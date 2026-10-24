import { NextResponse, after } from "next/server";
import { backfillStatsAvatars } from "@/lib/stats-avatar-backfill";
import { flushStats, getStatsSnapshot } from "@/lib/stats-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * サイト全体の馴れ合い統計（サークル横断ランキング）。
 * 集計は各サークルのペイロードビルド時に貯まっていく累積値。
 *
 * レスポンス後、アバター未取得のユーザーを fxtwitter から静かに解決して保存する
 * （サークル画面と同じ高画質アイコンを出すため。次回以降の取得で反映される）。
 */
export async function GET(req: Request) {
  try {
    // ?flush=1 でディスクへ書き出す（デバウンス待ちを飛ばす。デプロイ前の退避用）
    if (new URL(req.url).searchParams.get("flush") === "1") await flushStats();
    const snapshot = getStatsSnapshot();
    after(() => {
      void backfillStatsAvatars(40).catch(() => {});
    });
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "統計の取得に失敗しました。" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
