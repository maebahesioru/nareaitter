import { ImageResponse } from "next/og";
import { unstable_cache } from "next/cache";
import sharp from "sharp";
import { fetchProxiedImageUpstream } from "@/lib/image-proxy-upstream";
import { getServedYahooPayload } from "@/lib/yahoo-payload-server";

/**
 * プロフィールページ（/@handle）の共有カード（OG画像）を動的生成する。
 *
 * - 上位ユーザーのアイコンをグリッド状に並べたプレビュー + @handle を描画
 * - ペイロードが引けない/時間がかかる/アイコン不足の場合は汎用デザインへフォールバック
 * - テキストは ASCII のみ（@handle / ドメイン）にしてフォント問題を回避
 * - 生成結果はオリジンで5分キャッシュ（クローラの連打で毎回アイコンを取りに行かない）
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const OG_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;

const GRID_COLS = 10;
const CELL = 104;
const GAP = 8;
const MAX_ICONS = GRID_COLS * 4;
const BUILD_TIMEOUT_MS = 22_000;
const IMAGE_CONCURRENCY = 16;
const RENDER_CACHE_SECONDS = 300;

type CircleUserLite = {
  avatarUrl?: string | null;
  avatarUrlPreview?: string | null;
};

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

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

/** PNG(base64) を組み立てる。動的生成に失敗したら汎用デザイン */
async function buildPngBase64(sn: string): Promise<string> {
  if (sn) {
    try {
      const { payload } = await withTimeout(
        getServedYahooPayload(sn, true),
        BUILD_TIMEOUT_MS,
      );
      const users =
        ((payload as Record<string, unknown>).circleUsers as
          | CircleUserLite[]
          | undefined) ?? [];
      const picks = users.slice(0, MAX_ICONS);
      const cells = await mapLimit(picks, IMAGE_CONCURRENCY, (u) =>
        toCellDataUrl(
          (u.avatarUrl ?? "").trim() || (u.avatarUrlPreview ?? "").trim(),
        ),
      );
      const imgs = cells.filter((c): c is string => Boolean(c));
      console.warn(
        `[og-circle] ${sn}: users=${users.length} picks=${picks.length} imgs=${imgs.length}`,
      );
      if (imgs.length >= 4) {
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
      }
    } catch (e) {
      console.warn(
        `[og-circle] ${sn} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      /* フォールバックへ */
    }
  }
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

  const b64 = await unstable_cache(
    async () => buildPngBase64(sn),
    ["og-circle-v1", sn || "_"],
    { revalidate: RENDER_CACHE_SECONDS },
  )();

  return new Response(Buffer.from(b64, "base64"), {
    headers: {
      "Content-Type": "image/png",
      ...OG_CACHE_HEADERS,
    },
  });
}
