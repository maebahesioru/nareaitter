import type { Metadata } from "next";
import { CirclePageShell } from "@/app/CirclePageShell";
import { StatsApp } from "@/components/StatsApp";

export const metadata: Metadata = {
  title: "馴れ合い統計 — サイト全体ランキング",
  description:
    "このサイトで集計された馴れ合いサークルを横断して、サークル登場ランキング・総交流数・平均順位・よく使われる絵文字や活動時間帯をまとめた統計ページです。",
  alternates: {
    canonical: "/stats",
    languages: { ja: "/stats", en: "/en/stats" },
  },
  openGraph: {
    title: "馴れ合い統計 — サイト全体ランキング",
    description:
      "馴れ合いサークルを横断した登場ランキング・総交流数・平均順位などの統計。",
    url: "/stats",
  },
};

export default function StatsPage() {
  return (
    <CirclePageShell>
      <StatsApp />
    </CirclePageShell>
  );
}
