import { NextRequest, NextResponse } from "next/server";
import { backfillStatsAvatars } from "@/lib/stats-avatar-backfill";
import { getStatsMeta } from "@/lib/stats-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * アバターのバックフィルを明示的に1バッチ走らせる（管理・補修用）。
 * fx/vx は 429 で全体休止（90秒）に入ることがあるので、小刻みに何度か叩く前提。
 */
const globalForAv = globalThis as unknown as { __nareaiStatsAvatarGate?: { at: number } };
const gate = (globalForAv.__nareaiStatsAvatarGate ??= { at: 0 });
const MIN_INTERVAL_MS = 5_000;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const limit = Math.max(1, Math.min(80, Number(params.get("limit") ?? 30) || 30));
  const force = params.get("force") === "1";
  const now = Date.now();
  if (!force && now - gate.at < MIN_INTERVAL_MS) {
    return NextResponse.json(
      { error: "続けて叩きすぎです。5秒あけてください。" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }
  gate.at = now;
  const saved = await backfillStatsAvatars(limit, 300);
  return NextResponse.json(
    { ok: true, limit, saved, meta: getStatsMeta() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
