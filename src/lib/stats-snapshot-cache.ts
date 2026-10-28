import { getStatsSnapshot, type StatsSnapshot } from "@/lib/stats-store";

/**
 * /api/stats と /stats ページで共有するスナップショットのメモリキャッシュ。
 * - 60秒を超えたら「裏で」作り直す（リクエストは待たせない）
 * - 30分を超えたものは念のため出さない
 */
const SNAPSHOT_REFRESH_MS = 60_000;
const SNAPSHOT_MAX_STALE_MS = 30 * 60_000;

type Cache = { at: number; data: StatsSnapshot | null; inflight: Promise<StatsSnapshot> | null };

const globalForStats = globalThis as unknown as { __nareaiStatsSnapshotCache?: Cache };
const cache = (globalForStats.__nareaiStatsSnapshotCache ??= { at: 0, data: null, inflight: null });

/** 作り直す（多重起動しない） */
export function refreshStatsSnapshot(): Promise<StatsSnapshot> {
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

export type CachedSnapshot = {
  /** 出してよいスナップショット（無ければ null） */
  data: StatsSnapshot | null;
  /** 古いので裏で更新したほうがよい */
  stale: boolean;
};

/** 同期的に「出すだけ」の取得（SSR 用）。無ければ null */
export function peekStatsSnapshot(): CachedSnapshot {
  const data = cache.data && Date.now() - cache.at <= SNAPSHOT_MAX_STALE_MS ? cache.data : null;
  return { data, stale: !data ? true : Date.now() - cache.at > SNAPSHOT_REFRESH_MS };
}

/** 無ければ作る（初回だけ待つ）。SSR の初回描画用 */
export async function getStatsSnapshotCached(): Promise<StatsSnapshot> {
  const { data, stale } = peekStatsSnapshot();
  if (data && !stale) return data;
  return refreshStatsSnapshot();
}
