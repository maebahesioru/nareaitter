import { NextResponse } from "next/server";
import { getStatsCandidates } from "@/lib/stats-store";

export const dynamic = "force-dynamic";

/**
 * まだ集計していないハンドルの候補を返す（芋づる式クロール用）。
 * 集計済みサークルに出ている人数の多い順。
 */
export async function GET(req: Request) {
  try {
    const raw = Number(new URL(req.url).searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(raw) ? Math.floor(raw) : 200;
    const rows = getStatsCandidates(limit);
    return NextResponse.json(
      { count: rows.length, candidates: rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "候補の取得に失敗しました。" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
