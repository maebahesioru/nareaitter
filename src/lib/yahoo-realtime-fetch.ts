import type {
  YahooPaginationResponse,
  YahooRealtimeEntry,
} from "@/types/yahoo-realtime";

function normalizeYahooProfileImageUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const u = t.startsWith("//") ? `https:${t}` : t;
  if (!/^https:\/\//i.test(u)) return null;
  try {
    if (new URL(u).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return u;
}

export function buildYahooAuthorProfileImageMap(
  mentionsToYou: YahooRealtimeEntry[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of mentionsToYou) {
    const sn = e.screenName?.trim();
    if (!sn) continue;
    const key = sn.toLowerCase();
    if (map[key]) continue;
    const u = normalizeYahooProfileImageUrl(e.profileImage ?? "");
    if (u) map[key] = u;
  }
  return map;
}

export function pickSelfProfileImageFromYahoo(
  mentionsFromYou: YahooRealtimeEntry[],
): string | null {
  for (const e of mentionsFromYou) {
    const u = normalizeYahooProfileImageUrl(e.profileImage ?? "");
    if (u) return u;
  }
  return null;
}

// ── 取得戦略 ────────────────────────────────────
//
// 優先順:
//   1. 直接（サーバーが国内にある前提）が最速かつ安定（実測 0.2〜0.4 秒 / 20 並列で 200）
//   2. YAHOO_HTTP_PROXY（http(s):// のプロキシ。VM100 の WARP 出口プロキシ）
//
// 1 が連続で失敗したらしばらく 2 を優先する。スクレイプ系プロキシプールや
// Cloudflare Worker リレーは 2026-09 に廃止（プールは疎通テストで大量リクエストを消費、
// リレーは WARP で代替可能になったため）。

import { ProxyAgent, fetch as undiciFetch } from "undici";

const YAHOO_DIRECT_BASE = "https://search.yahoo.co.jp/realtime/api/v1";
/**
 * フォールバック出口プロキシ。カンマ区切りで複数指定でき、左から順に試す。
 * 例: http://10.0.1.1:8888,http://192.168.1.4:8892
 * （WARP tinyproxy → MAINPC の Mullvad 出口プロキシ。2026-10-01 に WARP と
 *   自宅 IP が同時に Yahoo から 500 を返す障害があり、複数出口が必要になった）
 */
const YAHOO_HTTP_PROXY_URLS = (() => {
  const v = process.env.YAHOO_HTTP_PROXY?.trim();
  if (!v) return [] as string[];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s));
})();

let httpProxyFetches: Array<typeof fetch> | null = null;
/** undici ProxyAgent 経由の fetch（初回のみ生成） */
function getHttpProxyFetches(): Array<typeof fetch> {
  if (YAHOO_HTTP_PROXY_URLS.length === 0) return [];
  if (!httpProxyFetches) {
    httpProxyFetches = YAHOO_HTTP_PROXY_URLS.map((uri) => {
      const agent = new ProxyAgent({ uri });
      return ((input: string | URL, init?: RequestInit) =>
        undiciFetch(input as Parameters<typeof undiciFetch>[0], {
          ...(init as Parameters<typeof undiciFetch>[1]),
          dispatcher: agent,
        })) as unknown as typeof fetch;
    });
  }
  return httpProxyFetches;
}

const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://search.yahoo.co.jp/realtime/search",
} as const;

/** 直接取得が連続で失敗したら、しばらく試さずフォールバック優先にする */
const DIRECT_FAIL_STREAK_LIMIT = 3;
const DIRECT_SKIP_MS = 5 * 60 * 1000;
let directFailStreak = 0;
let directSkippedUntil = 0;

function noteDirectFailure(): void {
  directFailStreak += 1;
  if (directFailStreak >= DIRECT_FAIL_STREAK_LIMIT) {
    directSkippedUntil = Date.now() + DIRECT_SKIP_MS;
  }
}

/**
 * フォールバック（WARP等）が失敗したら直ちに直優先へ戻す。
 *
 * 実測 2026-10-01: WARP 出口の IP が Yahoo から 500 を返される状態になり、
 * 「直が3連続失敗→5分 WARP 固定」の間ずっと 500 を受け続けて全滅した。
 * 焼けた出口に 5 分固定されないよう、フォールバック失敗で即座に解除する
 * （直が本当に死んでいる場合は次の 3 連続失敗で再びフォールバックに乗る）。
 */
function noteProxyFailure(): void {
  directFailStreak = 0;
  directSkippedUntil = 0;
}

async function yahooFetch(pathAndQuery: string): Promise<Response> {
  const canDirect =
    YAHOO_HTTP_PROXY_URLS.length === 0 || Date.now() >= directSkippedUntil;
  let lastRes: Response | null = null;
  let lastError: unknown = null;

  if (canDirect) {
    try {
      const res = await fetch(`${YAHOO_DIRECT_BASE}${pathAndQuery}`, {
        headers: YAHOO_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        directFailStreak = 0;
        return res;
      }
      lastRes = res;
      noteDirectFailure();
    } catch (e) {
      lastError = e;
      noteDirectFailure();
    }
  }

  const proxyFetches = getHttpProxyFetches();
  if (proxyFetches.length > 0) {
    let anyOk = false;
    for (const proxyFetch of proxyFetches) {
      try {
        const res = await proxyFetch(`${YAHOO_DIRECT_BASE}${pathAndQuery}`, {
          headers: YAHOO_HEADERS,
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        } as RequestInit);
        if (res.ok) {
          anyOk = true;
          return res;
        }
        lastRes = lastRes ?? res;
      } catch (e) {
        lastError = lastError ?? e;
      }
    }
    // 全出口が失敗したときだけ「直接に戻る」判断をする
    if (!anyOk) noteProxyFailure();
  }

  // 非 OK レスポンスは呼び出し側で HTTP ステータスを握って判断する
  if (lastRes) return lastRes;
  throw lastError instanceof Error
    ? lastError
    : new Error("Yahoo API unreachable");
}

export const RESULTS_PER_PAGE = 40;
export const MAX_START_PAGES = 100;
const PARALLEL_CHUNK = 20;
/** 1 ページの取得リトライ回数（指数バックオフ） */
const PAGE_RETRY_ATTEMPTS = 2;
/** 1 回のスイープで許容する恒久失敗ページ数。超えたらエラーにする */
const MAX_FAILED_PAGES = 2;

export function normalizeScreenName(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

function buildSearchParams(
  p: string,
  opts: {
    start?: number;
    oldestTweetId?: string;
    md?: string;
  },
): URLSearchParams {
  const q = new URLSearchParams();
  q.set("p", p);
  q.set("results", String(RESULTS_PER_PAGE));
  if (opts.md !== undefined) q.set("md", opts.md);
  if (opts.start !== undefined) q.set("start", String(opts.start));
  if (opts.oldestTweetId) q.set("oldestTweetId", opts.oldestTweetId);
  return q;
}

type PageResult =
  | { ok: true; data: YahooPaginationResponse }
  | { ok: false; error: unknown };

async function fetchPaginationJson(
  p: string,
  opts: {
    start?: number;
    oldestTweetId?: string;
    md?: string;
  },
): Promise<PageResult> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= PAGE_RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 250 * attempt * attempt));
    }
    try {
      const res = await yahooFetch(`/pagination?${buildSearchParams(p, opts)}`);
      if (!res.ok) {
        throw new Error(`Yahoo API HTTP ${res.status}`);
      }
      return { ok: true, data: (await res.json()) as YahooPaginationResponse };
    } catch (e) {
      lastError = e;
    }
  }
  return { ok: false, error: lastError };
}

export function getEntries(data: YahooPaginationResponse): YahooRealtimeEntry[] {
  return data.timeline?.entry ?? [];
}

function totalAvailable(data: YahooPaginationResponse): number {
  return data.timeline?.head?.totalResultsAvailable ?? 0;
}

type SweepResult = {
  entries: YahooRealtimeEntry[];
  /** インデックスに存在する全件を取り切った（末尾の短いページに到達した） */
  complete: boolean;
  /** 恒久失敗したページ数（0〜MAX_FAILED_PAGES） */
  failedPages: number;
};

/**
 * start パラメータによる並列ページ取得。
 *
 * - 1 ページ目で総件数(totalResultsAvailable)を読み、必要ページ数だけを取得する
 * - 途中のページが 40 件未満になった時点で「インデックスの末尾」と判断して打ち切る
 * - 例: メンション 1,760 件のユーザー → 100 ページ固定だったものを約 46 リクエストに削減
 * - 例: メンション 65 件のユーザー → 4 リクエスト（従来 100 固定）
 */
export async function fetchByStartAdaptive(
  p: string,
  options: { md?: string; maxPages?: number } = {},
): Promise<SweepResult> {
  const maxPages = options.maxPages ?? MAX_START_PAGES;
  const byId = new Map<string, YahooRealtimeEntry>();
  let failedPages = 0;

  const push = (list: YahooRealtimeEntry[]) => {
    for (const e of list) {
      if (e?.id && !byId.has(e.id)) byId.set(e.id, e);
    }
  };

  // 1 ページ目（総件数の取得と、小さいアカウントの即終了を兼ねる）
  const first = await fetchPaginationJson(p, { start: 1, md: options.md });
  if (!first.ok) throw first.error instanceof Error ? first.error : new Error("Yahoo API error");
  const firstEntries = getEntries(first.data);
  push(firstEntries);
  let total = totalAvailable(first.data);
  if (firstEntries.length < RESULTS_PER_PAGE) {
    return { entries: [...byId.values()], complete: true, failedPages: 0 };
  }

  let done = 1;
  let complete = false;

  while (done < maxPages) {
    // 総件数から必要ページ数を見積もる（+2 は取得中に増える分のマージン）
    const plan = Math.min(
      maxPages,
      Math.max(done + 1, Math.ceil(total / RESULTS_PER_PAGE) + 2),
    );
    const size = Math.min(PARALLEL_CHUNK, plan - done);
    const starts = Array.from({ length: size }, (_, i) => (done + i) * RESULTS_PER_PAGE + 1);

    const results = await Promise.all(
      starts.map((start) => fetchPaginationJson(p, { start, md: options.md })),
    );

    for (const r of results) {
      if (!r.ok) {
        failedPages += 1;
        continue;
      }
      const es = getEntries(r.data);
      push(es);
      total = Math.max(total, totalAvailable(r.data));
      if (es.length < RESULTS_PER_PAGE) complete = true;
    }

    if (failedPages > MAX_FAILED_PAGES) {
      const failed = results.find(
        (r): r is Extract<PageResult, { ok: false }> => !r.ok,
      );
      throw failed?.error instanceof Error
        ? failed.error
        : new Error("Yahoo API error");
    }

    done += size;
    if (complete) break;
  }

  // 全ページを取り切ったか、末尾が未確認のまま100ページ上限に達したか
  return { entries: [...byId.values()], complete, failedPages };
}

export function isOutgoingMentionTweet(
  entry: YahooRealtimeEntry,
): boolean {
  const m = entry.mentions;
  return Array.isArray(m) && m.length > 0;
}

export async function fetchMentionsToYou(
  screenName: string,
): Promise<YahooRealtimeEntry[]> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");
  const p = `@${name}`;
  const { entries } = await fetchByStartAdaptive(p, {});
  return entries.slice(0, 10000);
}

export async function fetchMentionsFromYou(
  screenName: string,
): Promise<YahooRealtimeEntry[]> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");
  const p = `ID:${name}`;

  const sweep = await fetchByStartAdaptive(p, {});
  const collected: YahooRealtimeEntry[] = [];
  const seen = new Set<string>();

  const pushFiltered = (list: YahooRealtimeEntry[]) => {
    for (const e of list) {
      if (!e?.id || seen.has(e.id)) continue;
      if (!isOutgoingMentionTweet(e)) continue;
      seen.add(e.id);
      collected.push(e);
      if (collected.length >= 10000) return;
    }
  };

  pushFiltered(sweep.entries);

  // 100 ページ（4,000 件）を全部使い切ったときだけ、カーソルでさらに奥を取る。
  // 通常のユーザーは適応スイープの時点で末尾に到達しているため、カーソルは回さない。
  if (sweep.complete || collected.length >= 10000) {
    return collected.slice(0, 10000);
  }

  let cursor = oldestTweetIdInBatch(sweep.entries);

  let guard = 0;
  const maxCursorPages = 500;

  while (collected.length < 10000 && cursor && guard < maxCursorPages) {
    guard += 1;
    const r = await fetchPaginationJson(p, { oldestTweetId: cursor });
    if (!r.ok) break;
    const page = getEntries(r.data);
    if (page.length === 0) break;

    pushFiltered(page);
    const next =
      r.data.timeline?.head?.oldestTweetId ??
      page.at(-1)?.id ??
      oldestTweetIdInBatch(page) ??
      null;
    if (!next || next === cursor) break;
    cursor = next;
  }

  return collected.slice(0, 10000);
}

function oldestTweetIdInBatch(entries: YahooRealtimeEntry[]): string | undefined {
  let min: bigint | undefined;
  let minId: string | undefined;
  for (const e of entries) {
    if (!e.id) continue;
    try {
      const n = BigInt(e.id);
      if (min === undefined || n < min) {
        min = n;
        minId = e.id;
      }
    } catch {
      if (minId === undefined) minId = e.id;
    }
  }
  return minId;
}

export async function fetchMentionsBothParallel(screenName: string): Promise<{
  mentionsToYou: YahooRealtimeEntry[];
  mentionsFromYou: YahooRealtimeEntry[];
}> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");

  const [mentionsToYou, mentionsFromYou] = await Promise.all([
    fetchMentionsToYou(name),
    fetchMentionsFromYou(name),
  ]);

  return { mentionsToYou, mentionsFromYou };
}

/** 1 相手あたりの集計: メンション回数・最終交流時刻（epoch 秒）・表示名 */
export type MentionPeerAgg = { n: number; last: number; name?: string };

export function aggregateMentionAuthors(
  mentionsToYou: YahooRealtimeEntry[],
): Record<string, MentionPeerAgg> {
  const map: Record<string, MentionPeerAgg> = {};
  for (const e of mentionsToYou) {
    const sn = (e.screenName ?? "unknown").toLowerCase();
    const t = typeof e.createdAt === "number" && e.createdAt > 0 ? e.createdAt : 0;
    const nm = (e.name ?? "").trim();
    const cur = map[sn];
    if (cur) {
      cur.n += 1;
      if (t > cur.last) cur.last = t;
      if (!cur.name && nm) cur.name = nm;
    } else {
      map[sn] = { n: 1, last: t, name: nm || undefined };
    }
  }
  return map;
}

export function aggregateMentionTargets(
  mentionsFromYou: YahooRealtimeEntry[],
  selfScreenName: string,
): Record<string, MentionPeerAgg> {
  const self = selfScreenName.toLowerCase();
  const map: Record<string, MentionPeerAgg> = {};
  for (const e of mentionsFromYou) {
    const t = typeof e.createdAt === "number" && e.createdAt > 0 ? e.createdAt : 0;
    for (const m of e.mentions ?? []) {
      const sn = (m.screenName ?? "").toLowerCase();
      if (!sn || sn === self) continue;
      const nm = (m.name ?? "").trim();
      const cur = map[sn];
      if (cur) {
        cur.n += 1;
        if (t > cur.last) cur.last = t;
        if (!cur.name && nm) cur.name = nm;
      } else {
        map[sn] = { n: 1, last: t, name: nm || undefined };
      }
    }
  }
  return map;
}
