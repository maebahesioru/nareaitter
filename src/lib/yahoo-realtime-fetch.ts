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

/** あなた宛メンションの投稿者 → Yahoo の profileImage（仮アイコン用） */
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

/** 本人投稿タイムラインの先頭付近の profileImage（自分の仮アイコン） */
export function pickSelfProfileImageFromYahoo(
  mentionsFromYou: YahooRealtimeEntry[],
): string | null {
  for (const e of mentionsFromYou) {
    const u = normalizeYahooProfileImageUrl(e.profileImage ?? "");
    if (u) return u;
  }
  return null;
}

const YAHOO_RT = "https://search.yahoo.co.jp/realtime/api/v1/pagination";
export const RESULTS_PER_PAGE = 40;
/**
 * 1 クエリあたりの start ページ数上限（40 件×ページ）。
 * 250 ページを一度に並列すると Yahoo 側で詰まり 1〜数分かかることがあるため抑える。
 */
export const MAX_START_PARALLEL_PAGES = 100;
/** 同時に飛ばす Yahoo リクエスト数（チャンク）。残りは順次ウェーブ */
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
    /** 新着: 省略または `t` / 話題: `h` */
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
  const url = `${YAHOO_RT}?${buildSearchParams(p, opts)}`;
  const res = await fetch(url, { headers: YAHOO_HEADERS, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Yahoo API HTTP ${res.status} (${url.slice(0, 120)}…)`);
  }
  return res.json() as Promise<YahooPaginationResponse>;
}

export function getEntries(data: YahooPaginationResponse): YahooRealtimeEntry[] {
  return data.timeline?.entry ?? [];
}

/**
 * `start` をチャンク単位で並列取得し、重複除去したエントリを返す。
 * ページ数は {@link MAX_START_PARALLEL_PAGES}（全件一括より Yahoo が詰まりにくい）。
 */
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

/** 本人投稿（ID:）かつ本文にメンションが含まれるツイート */
export function isOutgoingMentionTweet(
  entry: YahooRealtimeEntry,
): boolean {
  const m = entry.mentions;
  return Array.isArray(m) && m.length > 0;
}

/**
 * 本人に来たメンション: クエリ `@screenName`（ユーザー宛ての投稿）。
 */
export async function fetchMentionsToYou(
  screenName: string,
): Promise<YahooRealtimeEntry[]> {
  const name = normalizeScreenName(screenName);
  if (!name) throw new Error("screenName が空です。");
  const p = `@${name}`;
  const entries = await fetchByStartParallel(p, {});
  return entries.slice(0, 10000);
}

/**
 * 本人がするメンション: `ID:screenName` で本人投稿を取得し、`mentions` ありのみ残す。
 * まず `start` でページ取得 → フィルタ後 10000 件未満なら `oldestTweetId` で追補。
 */
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

/** 並列ページをまとめた集合のうち、最も古いツイート ID（カーソル継続用） */
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

/**
 * 受信・送信を同時に走らせる（合計 500 リクエストの並列 + 追補は逐次）。
 */
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

/** 集計: あなたにメンションしてきたユーザー（投稿者）ごとの件数 */
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

/** 集計: あなたがメンションした相手の screenName ごとの件数 */
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
