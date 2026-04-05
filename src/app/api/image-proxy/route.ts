import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchProxiedImageUpstream,
  UpstreamImageError,
} from "@/lib/image-proxy-upstream";

/** CDN と揃え、オリジンでの再 fetch・再エンコード CPU を抑える */
const IMAGE_PROXY_REVALIDATE_SEC = 604800;

function stableImageCacheKey(raw: string): string {
  try {
    return new URL(raw.trim()).toString();
  } catch {
    return raw.trim();
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw?.trim()) {
    return NextResponse.json({ error: "url が必要です。" }, { status: 400 });
  }

  const key = stableImageCacheKey(raw);

  try {
    const cached = await unstable_cache(
      async () => {
        const { arrayBuffer, contentType } = await fetchProxiedImageUpstream(raw);
        return {
          contentType,
          b64: Buffer.from(arrayBuffer).toString("base64"),
        };
      },
      ["image-proxy-get-v1", key],
      { revalidate: IMAGE_PROXY_REVALIDATE_SEC },
    )();

    return new NextResponse(Buffer.from(cached.b64, "base64"), {
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control":
          "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "invalid url") {
      return NextResponse.json({ error: "無効な URL です。" }, { status: 400 });
    }
    if (msg === "forbidden host") {
      return NextResponse.json(
        { error: "許可されていないホストです。" },
        { status: 403 },
      );
    }
    if (e instanceof UpstreamImageError && e.status === 404) {
      return NextResponse.json(
        {
          error:
            "画像を取得できませんでした（Yahoo の URL の期限切れなどの可能性があります）。",
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ error: "取得に失敗しました。" }, { status: 502 });
  }
}
