"use client";

import { useMemo, useState } from "react";
import type { CircleUser } from "@/types/circle";
import { proxiedImageSrc } from "@/lib/proxied-image-src";
import { useLocale } from "./LocaleProvider";

type SortKey = "total" | "received" | "sent" | "last";
type SortDir = "desc" | "asc";

/**
 * 交流の詳細表。
 * - 誰と何回合わせたか（合計）と、内訳（相手→あなた / あなた→相手）を一覧する
 * - 見出しクリックで並べ替え、ユーザー名で絞り込み
 * - 画像は loading=lazy で行が表示された分だけ読み込む（画像プロキシのキャッシュに乗る）
 */
export function InteractionTable({ users }: { users: CircleUser[] }) {
  const { t, locale } = useLocale();
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? users.filter((u) => u.screenName.toLowerCase().includes(q))
      : users.slice();

    const val = (u: CircleUser): number => {
      switch (sortKey) {
        case "received":
          return u.mentionsReceived ?? 0;
        case "sent":
          return u.mentionsSent ?? 0;
        case "last":
          return u.lastInteractionAt ? Date.parse(u.lastInteractionAt) : 0;
        default:
          return (
            u.interactionCount ??
            (u.mentionsReceived ?? 0) + (u.mentionsSent ?? 0)
          );
      }
    };

    filtered.sort((a, b) => {
      const d = val(a) - val(b);
      if (d !== 0) return sortDir === "desc" ? -d : d;
      return (b.interactionCount ?? 0) - (a.interactionCount ?? 0);
    });
    return filtered;
  }, [users, sortKey, sortDir, filter]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const fmtDate = (iso?: string): string => {
    if (!iso) return "—";
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return "—";
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  };

  const arrow = (k: SortKey) =>
    sortKey === k ? (sortDir === "desc" ? " ▼" : " ▲") : "";

  const thBase =
    "cursor-pointer select-none whitespace-nowrap px-3 py-2 text-xs font-semibold text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t.tableFilterPlaceholder}
          autoComplete="off"
          className="w-full max-w-60 rounded-lg border border-zinc-300/90 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-sky-500/50 focus:outline-none dark:border-white/10 dark:bg-black/30 dark:text-zinc-100"
        />
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {t.tableShownLabel}: {rows.length} / {users.length}
        </span>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-xl border border-zinc-200/90 dark:border-white/10">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-100 dark:bg-zinc-800">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {t.tableColRank}
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {t.tableColUser}
              </th>
              <th className={`${thBase} text-right`} onClick={() => onSort("total")}>
                {t.tableColTotal}
                {arrow("total")}
              </th>
              <th
                className={`${thBase} text-right`}
                onClick={() => onSort("received")}
              >
                {t.tableColReceived}
                {arrow("received")}
              </th>
              <th className={`${thBase} text-right`} onClick={() => onSort("sent")}>
                {t.tableColSent}
                {arrow("sent")}
              </th>
              <th className={`${thBase} text-right`} onClick={() => onSort("last")}>
                {t.tableColLast}
                {arrow("last")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u, i) => {
              const img = (u.avatarUrlPreview ?? "").trim() || (u.avatarUrl ?? "").trim();
              return (
                <tr
                  key={u.id}
                  className="border-t border-zinc-200/80 odd:bg-white even:bg-zinc-50/60 dark:border-white/5 dark:odd:bg-zinc-900/40 dark:even:bg-zinc-900/20"
                >
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                    {i + 1}
                  </td>
                  <td className="max-w-52 px-3 py-1.5">
                    <span className="flex items-center gap-2">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={proxiedImageSrc(img)}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                          decoding="async"
                          className="h-7 w-7 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="h-7 w-7 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                      )}
                      <a
                        href={`https://x.com/${encodeURIComponent(u.screenName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`@${u.screenName}`}
                        className="truncate text-zinc-800 underline-offset-2 hover:text-sky-600 hover:underline dark:text-zinc-200 dark:hover:text-sky-400"
                      >
                        @{u.screenName}
                      </a>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {u.interactionCount ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {u.mentionsReceived ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {u.mentionsSent ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {fmtDate(u.lastInteractionAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {t.tableNoMatch}
          </p>
        )}
      </div>

      <p className="mt-3 text-center text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        {t.tableSortHint}
      </p>
    </div>
  );
}
