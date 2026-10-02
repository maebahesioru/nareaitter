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

/**
 * Cloudflare Worker リレー（独立した出口の最終予備）。
 * ベースURLに `/pagination?...` をそのまま繋げて使う（Worker 側が Yahoo へ中継）。
 * 例: https://yahoo-relay.restart-notslander.workers.dev
 */
const YAHOO_RELAY_URL = (() => {
  const v = process.env.YAHOO_RELAY_URL?.trim();
  return v && /^https:\/\//i.test(v) ? v.replace(/\/$/, "") : null;
})();

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
  const hasFallback =
    YAHOO_HTTP_PROXY_URLS.length > 0 || Boolean(YAHOO_RELAY_URL);
  const canDirect = !hasFallback || Date.now() >= directSkippedUntil;
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

  let anyFallbackOk = false;

  const proxyFetches = getHttpProxyFetches();
  for (const proxyFetch of proxyFetches) {
    try {
      const res = await proxyFetch(`${YAHOO_DIRECT_BASE}${pathAndQuery}`, {
        headers: YAHOO_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      } as RequestInit);
      if (res.ok) {
        anyFallbackOk = true;
        return res;
      }
      lastRes = lastRes ?? res;
    } catch (e) {
      lastError = lastError ?? e;
    }
  }

  // Cloudflare Worker リレー（独立出口）
  if (YAHOO_RELAY_URL) {
    try {
      const res = await fetch(`${YAHOO_RELAY_URL}${pathAndQuery}`, {
        headers: YAHOO_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        anyFallbackOk = true;
        return res;
      }
      lastRes = lastRes ?? res;
    } catch (e) {
      lastError = lastError ?? e;
    }
  }

  // フォールバックが1つも成功しなかったときだけ「直接に戻る」判断をする
  if (hasFallback && !anyFallbackOk) noteProxyFailure();

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

/** サロゲートペア（絵文字）を分断しない切り詰め位置を返す */
export function cutSafe(t: string, max: number): number {
  if (max >= t.length) return t.length;
  const c = t.charCodeAt(max - 1);
  return c >= 0xd800 && c <= 0xdbff ? max - 1 : max;
}

/** 空白・改行を潰し、文面スニペット用に短く切る（絵文字を分断しない） */
export function cleanSnippet(raw: string | undefined, max = 80): string | undefined {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, cutSafe(t, max))}…` : t;
}

/** 1 相手あたりの集計（診断の文脈用に初回/7日数/1つ前の文面も持つ） */
export type MentionPeerAgg = {
  n: number;
  last: number;
  name?: string;
  text?: string;
  prevText?: string;
  /** 内部用: text / prevText の時刻 */
  textT?: number;
  prevT?: number;
  first?: number;
  n7?: number;
  /** 直近のやり取り履歴（最大8件・新しい順） */
  hist?: Array<{ t: number; dir: "from" | "to"; text: string }>;
  /** よく使う絵文字トップ3 */
  emojis?: string[];
  /** 最も多い活動時間帯（0-23） */
  activeHour?: number;
  /** 最初の交流時の文面（相手 or 自分側） */
  firstText?: string;
  /** 最初の交流時の文面の時刻 */
  firstTextT?: number;
  /** 相手が使いがちな呼称（「架っさん」等・さん/ちゃん系の最頻） */
  vocative?: string;
  /** 笑い方の癖（ｗ派/笑派/草派） */
  laugh?: string;
  /** 平均文字数 */
  avgLen?: number;
};

/** テキストから絵文字を抽出（ZWJ連結・国旗ペア対応の簡易版） */
export function extractEmojis(text: string): string[] {
  const re = /\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
  return text.match(re) ?? [];
}

function topEmojisOf(counts: Map<string, number>, k = 3): string[] | undefined {
  const arr = [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, k);
  return arr.length ? arr.map(([e]) => e) : undefined;
}

export function aggregateMentionAuthors(
  mentionsToYou: YahooRealtimeEntry[],
): Record<string, MentionPeerAgg> {
  const nowSec = Math.floor(Date.now() / 1000);
  const map: Record<string, MentionPeerAgg> = {};
  const emojiCounts = new Map<string, Map<string, number>>();
  const hourCounts = new Map<string, number[]>();
  const vociCounts = new Map<string, Map<string, number>>();
  const lenSums = new Map<string, { n: number; sum: number }>();
  const laughCounts = new Map<string, { w: number; warau: number; kusa: number }>();
  for (const e of mentionsToYou) {
    const sn = (e.screenName ?? "unknown").toLowerCase();
    const t = typeof e.createdAt === "number" && e.createdAt > 0 ? e.createdAt : 0;
    const nm = (e.name ?? "").trim();
    const txt = cleanSnippet(e.displayText);
    const is7d = t >= nowSec - 7 * 86400;
    const cur = map[sn];
    if (cur) {
      cur.n += 1;
      if (is7d) cur.n7 = (cur.n7 ?? 0) + 1;
      if (t >= cur.last) cur.last = t;
      if (txt) {
        const ct = cur.textT ?? 0;
        if (!cur.text || t > ct) {
          cur.prevText = cur.text;
          cur.prevT = ct;
          cur.text = txt;
          cur.textT = t;
        } else if (t > (cur.prevT ?? 0) && txt !== cur.text) {
          cur.prevText = txt;
          cur.prevT = t;
        }
        (cur.hist ??= []).push({ t, dir: "from", text: txt });
      }
      if (t > 0 && (cur.first === undefined || t < cur.first)) {
        cur.first = t;
        if (txt) { cur.firstText = txt; cur.firstTextT = t; }
      }
      if (!cur.name && nm) cur.name = nm;
    } else {
      map[sn] = { n: 1, last: t, name: nm || undefined, text: txt, textT: t, first: t || undefined, firstText: t > 0 ? txt : undefined, firstTextT: t || undefined, n7: is7d ? 1 : 0, hist: txt ? [{ t, dir: "from", text: txt }] : undefined };
    }
    if (txt) {
      let em = emojiCounts.get(sn);
      if (!em) { em = new Map(); emojiCounts.set(sn, em); }
      for (const ch of extractEmojis(txt)) em.set(ch, (em.get(ch) ?? 0) + 1);
      // 呼称（さん/ちゃん系の接尾辞の前 2〜8 文字）
      for (const m of txt.matchAll(/([^\s@＠。、！？!?…「」]{2,8})(さん|ちゃん|くん|君|氏|たん|りん|殿)/gu)) {
        const v = m[1] + m[2];
        let vm = vociCounts.get(sn);
        if (!vm) { vm = new Map(); vociCounts.set(sn, vm); }
        vm.set(v, (vm.get(v) ?? 0) + 1);
      }
      // 文体（文字数・笑い方）
      const clean = txt.replace(/https?:\/\/\S+/g, "").trim();
      if (clean) {
        const ls = lenSums.get(sn) ?? { n: 0, sum: 0 };
        ls.n += 1; ls.sum += clean.length; lenSums.set(sn, ls);
      }
      const lc = laughCounts.get(sn) ?? { w: 0, warau: 0, kusa: 0 };
      lc.w += (txt.match(/[wｗ]{2,}/g) ?? []).length;
      lc.warau += (txt.match(/笑/g) ?? []).length;
      lc.kusa += (txt.match(/草/g) ?? []).length;
      laughCounts.set(sn, lc);
    }
    if (t > 0) {
      let hc = hourCounts.get(sn);
      if (!hc) { hc = new Array<number>(24).fill(0); hourCounts.set(sn, hc); }
      hc[new Date(t * 1000).getHours()] += 1;
    }
  }
  for (const [sn, cur] of Object.entries(map)) {
    if (cur.hist && cur.hist.length > 8) {
      cur.hist.sort((a, b) => b.t - a.t);
      cur.hist = cur.hist.slice(0, 8);
    }
    const em = emojiCounts.get(sn);
    if (em) cur.emojis = topEmojisOf(em);
    const hc = hourCounts.get(sn);
    if (hc) {
      let best = -1;
      let bestN = 0;
      hc.forEach((n, h) => { if (n > bestN) { bestN = n; best = h; } });
      if (best >= 0) cur.activeHour = best;
    }
    const vm = vociCounts.get(sn);
    if (vm) {
      let bestV = "";
      let bestVN = 0;
      vm.forEach((n, v) => { if (n > bestVN) { bestVN = n; bestV = v; } });
      if (bestVN >= 2) cur.vocative = bestV;
    }
    const ls = lenSums.get(sn);
    if (ls && ls.n > 0) cur.avgLen = Math.round(ls.sum / ls.n);
    const lc = laughCounts.get(sn);
    if (lc) {
      const max = Math.max(lc.w, lc.warau, lc.kusa);
      if (max >= 2) cur.laugh = max === lc.w ? "ｗ派" : max === lc.warau ? "笑派" : "草派";
    }
  }
  return map;
}

export function aggregateMentionTargets(
  mentionsFromYou: YahooRealtimeEntry[],
  selfScreenName: string,
): Record<string, MentionPeerAgg> {
  const self = selfScreenName.toLowerCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const map: Record<string, MentionPeerAgg> = {};
  for (const e of mentionsFromYou) {
    const t = typeof e.createdAt === "number" && e.createdAt > 0 ? e.createdAt : 0;
    const ownTxt = cleanSnippet(e.displayText);
    const is7d = t >= nowSec - 7 * 86400;
    for (const m of e.mentions ?? []) {
      const sn = (m.screenName ?? "").toLowerCase();
      if (!sn || sn === self) continue;
      const nm = (m.name ?? "").trim();
      const cur = map[sn];
      if (cur) {
        cur.n += 1;
        if (is7d) cur.n7 = (cur.n7 ?? 0) + 1;
        if (t >= cur.last) cur.last = t;
        if (ownTxt) {
          const ct = cur.textT ?? 0;
          if (!cur.text || t > ct) {
            cur.prevText = cur.text;
            cur.prevT = ct;
            cur.text = ownTxt;
            cur.textT = t;
          } else if (t > (cur.prevT ?? 0) && ownTxt !== cur.text) {
            cur.prevText = ownTxt;
            cur.prevT = t;
          }
          (cur.hist ??= []).push({ t, dir: "to", text: ownTxt });
        }
        if (t > 0 && (cur.first === undefined || t < cur.first)) {
          cur.first = t;
          if (ownTxt) { cur.firstText = ownTxt; cur.firstTextT = t; }
        }
        if (!cur.name && nm) cur.name = nm;
      } else {
        map[sn] = { n: 1, last: t, name: nm || undefined, text: ownTxt, textT: t, first: t || undefined, firstText: t > 0 ? ownTxt : undefined, firstTextT: t || undefined, n7: is7d ? 1 : 0, hist: ownTxt ? [{ t, dir: "to", text: ownTxt }] : undefined };
      }
    }
  }
  for (const cur of Object.values(map)) {
    if (cur.hist && cur.hist.length > 8) {
      cur.hist.sort((a, b) => b.t - a.t);
      cur.hist = cur.hist.slice(0, 8);
    }
  }
  return map;
}

/** 自分の直近ツイート（メンション無しも含む・1ページだけ取得） */
export async function fetchSelfRecentTweets(
  screenName: string,
  limit = 12,
): Promise<Array<{ text: string; hasMention: boolean; at: number }>> {
  const name = normalizeScreenName(screenName);
  if (!name) return [];
  try {
    const r = await fetchPaginationJson(`ID:${name}`, { start: 1 });
    if (!r.ok) return [];
    const entries = getEntries(r.data);
    return entries
      .map((e) => ({
        text: cleanSnippet(e.displayText, 100) ?? "",
        hasMention: (e.mentions?.length ?? 0) > 0,
        at: typeof e.createdAt === "number" ? e.createdAt : 0,
      }))
      .filter((x) => x.text)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  } catch {
    return [];
  }
}
