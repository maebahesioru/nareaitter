import { NextResponse, after } from "next/server";
import { backfillStatsAvatars } from "@/lib/stats-avatar-backfill";
import { flushStats, getStatsSnapshot } from "@/lib/stats-store";
import { peekStatsSnapshot, refreshStatsSnapshot } from "@/lib/stats-snapshot-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const flush = new URL(req.url).searchParams.get("flush") === "1";
  try {
    if (flush) {
      // ?flush=1 はデバウンスを飛ばしてディスクへ書き出す（デプロイ前の退避用）
      await flushStats();
      const snapshotNow = getStatsSnapshot();
      return NextResponse.json(snapshotNow, { headers: { "Cache-Control": "no-store" } });
    }
    // 手元にスナップショットがあれば、古くても即返して更新は裏で回す（体感ゼロ）
    const { data: cachedData, stale } = peekStatsSnapshot();
    const data = cachedData ?? (await refreshStatsSnapshot());
    if (stale && cachedData) {
      after(() => {
        void refreshStatsSnapshot().catch(() => {});
      });
    }
    after(() => {
      void backfillStatsAvatars(40).catch(() => {});
    });
    return NextResponse.json(data, {
      headers: {
        // エッジ/ブラウザは60秒使い回し、その後は裏で更新（体感を待たせない）
        "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "統計の取得に失敗しました。" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
