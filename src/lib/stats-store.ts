import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync, type Statement } from "node:sqlite";

/**
 * サークル横断の「馴れ合い統計」ストア。
 *
 * 保存先は Node 22 組み込みの `node:sqlite`（ネイティブ依存なし）。
 * 以前は 1個の JSON ブロブを 120 秒ごとに gzip で書き直していたが、
 * 記録のたびに全件シリアライズする必要があり、件数が増えると
 * イベントループをブロックする同期処理になっていた。SQLite なら
 * 追記は1サークル分の UPSERT だけで済み、件数上限も不要になる。
 *
 * 集計は「サークルを1回ビルドするたびに、その回の寄与を記録する」方式。
 * 同じサークルを再ビルドしたときは前回の寄与を差し引いてから足すので
 * 二重計上にならない（窓が前へ滑ったぶんだけが消える）。
 */

const DB_NAME = "stats.sqlite";
const LEGACY_GZ = "stats.json.gz";
const LEGACY_JSON = "stats.json";

const AVATAR_PLACEHOLDER = "BgIFgYJGVIVv8u0nVJvw8B2FauAYMF4jOP5zFJAV4i5e72TLbER0x";
const MAX_AVATAR_LEN = 400;

/** 書き出し間隔（WAL チェックポイントの間引き） */
const PERSIST_MIN_INTERVAL_MS = 120_000;

/** 日次スナップショットの保持日数 */
const DAILY_KEEP_DAYS = 45;
/** 日次スナップショットに残す上位人数 */
const DAILY_TOP_N = 150;

const GLOBAL_KEY = "__nareaiStatsSqliteV1";

export type PersistInfo = {
  dir: string;
  file?: string;
  ok: boolean;
  lastError?: string;
  lastWrite: number;
  /** ディスク上の DB ファイルサイズ（バイト） */
  bytes: number;
  /** 直近のチェックポイント所要時間（ミリ秒） */
  lastMs: number;
};

type Runtime = {
  db: DatabaseSync | null;
  dir: string;
  file: string;
  opened: boolean;
  persist: PersistInfo;
  timer: ReturnType<typeof setTimeout> | null;
  stmts: Map<string, Statement>;
  migrated: boolean;
};

type GlobalWithStats = typeof globalThis & { [GLOBAL_KEY]?: Runtime };

// ---------------------------------------------------------------------------
// 補助
// ---------------------------------------------------------------------------

function isUsableAvatar(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.length > MAX_AVATAR_LEN) return false;
  if (url.includes(AVATAR_PLACEHOLDER)) return false;
  return true;
}

function resolveDir(): string {
  const fromEnv = process.env.NAREAI_STATS_DIR?.trim();
  const candidates = [
    fromEnv,
    path.join(process.cwd(), "data"),
    path.join(os.tmpdir(), "nareai-stats"),
  ].filter((d): d is string => Boolean(d));
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

/** ISO 文字列 → epoch 日数（不正なら undefined） */
function toDayNum(iso: string | undefined | null): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return undefined;
  return Math.floor(ms / 86_400_000);
}

/** JST の YYYY-MM-DD */
function dayKey(ms = Date.now()): string {
  const d = new Date(ms + 9 * 3_600_000);
  return d.toISOString().slice(0, 10);
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** 空文字は NULL 扱い（SQLite の COALESCE で「未設定」を保つため） */
function tidyName(v: string | undefined | null): string | null {
  const t = (v ?? "").trim();
  return t ? t.slice(0, 80) : null;
}

/** しきい値未満・非数値は NULL */
function numOrNull(v: number | undefined, min: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min ? v : null;
}

/** 文字列配列を JSON で1列に（長すぎるものは捨てる） */
function jsonList(v: string[] | undefined): string | null {
  if (!Array.isArray(v)) return null;
  const items = v.map((x) => (x ?? "").trim()).filter((x) => x.length > 0 && x.length <= 32);
  if (items.length === 0) return null;
  return JSON.stringify(items.slice(0, 12));
}

function parseList(v: unknown): string[] {
  if (typeof v !== "string" || !v) return [];
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** 配列を「値→件数」で数えて上位を返す */
function countList(values: string[], limit: number): Array<{ key: string; n: number }> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function optNum(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// スキーマ
// ---------------------------------------------------------------------------

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA temp_store = MEMORY;

CREATE TABLE IF NOT EXISTS circles (
  handle TEXT PRIMARY KEY,
  at     INTEGER NOT NULL,
  total  INTEGER NOT NULL,
  users  INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS peers (
  circle TEXT NOT NULL,
  screen TEXT NOT NULL,
  n  INTEGER NOT NULL,
  r  INTEGER NOT NULL,
  s  INTEGER NOT NULL,
  k  INTEGER NOT NULL,
  h  INTEGER,
  l  INTEGER,
  rm REAL,
  fs INTEGER,
  rmm REAL,
  fsm INTEGER,
  al REAL,
  kr REAL,
  w7 INTEGER,
  wk0 INTEGER, wk1 INTEGER, wk2 INTEGER, wk3 INTEGER,
  fi INTEGER,
  PRIMARY KEY (circle, screen)
) WITHOUT ROWID;

-- サークル主（そのサークルの持ち主）自身の傾向。1ハンドル1行なので差分管理は不要。
CREATE TABLE IF NOT EXISTS owner (
  handle TEXT PRIMARY KEY,
  display TEXT,
  avg_len REAL,
  keigo REAL,
  streak INTEGER,
  laugh TEXT,
  emojis TEXT,
  vocatives TEXT,
  words TEXT,
  exclaim INTEGER,
  tone TEXT,
  gap REAL,
  posts REAL,
  weekday TEXT,
  breadth INTEGER,
  silence REAL,
  followers INTEGER,
  following INTEGER,
  tweets INTEGER,
  hours TEXT,
  newconn INTEGER,
  dormant INTEGER,
  out7 INTEGER,
  in7 INTEGER,
  burst INTEGER,
  peak_day TEXT,
  peak_n INTEGER,
  joined INTEGER,
  likes INTEGER,
  at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS users (
  screen TEXT PRIMARY KEY,
  display_name TEXT,
  avatar TEXT,
  appearances INTEGER NOT NULL DEFAULT 0,
  mentions INTEGER NOT NULL DEFAULT 0,
  received INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  rank_sum INTEGER NOT NULL DEFAULT 0,
  ranked_circles INTEGER NOT NULL DEFAULT 0,
  best_rank INTEGER NOT NULL DEFAULT 2147483647,
  first_seen INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0,
  last_active INTEGER,
  rm_s REAL NOT NULL DEFAULT 0, rm_c INTEGER NOT NULL DEFAULT 0,
  rmm_s REAL NOT NULL DEFAULT 0, rmm_c INTEGER NOT NULL DEFAULT 0, fsm INTEGER,
  al_s REAL NOT NULL DEFAULT 0, al_c INTEGER NOT NULL DEFAULT 0,
  kr_s REAL NOT NULL DEFAULT 0, kr_c INTEGER NOT NULL DEFAULT 0,
  w7 INTEGER NOT NULL DEFAULT 0,
  wk0 INTEGER NOT NULL DEFAULT 0, wk1 INTEGER NOT NULL DEFAULT 0,
  wk2 INTEGER NOT NULL DEFAULT 0, wk3 INTEGER NOT NULL DEFAULT 0,
  fst INTEGER,
  fi INTEGER
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS users_by_app ON users(appearances DESC, mentions DESC);
CREATE INDEX IF NOT EXISTS users_by_men ON users(mentions DESC);
CREATE INDEX IF NOT EXISTS users_by_recent ON users(last_active DESC, last_seen DESC);

CREATE TABLE IF NOT EXISTS agg (
  kind TEXT NOT NULL,
  key  TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, key)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS circle_agg (
  circle TEXT NOT NULL,
  kind   TEXT NOT NULL,
  key    TEXT NOT NULL,
  n      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (circle, kind, key)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS hours (
  h INTEGER PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS daily (
  d   TEXT PRIMARY KEY,
  m   INTEGER NOT NULL,
  u   INTEGER NOT NULL,
  top TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS avatar_tries (
  screen TEXT PRIMARY KEY,
  at     INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
) WITHOUT ROWID;
`;

// ---------------------------------------------------------------------------
// 旧 JSON からの移行
// ---------------------------------------------------------------------------

type LegacyPeer = {
  n?: number;
  r?: number;
  s?: number;
  k?: number;
  h?: number;
  l?: number;
  rm?: number;
  fs?: number;
  al?: number;
  kr?: number;
  w7?: number;
  wk?: number[];
  fi?: number;
};

type LegacyCircle = {
  at?: number;
  total?: number;
  users?: number;
  peers?: Record<string, LegacyPeer>;
  emojis?: Record<string, number>;
  laughs?: Record<string, number>;
  vocatives?: Record<string, number>;
};

type LegacyUser = {
  screenName?: string;
  displayName?: string;
  avatar?: string;
  appearances?: number;
  mentions?: number;
  received?: number;
  sent?: number;
  rankSum?: number;
  rankedCircles?: number;
  bestRank?: number;
  firstSeen?: number;
  lastSeen?: number;
  lastActive?: number;
  rmS?: number;
  rmC?: number;
  alS?: number;
  alC?: number;
  krS?: number;
  krC?: number;
  w7?: number;
  wk?: number[];
  fst?: number;
  fi?: number;
};

type LegacyState = {
  updatedAt?: number;
  builds?: number;
  circles?: Record<string, LegacyCircle>;
  users?: Record<string, LegacyUser>;
  emojis?: Record<string, number>;
  laughs?: Record<string, number>;
  vocatives?: Record<string, number>;
  hours?: number[];
  daily?: Record<string, { m?: number; u?: number; top?: Array<[string, number]> }>;
};

function readLegacy(dir: string): LegacyState | null {
  const candidates = [path.join(dir, LEGACY_GZ), path.join(dir, LEGACY_JSON)];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const buf = fs.readFileSync(file);
      const raw = file.endsWith(".gz") ? zlib.gunzipSync(buf).toString("utf8") : buf.toString("utf8");
      const parsed = JSON.parse(raw) as LegacyState;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* 壊れていたら次へ */
    }
  }
  return null;
}

function markLegacyMigrated(dir: string): void {
  for (const name of [LEGACY_GZ, LEGACY_JSON]) {
    const file = path.join(dir, name);
    try {
      if (fs.existsSync(file)) fs.renameSync(file, `${file}.migrated`);
    } catch {
      /* 失敗しても致命的ではない */
    }
  }
}

function importLegacy(db: DatabaseSync, state: LegacyState): number {
  const insertCircle = db.prepare("INSERT OR REPLACE INTO circles(handle, at, total, users) VALUES(?,?,?,?)");
  const insertPeer = db.prepare(
    `INSERT OR REPLACE INTO peers(
       circle, screen, n, r, s, k, h, l, rm, fs, al, kr, w7, wk0, wk1, wk2, wk3, fi
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insertUser = db.prepare(
    `INSERT OR REPLACE INTO users(
       screen, display_name, avatar, appearances, mentions, received, sent,
       rank_sum, ranked_circles, best_rank, first_seen, last_seen, last_active,
       rm_s, rm_c, al_s, al_c, kr_s, kr_c, w7, wk0, wk1, wk2, wk3, fst, fi
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  // 途中で落ちて半端に取り込まれると二度と再移行されないので、1トランザクションで入れる
  db.exec("BEGIN IMMEDIATE;");
  try {
    const n = importLegacyRows(state, { insertCircle, insertPeer, insertUser, db });
    db.exec("COMMIT;");
    return n;
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* noop */
    }
    throw err;
  }
}

function importLegacyRows(
  state: LegacyState,
  io: {
    db: DatabaseSync;
    insertCircle: Statement;
    insertPeer: Statement;
    insertUser: Statement;
  },
): number {
  const { db, insertCircle, insertPeer, insertUser } = io;

  let circles = 0;
  for (const [handle, c] of Object.entries(state.circles ?? {})) {
    const peers = Object.entries(c.peers ?? {});
    insertCircle.run(handle, num(c.at), num(c.total), num(c.users));
    for (const [screen, p] of peers) {
      const wk = Array.isArray(p.wk) && p.wk.length === 4 ? p.wk : [];
      insertPeer.run(
        handle,
        screen,
        num(p.n),
        num(p.r),
        num(p.s),
        num(p.k, 1),
        optNum(p.h),
        optNum(p.l),
        optNum(p.rm),
        optNum(p.fs),
        optNum(p.al),
        optNum(p.kr),
        optNum(p.w7),
        optNum(wk[0]),
        optNum(wk[1]),
        optNum(wk[2]),
        optNum(wk[3]),
        optNum(p.fi),
      );
    }
    circles += 1;
  }

  for (const u of Object.values(state.users ?? {})) {
    const screen = (u.screenName ?? "").trim().toLowerCase();
    if (!screen) continue;
    const wk = Array.isArray(u.wk) && u.wk.length === 4 ? u.wk : [];
    insertUser.run(
      screen,
      str(u.displayName),
      isUsableAvatar(u.avatar) ? u.avatar : null,
      num(u.appearances),
      num(u.mentions),
      num(u.received),
      num(u.sent),
      num(u.rankSum),
      num(u.rankedCircles),
      num(u.bestRank, 2147483647),
      num(u.firstSeen),
      num(u.lastSeen),
      optNum(u.lastActive),
      num(u.rmS),
      num(u.rmC),
      num(u.alS),
      num(u.alC),
      num(u.krS),
      num(u.krC),
      num(u.w7),
      num(wk[0]),
      num(wk[1]),
      num(wk[2]),
      num(wk[3]),
      optNum(u.fst),
      optNum(u.fi),
    );
  }

  const insertAgg = db.prepare("INSERT OR REPLACE INTO agg(kind, key, n) VALUES(?,?,?)");
  const aggMaps: Array<[string, Record<string, number>]> = [
    ["emoji", state.emojis ?? {}],
    ["laugh", state.laughs ?? {}],
    ["vocative", state.vocatives ?? {}],
  ];
  for (const [kind, map] of aggMaps) {
    for (const [key, n] of Object.entries(map)) {
      if (num(n) > 0) insertAgg.run(kind, key, num(n));
    }
  }

  const insertHour = db.prepare("INSERT OR REPLACE INTO hours(h, n) VALUES(?,?)");
  if (Array.isArray(state.hours)) {
    for (let h = 0; h < 24; h++) insertHour.run(h, num(state.hours[h]));
  }

  const insertDaily = db.prepare("INSERT OR REPLACE INTO daily(d, m, u, top) VALUES(?,?,?,?)");
  for (const [d, v] of Object.entries(state.daily ?? {})) {
    const top = Array.isArray(v.top) ? v.top.slice(0, DAILY_TOP_N) : [];
    insertDaily.run(d, num(v.m), num(v.u), JSON.stringify(top));
  }

  setMeta(db, "updatedAt", String(num(state.updatedAt)));
  setMeta(db, "builds", String(num(state.builds)));
  return circles;
}

// ---------------------------------------------------------------------------
// ランタイム
// ---------------------------------------------------------------------------

function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare("INSERT INTO meta(k, v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(key, value);
}

function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare("SELECT v FROM meta WHERE k=?").get(key);
  return row ? String(row.v) : null;
}

/** 既存 DB に後から足した列を補う（WITHOUT ROWID でも ADD COLUMN は可）。 */
function ensureColumns(db: DatabaseSync): void {
  const want: Array<[string, string, string]> = [
    ["peers", "rmm", "REAL"],
    ["peers", "fsm", "INTEGER"],
    ["users", "rmm_s", "REAL NOT NULL DEFAULT 0"],
    ["users", "rmm_c", "INTEGER NOT NULL DEFAULT 0"],
    ["users", "fsm", "INTEGER"],
    ["owner", "exclaim", "INTEGER"],
    ["owner", "tone", "TEXT"],
    ["owner", "gap", "REAL"],
    ["owner", "posts", "REAL"],
    ["owner", "weekday", "TEXT"],
    ["owner", "breadth", "INTEGER"],
    ["owner", "silence", "REAL"],
    ["owner", "followers", "INTEGER"],
    ["owner", "following", "INTEGER"],
    ["owner", "tweets", "INTEGER"],
    ["owner", "hours", "TEXT"],
    ["owner", "newconn", "INTEGER"],
    ["owner", "dormant", "INTEGER"],
    ["owner", "out7", "INTEGER"],
    ["owner", "in7", "INTEGER"],
    ["owner", "burst", "INTEGER"],
    ["owner", "peak_day", "TEXT"],
    ["owner", "peak_n", "INTEGER"],
    ["owner", "joined", "INTEGER"],
    ["owner", "likes", "INTEGER"],
  ];
  for (const [table, col, type] of want) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
      if (cols.some((c) => c.name === col)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    } catch {
      // 旧 DB の列追加に失敗しても既存機能は動かす
    }
  }
}

function openDb(rt: Runtime): DatabaseSync {
  fs.mkdirSync(rt.dir, { recursive: true });
  const db = new DatabaseSync(rt.file);
  db.exec(SCHEMA);
  ensureColumns(db);
  if (!rt.migrated) {
    rt.migrated = true;
    const hasCircles = db.prepare("SELECT COUNT(*) AS n FROM circles").get();
    const empty = !hasCircles || Number(hasCircles.n ?? 0) === 0;
    if (empty) {
      const legacy = readLegacy(rt.dir);
      if (legacy) {
        try {
          const n = importLegacy(db, legacy);
          markLegacyMigrated(rt.dir);
          rt.persist.lastError = `migrated ${n} circles from JSON`;
        } catch (err) {
          rt.persist.lastError = err instanceof Error ? err.message : String(err);
        }
      }
    }
  }
  try {
    const st = fs.statSync(rt.file);
    rt.persist.bytes = st.size;
    rt.persist.ok = true;
    rt.persist.lastWrite = Date.now();
  } catch {
    /* まだ無い */
  }
  return db;
}

function runtime(): Runtime {
  const g = globalThis as GlobalWithStats;
  let rt = g[GLOBAL_KEY];
  if (!rt) {
    const dir = resolveDir();
    const file = path.join(dir, DB_NAME);
    rt = {
      db: null,
      dir,
      file,
      opened: false,
      persist: { dir, file, ok: false, lastWrite: 0, bytes: 0, lastMs: 0 },
      timer: null,
      stmts: new Map(),
      migrated: false,
    };
    g[GLOBAL_KEY] = rt;
  }
  if (!rt.opened) {
    rt.opened = true;
    try {
      rt.db = openDb(rt);
    } catch (err) {
      rt.persist.ok = false;
      rt.persist.lastError = err instanceof Error ? err.message : String(err);
      rt.db = null;
    }
  }
  return rt;
}

function stmt(rt: Runtime, sql: string): Statement {
  const cached = rt.stmts.get(sql);
  if (cached) return cached;
  if (!rt.db) throw new Error("stats db is not open");
  const prepared = rt.db.prepare(sql);
  rt.stmts.set(sql, prepared);
  return prepared;
}

// ---------------------------------------------------------------------------
// 書き出し（WAL チェックポイント）
// ---------------------------------------------------------------------------

function captureDaily(db: DatabaseSync): void {
  const key = dayKey();
  const existing = db.prepare("SELECT 1 AS n FROM daily WHERE d=?").get(key);
  if (existing) return;
  const totals = db
    .prepare("SELECT COALESCE(SUM(mentions),0) AS m, COUNT(*) AS u FROM users WHERE appearances>0")
    .get();
  const top = db
    .prepare("SELECT screen, mentions FROM users WHERE appearances>0 ORDER BY mentions DESC LIMIT ?")
    .all(DAILY_TOP_N) as Array<Record<string, unknown>>;
  const payload = top.map((t) => [String(t.screen), Number(t.mentions ?? 0)] as [string, number]);
  db.prepare("INSERT OR REPLACE INTO daily(d, m, u, top) VALUES(?,?,?,?)").run(
    key,
    Number(totals?.m ?? 0),
    Number(totals?.u ?? 0),
    JSON.stringify(payload),
  );
  const cutoff = dayKey(Date.now() - DAILY_KEEP_DAYS * 86_400_000);
  db.prepare("DELETE FROM daily WHERE d < ?").run(cutoff);
}

async function persistNow(rt: Runtime): Promise<PersistInfo> {
  if (!rt.db) return rt.persist;
  const started = Date.now();
  try {
    captureDaily(rt.db);
    rt.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    const st = fs.statSync(rt.file);
    rt.persist.ok = true;
    rt.persist.lastError = undefined;
    rt.persist.bytes = st.size;
    rt.persist.lastWrite = Date.now();
  } catch (err) {
    rt.persist.ok = false;
    rt.persist.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    rt.persist.lastMs = Date.now() - started;
  }
  return rt.persist;
}

function schedulePersist(rt: Runtime, immediate = false): void {
  if (!rt.db) return;
  if (rt.timer) {
    if (!immediate) return;
    clearTimeout(rt.timer);
    rt.timer = null;
  }
  const wait = immediate ? 0 : Math.max(0, PERSIST_MIN_INTERVAL_MS - (Date.now() - rt.persist.lastWrite));
  rt.timer = setTimeout(() => {
    rt.timer = null;
    void persistNow(rt);
  }, wait);
  rt.timer.unref?.();
}

/** 集計をディスクへ反映する（書き込み自体は記録時に済んでいる） */
export async function flushStats(): Promise<PersistInfo> {
  const rt = runtime();
  if (rt.timer) {
    clearTimeout(rt.timer);
    rt.timer = null;
  }
  return persistNow(rt);
}

// ---------------------------------------------------------------------------
// 記録
// ---------------------------------------------------------------------------

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
  /** 本人→相手の返信速度（中央値・分） */
  replyMeMin?: number;
  /** 本人→相手の最速レス（秒） */
  fastestMeSec?: number;
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

/** サークル主（持ち主）自身の傾向。毎回上書きするので差分管理は不要。 */
export type StatsSelfInput = {
  displayName?: string;
  avgLen?: number;
  keigoRate?: number;
  exclaimRate?: number;
  streakDays?: number;
  laugh?: string;
  emojis?: string[];
  vocatives?: string[];
  words?: string[];
  /** 感情語の割合（thanks/love/tired/gloomy、%） */
  tone?: Record<string, number>;
  /** 投稿間隔の中央値（分） */
  postGapMin?: number;
  /** 1日あたりの投稿数 */
  postsPerDay?: number;
  /** 平日型 / 休日型 / 均等型 */
  weekdayType?: string;
  /** 話しかけられた相手の数 */
  breadth?: number;
  /** 最長の沈黙（日） */
  silence?: number;
  followers?: number;
  following?: number;
  tweets?: number;
  /** よく投稿する時間帯（上位1〜3件の時） */
  hours?: number[];
  /** 直近14日で新しくつながった相手の数 */
  newConn14d?: number;
  /** 直近14日以上返していない相手の数 */
  dormant14d?: number;
  /** 直近7日で自分が送った数 */
  sent7d?: number;
  /** 直近7日で自分が受け取った数 */
  received7d?: number;
  /** 連投（15分以内に3連投）の回数 */
  burstEpisodes?: number;
  /** 最多投稿日 */
  peakDay?: string;
  /** 最多投稿日の投稿数 */
  peakDayCount?: number;
  /** アカウント開設日時（epoch ms） */
  joinedAt?: number;
  /** いいね数 */
  likes?: number;
};

type PeerRow = {
  screen: string;
  n: number;
  r: number;
  s: number;
  k: number;
  h: number | null;
  l: number | null;
  rm: number | null;
  fs: number | null;
  rmm: number | null;
  fsm: number | null;
  al: number | null;
  kr: number | null;
  w7: number | null;
  wk: [number | null, number | null, number | null, number | null];
  fi: number | null;
};

const SUB_PEER = `
  UPDATE users SET
    appearances = MAX(0, appearances - 1),
    mentions = MAX(0, mentions - ?),
    received = MAX(0, received - ?),
    sent = MAX(0, sent - ?),
    rank_sum = MAX(0, rank_sum - ?),
    ranked_circles = MAX(0, ranked_circles - 1),
    rm_s = MAX(0, rm_s - ?), rm_c = MAX(0, rm_c - ?),
    al_s = MAX(0, al_s - ?), al_c = MAX(0, al_c - ?),
    kr_s = MAX(0, kr_s - ?), kr_c = MAX(0, kr_c - ?),
    rmm_s = MAX(0, rmm_s - ?), rmm_c = MAX(0, rmm_c - ?),
    w7 = MAX(0, w7 - ?),
    wk0 = MAX(0, wk0 - ?), wk1 = MAX(0, wk1 - ?),
    wk2 = MAX(0, wk2 - ?), wk3 = MAX(0, wk3 - ?)
  WHERE screen = ?`;

const UPSERT_PEER = `
  INSERT INTO users(
    screen, display_name, avatar, appearances, mentions, received, sent,
    rank_sum, ranked_circles, best_rank, first_seen, last_seen, last_active,
    rm_s, rm_c, al_s, al_c, kr_s, kr_c, w7, wk0, wk1, wk2, wk3, fst, fi,
    rmm_s, rmm_c, fsm
  ) VALUES(?,?,?,1,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(screen) DO UPDATE SET
    display_name = COALESCE(users.display_name, excluded.display_name),
    avatar = CASE
      WHEN (users.avatar IS NULL OR users.avatar = '') AND excluded.avatar IS NOT NULL
        THEN excluded.avatar
      ELSE users.avatar END,
    appearances = users.appearances + 1,
    mentions = users.mentions + excluded.mentions,
    received = users.received + excluded.received,
    sent = users.sent + excluded.sent,
    rank_sum = users.rank_sum + excluded.rank_sum,
    ranked_circles = users.ranked_circles + 1,
    best_rank = MIN(users.best_rank, excluded.best_rank),
    last_seen = MAX(users.last_seen, excluded.last_seen),
    last_active = CASE
      WHEN excluded.last_active IS NULL THEN users.last_active
      ELSE MAX(COALESCE(users.last_active, 0), excluded.last_active) END,
    rm_s = users.rm_s + excluded.rm_s,
    rm_c = users.rm_c + excluded.rm_c,
    al_s = users.al_s + excluded.al_s,
    al_c = users.al_c + excluded.al_c,
    kr_s = users.kr_s + excluded.kr_s,
    kr_c = users.kr_c + excluded.kr_c,
    w7 = users.w7 + excluded.w7,
    wk0 = users.wk0 + excluded.wk0,
    wk1 = users.wk1 + excluded.wk1,
    wk2 = users.wk2 + excluded.wk2,
    wk3 = users.wk3 + excluded.wk3,
    fst = CASE
      WHEN excluded.fst IS NULL THEN users.fst
      ELSE MIN(COALESCE(users.fst, 2147483647), excluded.fst) END,
    fi = CASE
      WHEN excluded.fi IS NULL THEN users.fi
      ELSE MIN(COALESCE(users.fi, 2147483647), excluded.fi) END,
    rmm_s = users.rmm_s + excluded.rmm_s,
    rmm_c = users.rmm_c + excluded.rmm_c,
    fsm = CASE
      WHEN excluded.fsm IS NULL THEN users.fsm
      ELSE MIN(COALESCE(users.fsm, 2147483647), excluded.fsm) END`;

function bumpAgg(rt: Runtime, kind: string, key: string, delta: number): void {
  stmt(
    rt,
    "INSERT INTO agg(kind, key, n) VALUES(?,?,?) ON CONFLICT(kind, key) DO UPDATE SET n = MAX(0, n + ?)",
  ).run(kind, key, Math.max(0, delta), delta);
  stmt(rt, "DELETE FROM agg WHERE kind=? AND key=? AND n<=0").run(kind, key);
}

function adjustHours(rt: Runtime, h: number, delta: number): void {
  if (!(h >= 0 && h < 24)) return;
  stmt(rt, "INSERT INTO hours(h, n) VALUES(?,?) ON CONFLICT(h) DO UPDATE SET n = MAX(0, n + ?)").run(
    h,
    Math.max(0, delta),
    delta,
  );
}

/** 1サークルぶんの寄与を足す（sign=1）/ 引く（sign=-1） */
function applyPeers(
  rt: Runtime,
  rows: PeerRow[],
  sign: 1 | -1,
  meta: Map<string, { displayName?: string; avatar?: string }>,
  now: number,
): void {
  const sub = sign < 0 ? stmt(rt, SUB_PEER) : null;
  const upsert = sign > 0 ? stmt(rt, UPSERT_PEER) : null;
  for (const p of rows) {
    const wk0 = p.wk[0] ?? 0;
    const wk1 = p.wk[1] ?? 0;
    const wk2 = p.wk[2] ?? 0;
    const wk3 = p.wk[3] ?? 0;
    const rmC = p.rm === null ? 0 : 1;
    const alC = p.al === null ? 0 : 1;
    const krC = p.kr === null ? 0 : 1;
    if (sign > 0 && upsert) {
      const m = meta.get(p.screen);
      const avatar = isUsableAvatar(m?.avatar) ? m.avatar : null;
      upsert.run(
        p.screen,
        m?.displayName ?? null,
        avatar,
        p.n,
        p.r,
        p.s,
        p.k,
        p.k,
        now,
        now,
        p.l,
        p.rm ?? 0,
        rmC,
        p.al ?? 0,
        alC,
        p.kr ?? 0,
        krC,
        p.w7 ?? 0,
        wk0,
        wk1,
        wk2,
        wk3,
        p.fs,
        p.fi,
        p.rmm ?? 0,
        p.rmm === null ? 0 : 1,
        p.fsm,
      );
    } else if (sub) {
      sub.run(
        p.n,
        p.r,
        p.s,
        p.k,
        p.rm ?? 0,
        rmC,
        p.al ?? 0,
        alC,
        p.kr ?? 0,
        krC,
        p.rmm ?? 0,
        p.rmm === null ? 0 : 1,
        p.w7 ?? 0,
        wk0,
        wk1,
        wk2,
        wk3,
        p.screen,
      );
    }
    if (p.h !== null) adjustHours(rt, p.h, sign);
  }
  if (sign < 0) {
    stmt(rt, "DELETE FROM users WHERE appearances<=0 OR ranked_circles<=0").run();
  }
}

function dropCircle(rt: Runtime, handle: string): boolean {
  const circle = stmt(rt, "SELECT 1 AS n FROM circles WHERE handle=?").get(handle);
  if (!circle) return false;
  const peerRows = stmt(
    rt,
    `SELECT screen, n, r, s, k, h, l, rm, fs, rmm, fsm, al, kr, w7, wk0, wk1, wk2, wk3, fi
     FROM peers WHERE circle=?`,
  ).all(handle) as Array<Record<string, unknown>>;
  const rows: PeerRow[] = peerRows.map((x) => ({
    screen: String(x.screen),
    n: Number(x.n ?? 0),
    r: Number(x.r ?? 0),
    s: Number(x.s ?? 0),
    k: Number(x.k ?? 1),
    h: x.h === null ? null : Number(x.h),
    l: x.l === null ? null : Number(x.l),
    rm: x.rm === null ? null : Number(x.rm),
    fs: x.fs === null ? null : Number(x.fs),
    rmm: x.rmm === null ? null : Number(x.rmm),
    fsm: x.fsm === null ? null : Number(x.fsm),
    al: x.al === null ? null : Number(x.al),
    kr: x.kr === null ? null : Number(x.kr),
    w7: x.w7 === null ? null : Number(x.w7),
    wk: [
      x.wk0 === null ? null : Number(x.wk0),
      x.wk1 === null ? null : Number(x.wk1),
      x.wk2 === null ? null : Number(x.wk2),
      x.wk3 === null ? null : Number(x.wk3),
    ],
    fi: x.fi === null ? null : Number(x.fi),
  }));
  applyPeers(rt, rows, -1, new Map(), Date.now());

  const prevAgg = stmt(rt, "SELECT kind, key, n FROM circle_agg WHERE circle=?").all(handle) as Array<
    Record<string, unknown>
  >;
  for (const a of prevAgg) {
    bumpAgg(rt, String(a.kind), String(a.key), -Number(a.n ?? 0));
  }
  stmt(rt, "DELETE FROM circle_agg WHERE circle=?").run(handle);
  stmt(rt, "DELETE FROM peers WHERE circle=?").run(handle);
  stmt(rt, "DELETE FROM circles WHERE handle=?").run(handle);
  return true;
}

/**
 * 1サークルぶんの集計を記録する。
 * peers は交流回数の降順で渡ってくる前提（payload 側でソート済み）。
 */
export function recordCircleStats(handle: string, peers: StatsPeerInput[], self?: StatsSelfInput): void {
  try {
    if (!handle || !Array.isArray(peers) || peers.length === 0) return;
    const rt = runtime();
    if (!rt.db) return;
    const key = handle.trim().toLowerCase().replace(/^@+/, "");
    if (!key) return;
    const now = Date.now();

    const rows: PeerRow[] = [];
    const meta = new Map<string, { displayName?: string; avatar?: string }>();
    const agg = new Map<string, Map<string, number>>([
      ["emoji", new Map()],
      ["laugh", new Map()],
      ["vocative", new Map()],
    ]);
    let total = 0;

    const limit = peers.length;
    for (let i = 0; i < limit; i++) {
      const p = peers[i];
      const screen = (p.screenName ?? "").trim().toLowerCase();
      if (!screen || screen === key) continue;
      const n = Math.max(0, p.interactionCount ?? (p.mentionsReceived ?? 0) + (p.mentionsSent ?? 0));
      if (n <= 0) continue;
      total += n;
      const weekly = Array.isArray(p.weekly) && p.weekly.length === 4 ? p.weekly : null;
      rows.push({
        screen,
        n,
        r: Math.max(0, p.mentionsReceived ?? 0),
        s: Math.max(0, p.mentionsSent ?? 0),
        k: i + 1,
        h: typeof p.activeHour === "number" && p.activeHour >= 0 && p.activeHour < 24 ? p.activeHour : null,
        l: toDayNum(p.lastInteractionAt) ?? null,
        rm: typeof p.replyThemMin === "number" && p.replyThemMin >= 0 ? p.replyThemMin : null,
        fs: typeof p.fastestThemSec === "number" && p.fastestThemSec > 0 ? p.fastestThemSec : null,
        rmm: typeof p.replyMeMin === "number" && p.replyMeMin >= 0 ? p.replyMeMin : null,
        fsm: typeof p.fastestMeSec === "number" && p.fastestMeSec > 0 ? p.fastestMeSec : null,
        al: typeof p.avgLen === "number" && p.avgLen > 0 ? p.avgLen : null,
        kr: typeof p.keigoRate === "number" && p.keigoRate >= 0 ? p.keigoRate : null,
        w7: typeof p.mentionsLast7d === "number" ? p.mentionsLast7d : null,
        wk: weekly
          ? [
              Math.max(0, Math.round(weekly[0] ?? 0)),
              Math.max(0, Math.round(weekly[1] ?? 0)),
              Math.max(0, Math.round(weekly[2] ?? 0)),
              Math.max(0, Math.round(weekly[3] ?? 0)),
            ]
          : [null, null, null, null],
        fi: toDayNum(p.firstInteractionAt) ?? null,
      });
      const rawAvatar = p.avatarUrl?.trim() || p.avatarUrlPreview?.trim() || undefined;
      const avatar = isUsableAvatar(rawAvatar) ? rawAvatar : undefined;
      if (p.displayName || avatar) meta.set(screen, { displayName: p.displayName, avatar });
      if (i < 20) {
        for (const e of p.topEmojis ?? []) {
          if (!e) continue;
          agg.get("emoji")!.set(e, (agg.get("emoji")!.get(e) ?? 0) + 1);
        }
        if (p.laugh) agg.get("laugh")!.set(p.laugh, (agg.get("laugh")!.get(p.laugh) ?? 0) + 1);
        if (p.vocative) agg.get("vocative")!.set(p.vocative, (agg.get("vocative")!.get(p.vocative) ?? 0) + 1);
      }
    }

    // 中身が無いときは前回ぶんを消さない
    if (rows.length === 0) return;

    const isNew = !stmt(rt, "SELECT 1 AS n FROM circles WHERE handle=?").get(key);
    rt.db.exec("BEGIN IMMEDIATE;");
    try {
      dropCircle(rt, key);

      stmt(rt, "INSERT INTO circles(handle, at, total, users) VALUES(?,?,?,?)").run(key, now, total, peers.length);
    const insertPeer = stmt(
      rt,
      `INSERT INTO peers(
         circle, screen, n, r, s, k, h, l, rm, fs, rmm, fsm, al, kr, w7, wk0, wk1, wk2, wk3, fi
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const p of rows) {
      insertPeer.run(
        key,
        p.screen,
        p.n,
        p.r,
        p.s,
        p.k,
        p.h,
        p.l,
        p.rm,
        p.fs,
        p.rmm,
        p.fsm,
        p.al,
        p.kr,
        p.w7,
        p.wk[0],
        p.wk[1],
        p.wk[2],
        p.wk[3],
        p.fi,
      );
    }
    applyPeers(rt, rows, 1, meta, now);

    const insertCircleAgg = stmt(rt, "INSERT OR REPLACE INTO circle_agg(circle, kind, key, n) VALUES(?,?,?,?)");
    for (const [kind, map] of agg) {
      for (const [k, n] of map) {
        insertCircleAgg.run(key, kind, k, n);
        bumpAgg(rt, kind, k, n);
      }
    }

    if (self) {
      stmt(
        rt,
        `INSERT INTO owner(handle, display, avg_len, keigo, streak, laugh, emojis, vocatives, words,
                           exclaim, tone, gap, posts, weekday, breadth, silence, followers, following, tweets, hours,
                           newconn, dormant, out7, in7, burst, peak_day, peak_n, joined, likes, at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(handle) DO UPDATE SET
           display = COALESCE(excluded.display, owner.display),
           avg_len = COALESCE(excluded.avg_len, owner.avg_len),
           keigo = COALESCE(excluded.keigo, owner.keigo),
           streak = COALESCE(excluded.streak, owner.streak),
           laugh = COALESCE(excluded.laugh, owner.laugh),
           emojis = COALESCE(excluded.emojis, owner.emojis),
           vocatives = COALESCE(excluded.vocatives, owner.vocatives),
           words = COALESCE(excluded.words, owner.words),
           exclaim = COALESCE(excluded.exclaim, owner.exclaim),
           tone = COALESCE(excluded.tone, owner.tone),
           gap = COALESCE(excluded.gap, owner.gap),
           posts = COALESCE(excluded.posts, owner.posts),
           weekday = COALESCE(excluded.weekday, owner.weekday),
           breadth = COALESCE(excluded.breadth, owner.breadth),
           silence = COALESCE(excluded.silence, owner.silence),
           followers = COALESCE(excluded.followers, owner.followers),
           following = COALESCE(excluded.following, owner.following),
           tweets = COALESCE(excluded.tweets, owner.tweets),
           hours = COALESCE(excluded.hours, owner.hours),
           newconn = COALESCE(excluded.newconn, owner.newconn),
           dormant = COALESCE(excluded.dormant, owner.dormant),
           out7 = COALESCE(excluded.out7, owner.out7),
           in7 = COALESCE(excluded.in7, owner.in7),
           burst = COALESCE(excluded.burst, owner.burst),
           peak_day = COALESCE(excluded.peak_day, owner.peak_day),
           peak_n = COALESCE(excluded.peak_n, owner.peak_n),
           joined = COALESCE(excluded.joined, owner.joined),
           likes = COALESCE(excluded.likes, owner.likes),
           at = excluded.at`,
      ).run(
        key,
        tidyName(self.displayName),
        numOrNull(self.avgLen, 0),
        numOrNull(self.keigoRate, 0),
        numOrNull(self.streakDays, -1),
        tidyName(self.laugh),
        jsonList(self.emojis),
        jsonList(self.vocatives),
        jsonList(self.words),
        numOrNull(self.exclaimRate, 0),
        self.tone ? JSON.stringify(self.tone) : null,
        numOrNull(self.postGapMin, 0),
        numOrNull(self.postsPerDay, 0),
        tidyName(self.weekdayType),
        numOrNull(self.breadth, 0),
        numOrNull(self.silence, 0),
        numOrNull(self.followers, 0),
        numOrNull(self.following, 0),
        numOrNull(self.tweets, 0),
        Array.isArray(self.hours) && self.hours.length > 0
          ? JSON.stringify(self.hours.slice(0, 24).map((h) => Math.max(0, Math.min(23, Number(h) || 0))))
          : null,
        numOrNull(self.newConn14d, 0),
        numOrNull(self.dormant14d, 0),
        numOrNull(self.sent7d, 0),
        numOrNull(self.received7d, 0),
        numOrNull(self.burstEpisodes, 0),
        tidyName(self.peakDay),
        numOrNull(self.peakDayCount, 0),
        numOrNull(self.joinedAt, 0),
        numOrNull(self.likes, 0),
        now,
      );
    }

    setMeta(rt.db, "updatedAt", String(now));
    const builds = Number(getMeta(rt.db, "builds") ?? "0") + 1;
    setMeta(rt.db, "builds", String(builds));
    rt.db.exec("COMMIT;");
    schedulePersist(rt, isNew);
    } catch (inner) {
      try {
        rt.db.exec("ROLLBACK;");
      } catch {
        /* トランザクション外なら無視 */
      }
      throw inner;
    }
  } catch {
    // 統計はおまけ。payload ビルドを絶対に壊さない
  }
}

// ---------------------------------------------------------------------------
// 読み出し
// ---------------------------------------------------------------------------

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

/** サークル主（持ち主）自身の傾向1行 */
export type StatsOwnerRow = {
  screenName: string;
  displayName?: string;
  avgLen?: number;
  keigo?: number;
  streak?: number;
  laugh?: string;
  emojis: string[];
  exclaim?: number;
  followers?: number;
  /** 直近14日で新しくつながった相手の数 */
  newConn?: number;
  /** 直近14日以上返していない相手の数（サークル内） */
  dormant?: number;
  /** 連投の回数 */
  burst?: number;
  /** 最多投稿日の投稿数 */
  peakCount?: number;
  /** アカウント開設日時（epoch ms） */
  joined?: number;
};

export type StatsOwnerBoard = {
  count: number;
  longest: StatsOwnerRow[];
  keigo: StatsOwnerRow[];
  exclaim: StatsOwnerRow[];
  followers: StatsOwnerRow[];
  /** 直近14日で新しくつながった相手が多い順 */
  newConn: StatsOwnerRow[];
  /** 14日以上沈黙している相手が多い順 */
  dormant: StatsOwnerRow[];
  /** 最多投稿日ランキング（日付と件数） */
  peakDays: Array<{ screenName: string; day: string; n: number }>;
  /** アカウント開設からの日数の中央値 */
  medianAge: number;
  /** サークル主のピーク時間帯の合計（24要素） */
  hours: number[];
  /** 感情語の平均（%） */
  tone: { thanks: number; love: number; tired: number; gloomy: number };
  weekday: Array<{ key: string; n: number }>;
  laughs: Array<{ key: string; n: number }>;
  emojis: Array<{ key: string; n: number }>;
  vocatives: Array<{ key: string; n: number }>;
  words: Array<{ key: string; n: number }>;
};

export type StatsSnapshot = {
  updatedAt: number;
  circleCount: number;
  userCount: number;
  totalMentions: number;
  builds: number;
  persist: PersistInfo;
  rankings: {
    appearances: StatsRankRow[];
    mentions: StatsRankRow[];
    rank: StatsRankRow[];
    recent: StatsRankRow[];
    fastest: StatsMetricRow[];
    reply: StatsMetricRow[];
    fastestMe: StatsMetricRow[];
    replyMe: StatsMetricRow[];
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
  owners: StatsOwnerBoard;
};

const RANK_COLS = `screen, display_name, avatar, appearances, mentions, received, sent,
  rank_sum, ranked_circles, best_rank, last_seen, last_active,
  CASE WHEN ranked_circles > 0 THEN rank_sum * 1.0 / ranked_circles ELSE 999 END AS avg_rank`;

function toRankRow(x: Record<string, unknown>): StatsRankRow {
  const avatar = isUsableAvatar(str(x.avatar)) ? String(x.avatar) : undefined;
  const lastActive = x.last_active === null || x.last_active === undefined ? null : Number(x.last_active);
  return {
    screenName: String(x.screen),
    displayName: str(x.display_name) ?? undefined,
    avatar,
    appearances: Number(x.appearances ?? 0),
    mentions: Number(x.mentions ?? 0),
    received: Number(x.received ?? 0),
    sent: Number(x.sent ?? 0),
    avgRank: Math.round(Number(x.avg_rank ?? 999) * 10) / 10,
    bestRank: Number(x.best_rank ?? 0) >= 2147483647 ? 0 : Number(x.best_rank ?? 0),
    lastSeen: lastActive ? lastActive * 86_400_000 : Number(x.last_seen ?? 0),
  };
}

function toMetricRow(x: Record<string, unknown>, value: number): StatsMetricRow {
  return {
    screenName: String(x.screen),
    displayName: str(x.display_name) ?? undefined,
    avatar: isUsableAvatar(str(x.avatar)) ? String(x.avatar) : undefined,
    value: Math.round(value * 10) / 10,
  };
}

function topAgg(rt: Runtime, kind: string, limit: number): Array<{ key: string; n: number }> {
  const rows = stmt(rt, "SELECT key, n FROM agg WHERE kind=? AND n>0 ORDER BY n DESC LIMIT ?").all(kind, limit) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({ key: String(r.key), n: Number(r.n ?? 0) }));
}

export function getStatsSnapshot(): StatsSnapshot {
  const rt = runtime();
  const db = rt.db;
  if (!db) {
    return {
      updatedAt: 0,
      circleCount: 0,
      userCount: 0,
      totalMentions: 0,
      builds: 0,
      persist: { ...rt.persist },
      rankings: {
        appearances: [],
        mentions: [],
        rank: [],
        recent: [],
        fastest: [],
        reply: [],
        fastestMe: [],
        replyMe: [],
        longest: [],
        keigo: [],
        rising: [],
        bond: [],
        growth: [],
      },
      trend: [],
      emojis: [],
      laughs: [],
      vocatives: [],
      hours: new Array(24).fill(0) as number[],
      circles: [],
      owners: EMPTY_OWNER_BOARD(),
    };
  }

  captureDaily(db);

  const byAppearances = db
    .prepare(`SELECT ${RANK_COLS} FROM users WHERE appearances>0 ORDER BY appearances DESC, mentions DESC LIMIT 100`)
    .all()
    .map(toRankRow);

  const byMentions = db
    .prepare(`SELECT ${RANK_COLS} FROM users WHERE appearances>0 ORDER BY mentions DESC, appearances DESC LIMIT 60`)
    .all()
    .map(toRankRow);

  const byRank = db
    .prepare(
      `SELECT ${RANK_COLS} FROM users WHERE ranked_circles>=2
       ORDER BY (rank_sum * 1.0 / ranked_circles) ASC, appearances DESC LIMIT 40`,
    )
    .all()
    .map(toRankRow);

  const recent = db
    .prepare(
      `SELECT ${RANK_COLS} FROM users WHERE appearances>0
       ORDER BY COALESCE(last_active, 0) DESC, last_seen DESC LIMIT 20`,
    )
    .all()
    .map(toRankRow);

  const fastest = db
    .prepare(
      `SELECT screen, display_name, avatar, fst AS v FROM users
       WHERE appearances>0 AND fst IS NOT NULL AND fst > 0
       ORDER BY fst ASC LIMIT 30`,
    )
    .all()
    .map((x) => toMetricRow(x, Number(x.v ?? 0)));

  const reply = db
    .prepare(
      `SELECT screen, display_name, avatar, (rm_s / rm_c) AS v FROM users
       WHERE appearances>0 AND rm_c > 0 ORDER BY (rm_s / rm_c) ASC LIMIT 30`,
    )
    .all()
    .map((x) => toMetricRow(x, Number(x.v ?? 0)));

  const fastestMe = db
    .prepare(
      `SELECT screen, display_name, avatar, fsm AS v FROM users
       WHERE appearances>0 AND fsm IS NOT NULL AND fsm > 0
       ORDER BY fsm ASC LIMIT 30`,
    )
    .all()
    .map((x) => toMetricRow(x, Number(x.v ?? 0)));

  const replyMe = db
    .prepare(
      `SELECT screen, display_name, avatar, (rmm_s / rmm_c) AS v FROM users
       WHERE appearances>0 AND rmm_c > 0 ORDER BY (rmm_s / rmm_c) ASC LIMIT 30`,
    )
    .all()
    .map((x) => toMetricRow(x, Number(x.v ?? 0)));

  const longest = db
    .prepare(
      `SELECT screen, display_name, avatar, mentions, (al_s / al_c) AS v FROM users
       WHERE appearances>0 AND al_c > 0
       ORDER BY (al_s / al_c) DESC, mentions DESC LIMIT 30`,
    )
    .all()
    .map((x) => toMetricRow(x, Number(x.v ?? 0)));

  const keigo = db
    .prepare(
      `SELECT screen, display_name, avatar, (kr_s / kr_c) AS v FROM users
       WHERE appearances>0 AND kr_c >= 2 ORDER BY (kr_s / kr_c) DESC LIMIT 20`,
    )
    .all()
    .map((x) => toMetricRow(x, Number(x.v ?? 0)));

  const rising = db
    .prepare(
      `SELECT screen, display_name, avatar, mentions, w7 AS v FROM users
       WHERE appearances>0 AND w7 > 0 ORDER BY w7 DESC, mentions DESC LIMIT 30`,
    )
    .all()
    .map((x) => toMetricRow(x, Number(x.v ?? 0)));

  const today = Math.floor(Date.now() / 86_400_000);
  const bond = db
    .prepare(
      `SELECT screen, display_name, avatar, fi AS v FROM users
       WHERE appearances>0 AND fi IS NOT NULL ORDER BY fi ASC LIMIT 30`,
    )
    .all()
    .map((x) => toMetricRow(x, Math.max(0, today - Number(x.v ?? today))));

  const dailyRows = db.prepare("SELECT d, m, u FROM daily ORDER BY d ASC").all() as Array<Record<string, unknown>>;
  const trend: StatsTrendPoint[] = dailyRows.slice(-30).map((r) => ({
    d: String(r.d),
    m: Number(r.m ?? 0),
    u: Number(r.u ?? 0),
  }));

  // 伸び（直近7日で最も古いスナップショットとの差分）
  const baseRow = dailyRows.length > 1 ? dailyRows[Math.max(0, dailyRows.length - 7)] : null;
  let baseTop = new Map<string, number>();
  if (baseRow) {
    const raw = db.prepare("SELECT top FROM daily WHERE d=?").get(String(baseRow.d));
    try {
      const parsed = JSON.parse(String(raw?.top ?? "[]")) as Array<[string, number]>;
      baseTop = new Map(parsed);
    } catch {
      baseTop = new Map();
    }
  }
  const growthRows = db
    .prepare(
      "SELECT screen, display_name, avatar, mentions FROM users WHERE appearances>0 ORDER BY mentions DESC LIMIT 5000",
    )
    .all() as Array<Record<string, unknown>>;
  const growth = growthRows
    .map((x) => {
      const mentions = Number(x.mentions ?? 0);
      const before = baseTop.get(String(x.screen));
      return { row: x, diff: before === undefined ? 0 : mentions - before };
    })
    .filter((x) => x.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 20)
    .map((x) => toMetricRow(x.row, x.diff));

  const circleCount = Number(db.prepare("SELECT COUNT(*) AS n FROM circles").get()?.n ?? 0);
  const totals = db
    .prepare("SELECT COALESCE(SUM(mentions),0) AS m, COUNT(*) AS u FROM users WHERE appearances>0")
    .get();
  const circles = (
    db.prepare("SELECT handle, users, total, at FROM circles ORDER BY at DESC LIMIT 1000").all() as Array<
      Record<string, unknown>
    >
  ).map((c) => ({
    screenName: String(c.handle),
    users: Number(c.users ?? 0),
    total: Number(c.total ?? 0),
    at: Number(c.at ?? 0),
  }));

  const hoursRow = db.prepare("SELECT h, n FROM hours").all() as Array<Record<string, unknown>>;
  const hours = new Array(24).fill(0) as number[];
  for (const r of hoursRow) {
    const h = Number(r.h);
    if (h >= 0 && h < 24) hours[h] = Math.max(0, Number(r.n ?? 0));
  }

  return {
    updatedAt: Number(getMeta(db, "updatedAt") ?? "0"),
    circleCount,
    userCount: Number(totals?.u ?? 0),
    totalMentions: Math.max(0, Number(totals?.m ?? 0)),
    builds: Number(getMeta(db, "builds") ?? "0"),
    persist: { ...rt.persist },
    rankings: {
      appearances: byAppearances,
      mentions: byMentions,
      rank: byRank,
      recent,
      fastest,
      reply,
      fastestMe,
      replyMe,
      longest,
      keigo,
      rising,
      bond,
      growth,
    },
    trend,
    emojis: topAgg(rt, "emoji", 36),
    laughs: topAgg(rt, "laugh", 8),
    vocatives: topAgg(rt, "vocative", 30),
    hours,
    circles,
    owners: ownerBoard(db),
  };
}

function EMPTY_OWNER_BOARD(): StatsOwnerBoard {
  return {
    count: 0,
    longest: [],
    keigo: [],
    exclaim: [],
    followers: [],
    newConn: [],
    dormant: [],
    peakDays: [],
    medianAge: 0,
    hours: new Array(24).fill(0) as number[],
    tone: { thanks: 0, love: 0, tired: 0, gloomy: 0 },
    weekday: [],
    laughs: [],
    emojis: [],
    vocatives: [],
    words: [],
  };
}

/** サークル主のピーク時間帯を合算する（各人の上位1〜3時間に1票ずつ） */
function sumHours(rows: Array<Record<string, unknown>>): number[] {
  const out = new Array(24).fill(0) as number[];
  for (const r of rows) {
    let arr: unknown = null;
    try {
      const raw = r.hours;
      arr = typeof raw === "string" ? (JSON.parse(raw) as unknown) : null;
    } catch {
      arr = null;
    }
    if (!Array.isArray(arr)) continue;
    for (const raw of arr) {
      const h = Number(raw);
      if (Number.isInteger(h) && h >= 0 && h < 24) out[h] += 1;
    }
  }
  return out;
}

/** 感情語プロファイルの平均（tone を持つサークル主だけを母数にする） */
function avgTone(rows: Array<Record<string, unknown>>): { thanks: number; love: number; tired: number; gloomy: number } {
  const keys = ["thanks", "love", "tired", "gloomy"] as const;
  const sum: Record<string, number> = { thanks: 0, love: 0, tired: 0, gloomy: 0 };
  let n = 0;
  for (const r of rows) {
    let obj: Record<string, unknown> | null = null;
    try {
      const raw = r.tone;
      obj = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      obj = null;
    }
    if (!obj || typeof obj !== "object") continue;
    n += 1;
    for (const k of keys) {
      const v = Number(obj[k]);
      if (Number.isFinite(v)) sum[k] += v;
    }
  }
  if (n === 0) return { thanks: 0, love: 0, tired: 0, gloomy: 0 };
  return {
    thanks: Math.round(sum.thanks / n),
    love: Math.round(sum.love / n),
    tired: Math.round(sum.tired / n),
    gloomy: Math.round(sum.gloomy / n),
  };
}

/** アカウント開設からの日数の中央値 */
function medianAge(rows: Array<Record<string, unknown>>): number {
  const now = Date.now();
  const ages = rows
    .map((r) => (r.joined === null || r.joined === undefined ? NaN : now - Number(r.joined)))
    .filter((v) => Number.isFinite(v) && v > 0)
    .map((v) => Math.floor(v / 86_400_000))
    .sort((a, b) => a - b);
  if (ages.length === 0) return 0;
  const mid = Math.floor(ages.length / 2);
  return ages.length % 2 === 0 ? Math.round((ages[mid - 1] + ages[mid]) / 2) : ages[mid];
}

/** サークル主たちの傾向（1ハンドル1行なのでスキャンで十分） */
function ownerBoard(db: DatabaseSync): StatsOwnerBoard {
  try {
    const rows = db
      .prepare(
        "SELECT handle, display, avg_len, keigo, streak, laugh, emojis, vocatives, words, exclaim, followers, tone, weekday, hours, newconn, dormant, burst, peak_day, peak_n, joined FROM owner",
      )
      .all() as Array<Record<string, unknown>>;
    if (rows.length === 0) return EMPTY_OWNER_BOARD();
    const toRow = (r: Record<string, unknown>): StatsOwnerRow => ({
      screenName: String(r.handle ?? ""),
      displayName: (r.display as string | null) ?? undefined,
      avgLen: r.avg_len === null ? undefined : Number(r.avg_len),
      keigo: r.keigo === null ? undefined : Number(r.keigo),
      streak: r.streak === null ? undefined : Number(r.streak),
      laugh: (r.laugh as string | null) ?? undefined,
      emojis: parseList(r.emojis),
      exclaim: r.exclaim === null ? undefined : Number(r.exclaim),
      followers: r.followers === null ? undefined : Number(r.followers),
      newConn: r.newconn === null ? undefined : Number(r.newconn),
      dormant: r.dormant === null ? undefined : Number(r.dormant),
      burst: r.burst === null ? undefined : Number(r.burst),
      peakCount: r.peak_n === null ? undefined : Number(r.peak_n),
      joined: r.joined === null ? undefined : Number(r.joined),
    });
    const pick = (
      key: "avg_len" | "keigo" | "exclaim" | "followers" | "newconn" | "dormant" | "burst" | "peak_n",
      limit: number,
    ): StatsOwnerRow[] =>
      rows
        .filter((r) => r[key] !== null && Number(r[key]) > 0)
        .sort((a, b) => Number(b[key]) - Number(a[key]))
        .slice(0, limit)
        .map(toRow);
    return {
      count: rows.length,
      longest: pick("avg_len", 10),
      keigo: pick("keigo", 10),
      exclaim: pick("exclaim", 10),
      followers: pick("followers", 10),
      newConn: pick("newconn", 10),
      dormant: pick("dormant", 10),
      peakDays: rows
        .filter((r) => typeof r.peak_day === "string" && Number(r.peak_n) > 0)
        .sort((a, b) => Number(b.peak_n) - Number(a.peak_n))
        .slice(0, 5)
        .map((r) => ({
          screenName: String(r.handle ?? ""),
          day: String(r.peak_day),
          n: Number(r.peak_n),
        })),
      medianAge: medianAge(rows),
      hours: sumHours(rows),
      tone: avgTone(rows),
      weekday: countList(
        rows.map((r) => (r.weekday as string | null) ?? "").filter(Boolean),
        3,
      ),
      laughs: countList(
        rows.map((r) => (r.laugh as string | null) ?? "").filter(Boolean),
        8,
      ),
      emojis: countList(rows.flatMap((r) => parseList(r.emojis)), 24),
      vocatives: countList(rows.flatMap((r) => parseList(r.vocatives)), 20),
      words: countList(rows.flatMap((r) => parseList(r.words)), 24),
    };
  } catch {
    return EMPTY_OWNER_BOARD();
  }
}

/**
 * まだ集計していないハンドルの候補（芋づる式クロールの起点）。
 * 集計済みサークルの登場人物を、何サークルに出ているかで重み付けして返す。
 */
export function getStatsCandidates(limit = 200): { screenName: string; circles: number; mentions: number }[] {
  try {
    const rt = runtime();
    const rows = stmt(
      rt,
      `SELECT p.screen AS screen, COUNT(*) AS c, SUM(p.n) AS m
         FROM peers p
         LEFT JOIN circles c ON c.handle = p.screen
        WHERE c.handle IS NULL
        GROUP BY p.screen
        ORDER BY c DESC, m DESC
        LIMIT ?`,
    ).all(Math.max(1, Math.min(2000, limit))) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      screenName: String(r.screen),
      circles: Number(r.c ?? 0),
      mentions: Number(r.m ?? 0),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// アバター
// ---------------------------------------------------------------------------

const AVATAR_RETRY_MS = 10 * 60 * 1000;

/** バックフィルの再試行間隔をリセットする（force 用） */
export function resetAvatarAttempts(): void {
  const rt = runtime();
  if (!rt.db) return;
  try {
    stmt(rt, "DELETE FROM avatar_tries").run();
  } catch {
    /* noop */
  }
}

/** 解決を試みたことを記録する（失敗した相手を毎回叩かない） */
export function noteAvatarAttempt(screenName: string): void {
  const rt = runtime();
  if (!rt.db) return;
  try {
    stmt(rt, "INSERT OR REPLACE INTO avatar_tries(screen, at) VALUES(?,?)").run(
      screenName.toLowerCase(),
      Date.now(),
    );
  } catch {
    /* noop */
  }
}

/**
 * 解決済みのアバターURLを保存する（fxtwitter の高画質URLを想定）。
 * 保存済み・不正URLは false。
 */
export function setUserAvatar(screenName: string, url: string): boolean {
  const rt = runtime();
  if (!rt.db) return false;
  if (!isUsableAvatar(url)) return false;
  try {
    const key = screenName.toLowerCase();
    const cur = stmt(rt, "SELECT avatar FROM users WHERE screen=?").get(key);
    if (!cur) return false;
    if (isUsableAvatar(str(cur.avatar))) return false;
    stmt(rt, "UPDATE users SET avatar=? WHERE screen=?").run(url, key);
    schedulePersist(rt);
    return true;
  } catch {
    return false;
  }
}

/** アバター未取得のハンドルを登場回数の多い順に返す（バックフィル対象） */
export function getAvatarBackfillTargets(limit = 30): string[] {
  const rt = runtime();
  if (!rt.db) return [];
  try {
    const since = Date.now() - AVATAR_RETRY_MS;
    const rows = stmt(
      rt,
      `SELECT u.screen AS screen FROM users u
         LEFT JOIN avatar_tries a ON a.screen = u.screen
        WHERE u.appearances > 0
          AND (u.avatar IS NULL OR u.avatar = '')
          AND (a.at IS NULL OR a.at < ?)
        ORDER BY u.appearances DESC, u.mentions DESC
        LIMIT ?`,
    ).all(since, Math.max(1, Math.min(400, limit))) as Array<Record<string, unknown>>;
    return rows.map((r) => String(r.screen));
  } catch {
    return [];
  }
}

/** 計測用（デバッグ・検証スクリプト向け） */
export function getStatsMeta(): {
  circles: number;
  users: number;
  avatars: number;
  pruned: number;
  persist: PersistInfo;
} {
  const rt = runtime();
  if (!rt.db) {
    return { circles: 0, users: 0, avatars: 0, pruned: 0, persist: { ...rt.persist } };
  }
  const c = rt.db.prepare("SELECT COUNT(*) AS n FROM circles").get();
  const u = rt.db.prepare("SELECT COUNT(*) AS n FROM users").get();
  const a = rt.db.prepare("SELECT COUNT(*) AS n FROM users WHERE avatar IS NOT NULL AND avatar <> ''").get();
  return {
    circles: Number(c?.n ?? 0),
    users: Number(u?.n ?? 0),
    avatars: Number(a?.n ?? 0),
    // 件数上限は撤廃したので常に 0（旧 API 互換）
    pruned: 0,
    persist: { ...rt.persist },
  };
}
