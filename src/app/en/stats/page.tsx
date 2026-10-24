import type { Metadata } from "next";
import { CirclePageShell } from "@/app/CirclePageShell";
import { StatsApp } from "@/components/StatsApp";

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

export default function StatsPageEn() {
  return (
    <CirclePageShell>
      <StatsApp />
    </CirclePageShell>
  );
}
