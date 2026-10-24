import { NextResponse } from "next/server";
import { flushStats, getStatsSnapshot } from "@/lib/stats-store";

export const dynamic = "force-dynamic";

/**
 * サイト全体の馴れ合い統計（サークル横断ランキング）。
 * 集計は各サークルのペイロードビルド時に貯まっていく累積値。
 */
export async function GET(req: Request) {
  try {
    // ?flush=1 でディスクへ書き出す（デバウンス待ちを飛ばす。デプロイ前の退避用）
    if (new URL(req.url).searchParams.get("flush") === "1") flushStats();
    const snapshot = getStatsSnapshot();
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
