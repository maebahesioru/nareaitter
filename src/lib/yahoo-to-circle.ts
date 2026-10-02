import type { CircleUser } from "@/types/circle";
import type { MentionPeerAgg } from "@/lib/yahoo-realtime-fetch";
import { resolveCircleAvatarUrl } from "@/lib/x-profile-image";

type HistItem = { t: number; dir: "from" | "to"; text: string };

function median(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** 会話履歴から返信速度を実測（自分の投稿→相手の反応 / 相手の投稿→自分の反応・中央値・分） */
function replySpeeds(hist: HistItem[]): { themMin?: number; meMin?: number } {
  if (hist.length < 2) return {};
  const sorted = [...hist].sort((a, b) => a.t - b.t);
  const themGaps: number[] = [];
  const meGaps: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    if (!m.t) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const n = sorted[j];
      if (n.dir === m.dir) continue;
      const gap = n.t - m.t;
      if (gap > 0 && gap <= 3600) {
        (m.dir === "to" ? themGaps : meGaps).push(gap);
      }
      break;
    }
  }
  const toMin = (g?: number) => (g !== undefined ? Math.max(1, Math.round(g / 60)) : undefined);
  return { themMin: toMin(median(themGaps)), meMin: toMin(median(meGaps)) };
}

/** 無制限並列だと FixTweet 系 API が 429 になり再試行で遅延が積む（実測: 28並列までは429なし・63req/s） */
const AVATAR_FETCH_CONCURRENCY = 28;

/**
 * 高画質（fxtwitter/vxtwitter）アバター取得のしきい値。
 *
 * Yahoo の profileImage（rts-pctr）は実測 48×48px しかないため、
 * 描画セルが大きいときだけ HD を取りに行く。
 * サークルのセル辺は「キャンバス幅 ÷ ceil(sqrt(人数))」で近似できるので、
 * これが {@link HD_MIN_CELL_PX} 未満になる大人数サークルでは HD を全員分は取らない
 * （1 アバターにつき最大 2 リクエスト × 1000 人分 → 数十件へ削減できる）。
 */
const HD_MIN_CELL_PX = 40;
/** セル辺の概算に使う想定キャンバス幅（px） */
const ASSUMED_CANVAS_W = 720;
/** Yahoo プレビュー画像が無いユーザーの HD 救済フェッチ上限（表示消え防止） */
const HD_RESCUE_MAX = 128;

function estimatedCellPx(peerCount: number): number {
  if (peerCount <= 0) return ASSUMED_CANVAS_W;
  const cols = Math.max(1, Math.ceil(Math.sqrt(peerCount)));
  return ASSUMED_CANVAS_W / cols;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Yahoo profileImage を avatarUrlPreview、fxtwitter/vxtwitter を avatarUrl に入れる（canvas が仮→高画質）。
 */
export async function yahooAggregatesToCircleUsers(
  authorsToYou: Record<string, MentionPeerAgg>,
  targetsFromYou: Record<string, MentionPeerAgg>,
  selfScreenName: string,
  yahooPeerProfileByScreen: Record<string, string>,
): Promise<CircleUser[]> {
  const self = selfScreenName.toLowerCase();
  const keys = new Set([
    ...Object.keys(authorsToYou),
    ...Object.keys(targetsFromYou),
  ]);

  const rows: {
    screen: string;
    name: string;
    n: number;
    received: number;
    sent: number;
    last: number;
    first?: number;
    n7: number;
    fromThem?: string;
    toThem?: string;
    fromThem2?: string;
    toThem2?: string;
    hist: HistItem[];
    activeHour?: number;
    emojis?: string[];
    vocative?: string;
    laugh?: string;
    avgLen?: number;
  }[] = [];
  for (const k of keys) {
    if (k.toLowerCase() === self) continue;
    const a = authorsToYou[k];
    const b = targetsFromYou[k];
    const received = a?.n ?? 0;
    const sent = b?.n ?? 0;
    const n = received + sent;
    if (n > 0) {
      const firstCandidates = [a?.first, b?.first].filter((x): x is number => typeof x === "number" && x > 0);
      rows.push({
        screen: k,
        name: (a?.name || b?.name || "").trim(),
        n,
        received,
        sent,
        last: Math.max(a?.last ?? 0, b?.last ?? 0),
        first: firstCandidates.length ? Math.min(...firstCandidates) : undefined,
        n7: (a?.n7 ?? 0) + (b?.n7 ?? 0),
        fromThem: a?.text,
        toThem: b?.text,
        fromThem2: a?.prevText,
        toThem2: b?.prevText,
        hist: [...(a?.hist ?? []), ...(b?.hist ?? [])].sort((x, y) => y.t - x.t),
        activeHour: a?.activeHour,
        emojis: a?.emojis,
        vocative: a?.vocative,
        laugh: a?.laugh,
        avgLen: a?.avgLen,
      });
    }
  }

  rows.sort((a, b) => b.n - a.n);
  const max = rows[0]?.n ?? 1;

  const previewFor = (screen: string) =>
    yahooPeerProfileByScreen[screen.toLowerCase()]?.trim() || undefined;

  // どの行で HD を取るか先に決める（並列処理中に数え漏れしないように）
  const hdForAll = estimatedCellPx(rows.length) >= HD_MIN_CELL_PX;
  const hdIndexes = new Set<number>();
  if (!hdForAll) {
    for (let i = 0; i < rows.length && hdIndexes.size < HD_RESCUE_MAX; i++) {
      // プレビューが無いユーザーは HD が無いと描画から消えるため優先的に救済する
      if (!previewFor(rows[i].screen)) hdIndexes.add(i);
    }
  }

  const list = await mapWithConcurrency(
    rows,
    AVATAR_FETCH_CONCURRENCY,
    async (r, i) => {
      const preview = previewFor(r.screen);
      const wantHd = hdForAll || hdIndexes.has(i);
      const hdRaw = wantHd ? await resolveCircleAvatarUrl(r.screen) : null;
      const avatarUrl = hdRaw?.trim() || undefined;
      const keepContext = i < 64;
      const keepDeep = i < 20;
      const keepTop5 = i < 10;
      const speeds = keepDeep ? replySpeeds(r.hist) : {};
      return {
        id: `yahoo-${r.screen}-${i}`,
        screenName: r.screen,
        displayName: r.name || r.screen,
        latestFromThem: keepContext ? r.fromThem : undefined,
        latestToThem: keepContext ? r.toThem : undefined,
        latestFromThem2: keepDeep ? r.fromThem2 : undefined,
        latestToThem2: keepDeep ? r.toThem2 : undefined,
        mentionsLast7d: keepContext ? r.n7 : undefined,
        activeHour: keepContext ? r.activeHour : undefined,
        topEmojis: keepDeep ? r.emojis : undefined,
        vocative: keepDeep ? r.vocative : undefined,
        laugh: keepDeep ? r.laugh : undefined,
        avgLen: keepDeep ? r.avgLen : undefined,
        replyThemMin: keepDeep ? speeds.themMin : undefined,
        replyMeMin: keepDeep ? speeds.meMin : undefined,
        exchange: keepTop5 && r.hist.length ? r.hist.slice(0, 6).map((h) => ({ t: h.t, dir: h.dir, text: h.text })) : undefined,
        firstInteractionAt:
          keepContext && r.first && r.first > 0
            ? new Date(r.first * 1000).toISOString()
            : undefined,
        avatarUrlPreview: preview,
        avatarUrl,
        interactionScore: Math.max(1, Math.round((r.n / max) * 100)),
        interactionCount: r.n,
        mentionsReceived: r.received,
        mentionsSent: r.sent,
        lastInteractionAt:
          r.last > 0 ? new Date(r.last * 1000).toISOString() : undefined,
      };
    },
  );

  // 失敗救済の2周目:
  // 初回は DNS がコールド（コンテナ再起動直後は埋め込みDNSが数秒詰まることがある）ため、
  // 一斉取得時に一部のアバターが一時失敗で欠ける。DNS が温まった後に一度だけ取り直す。
  const missing: number[] = [];
  list.forEach((u, i) => {
    if (!u.avatarUrl?.trim() && !u.avatarUrlPreview?.trim()) missing.push(i);
  });
  if (missing.length > 0) {
    await mapWithConcurrency(
      missing,
      AVATAR_FETCH_CONCURRENCY,
      async (i) => {
        const hdRaw = await resolveCircleAvatarUrl(rows[i].screen);
        const hd = hdRaw?.trim();
        if (hd) list[i] = { ...list[i], avatarUrl: hd };
      },
    );
  }

  return list.filter((u) =>
    Boolean(u.avatarUrl?.trim() || u.avatarUrlPreview?.trim()),
  );
}
