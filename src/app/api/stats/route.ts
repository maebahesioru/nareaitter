import { NextResponse, after } from "next/server";
import { backfillStatsAvatars } from "@/lib/stats-avatar-backfill";
import { flushStats, getStatsSnapshot } from "@/lib/stats-store";
import type { StatsSnapshot } from "@/lib/stats-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** これより古くなったら「裏で」作り直す（ユーザーは待たせない）。ビルドは数分おきなので遅れは実害なし */
const SNAPSHOT_REFRESH_MS = 60_000;
/** 作り直しに失敗し続けたときの保険。これ以上古いものは出さない */
const SNAPSHOT_MAX_STALE_MS = 30 * 60_000;

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
/** スナップショットを作り直す（多重起動しない） */
function refresh(): Promise<StatsSnapshot> {
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
    // 手元にスナップショットがあれば、古くても即返して更新は裏で回す（体感ゼロ）
    const fresh = cache.data && Date.now() - cache.at <= SNAPSHOT_MAX_STALE_MS ? cache.data : null;
    const data = fresh ?? (await refresh());
    if (fresh && Date.now() - cache.at > SNAPSHOT_REFRESH_MS) {
      after(() => {
        void refresh().catch(() => {});
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
