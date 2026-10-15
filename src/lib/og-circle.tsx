import { ImageResponse } from "next/og";
import { unstable_cache } from "next/cache";
import sharp from "sharp";
import { fetchProxiedImageUpstream } from "@/lib/image-proxy-upstream";
import { peekOrAwaitServedYahooPayload } from "@/lib/yahoo-payload-server";
import { spriteSliceSig } from "@/lib/sprite-sig";

/**
 * プロフィールページ（/@handle）の共有カード（OG画像）を動的に生成する。
 *
 * - 上位ユーザーのアイコンをグリッド状に並べたプレビュー + @handle を描画
 * - **コールド状態では絶対にペイロードのビルドを開始しない**（peekのみ。進行中ビルドが
 *   あれば最大6秒だけ待つ）。クローラーが未閲覧ハンドルを大量に叩くと、その都度
 *   Yahoo全域スイープ（数〜十数秒×CPU）を誘発してサイト全体が飽和するため
 *   （2026-10-16 実測: クローラー起因で毎分8件のコールドビルドが発生していた）。
 *   実カードは「メモリに温まっている時だけ」・汎用カードは長期キャッシュで返す
 * - テキストは ASCII のみ（@handle / ドメイン）にしてフォント問題を回避
 * - グリッドはスライス署名ごとに30分、汎用は24時間キャッシュ
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_CACHE_HEADERS = {
  "Cache-Control":
    "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
} as const;

const GRID_COLS = 10;
const CELL = 104;
const GAP = 8;
const MAX_ICONS = GRID_COLS * 4;
const GRID_CACHE_SECONDS = 1800;
const FALLBACK_CACHE_SECONDS = 86_400;
/** 進行中ビルドの完了を待つ上限（新規ビルドは開始しない） */
const INFLIGHT_WAIT_MS = 6_000;
const IMAGE_CONCURRENCY = 16;

type CircleUserLite = {
  avatarUrl?: string | null;
  avatarUrlPreview?: string | null;
};

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

async function toCellDataUrl(url: string): Promise<string | null> {
  if (!url.trim()) return null;
  try {
    const { arrayBuffer } = await fetchProxiedImageUpstream(url);
    const buf = await sharp(Buffer.from(arrayBuffer))
      .resize(CELL, CELL, { fit: "cover" })
      .jpeg({ quality: 78 })
      .toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** ペイロードが無いときの汎用デザイン（既存の同心スクエア） */
function fallbackJsx() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(145deg, #0ea5e9 0%, #059669 42%, #18181b 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          width: 320,
          height: 320,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 300,
            height: 300,
            border: "6px solid rgba(255,255,255,0.28)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 200,
            height: 200,
            border: "6px solid rgba(255,255,255,0.45)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 100,
            height: 100,
            background: "rgba(255,255,255,0.92)",
          }}
        />
      </div>
    </div>
  );
}

/** 温まっているペイロードからグリッドカードを組み立てる。組めなければ null */
async function buildGridPngBase64(
  sn: string,
  picks: CircleUserLite[],
): Promise<string | null> {
  try {
    const cells = await mapLimit(picks, IMAGE_CONCURRENCY, (u) =>
      toCellDataUrl(
        (u.avatarUrl ?? "").trim() || (u.avatarUrlPreview ?? "").trim(),
      ),
    );
    const imgs = cells.filter((c): c is string => Boolean(c));
    console.warn(
      `[og-circle] ${sn}: picks=${picks.length} imgs=${imgs.length}`,
    );
    if (imgs.length < 4) return null;
    const res = new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(145deg, #0ea5e9 0%, #059669 42%, #18181b 100%)",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 46,
              fontWeight: 700,
              color: "#ffffff",
            }}
          >
            @{sn}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              width: GRID_COLS * CELL + (GRID_COLS - 1) * GAP,
              gap: GAP,
              justifyContent: "center",
            }}
          >
            {imgs.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                width={CELL}
                height={CELL}
                alt=""
                style={{ borderRadius: 18 }}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            nareaitter.hikamers.app
          </div>
        </div>
      ),
      { ...OG_SIZE },
    );
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch (e) {
    console.warn(
      `[og-circle] ${sn} failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

/** 汎用カード（PNG base64） */
async function buildFallbackPngBase64(): Promise<string> {
  const fb = new ImageResponse(fallbackJsx(), { ...OG_SIZE });
  return Buffer.from(await fb.arrayBuffer()).toString("base64");
}

export async function renderOgImage(handleParam: string): Promise<Response> {
  let sn = handleParam;
  try {
    sn = decodeURIComponent(handleParam);
  } catch {
    /* keep raw */
  }
  sn = sn.replace(/^@/, "").trim().toLowerCase();
  if (sn && !/^[a-z0-9_]{1,20}$/.test(sn)) sn = "";

  // 実カード: メモリに温まっている時だけ（コールドビルドは絶対に始めない）
  let b64: string | null = null;
  if (sn) {
    const payload = await peekOrAwaitServedYahooPayload(
      sn,
      true,
      INFLIGHT_WAIT_MS,
    );
    const users =
      ((payload as Record<string, unknown> | null)?.circleUsers as
        | CircleUserLite[]
        | undefined) ?? [];
    if (users.length > 0) {
      const picks = users.slice(0, MAX_ICONS);
      const sig = spriteSliceSig(picks);
      b64 = await unstable_cache(
        () => buildGridPngBase64(sn, picks),
        ["og-circle-v2", sn, sig],
        { revalidate: GRID_CACHE_SECONDS },
      )();
    }
  }

  // 汎用カード（長期キャッシュ）
  if (!b64) {
    b64 = await unstable_cache(
      () => buildFallbackPngBase64(),
      ["og-circle-fb-v1", sn || "_"],
      { revalidate: FALLBACK_CACHE_SECONDS },
    )();
  }

  return new Response(Buffer.from(b64, "base64"), {
    headers: {
      "Content-Type": "image/png",
      ...OG_CACHE_HEADERS,
    },
  });
}
