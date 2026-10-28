import { NextResponse, after } from "next/server";
import { backfillStatsAvatars } from "@/lib/stats-avatar-backfill";
import { flushStats, getStatsSnapshot } from "@/lib/stats-store";
import type { StatsSnapshot } from "@/lib/stats-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** スナップショットの使い回し時間。ビルドは数分おきなので15秒の遅れは実害がない */
const SNAPSHOT_TTL_MS = 15_000;

type SnapshotCache = {
  at: number;
  data: StatsSnapshot | null;
  inflight: Promise<StatsSnapshot> | null;
};

const globalForStats = globalThis as unknown as { __nareaiStatsSnapshotCache?: SnapshotCache };
const cache = (globalForStats.__nareaiStatsSnapshotCache ??= { at: 0, data: null, inflight: null });

/**
 * スナップショットは SQLite への問い合わせ十数本で作るので、同時アクセスで作り直さない。
 * 15秒だけメモリに残し、その間のリクエストは同じオブジェクトを返す。
 */
function snapshot(): Promise<StatsSnapshot> {
  if (cache.data && Date.now() - cache.at < SNAPSHOT_TTL_MS) return Promise.resolve(cache.data);
  if (cache.inflight) return cache.inflight;
  cache.inflight = Promise.resolve()
    .then(() => {
      const data = getStatsSnapshot();
      cache.data = data;
      cache.at = Date.now();
      return data;
    })
    .finally(() => {
      cache.inflight = null;
    });
  return cache.inflight;
}

/**
 * サイト全体の馴れ合い統計（サークル横断ランキング）。
 * 集計は各サークルのペイロードビルド時に貯まっていく累積値。
 *
 * レスポンス後、アバター未取得のユーザーを fxtwitter から静かに解決して保存する
 * （サークル画面と同じ高画質アイコンを出すため。次回以降の取得で反映される）。
 */
export async function GET(req: Request) {
  const flush = new URL(req.url).searchParams.get("flush") === "1";
  try {
    if (flush) {
      // ?flush=1 はデバウンスを飛ばしてディスクへ書き出す（デプロイ前の退避用）
      await flushStats();
      const snapshotNow = getStatsSnapshot();
      return NextResponse.json(snapshotNow, { headers: { "Cache-Control": "no-store" } });
    }
    const data = await snapshot();
    after(() => {
      void backfillStatsAvatars(40).catch(() => {});
    });
    return NextResponse.json(data, {
      headers: {
        // エッジ/ブラウザは60秒使い回し、その後は裏で更新（体感を待たせない）
        "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "統計の取得に失敗しました。" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
