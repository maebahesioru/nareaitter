import type { NextRequest } from "next/server";
import { resolveCircleAvatarUrl } from "@/lib/x-profile-image";

export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * アバターの最終フォールバック。
 * Yahoo のサムネイルURLが失効して 404 になったユーザーでも、
 * fxtwitter / vxtwitter から現在のアバターを解決して配信する。
 * （family tree などの「プレビューURL直読み」箇所の欠け対策）
 */
export async function GET(req: NextRequest) {
  const screen = (req.nextUrl.searchParams.get("screen") ?? "").replace(/^@/, "").trim();
  if (!screen || !/^[A-Za-z0-9_]{1,20}$/.test(screen)) {
    return new Response("bad_request", { status: 400, headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } });
  }
  const hd = await resolveCircleAvatarUrl(screen);
  if (!hd) {
    // 存在しない/解決不能アカウント。短めにキャッシュして再試行を抑える
    return new Response("not_found", { status: 404, headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } });
  }
  try {
    const img = await fetch(hd, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!img.ok || !img.body) {
      return new Response("upstream_error", { status: 502, headers: { "Cache-Control": "public, max-age=120, s-maxage=300" } });
    }
    return new Response(img.body, {
      status: 200,
      headers: {
        "Content-Type": img.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("fetch_error", { status: 502, headers: { "Cache-Control": "public, max-age=120, s-maxage=300" } });
  }
}
