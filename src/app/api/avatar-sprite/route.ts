import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import sharp, { type OverlayOptions } from "sharp";
import { fetchProxiedImageUpstream, UpstreamImageError } from "@/lib/image-proxy-upstream";
import { resolveCircleAvatarUrl } from "@/lib/x-profile-image";
import { deadMaskToHex, spriteCellUrl, spriteCellUrlLarge, spriteSliceSig } from "@/lib/sprite-sig";
import {
  findCircleUsersForSig,
  getServedYahooPayload,
} from "@/lib/yahoo-payload-server";
import { normalizeScreenName } from "@/lib/yahoo-realtime-fetch";

export const maxDuration = 60;

/** 1セルのピクセル数（rts-pctr のプレビュー実寸に合わせた既定値） */
const CELL = 48;
/** 横に並べるセル数 */
const COLS = 10;
/** 1リクエストで合成する最大セル数 */
const MAX_CELLS = 120;
/** 上流フェッチの並列上限 */
const UPSTREAM_CONCURRENCY = 32;
/**
 * クライアントが要求できるセル辺（px）。セル辺が大きくなる少人数サークルでは
 * 48px だと拡大描画でぼやけるため、大きいセルを許容する（HD URL を優先使用）。
 */
const ALLOWED_CELLS = new Set([48, 96, 128]);

type CircleUserLite = {
  screenName?: string | null;
  avatarUrlPreview?: string | null;
  avatarUrl?: string | null;
};

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
}

/**
 * アバターのスプライトシート（10列グリッドのJPEG）を合成して返す。
 *
 * - クライアントは約100セルぶんのURL列を持つ。そのハッシュ(sig)を送り、
 *   サーバー側の現行ペイロードのスライスと一致したときだけ合成する（リビジョン保証）。
 * - 一致しない場合は 409 を返し、クライアントは個別取得にフォールバックする。
 * - 合成できなかったセル（404等）は X-Sprite-Dead のビットマスクで通知。
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const name = normalizeScreenName(sp.get("screenName") ?? "");
  const from = Math.max(0, Number.parseInt(sp.get("from") ?? "0", 10) || 0);
  const countRaw = Number.parseInt(sp.get("count") ?? "100", 10) || 100;
  const count = Math.min(MAX_CELLS, Math.max(1, countRaw));
  const sig = (sp.get("sig") ?? "").toLowerCase();
  const cellRaw = Number.parseInt(sp.get("cell") ?? "", 10) || CELL;
  const cell = ALLOWED_CELLS.has(cellRaw) ? cellRaw : CELL;

  if (!name) {
    return NextResponse.json({ error: "screenName が必要です。" }, { status: 400 });
  }

  let slice: CircleUserLite[];
  try {
    const { payload } = await getServedYahooPayload(name, true);
    const users = (payload.circleUsers as CircleUserLite[] | undefined) ?? [];
    slice = users.slice(from, from + count);
    // 現行リビジョンと一致しない場合は、直近リビジョンから探す
    // （クライアントは最大5分前のCDNキャッシュを見ていることがある）
    if (slice.length === 0 || spriteSliceSig(slice) !== sig) {
      const alt = findCircleUsersForSig(name, from, count, sig);
      if (alt) slice = alt;
    }
  } catch {
    return NextResponse.json({ error: "データを取得できませんでした。" }, { status: 502 });
  }

  if (slice.length === 0) {
    return NextResponse.json({ error: "範囲が空です。" }, { status: 404 });
  }

  // リビジョン検証（クライアントのURL列と一致するスライスがなければ合成しない）
  const actualSig = spriteSliceSig(slice);
  if (actualSig !== sig) {
    return NextResponse.json(
      { error: "stale", sig: actualSig },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rows = Math.ceil(slice.length / COLS);
  const hiRes = cell > CELL;

  // 合成結果をオリジン側にもキャッシュ（エッジを通過した2人目以降・別colo向け）
  const composed = await unstable_cache(
    async () => {
      const dead: boolean[] = new Array(slice.length).fill(false);
      const composites: OverlayOptions[] = [];

      type DrawResult = { ok: true } | { ok: false; permanent: boolean };

      const drawCell = async (url: string, i: number): Promise<DrawResult> => {
        if (!url.trim()) return { ok: false, permanent: true };
        try {
          const { arrayBuffer } = await fetchProxiedImageUpstream(url);
          const cellBuf = await sharp(Buffer.from(arrayBuffer))
            .resize(cell, cell, { fit: "cover" })
            .jpeg({ quality: 82 })
            .toBuffer();
          composites.push({
            input: cellBuf,
            left: (i % COLS) * cell,
            top: Math.floor(i / COLS) * cell,
          });
          return { ok: true };
        } catch (e) {
          const status = e instanceof UpstreamImageError ? e.status : 0;
          return { ok: false, permanent: status === 404 || status === 410 };
        }
      };

      /**
       * 1 セルを描く。
       * - 通常セル(48px): ペイロードの URL（プレビュー優先）で描画
       * - 高画質セル(96/128px): HD（pbs/fx系）を優先し、失敗時はプレビューで妥協
       *   （セルが大きい少人数サークルで 48px プレビューの拡大ぼやけを防ぐ）
       * - 404系（期限切れの Yahoo プレビュー等）だけ fx/vx で現行アバターを救済。
       *   ⚠️ 一時失敗（timeout）で fx を撃つと、内蔵リトライのラダー（最長36秒/人）が
       *   合成全体を数十秒に伸ばし、クライアントの15秒タイムアウト→個別取得フォールバック
       *   を誘発して多重合成の悪循環になる（実測 2026-10-01）。一時失敗は2周目リトライのみ。
       */
      const composeCell = async (u: CircleUserLite, i: number): Promise<void> => {
        const primary = hiRes ? spriteCellUrlLarge(u) : spriteCellUrl(u);
        const secondary = hiRes ? spriteCellUrl(u) : "";
        let r = await drawCell(primary, i);
        if (r.ok) {
          dead[i] = false;
          return;
        }
        if (hiRes && secondary.trim() && secondary !== primary) {
          r = await drawCell(secondary, i);
          if (r.ok) {
            dead[i] = false;
            return;
          }
        }
        const screen = (u.screenName ?? "").trim();
        const permanent = r.permanent || !primary.trim();
        if (permanent && screen) {
          const alt = await resolveCircleAvatarUrl(screen);
          if (alt && (await drawCell(alt, i)).ok) {
            dead[i] = false;
            return;
          }
        }
        dead[i] = true;
      };

      await mapLimit(slice, UPSTREAM_CONCURRENCY, async (u, i) => {
        await composeCell(u, i);
      });

      // 一時失敗の救済2周目:
      // 初回は DNS/接続がコールドだと一部セルが一時失敗し、それが dead マスクに
      // 焼き込まれると URL が生きていてもクライアントが再取得しない（実測: 20%欠け）。
      // 同じ合成を即時にもう一度だけ走らせる（成功すれば dead を解除）。
      const failed = slice.map((_, i) => i).filter((i) => dead[i]);
      if (failed.length > 0) {
        await mapLimit(failed, UPSTREAM_CONCURRENCY, async (i) => {
          await composeCell(slice[i], i);
        });
      }

      const sprite = await sharp({
        create: {
          width: COLS * cell,
          height: Math.max(1, rows) * cell,
          channels: 3,
          background: { r: 9, g: 9, b: 11 },
        },
      })
        .composite(composites)
        .jpeg({ quality: 80, chromaSubsampling: "4:2:0" })
        .toBuffer();

      return { b64: sprite.toString("base64"), deadHex: deadMaskToHex(dead) };
    },
    ["avatar-sprite-v2", name.toLowerCase(), String(from), String(count), sig, String(cell)],
    { revalidate: 900 },
  )();

  const sprite = Buffer.from(composed.b64, "base64");

  return new NextResponse(new Uint8Array(sprite), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, s-maxage=900, max-age=900",
      "X-Sprite-Sig": sig,
      "X-Sprite-Dead": composed.deadHex,
      "X-Sprite-Cell": String(cell),
      "X-Sprite-Cols": String(COLS),
      "X-Sprite-Count": String(slice.length),
      "X-Sprite-From": String(from),
    },
  });
}
