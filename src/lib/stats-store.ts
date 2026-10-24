/**
 * サイト全体の「馴れ合い統計」を貯めるサーバー専用ストア。
 *
 * 各ハンドルのサークルがビルドされるたびに、そのサークルの上位メンバーを
 * 差分で足し引きして累積する（同じサークルを再ビルドしても二重計上しない）。
 * これにより「何人ものサークルに登場している人 = 界隈の中心人物」を出せる。
 *
 * - 状態は globalThis に置く（Next.js はページ/API でモジュール状態が別インスタンスに
 *   なり得るため。実測 2026-10 の教訓）
 * - ディスクへは JSON で間引いて書き出す。NAREAI_STATS_DIR が書けなければ
 *   メモリのみで動く（機能は止めない）
 * - 壊れたデータ・上限超過でも例外を投げない（payload ビルドを巻き込まない）
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const STATE_VERSION = 1;
/** 直近何サークルぶんを保持するか（古いものは寄与を差し引いて捨てる） */
const MAX_CIRCLES = 240;
/** 1サークルあたり何位までを集計対象にするか（長すぎる尾は重複が多く伸びない） */
const MAX_PEERS_PER_CIRCLE = 120;
/** ユーザー表の上限（通常は数千人規模。暴走時の保険） */
const MAX_USERS = 60_000;
/** アバターURLは1件300〜400字と重いので保持件数に上限を設ける */
const MAX_AVATARS = 6_000;
const MAX_AVATAR_LEN = 400;
const PERSIST_MIN_INTERVAL_MS = 120_000;
const PERSIST_MAX_BYTES = 24 * 1024 * 1024;

export type StatsPeerInput = {
  screenName: string;
  displayName?: string;
  interactionCount?: number;
  mentionsReceived?: number;
  mentionsSent?: number;
  avatarUrl?: string;
  avatarUrlPreview?: string;
  activeHour?: number;
  topEmojis?: string[];
  laugh?: string;
  vocative?: string;
  lastInteractionAt?: string;
};

type PeerContribution = {
  /** 交流回数 */
  n: number;
  /** 相手→本人 */
  r: number;
  /** 本人→相手 */
  s: number;
  /** 最後に交流した日（epoch 日数）。並べ替え用に日単位で持つ */
  l?: number;
  /** サークル内順位（1始まり） */
  k: number;
  /** 相手の活動ピーク時間帯（上位のみ） */
  h?: number;
};

type CircleContribution = {
  at: number;
  /** サークルの延べ交流数 */
  total: number;
  /** サークルの人数（上位120に切る前の実人数） */
  users: number;
  peers: Record<string, PeerContribution>;
  emojis: Record<string, number>;
  laughs: Record<string, number>;
  vocatives: Record<string, number>;
};

export type StatsUser = {
  screenName: string;
  displayName?: string;
  avatar?: string;
  /** 登場したサークル数 */
  appearances: number;
  /** 延べ交流数 */
  mentions: number;
  received: number;
  sent: number;
  rankSum: number;
  rankedCircles: number;
  bestRank: number;
  firstSeen: number;
  lastSeen: number;
  /** 実際の最終交流日（epoch 日数） */
  lastActive?: number;
};

type StatsState = {
  version: number;
  updatedAt: number;
  circles: Record<string, CircleContribution>;
  users: Record<string, StatsUser>;
  emojis: Record<string, number>;
  laughs: Record<string, number>;
  vocatives: Record<string, number>;
  /** 24時間ぶんの活動ピーク集計 */
  hours: number[];
  /** 記録したサークル更新回数（再ビルド含む） */
  builds: number;
  /** 累積の延べ交流数 */
  totalMentions: number;
  /** アバターURLを保持している人数（保存サイズの上限管理用） */
  avatars?: number;
};

type PersistInfo = {
  dir: string;
  file?: string;
  ok: boolean;
  lastError?: string;
  lastWrite: number;
};

type StatsRuntime = {
  state: StatsState;
  persist: PersistInfo;
  loaded: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

const GLOBAL_KEY = "__nareaiStatsV1";
type GlobalWithStats = typeof globalThis & { [GLOBAL_KEY]?: StatsRuntime };

function emptyState(): StatsState {
  return {
    version: STATE_VERSION,
    updatedAt: 0,
    circles: {},
    users: {},
    emojis: {},
    laughs: {},
    vocatives: {},
    hours: new Array(24).fill(0),
    builds: 0,
    totalMentions: 0,
  };
}

function resolveDir(): string {
  const fromEnv = process.env.NAREAI_STATS_DIR?.trim();
  if (fromEnv) return fromEnv;
  // 永続ボリュームがあればそこ、無ければ tmp（コンテナ再起動は耐える）
  const candidates = [path.join(process.cwd(), "data"), path.join(os.tmpdir(), "nareai-stats")];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      /* 次の候補へ */
    }
  }
  return path.join(os.tmpdir(), "nareai-stats");
}

function runtime(): StatsRuntime {
  const g = globalThis as GlobalWithStats;
  let rt = g[GLOBAL_KEY];
  if (!rt) {
    const dir = resolveDir();
    rt = {
      state: emptyState(),
      persist: { dir, file: undefined, ok: false, lastWrite: 0 },
      loaded: false,
      timer: null,
    };
    g[GLOBAL_KEY] = rt;
  }
  if (!rt.loaded) {
    rt.loaded = true;
    try {
      const file = path.join(rt.persist.dir, "stats.json.gz");
      rt.persist.file = file;
      let raw: string;
      try {
        raw = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
      } catch {
        // 旧形式（無圧縮）からの移行
        raw = fs.readFileSync(path.join(rt.persist.dir, "stats.json"), "utf8");
      }
      const parsed = JSON.parse(raw) as StatsState;
      if (parsed && parsed.version === STATE_VERSION) {
        rt.state = {
          ...emptyState(),
          ...parsed,
          hours:
            Array.isArray(parsed.hours) && parsed.hours.length === 24
              ? parsed.hours
              : new Array(24).fill(0),
        };
        rt.persist.ok = true;
        rt.persist.lastWrite = Date.now();
      }
    } catch {
      /* 初回はファイルが無いだけ */
    }
  }
  return rt;
}

function bump(map: Record<string, number>, key: string, delta: number): void {
  const next = (map[key] ?? 0) + delta;
  if (next <= 0) delete map[key];
  else map[key] = next;
}

function applyContribution(
  state: StatsState,
  handle: string,
  contrib: CircleContribution,
  sign: 1 | -1,
  meta?: Record<string, { displayName?: string; avatar?: string }>,
  now = Date.now(),
): void {
  state.totalMentions += sign * contrib.total;
  for (const [screen, peer] of Object.entries(contrib.peers)) {
    let u = state.users[screen];
    if (sign > 0) {
      if (!u) {
        u = {
          screenName: screen,
          appearances: 0,
          mentions: 0,
          received: 0,
          sent: 0,
          rankSum: 0,
          rankedCircles: 0,
          bestRank: Number.MAX_SAFE_INTEGER,
          firstSeen: now,
          lastSeen: now,
        };
        state.users[screen] = u;
      }
      const m = meta?.[screen];
      if (m?.displayName && !u.displayName) u.displayName = m.displayName;
      if (
        m?.avatar &&
        !u.avatar &&
        m.avatar.length <= MAX_AVATAR_LEN &&
        (state.avatars ?? 0) < MAX_AVATARS
      ) {
        u.avatar = m.avatar;
        state.avatars = (state.avatars ?? 0) + 1;
      }
      u.appearances += 1;
      u.mentions += peer.n;
      u.received += peer.r;
      u.sent += peer.s;
      u.rankSum += peer.k;
      u.rankedCircles += 1;
      if (peer.k < u.bestRank) u.bestRank = peer.k;
      u.lastSeen = Math.max(u.lastSeen, now);
      if (peer.l) u.lastActive = Math.max(u.lastActive ?? 0, peer.l);
    } else if (u) {
      u.appearances -= 1;
      u.mentions -= peer.n;
      u.received -= peer.r;
      u.sent -= peer.s;
      u.rankSum -= peer.k;
      u.rankedCircles -= 1;
    }
  }
  for (const [e, n] of Object.entries(contrib.emojis)) bump(state.emojis, e, sign * n);
  for (const [e, n] of Object.entries(contrib.laughs)) bump(state.laughs, e, sign * n);
  for (const [e, n] of Object.entries(contrib.vocatives)) bump(state.vocatives, e, sign * n);
  for (const [key, peer] of Object.entries(contrib.peers)) {
    if (typeof peer.h === "number" && peer.h >= 0 && peer.h < 24) {
      state.hours[peer.h] = Math.max(0, state.hours[peer.h] + sign);
    }
  }
  void handle;
}

function dropCircle(state: StatsState, handle: string): void {
  const c = state.circles[handle];
  if (!c) return;
  applyContribution(state, handle, c, -1);
  delete state.circles[handle];
}

/** 寄与がなくなったユーザーを掃除（減算だけで消えた人） */
function pruneUsers(state: StatsState): void {
  for (const [screen, u] of Object.entries(state.users)) {
    if (u.appearances <= 0 || u.rankedCircles <= 0) delete state.users[screen];
  }
  const names = Object.keys(state.users);
  if (names.length > MAX_USERS) {
    names
      .sort((a, b) => state.users[a].lastSeen - state.users[b].lastSeen)
      .slice(0, names.length - MAX_USERS)
      .forEach((n) => delete state.users[n]);
  }
}

function pruneCircles(state: StatsState): void {
  const handles = Object.keys(state.circles);
  if (handles.length <= MAX_CIRCLES) return;
  handles
    .sort((a, b) => state.circles[a].at - state.circles[b].at)
    .slice(0, handles.length - MAX_CIRCLES)
    .forEach((h) => dropCircle(state, h));
}

function serialize(rt: StatsRuntime): string {
  return JSON.stringify({ ...rt.state, version: STATE_VERSION });
}

/** 書き出しをスケジュール（多重呼び出しはデバウンス） */
function schedulePersist(rt: StatsRuntime, immediate = false): void {
  const file = rt.persist.file;
  if (!file) return;
  const wait = immediate
    ? 0
    : Math.max(0, PERSIST_MIN_INTERVAL_MS - (Date.now() - rt.persist.lastWrite));
  if (rt.timer) {
    if (!immediate) return;
    clearTimeout(rt.timer);
    rt.timer = null;
  }
  rt.timer = setTimeout(() => {
    rt.timer = null;
    try {
      const body = serialize(rt);
      if (body.length > PERSIST_MAX_BYTES) {
        rt.persist.ok = false;
        rt.persist.lastError = "payload too large";
        return;
      }
      // アバターURLなどで膨らむため gzip で保存する（実測 1サークル 68KB → 約 12KB）
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(body, "utf8")));
      fs.renameSync(tmp, file);
      rt.persist.ok = true;
      rt.persist.lastError = undefined;
      rt.persist.lastWrite = Date.now();
    } catch (err) {
      rt.persist.ok = false;
      rt.persist.lastError = err instanceof Error ? err.message : String(err);
    }
  }, wait);
  // タイマーでプロセスを生かし続けない
  rt.timer.unref?.();
}

/** 集計を即座にディスクへ書く（デプロイ前確認・API 用） */
export function flushStats(): PersistInfo {
  const rt = runtime();
  if (rt.timer) {
    clearTimeout(rt.timer);
    rt.timer = null;
  }
  schedulePersist(rt, true);
  return { ...rt.persist };
}

/**
 * 1サークルぶんの集計を記録する。
 * circleUsers は交流回数の降順で渡ってくる前提（payload 側でソート済み）。
 */
export function recordCircleStats(handle: string, peers: StatsPeerInput[]): void {
  try {
    if (!handle || peers.length === 0) return;
    const rt = runtime();
    const state = rt.state;
    const key = handle.trim().toLowerCase().replace(/^@+/, "");
    if (!key) return;
    const now = Date.now();

    // 前回ぶんを差し引く（再ビルドでの二重計上を防ぐ）
    const isNew = !state.circles[key];
    dropCircle(state, key);

    const contrib: CircleContribution = {
      at: now,
      total: 0,
      users: peers.length,
      peers: {},
      emojis: {},
      laughs: {},
      vocatives: {},
    };
    const meta: Record<string, { displayName?: string; avatar?: string }> = {};

    const limit = Math.min(peers.length, MAX_PEERS_PER_CIRCLE);
    for (let i = 0; i < limit; i++) {
      const p = peers[i];
      const screen = (p.screenName ?? "").trim().toLowerCase();
      if (!screen || screen === key) continue;
      const n = Math.max(0, p.interactionCount ?? (p.mentionsReceived ?? 0) + (p.mentionsSent ?? 0));
      if (n <= 0) continue;
      contrib.total += n;
      const lastMs = p.lastInteractionAt ? Date.parse(p.lastInteractionAt) : Number.NaN;
      contrib.peers[screen] = {
        n,
        r: Math.max(0, p.mentionsReceived ?? 0),
        s: Math.max(0, p.mentionsSent ?? 0),
        k: i + 1,
        h: typeof p.activeHour === "number" ? p.activeHour : undefined,
        l: Number.isFinite(lastMs) ? Math.floor(lastMs / 86_400_000) : undefined,
      };
      const avatar = p.avatarUrl?.trim() || p.avatarUrlPreview?.trim() || undefined;
      if (p.displayName || avatar) meta[screen] = { displayName: p.displayName, avatar };
      if (i < 20) {
        for (const e of p.topEmojis ?? []) if (e) contrib.emojis[e] = (contrib.emojis[e] ?? 0) + 1;
        if (p.laugh) contrib.laughs[p.laugh] = (contrib.laughs[p.laugh] ?? 0) + 1;
        if (p.vocative) contrib.vocatives[p.vocative] = (contrib.vocatives[p.vocative] ?? 0) + 1;
      }
    }
    if (Object.keys(contrib.peers).length === 0) return;

    state.circles[key] = contrib;
    applyContribution(state, key, contrib, 1, meta, now);
    state.builds += 1;
    state.updatedAt = now;
    pruneCircles(state);
    pruneUsers(state);
    // 新しいサークルが増えたときは即書き出し（再起動でデバウンス待ちの分を失わないように）
    schedulePersist(rt, isNew);
  } catch {
    // 統計は本機能のおまけ。payload ビルドを絶対に壊さない
  }
}

export type StatsRankRow = {
  screenName: string;
  displayName?: string;
  avatar?: string;
  appearances: number;
  mentions: number;
  received: number;
  sent: number;
  avgRank: number;
  bestRank: number;
  lastSeen: number;
};

export type StatsCircleRow = {
  screenName: string;
  users: number;
  total: number;
  at: number;
};

export type StatsSnapshot = {
  updatedAt: number;
  circleCount: number;
  userCount: number;
  totalMentions: number;
  builds: number;
  persist: Omit<PersistInfo, "file"> & { file?: string };
  rankings: {
    appearances: StatsRankRow[];
    mentions: StatsRankRow[];
    rank: StatsRankRow[];
    recent: StatsRankRow[];
  };
  emojis: Array<{ key: string; n: number }>;
  laughs: Array<{ key: string; n: number }>;
  vocatives: Array<{ key: string; n: number }>;
  hours: number[];
  circles: StatsCircleRow[];
};

function toRow(u: StatsUser, appearances: number, mentions: number): StatsRankRow {
  const avgRank = u.rankedCircles > 0 ? u.rankSum / u.rankedCircles : 999;
  return {
    screenName: u.screenName,
    displayName: u.displayName,
    avatar: u.avatar,
    appearances,
    mentions,
    received: Math.max(0, u.received),
    sent: Math.max(0, u.sent),
    avgRank: Math.round(avgRank * 10) / 10,
    bestRank: u.bestRank === Number.MAX_SAFE_INTEGER ? 0 : u.bestRank,
    lastSeen: u.lastActive ? u.lastActive * 86_400_000 : u.lastSeen,
  };
}

function topEntries(map: Record<string, number>, limit: number): Array<{ key: string; n: number }> {
  return Object.entries(map)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, n]) => ({ key, n }));
}

export function getStatsSnapshot(): StatsSnapshot {
  const rt = runtime();
  const state = rt.state;
  const users = Object.values(state.users).filter((u) => u.appearances > 0);

  const byAppearances = [...users]
    .sort((a, b) => b.appearances - a.appearances || b.mentions - a.mentions)
    .slice(0, 100)
    .map((u) => toRow(u, u.appearances, u.mentions));

  const byMentions = [...users]
    .sort((a, b) => b.mentions - a.mentions || b.appearances - a.appearances)
    .slice(0, 60)
    .map((u) => toRow(u, u.appearances, u.mentions));

  const byRank = users
    .filter((u) => u.rankedCircles >= 2)
    .sort((a, b) => a.rankSum / a.rankedCircles - b.rankSum / b.rankedCircles || b.appearances - a.appearances)
    .slice(0, 40)
    .map((u) => toRow(u, u.appearances, u.mentions));

  const recent = [...users]
    .sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0) || b.lastSeen - a.lastSeen)
    .slice(0, 20)
    .map((u) => toRow(u, u.appearances, u.mentions));

  const circles: StatsCircleRow[] = Object.entries(state.circles)
    .map(([screenName, c]) => ({ screenName, users: c.users, total: c.total, at: c.at }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 60);

  return {
    updatedAt: state.updatedAt,
    circleCount: Object.keys(state.circles).length,
    userCount: users.length,
    totalMentions: Math.max(0, state.totalMentions),
    builds: state.builds,
    persist: {
      dir: rt.persist.dir,
      file: rt.persist.file,
      ok: rt.persist.ok,
      lastError: rt.persist.lastError,
      lastWrite: rt.persist.lastWrite,
    },
    rankings: { appearances: byAppearances, mentions: byMentions, rank: byRank, recent },
    emojis: topEntries(state.emojis, 36),
    laughs: topEntries(state.laughs, 8),
    vocatives: topEntries(state.vocatives, 30),
    hours: state.hours,
    circles,
  };
}

/** 計測用（デバッグ・検証スクリプト向け） */
export function getStatsMeta(): { circles: number; users: number; persist: PersistInfo } {
  const rt = runtime();
  return {
    circles: Object.keys(rt.state.circles).length,
    users: Object.keys(rt.state.users).length,
    persist: { ...rt.persist },
  };
}
