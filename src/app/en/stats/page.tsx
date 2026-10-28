import type { Metadata } from "next";
import { CirclePageShell } from "@/app/CirclePageShell";
import { StatsApp } from "@/components/StatsApp";
import { getStatsSnapshotCached } from "@/lib/stats-snapshot-cache";

export const metadata: Metadata = {
  title: "Mutual Circle Stats — site-wide rankings",
  description:
    "Cross-circle statistics for the mutual circles built on this site: most circles appeared in, total mentions, best average rank, top emojis and active hours.",
  alternates: {
    canonical: "/en/stats",
    languages: { ja: "/stats", en: "/en/stats" },
  },
  openGraph: {
    title: "Mutual Circle Stats — site-wide rankings",
    description:
      "Cross-circle rankings: appearances, mentions, average rank, emojis and active hours.",
    url: "/en/stats",
  },
};

export const dynamic = "force-dynamic";

export default async function StatsPageEn() {
  // サーバ側でスナップショットを載せて、JS 読み込み前から中身を出す（体感の高速化）
  let initial = null;
  try {
    initial = await getStatsSnapshotCached();
  } catch {
    initial = null;
  }
  return (
    <CirclePageShell>
      <StatsApp initial={initial} />
    </CirclePageShell>
  );
}
