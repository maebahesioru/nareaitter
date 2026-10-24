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
/**
 * 件数の上限は設けない（データを勝手に捨てない）。
 * 代わりに「保存できるサイズ」だけを予算として持ち、超えたときだけ
 * 古いサークルから落とす。落とした件数は state.pruned に数えて可視化する。
 */
const PERSIST_SOFT_BYTES = 24 * 1024 * 1024;
/** アバターURLは1件300〜400字と重いので保持件数に上限を設ける */
const MAX_AVATARS = 40_000;
const MAX_AVATAR_LEN = 400;
/**
 * Yahoo が「画像なし」の相手に返す共通プレースホルダ。
 * これを保存すると全員が同じデフォルトアイコンになるので捨てる
 * （表示側は /api/avatar-fallback で実アバターを解決する）。
 */
const AVATAR_PLACEHOLDER = "rts-pctr.c.yimg.jp/BgIFgYJGVIVv8u0nVJvw8B2FauAYMF4jOP5zFJAV4i5e72TLbER0x";

/** 保存に値するアバターURLか（プレースホルダ・長すぎるものは不可） */
function isUsableAvatar(url: string | undefined): url is string {
  if (!url) return false;
  if (url.length > MAX_AVATAR_LEN) return false;
  if (url.includes(AVATAR_PLACEHOLDER)) return false;
  return true;
}
const PERSIST_MIN_INTERVAL_MS = 120_000;
/** これを超えたら書き込みを諦める最終防波堤（通常は到達しない） */
const PERSIST_HARD_BYTES = 96 * 1024 * 1024;

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
  /** 相手→本人の返信速度（中央値・分） */
  replyThemMin?: number;
  /** 最速レス（秒） */
  fastestThemSec?: number;
  /** 平均文字数 */
  avgLen?: number;
  /** 敬語率 0-100 */
  keigoRate?: number;
  /** 直近7日の交流回数 */
  mentionsLast7d?: number;
  /** 週次カウント（4週前→今週） */
  weekly?: number[];
  /** 最初に交流した日時（ISO） */
  firstInteractionAt?: string;
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
  /** 返信速度（分・中央値） */
  rm?: number;
  /** 最速レス（秒） */
  fs?: number;
  /** 平均文字数 */
  al?: number;
  /** 敬語率 0-100 */
  kr?: number;
  /** 直近7日 */
  w7?: number;
  /** 週次（4） */
  wk?: number[];
  /** 初対面の日（epoch 日数） */
  fi?: number;
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
  /** 返信速度の合計（分）と件数 */
  rmS?: number;
  rmC?: number;
  /** 平均文字数の合計と件数 */
  alS?: number;
  alC?: number;
  /** 敬語率の合計と件数 */
  krS?: number;
  krC?: number;
  /** 直近7日の延べ交流 */
  w7?: number;
  /** 週次合計（4週前→今週） */
  wk?: number[];
  /** 記録した最速レス（秒・最小値） */
  fst?: number;
  /** 一番古い初対面の日（epoch 日数・最小値） */
  fi?: number;
};

/** 1日ぶんのスナップショット（推移・伸び率の算出用） */
type DailySnapshot = {
  /** 延べ交流 */
  m: number;
  /** 人数 */
  u: number;
  /** 上位ユーザーの累積交流数 [screenName, mentions] */
  top: Array<[string, number]>;
};

/** JST の YYYY-MM-DD */
function dayKey(t = Date.now()): string {
  const d = new Date(t + 9 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

/** ISO 文字列 → epoch 日数 */
function toDayNum(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : undefined;
}

function captureDaily(state: StatsState): void {
  try {
    const key = dayKey();
    const users = Object.values(state.users);
    const top = [...users]
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 150)
      .map((u) => [u.screenName, u.mentions] as [string, number]);
    state.daily = state.daily ?? {};
    state.daily[key] = { m: Math.max(0, state.totalMentions), u: users.length, top };
    const keys = Object.keys(state.daily).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 45))) delete state.daily[k];
  } catch {
    // スナップショット失敗は致命的ではない
  }
}

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
  /** 日次スナップショット（YYYY-MM-DD → 合計と上位ユーザーの累積） */
  daily?: Record<string, DailySnapshot>;
  /** サイズ予算のために落としたサークル数 */
  pruned?: number;
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
  /** 最後に書き出した JSON のバイト数 */
  bytes: number;
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
    pruned: 0,
    daily: {},
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
      persist: { dir, file: undefined, ok: false, lastWrite: 0, bytes: 0 },
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
        isUsableAvatar(m.avatar) &&
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
      if (peer.rm !== undefined) {
        u.rmS = (u.rmS ?? 0) + peer.rm;
        u.rmC = (u.rmC ?? 0) + 1;
      }
      if (peer.al !== undefined) {
        u.alS = (u.alS ?? 0) + peer.al;
        u.alC = (u.alC ?? 0) + 1;
      }
      if (peer.kr !== undefined) {
        u.krS = (u.krS ?? 0) + peer.kr;
        u.krC = (u.krC ?? 0) + 1;
      }
      if (peer.w7 !== undefined) u.w7 = (u.w7 ?? 0) + peer.w7;
      if (peer.wk) u.wk = u.wk ? u.wk.map((v, i) => v + (peer.wk?.[i] ?? 0)) : [...peer.wk];
      if (peer.fs !== undefined) u.fst = Math.min(u.fst ?? Number.MAX_SAFE_INTEGER, peer.fs);
      if (peer.fi !== undefined) u.fi = Math.min(u.fi ?? Number.MAX_SAFE_INTEGER, peer.fi);
    } else if (u) {
      u.appearances -= 1;
      u.mentions -= peer.n;
      u.received -= peer.r;
      u.sent -= peer.s;
      u.rankSum -= peer.k;
      u.rankedCircles -= 1;
      if (peer.rm !== undefined) {
        u.rmS = Math.max(0, (u.rmS ?? 0) - peer.rm);
        u.rmC = Math.max(0, (u.rmC ?? 0) - 1);
      }
      if (peer.al !== undefined) {
        u.alS = Math.max(0, (u.alS ?? 0) - peer.al);
        u.alC = Math.max(0, (u.alC ?? 0) - 1);
      }
      if (peer.kr !== undefined) {
        u.krS = Math.max(0, (u.krS ?? 0) - peer.kr);
        u.krC = Math.max(0, (u.krC ?? 0) - 1);
      }
      if (peer.w7 !== undefined) u.w7 = Math.max(0, (u.w7 ?? 0) - peer.w7);
      if (peer.wk && u.wk) u.wk = u.wk.map((v, i) => Math.max(0, v - (peer.wk?.[i] ?? 0)));
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
}

/** 古いサークルから1つ落とす（サイズ予算を超えたときだけ使う） */
function dropOldestCircle(state: StatsState): boolean {
  const handles = Object.keys(state.circles);
  if (handles.length === 0) return false;
  const oldest = handles.reduce((a, b) => (state.circles[a].at <= state.circles[b].at ? a : b));
  dropCircle(state, oldest);
  state.pruned = (state.pruned ?? 0) + 1;
  return true;
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
      captureDaily(rt.state);
      let body = serialize(rt);
      // 予算を超えたときだけ、古いサークルを落として作り直す（件数では切らない）
      let guard = 0;
      while (Buffer.byteLength(body, "utf8") > PERSIST_SOFT_BYTES && guard < 5_000) {
        if (!dropOldestCircle(rt.state)) break;
        body = serialize(rt);
        guard += 1;
      }
      if (Buffer.byteLength(body, "utf8") > PERSIST_HARD_BYTES) {
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
      rt.persist.bytes = Buffer.byteLength(body, "utf8");
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

    const limit = peers.length;
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
        rm: typeof p.replyThemMin === "number" && p.replyThemMin >= 0 ? p.replyThemMin : undefined,
        fs: typeof p.fastestThemSec === "number" && p.fastestThemSec > 0 ? p.fastestThemSec : undefined,
        al: typeof p.avgLen === "number" && p.avgLen > 0 ? p.avgLen : undefined,
        kr: typeof p.keigoRate === "number" && p.keigoRate >= 0 ? p.keigoRate : undefined,
        w7: typeof p.mentionsLast7d === "number" ? p.mentionsLast7d : undefined,
        wk: Array.isArray(p.weekly) && p.weekly.length === 4 ? p.weekly.map((v) => Math.max(0, Math.round(v))) : undefined,
        fi: toDayNum(p.firstInteractionAt),
      };
      const rawAvatar = p.avatarUrl?.trim() || p.avatarUrlPreview?.trim() || undefined;
      const avatar = isUsableAvatar(rawAvatar) ? rawAvatar : undefined;
      if (p.displayName || avatar) meta[screen] = { displayName: p.displayName, avatar };
      if (i < 20) {
        for (const e of p.topEmojis ?? []) if (e) contrib.emojis[e] = (contrib.emojis[e] ?? 0) + 1;
        if (p.laugh) contrib.laughs[p.laugh] = (contrib.laughs[p.laugh] ?? 0) + 1;
        if (p.vocative) contrib.vocatives[p.vocative] = (contrib.vocatives[p.vocative] ?? 0) + 1;
      }
    }
    // 中身が無いときは前回ぶんを消さない（消すとデータが減るだけ）
    if (Object.keys(contrib.peers).length === 0) return;

    // 前回ぶんを差し引く（再ビルドでの二重計上を防ぐ）
    const isNew = !state.circles[key];
    dropCircle(state, key);
    state.circles[key] = contrib;
    applyContribution(state, key, contrib, 1, meta, now);
    state.builds += 1;
    state.updatedAt = now;
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

export type StatsMetricRow = {
  screenName: string;
  displayName?: string;
  avatar?: string;
  /** 指標の値（単位は指標ごとに違う） */
  value: number;
};

export type StatsTrendPoint = { d: string; m: number; u: number };

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
    fastest: StatsMetricRow[];
    reply: StatsMetricRow[];
    longest: StatsMetricRow[];
    keigo: StatsMetricRow[];
    rising: StatsMetricRow[];
    bond: StatsMetricRow[];
    growth: StatsMetricRow[];
  };
  trend: StatsTrendPoint[];
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
    avatar: isUsableAvatar(u.avatar) ? u.avatar : undefined,
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

  const metricRow = (u: StatsUser, value: number): StatsMetricRow => ({
    screenName: u.screenName,
    displayName: u.displayName,
    avatar: isUsableAvatar(u.avatar) ? u.avatar : undefined,
    value: Math.round(value * 10) / 10,
  });

  const byFastest = users
    .filter((u) => typeof u.fst === "number" && (u.fst ?? 0) > 0 && u.fst !== Number.MAX_SAFE_INTEGER)
    .sort((a, b) => (a.fst ?? 0) - (b.fst ?? 0))
    .slice(0, 30)
    .map((u) => metricRow(u, u.fst ?? 0));

  const byReply = users
    .filter((u) => (u.rmC ?? 0) > 0)
    .sort((a, b) => (a.rmS ?? 0) / (a.rmC ?? 1) - (b.rmS ?? 0) / (b.rmC ?? 1))
    .slice(0, 30)
    .map((u) => metricRow(u, (u.rmS ?? 0) / (u.rmC ?? 1)));

  const byLongest = users
    .filter((u) => (u.alC ?? 0) > 0)
    // 元テキストが長さ上限で切られているため上限付近は同点になる。同点は交流数で割る
    .sort(
      (a, b) =>
        (b.alS ?? 0) / (b.alC ?? 1) - (a.alS ?? 0) / (a.alC ?? 1) || b.mentions - a.mentions,
    )
    .slice(0, 30)
    .map((u) => metricRow(u, (u.alS ?? 0) / (u.alC ?? 1)));

  const byKeigo = users
    .filter((u) => (u.krC ?? 0) >= 2)
    .sort((a, b) => (b.krS ?? 0) / (b.krC ?? 1) - (a.krS ?? 0) / (a.krC ?? 1))
    .slice(0, 20)
    .map((u) => metricRow(u, (u.krS ?? 0) / (u.krC ?? 1)));

  const byRising = users
    .filter((u) => (u.w7 ?? 0) > 0)
    .sort((a, b) => (b.w7 ?? 0) - (a.w7 ?? 0) || b.mentions - a.mentions)
    .slice(0, 30)
    .map((u) => metricRow(u, u.w7 ?? 0));

  const today = Math.floor(Date.now() / 86_400_000);
  const byBond = users
    .filter((u) => typeof u.fi === "number" && u.fi !== Number.MAX_SAFE_INTEGER)
    .sort((a, b) => (a.fi ?? 0) - (b.fi ?? 0))
    .slice(0, 30)
    .map((u) => metricRow(u, Math.max(0, today - (u.fi ?? today))));

  // 日次推移と伸び（直近7日で最も古いスナップショットとの差分）
  if (!state.daily?.[dayKey()]) captureDaily(state);
  const days = Object.keys(state.daily ?? {}).sort();
  const trend: StatsTrendPoint[] = days.slice(-30).map((d) => ({
    d,
    m: state.daily?.[d]?.m ?? 0,
    u: state.daily?.[d]?.u ?? 0,
  }));
  const base = days.slice(-7)[0];
  const baseTop = new Map<string, number>(state.daily?.[base]?.top ?? []);
  const growth: StatsMetricRow[] = [...users]
    .map((u) => ({ u, diff: u.mentions - (baseTop.get(u.screenName) ?? u.mentions) }))
    .filter((x) => x.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 20)
    .map((x) => metricRow(x.u, x.diff));

  const recent = [...users]
    .sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0) || b.lastSeen - a.lastSeen)
    .slice(0, 20)
    .map((u) => toRow(u, u.appearances, u.mentions));

  const circles: StatsCircleRow[] = Object.entries(state.circles)
    .map(([screenName, c]) => ({ screenName, users: c.users, total: c.total, at: c.at }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 240);

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
      bytes: rt.persist.bytes,
    },
    rankings: {
      appearances: byAppearances,
      mentions: byMentions,
      rank: byRank,
      recent,
      fastest: byFastest,
      reply: byReply,
      longest: byLongest,
      keigo: byKeigo,
      rising: byRising,
      bond: byBond,
      growth,
    },
    trend,
    emojis: topEntries(state.emojis, 36),
    laughs: topEntries(state.laughs, 8),
    vocatives: topEntries(state.vocatives, 30),
    hours: state.hours,
    circles,
  };
}

/**
 * まだ集計していないハンドルの候補（芋づる式クロールの起点）。
 * 集計済みサークルの登場人物を、何サークルに出ているかで重み付けして返す。
 */
/** アバター解決を試した時刻（失敗の再試行間隔を空けるため） */
const avatarTriedAt = new Map<string, number>();
const AVATAR_RETRY_MS = 10 * 60 * 1000;

/** バックフィルの再試行間隔をリセットする（force 用） */
export function resetAvatarAttempts(): void {
  avatarTriedAt.clear();
}

/** 解決を試みたことを記録する（失敗した相手を毎回叩かない） */
export function noteAvatarAttempt(screenName: string): void {
  avatarTriedAt.set(screenName.toLowerCase(), Date.now());
}

/**
 * 解決済みのアバターURLを保存する（fxtwitter の高画質URLを想定）。
 * 保存済み・上限超過・不正URLは false。
 */
export function setUserAvatar(screenName: string, url: string): boolean {
  const rt = runtime();
  const u = rt.state.users[screenName];
  if (!u) return false;
  if (!isUsableAvatar(url)) return false;
  if (isUsableAvatar(u.avatar)) return false; // 既に良いURLがある
  const hadAny = Boolean(u.avatar);
  // 差し替えは件数が増えないので上限の対象外
  if (!hadAny && (rt.state.avatars ?? 0) >= MAX_AVATARS) return false;
  // プレースホルダ等の使えないURLが入っていた場合は差し替える（件数は増やさない）
  u.avatar = url;
  if (!hadAny) rt.state.avatars = (rt.state.avatars ?? 0) + 1;
  schedulePersist(rt);
  return true;
}

/** アバター未取得のハンドルを登場回数の多い順に返す（バックフィル対象） */
export function getAvatarBackfillTargets(limit = 30): string[] {
  const rt = runtime();
  const now = Date.now();
  const rows: Array<{ s: string; a: number }> = [];
  for (const u of Object.values(rt.state.users)) {
    if (isUsableAvatar(u.avatar)) continue;
    const tried = avatarTriedAt.get(u.screenName.toLowerCase());
    if (tried && now - tried < AVATAR_RETRY_MS) continue;
    rows.push({ s: u.screenName, a: u.appearances });
  }
  rows.sort((a, b) => b.a - a.a);
  return rows.slice(0, Math.max(1, Math.min(400, limit))).map((r) => r.s);
}

export function getStatsCandidates(
  limit = 200,
): { screenName: string; circles: number; mentions: number }[] {
  try {
    const rt = runtime();
    const state = rt.state;
    const acc = new Map<string, { circles: number; mentions: number }>();
    for (const contrib of Object.values(state.circles)) {
      for (const [screen, peer] of Object.entries(contrib.peers)) {
        if (state.circles[screen]) continue; // 集計済みは除外
        const row = acc.get(screen);
        if (row) {
          row.circles += 1;
          row.mentions += peer.n;
        } else {
          acc.set(screen, { circles: 1, mentions: peer.n });
        }
      }
    }
    return [...acc.entries()]
      .map(([screenName, v]) => ({ screenName, ...v }))
      .sort((a, b) => b.circles - a.circles || b.mentions - a.mentions)
      .slice(0, Math.max(1, Math.min(2000, limit)));
  } catch {
    return [];
  }
}

/** 計測用（デバッグ・検証スクリプト向け） */
export function getStatsMeta(): { circles: number; users: number; avatars: number; pruned: number; persist: PersistInfo } {
  const rt = runtime();
  return {
    circles: Object.keys(rt.state.circles).length,
    users: Object.keys(rt.state.users).length,
    avatars: rt.state.avatars ?? 0,
    pruned: rt.state.pruned ?? 0,
    persist: { ...rt.persist },
  };
}
