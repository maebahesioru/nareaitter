"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";

type Item = { name: string; url: string; category: string };

/**
 * おすすめ商品（広告）ウィジェット。
 * Amazonアソシエイトのテキストリンクをランダム表示する。
 * 画像・価格・APIは使わない（アソシエイト規約で安全な静的リンク方式）。
 */
export function AmazonPicks() {
  const { locale } = useLocale();
  const isJa = locale === "ja";
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/amazon-picks?n=5", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { items?: Item[] };
        setItems(j.items ?? []);
      }
    } catch {
      /* 表示できなければ非表示のまま */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loading && items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white/70 p-4 text-left dark:border-white/10 dark:bg-zinc-900/40">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {isJa ? "おすすめ商品" : "Recommended"}
          </h2>
          <span className="rounded-md border border-zinc-300/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:border-white/15 dark:text-zinc-500">
            {isJa ? "広告" : "Ad"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-zinc-300/90 bg-white/80 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-400/70 disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800/70 dark:text-zinc-400 dark:hover:border-white/25"
        >
          {loading ? (isJa ? "読み込み中…" : "Loading…") : isJa ? "引き直す" : "Shuffle"}
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={`${it.url}-${i}`} className="flex items-baseline gap-2 text-sm">
            <a
              href={it.url}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              className="min-w-0 flex-1 truncate text-sky-700 underline-offset-2 transition hover:text-sky-500 hover:underline dark:text-sky-400/90 dark:hover:text-sky-300"
              title={it.name}
            >
              {it.name}
            </a>
            <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-600">{it.category}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-600">
        {isJa
          ? "Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。"
          : "As an Amazon Associate, this site earns from qualifying purchases."}
      </p>
    </section>
  );
}
