"use client";

import { useLocale } from "@/components/LocaleProvider";
import { categoryEmoji } from "@/components/AmazonPicks";

const TAG = "maebahesioru-22";

/** 収録数トップのカテゴリ（amazon_links.json の実数） */
const CATEGORIES: Array<{ name: string; count: number; query: string }> = [
  { name: "スポーツ・アウトドア", count: 835, query: "スポーツ アウトドア" },
  { name: "ガジェット・家電", count: 759, query: "ガジェット 家電" },
  { name: "ホビー・おもちゃ", count: 726, query: "おもちゃ ホビー" },
  { name: "PC・作業環境", count: 710, query: "PC 周辺機器" },
  { name: "音・配信・DTM", count: 685, query: "オーディオ イヤホン" },
  { name: "食品・飲料", count: 532, query: "食品 飲料" },
  { name: "ファッション", count: 430, query: "ファッション" },
  { name: "生活・キッチン", count: 381, query: "キッチン用品" },
  { name: "健康・ドラッグ", count: 354, query: "健康 サプリ" },
  { name: "生活・収納・家具", count: 272, query: "収納 家具" },
  { name: "DIY・工具・ガーデン", count: 223, query: "DIY 工具" },
  { name: "ペット", count: 221, query: "ペット用品" },
];

/** 左レール用: Amazon検索へのアフィリエイトリンク集（広告） */
export function AmazonCategories() {
  const { locale } = useLocale();
  const isJa = locale === "ja";

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4 text-left dark:border-white/10 dark:bg-zinc-900/40">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {isJa ? "カテゴリから探す" : "Browse categories"}
        </h2>
        <span className="rounded-md border border-zinc-300/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:border-white/15 dark:text-zinc-500">
          {isJa ? "広告" : "Ad"}
        </span>
      </div>
      <ul className="space-y-1">
        {CATEGORIES.map((c) => (
          <li key={c.name}>
            <a
              href={`https://www.amazon.co.jp/s?k=${encodeURIComponent(c.query)}&tag=${TAG}`}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-zinc-100/80 dark:hover:bg-white/5"
            >
              <span aria-hidden className="shrink-0 text-base leading-none">
                {categoryEmoji(c.name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">{c.name}</span>
              <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-600">{c.count}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-2 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-600">
        {isJa ? "Amazon.co.jpの検索結果が開きます（アフィリエイトリンク）。" : "Opens Amazon.co.jp search (affiliate link)."}
      </p>
    </section>
  );
}
