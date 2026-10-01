import type { CircleUser } from "@/types/circle";
import type { MentionPeerAgg } from "@/lib/yahoo-realtime-fetch";
import { resolveCircleAvatarUrl } from "@/lib/x-profile-image";

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
  }[] = [];
  for (const k of keys) {
    if (k.toLowerCase() === self) continue;
    const a = authorsToYou[k];
    const b = targetsFromYou[k];
    const received = a?.n ?? 0;
    const sent = b?.n ?? 0;
    const n = received + sent;
    if (n > 0)
      rows.push({
        screen: k,
        name: (a?.name || b?.name || "").trim(),
        n,
        received,
        sent,
        last: Math.max(a?.last ?? 0, b?.last ?? 0),
      });
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
      return {
        id: `yahoo-${r.screen}-${i}`,
        screenName: r.screen,
        displayName: r.name || r.screen,
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
