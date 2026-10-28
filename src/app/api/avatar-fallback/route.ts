import type { NextRequest } from "next/server";
import { setUserAvatar } from "@/lib/stats-store";
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
    // 未解決（存在しない場合と、fxtwitter 側の一時的な休止の両方があり得る）。
    // 長くキャッシュすると復帰後も欠けたままになるので短命にする。
    return new Response("not_found", {
      status: 404,
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  }
  // X の既定アイコンしか無いアカウントは「画像なし」として扱う
  if (hd.includes("default_profile") || hd.includes("/sticky/default_profile_images/")) {
    return new Response("not_found", { status: 404, headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } });
  }
  // 解決できた URL は統計ストアにも書き戻す（次回のページ表示で即描画できる）
  try {
    setUserAvatar(screen, hd);
  } catch {
    /* ストア未初期化などは無視 */
  }
  // pbs.twimg.com から画像バイトをサーバ経由で取ると、上流の遅延で 8 秒待ち→502 になるため、
  // 解決済み URL へリダイレクトしてブラウザに直接読ませる。
  return new Response(null, {
    status: 302,
    headers: {
      Location: hd,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
