import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import sharp, { type OverlayOptions } from "sharp";
import { fetchProxiedImageUpstream } from "@/lib/image-proxy-upstream";
import { resolveCircleAvatarUrl } from "@/lib/x-profile-image";
import { deadMaskToHex, spriteCellUrl, spriteSliceSig } from "@/lib/sprite-sig";
import {
  findCircleUsersForSig,
  getServedYahooPayload,
} from "@/lib/yahoo-payload-server";
import { normalizeScreenName } from "@/lib/yahoo-realtime-fetch";

export const maxDuration = 60;

/** 1セルのピクセル数（rts-pctr のプレビュー実寸に合わせる） */
const CELL = 48;
/** 横に並べるセル数 */
const COLS = 10;
/** 1リクエストで合成する最大セル数 */
const MAX_CELLS = 120;
/** 上流フェッチの並列上限 */
const UPSTREAM_CONCURRENCY = 32;

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

  // 合成結果をオリジン側にもキャッシュ（エッジを通過した2人目以降・別colo向け）
  const composed = await unstable_cache(
    async () => {
      const dead: boolean[] = new Array(slice.length).fill(false);
      const composites: OverlayOptions[] = [];

      const drawCell = async (url: string, i: number): Promise<boolean> => {
        if (!url.trim()) return false;
        try {
          const { arrayBuffer } = await fetchProxiedImageUpstream(url);
          const cellBuf = await sharp(Buffer.from(arrayBuffer))
            .resize(CELL, CELL, { fit: "cover" })
            .jpeg({ quality: 82 })
            .toBuffer();
          composites.push({
            input: cellBuf,
            left: (i % COLS) * CELL,
            top: Math.floor(i / COLS) * CELL,
          });
          return true;
        } catch {
          return false;
        }
      };

      /**
       * 1 セルを描く。
       * - まずペイロードの URL（プレビュー優先）で描画
       * - 失敗したら fx/vx で現行アバターを救済（Yahoo プレビュー URL は期限切れが多く、
       *   壊れた同一 URL を多数ユーザーが共有することがある。実測 2026-10-01）
       */
      const composeCell = async (u: CircleUserLite, i: number): Promise<void> => {
        const raw = spriteCellUrl(u);
        if (await drawCell(raw, i)) {
          dead[i] = false;
          return;
        }
        const screen = (u.screenName ?? "").trim();
        if (screen) {
          const alt = await resolveCircleAvatarUrl(screen);
          if (alt && (await drawCell(alt, i))) {
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
          width: COLS * CELL,
          height: Math.max(1, rows) * CELL,
          channels: 3,
          background: { r: 9, g: 9, b: 11 },
        },
      })
        .composite(composites)
        .jpeg({ quality: 80, chromaSubsampling: "4:2:0" })
        .toBuffer();

      return { b64: sprite.toString("base64"), deadHex: deadMaskToHex(dead) };
    },
    ["avatar-sprite-v2", name.toLowerCase(), String(from), String(count), sig],
    { revalidate: 900 },
  )();

  const sprite = Buffer.from(composed.b64, "base64");

  return new NextResponse(new Uint8Array(sprite), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, s-maxage=900, max-age=900",
      "X-Sprite-Sig": sig,
      "X-Sprite-Dead": composed.deadHex,
      "X-Sprite-Cell": String(CELL),
      "X-Sprite-Cols": String(COLS),
      "X-Sprite-Count": String(slice.length),
      "X-Sprite-From": String(from),
    },
  });
}
