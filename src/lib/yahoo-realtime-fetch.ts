import type {
  YahooPaginationResponse,
  YahooRealtimeEntry,
} from "@/types/yahoo-realtime";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

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

const YAHOO_DIRECT_BASE = "https://search.yahoo.co.jp/realtime/api/v1";
const YAHOO_PROXY_BASE = process.env.YAHOO_PROXY?.replace(/\/$/, "");
const YAHOO_HTTP_PROXY = YAHOO_PROXY_BASE?.startsWith("http://") ? YAHOO_PROXY_BASE : null;

// ── プロキシ自動ローテーション ────────────────────

const PROXY_REFRESH_MS = 10 * 60 * 1000; // 10分
const PROXY_MAX = 30;                     // プール最大数
const PROXY_TEST_TIMEOUT = 6;             // 疎通テストタイムアウト（秒）
const PROXY_SCRAPE_URL =
  "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all";

let proxyPool: { addr: string; latency: number }[] = [];
let proxyPoolTs = 0;
let proxyPoolRefreshing = false;

/** proxyscrape.com からリスト取得 */
async function fetchProxyList(): Promise<string[]> {
  const resp = await fetch(PROXY_SCRAPE_URL, { signal: AbortSignal.timeout(8000) });
  const text = await resp.text();
  return text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

/** 1つのプロキシでYahoo API疎通テスト */
async function testProxyLatency(addr: string): Promise<number | null> {
  const t0 = performance.now();
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "--max-time", String(PROXY_TEST_TIMEOUT),
      "--proxy", addr,
      "-H", `User-Agent: ${YAHOO_HEADERS["User-Agent"]}`,
      "-H", `Accept: ${YAHOO_HEADERS["Accept"]}`,
      "-H", `Referer: ${YAHOO_HEADERS["Referer"]}`,
      `${YAHOO_DIRECT_BASE}/pagination?p=@v&results=1&start=1`,
    ], { timeout: (PROXY_TEST_TIMEOUT + 2) * 1000, maxBuffer: 1024 });
    if (stdout.trim().startsWith("{")) {
      return performance.now() - t0;
    }
  } catch { /* noop */ }
  return null;
}

/** プロキシプールをリフレッシュ（リスト取得＋疎通テスト） */
async function refreshProxyPool(): Promise<void> {
  if (proxyPoolRefreshing) return;
  proxyPoolRefreshing = true;
  try {
    const addrs = await fetchProxyList();
    // 最初のPROXY_MAX個だけテスト（全部テストすると遅すぎる）
    const candidates = addrs.slice(0, PROXY_MAX * 3);
    const results = await Promise.all(
      candidates.map(async addr => {
        const lat = await testProxyLatency(addr);
        return lat !== null ? { addr, latency: lat } : null;
      })
    );
    const valid = results.filter(Boolean) as { addr: string; latency: number }[];
    valid.sort((a, b) => a.latency - b.latency);
    proxyPool = valid.slice(0, PROXY_MAX);
    proxyPoolTs = Date.now();
  } catch { /* pool維持 */ }
  proxyPoolRefreshing = false;
}

/** 現在のプールから最も遅延の小さいプロキシを取得。空ならnull */
function bestProxy(): string | null {
  return proxyPool.length > 0 ? proxyPool[0].addr : null;
}

/** 使えなくなったプロキシをプールから除外 */
function discardProxy(addr: string): void {
  proxyPool = proxyPool.filter(p => p.addr !== addr);
}

/** curl exec（プロキシ指定版） */
async function yahooFetchViaCurl(pathAndQuery: string, proxy: string): Promise<Response> {
  const url = `${YAHOO_DIRECT_BASE}${pathAndQuery}`;
  const { stdout } = await execFileAsync("curl", [
    "-s", "--max-time", "30",
    "--proxy", proxy,
    "-H", `User-Agent: ${YAHOO_HEADERS["User-Agent"]}`,
    "-H", `Accept: ${YAHOO_HEADERS["Accept"]}`,
    "-H", `Referer: ${YAHOO_HEADERS["Referer"]}`,
    url,
  ], { timeout: 35000, maxBuffer: 5 * 1024 * 1024 });

  if (!stdout.trim().startsWith("{")) {
    throw new Error("Yahoo API non-JSON response");
  }
  return new Response(stdout, {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function yahooFetch(pathAndQuery: string): Promise<Response> {
  // 固定プロキシが設定されていればそれを使う（従来動作）
  if (YAHOO_HTTP_PROXY) {
    return yahooFetchViaCurl(pathAndQuery, YAHOO_HTTP_PROXY);
  }

  // プロキシプールが未初期化・期限切れの場合はリフレッシュ（fire & forget）
  if (!proxyPoolTs || Date.now() - proxyPoolTs > PROXY_REFRESH_MS) {
    refreshProxyPool(); // fire & forget
  }

  // プロキシプールがあればローテーション
  if (proxyPool.length > 0) {
    const proxy = bestProxy();
    if (proxy) {
      try {
        return await yahooFetchViaCurl(pathAndQuery, proxy);
      } catch {
        discardProxy(proxy);
        // 次のプロキシがあればリトライ
        const next = bestProxy();
        if (next) {
          return yahooFetchViaCurl(pathAndQuery, next);
        }
        // 全滅したら直接アクセスにフォールスルー
      }
    }
  }

  // 直接アクセス（フォールバック）
  const directRes = await fetch(`${YAHOO_DIRECT_BASE}${pathAndQuery}`, { headers: YAHOO_HEADERS, cache: "no-store" });
  if (directRes.ok) return directRes;

  // 中継URL経由
  if (YAHOO_PROXY_BASE?.startsWith("https://")) {
    return fetch(`${YAHOO_PROXY_BASE}${pathAndQuery}`, { headers: YAHOO_HEADERS, cache: "no-store" });
  }

  return directRes;
}

export const RESULTS_PER_PAGE = 40;
export const MAX_START_PARALLEL_PAGES = 100;
const YAHOO_PARALLEL_CHUNK = 20;

const YAHOO_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://search.yahoo.co.jp/realtime/search",
};

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

async function fetchPaginationJson(
  p: string,
  opts: {
    start?: number;
    oldestTweetId?: string;
    md?: string;
  },
): Promise<YahooPaginationResponse> {
  const res = await yahooFetch(`/pagination?${buildSearchParams(p, opts)}`);
  if (!res.ok) {
    throw new Error(`Yahoo API HTTP ${res.status}`);
  }
  return res.json() as Promise<YahooPaginationResponse>;
}

export function getEntries(data: YahooPaginationResponse): YahooRealtimeEntry[] {
  return data.timeline?.entry ?? [];
}

export async function fetchByStartParallel(
  p: string,
  options: { md?: string; maxPages?: number } = {},
): Promise<YahooRealtimeEntry[]> {
  const maxPages = options.maxPages ?? MAX_START_PARALLEL_PAGES;
  const starts = Array.from(
    { length: maxPages },
    (_, i) => i * RESULTS_PER_PAGE + 1,
  );

  const flat: YahooRealtimeEntry[][] = [];
  for (let i = 0; i < starts.length; i += YAHOO_PARALLEL_CHUNK) {
    const chunk = starts.slice(i, i + YAHOO_PARALLEL_CHUNK);
    const part = await Promise.all(
      chunk.map((start) =>
        fetchPaginationJson(p, { start, md: options.md }).then(getEntries),
      ),
    );
    flat.push(...part);
  }

  const byId = new Map<string, YahooRealtimeEntry>();
  for (const entry of flat.flat()) {
    if (entry?.id && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  return [...byId.values()];
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
  const entries = await fetchByStartParallel(p, {});
  return entries.slice(0, 10000);
}

export async function fetchMentionsFromYou(
  screenName: string,
): Promise<YahooRealtimeEntry[]> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");
  const p = `ID:${name}`;

  const firstBatch = await fetchByStartParallel(p, {});
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

  pushFiltered(firstBatch);
  if (collected.length >= 10000) {
    return collected.slice(0, 10000);
  }

  let cursor = oldestTweetIdInBatch(firstBatch);

  let guard = 0;
  const maxCursorPages = 500;

  while (collected.length < 10000 && cursor && guard < maxCursorPages) {
    guard += 1;
    const data = await fetchPaginationJson(p, { oldestTweetId: cursor });
    const page = getEntries(data);
    if (page.length === 0) break;

    pushFiltered(page);
    const next =
      data.timeline?.head?.oldestTweetId ??
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

export function aggregateMentionAuthors(
  mentionsToYou: YahooRealtimeEntry[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of mentionsToYou) {
    const sn = (e.screenName ?? "unknown").toLowerCase();
    map[sn] = (map[sn] ?? 0) + 1;
  }
  return map;
}

export function aggregateMentionTargets(
  mentionsFromYou: YahooRealtimeEntry[],
  selfScreenName: string,
): Record<string, number> {
  const self = selfScreenName.toLowerCase();
  const map: Record<string, number> = {};
  for (const e of mentionsFromYou) {
    for (const m of e.mentions ?? []) {
      const t = (m.screenName ?? "").toLowerCase();
      if (!t || t === self) continue;
      map[t] = (map[t] ?? 0) + 1;
    }
  }
  return map;
}
