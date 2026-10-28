import { NextResponse } from "next/server";
import { listStatsCircles } from "@/lib/stats-store";

export const dynamic = "force-dynamic";

/**
 * 集計済みサークルのハンドル一覧（バックフィル用）。
 * 再ビルドを回すときに全件を列挙するためだけの軽量エンドポイント。
 */
export async function GET() {
  try {
    const rows = listStatsCircles();
    return NextResponse.json(
      { count: rows.length, circles: rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "一覧の取得に失敗しました。" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
