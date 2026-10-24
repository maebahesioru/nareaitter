"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLink } from "@/components/AppLink";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocale } from "@/components/LocaleProvider";
import { proxiedImageSrc } from "@/lib/proxied-image-src";
import type { StatsRankRow, StatsSnapshot } from "@/lib/stats-store";

type LoadState = "loading" | "ready" | "error";

function Avatar({ row }: { row: StatsRankRow }) {
  const [broken, setBroken] = useState(false);
  const initial = (row.screenName || "?").slice(0, 1).toUpperCase();
  const src = row.avatar?.trim();
  if (!src || broken) {
    return (
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-200 to-emerald-200 text-sm font-semibold text-sky-900 dark:from-sky-900/60 dark:to-emerald-900/60 dark:text-sky-100"
      >
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxiedImageSrc(src)}
      alt=""
      aria-hidden
      width={36}
      height={36}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-white/15"
    />
  );
}

function rankBadgeClass(rank: number): string {
  if (rank === 1)
    return "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 ring-amber-400/60";
  if (rank === 2)
    return "bg-gradient-to-br from-zinc-200 to-zinc-400 text-zinc-800 ring-zinc-300/70";
  if (rank === 3)
    return "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950 ring-orange-400/60";
  return "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/10";
}

type RankListProps = {
  rows: StatsRankRow[];
  hrefBase: string;
  maxValue: number;
  valueOf: (row: StatsRankRow) => number;
  valueLabel: (row: StatsRankRow) => string;
  unit: string;
  subOf: (row: StatsRankRow) => string;
  barPct: (row: StatsRankRow) => number;
  startRank?: number;
};

function RankList({
  rows,
  hrefBase,
  valueOf,
  valueLabel,
  unit,
  subOf,
  barPct,
  startRank = 1,
}: RankListProps) {
  return (
    <ol className="mt-3 space-y-0.5">
      {rows.map((row, i) => {
        const rank = i + startRank;
        const pct = Math.max(2, Math.min(100, barPct(row)));
        return (
          <li
            key={`${row.screenName}-${rank}`}
            className="flex items-center gap-3 rounded-xl px-1.5 py-2 transition hover:bg-zinc-100/80 dark:hover:bg-white/5"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ${rankBadgeClass(rank)}`}
            >
              {rank}
            </span>
            <Avatar row={row} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <AppLink
                  href={`${hrefBase}${encodeURIComponent(row.screenName)}`}
                  className="truncate text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-50"
                >
                  {row.displayName?.trim() || row.screenName}
                </AppLink>
                <span className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  @{row.screenName}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-400 to-emerald-400"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                {subOf(row)}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                {valueLabel(row)}
              </div>
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{unit}</div>
            </div>
            <span className="sr-only">{valueOf(row)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Chips({
  items,
  emoji,
}: {
  items: Array<{ key: string; n: number }>;
  emoji?: boolean;
}) {
  if (items.length === 0) {
    return <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">—</p>;
  }
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span
          key={it.key}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200/90 bg-white/70 px-2.5 py-1 text-xs text-zinc-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-200"
        >
          <span className={emoji ? "text-base leading-none" : "font-medium"}>
            {it.key}
          </span>
          {it.n > 1 ? (
            <span className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
              {it.n}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function Podium({
  rows,
  hrefBase,
  valueLabel,
  unit,
}: {
  rows: StatsRankRow[];
  hrefBase: string;
  valueLabel: (row: StatsRankRow) => string;
  unit: string;
}) {
  if (rows.length === 0) return null;
  const order = [0, 1, 2];
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {order.slice(0, rows.length).map((idx) => {
        const row = rows[idx];
        if (!row) return null;
        const rank = idx + 1;
        const accent =
          rank === 1
            ? "border-amber-300/80 bg-gradient-to-b from-amber-50 to-white dark:border-amber-400/30 dark:from-amber-500/10 dark:to-transparent"
            : rank === 2
              ? "border-zinc-300/80 bg-gradient-to-b from-zinc-50 to-white dark:border-white/15 dark:from-white/10 dark:to-transparent"
              : "border-orange-300/70 bg-gradient-to-b from-orange-50 to-white dark:border-orange-400/30 dark:from-orange-500/10 dark:to-transparent";
        return (
          <AppLink
            key={row.screenName}
            href={`${hrefBase}${encodeURIComponent(row.screenName)}`}
            className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center shadow-sm transition hover:brightness-[1.03] ${accent} ${rank === 1 ? "sm:py-4" : ""}`}
          >
            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
              {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
            </span>
            <Avatar row={row} />
            <span className="line-clamp-2 w-full text-xs font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
              {row.displayName?.trim() || row.screenName}
            </span>
            <span className="w-full truncate text-[10px] text-zinc-500 dark:text-zinc-400">
              @{row.screenName}
            </span>
            <span className="mt-0.5 text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {valueLabel(row)}
              <span className="ml-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                {unit}
              </span>
            </span>
          </AppLink>
        );
      })}
    </div>
  );
}

function SectionCard({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200/90 bg-white/75 p-4 shadow-sm backdrop-blur-sm sm:p-5 dark:border-white/10 dark:bg-zinc-900/50 ${className}`}
    >
      <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">{title}</h2>
      {hint ? (
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      ) : null}
      {children}
    </section>
  );
}

export function StatsApp() {
  const { locale, t, homePath } = useLocale();
  const [data, setData] = useState<StatsSnapshot | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const hrefBase = locale === "en" ? "/en/" : "/";
  const unitRank = locale === "en" ? "" : t.statsUnitRank;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      const json = (await res.json()) as StatsSnapshot;
      setData(json);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = handle.trim().replace(/^@+/, "");
      if (!name || busy) return;
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch("/api/stats/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ screenName: name }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          users?: number;
          circleUsers?: number;
          error?: string;
        };
        if (!res.ok || !json.ok) {
          setMessage({
            ok: false,
            text: json.error?.trim() || t.statsIngestErr,
          });
        } else {
          const people = json.circleUsers ?? 0;
          setMessage({
            ok: true,
            text: t.statsIngestOk
              .replace("{handle}", name)
              .replace("{users}", String(people)),
          });
          await load();
        }
      } catch {
        setMessage({ ok: false, text: t.statsIngestErr });
      } finally {
        setBusy(false);
      }
    },
    [busy, handle, load, t],
  );

  const derived = useMemo(() => {
    if (!data) return null;
    const circleCount = Math.max(1, data.circleCount);
    const maxAppear = Math.max(1, ...data.rankings.appearances.map((r) => r.appearances));
    const maxMentions = Math.max(1, ...data.rankings.mentions.map((r) => r.mentions));
    const ranks = data.rankings.rank;
    const maxAvg = Math.max(1, ...ranks.map((r) => r.avgRank));
    const hourMax = Math.max(1, ...data.hours);
    return { circleCount, maxAppear, maxMentions, maxAvg, hourMax };
  }, [data]);

  const updatedLabel = useMemo(() => {
    if (!data?.updatedAt) return "—";
    try {
      return new Date(data.updatedAt).toLocaleString(
        locale === "en" ? "en-US" : "ja-JP",
        { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" },
      );
    } catch {
      return "—";
    }
  }, [data?.updatedAt, locale]);

  const relTime = useCallback(
    (ms: number) => {
      if (!ms) return "";
      const dayMs = 86_400_000;
      const days = Math.floor((Date.now() - ms) / dayMs);
      if (days <= 0) return t.statsToday;
      if (days === 1) return t.statsYesterday;
      if (days < 30) return t.statsDaysAgo.replace("{n}", String(days));
      try {
        return new Date(ms).toLocaleDateString(locale === "en" ? "en-US" : "ja-JP", {
          month: "numeric",
          day: "numeric",
        });
      } catch {
        return "";
      }
    },
    [locale, t],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <AppLink
          href={homePath}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/90 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <span aria-hidden>←</span>
          {t.statsBack}
        </AppLink>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <div className="mt-5">
        <h1 className="bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:text-3xl">
          {t.statsTitle}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t.statsTagline}
        </p>
      </div>

      {state === "error" ? (
        <p className="mt-8 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200">
          {t.statsError}
        </p>
      ) : null}

      {state === "loading" ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[74px] animate-pulse rounded-2xl border border-zinc-200/70 bg-white/60 dark:border-white/10 dark:bg-white/5"
            />
          ))}
        </div>
      ) : null}

      {state === "ready" && data && derived ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t.statsStatCircles, value: data.circleCount.toLocaleString() },
              { label: t.statsStatUsers, value: data.userCount.toLocaleString() },
              { label: t.statsStatMentions, value: data.totalMentions.toLocaleString() },
              { label: t.statsStatUpdated, value: updatedLabel },
            ].map((cell) => (
              <div
                key={cell.label}
                className="rounded-2xl border border-zinc-200/90 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/50"
              >
                <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {cell.label}
                </div>
                <div className="mt-0.5 text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {cell.value}
                </div>
              </div>
            ))}
          </div>

          <SectionCard
            title={t.statsIngestTitle}
            hint={t.statsIngestHint}
            className="mt-3"
          >
            <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={t.statsIngestPlaceholder}
                aria-label={t.labelHandle}
                className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-200 dark:border-white/15 dark:bg-zinc-950/60 dark:text-zinc-100 dark:focus:border-sky-500 dark:focus:ring-sky-900"
              />
              <button
                type="submit"
                disabled={busy || !handle.trim()}
                className="rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? t.statsIngestBusy : t.statsIngestBtn}
              </button>
            </form>
            {message ? (
              <p
                className={`mt-2 text-xs ${message.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                role="status"
              >
                {message.text}
              </p>
            ) : null}
          </SectionCard>

          {data.rankings.appearances.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-6 text-center text-sm text-zinc-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-400">
              {t.statsEmpty}
            </p>
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <SectionCard
                title={t.statsAppearTitle}
                hint={t.statsAppearHint}
                className="lg:col-span-2"
              >
                <Podium
                  rows={data.rankings.appearances.slice(0, 3)}
                  hrefBase={hrefBase}
                  valueLabel={(r) => `${r.appearances}`}
                  unit={t.statsUnitCircles}
                />
                <RankList
                  rows={data.rankings.appearances.slice(3, 53)}
                  startRank={4}
                  hrefBase={hrefBase}
                  maxValue={derived.maxAppear}
                  valueOf={(r) => r.appearances}
                  valueLabel={(r) => `${r.appearances}`}
                  unit={t.statsUnitCircles}
                  barPct={(r) => (r.appearances / derived.circleCount) * 100}
                  subOf={(r) =>
                    locale === "en"
                      ? `avg rank ${r.avgRank}${unitRank} · best ${r.bestRank} · ${r.mentions} mentions`
                      : `平均 ${r.avgRank}位 · 最高 ${r.bestRank}位 · 延べ ${r.mentions}回`
                  }
                />
              </SectionCard>

              <SectionCard title={t.statsMentionsTitle} hint={t.statsMentionsHint}>
                <RankList
                  rows={data.rankings.mentions.slice(0, 30)}
                  hrefBase={hrefBase}
                  maxValue={derived.maxMentions}
                  valueOf={(r) => r.mentions}
                  valueLabel={(r) => `${r.mentions}`}
                  unit={t.statsUnitTimes}
                  barPct={(r) => (r.mentions / derived.maxMentions) * 100}
                  subOf={(r) =>
                    locale === "en"
                      ? `${r.appearances} circles · avg rank ${r.avgRank}${unitRank}`
                      : `${r.appearances}サークル · 平均 ${r.avgRank}位`
                  }
                />
              </SectionCard>

              <SectionCard title={t.statsRankTitle} hint={t.statsRankHint}>
                <RankList
                  rows={data.rankings.rank.slice(0, 30)}
                  hrefBase={hrefBase}
                  maxValue={derived.maxAvg}
                  valueOf={(r) => -r.avgRank}
                  valueLabel={(r) => `${r.avgRank}`}
                  unit={locale === "en" ? "rank" : t.statsUnitRank}
                  barPct={(r) =>
                    ((derived.maxAvg - r.avgRank + 1) / derived.maxAvg) * 100
                  }
                  subOf={(r) =>
                    locale === "en"
                      ? `${r.appearances} circles · ${r.mentions} mentions`
                      : `${r.appearances}サークル · 延べ ${r.mentions}回`
                  }
                />
              </SectionCard>

              <SectionCard title={t.statsEmojisTitle} hint={t.statsEmojisHint}>
                <Chips items={data.emojis} emoji />
              </SectionCard>

              <SectionCard title={t.statsHoursTitle} hint={t.statsHoursHint}>
                <div className="mt-3 flex h-28 items-end gap-[2px]">
                  {data.hours.map((v, h) => {
                    const pct = Math.max(3, (v / derived.hourMax) * 100);
                    return (
                      <div
                        key={h}
                        className="group relative flex h-full flex-1 items-end"
                        title={`${h}:00 — ${v}`}
                      >
                        <div
                          className="w-full rounded-t-[3px] bg-gradient-to-t from-sky-400/70 to-emerald-400/90 transition group-hover:from-sky-500 group-hover:to-emerald-500"
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  {[0, 6, 12, 18, 23].map((h) => (
                    <span key={h}>{h}時</span>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title={t.statsLaughsTitle}>
                <Chips items={data.laughs} />
              </SectionCard>

              <SectionCard title={t.statsVocativesTitle}>
                <Chips items={data.vocatives} />
              </SectionCard>

              <SectionCard
                title={t.statsRecentTitle}
                hint={t.statsRecentHint}
                className="lg:col-span-2"
              >
                <ul className="mt-3 grid gap-0.5 sm:grid-cols-2">
                  {data.rankings.recent.slice(0, 12).map((r) => (
                    <li key={r.screenName}>
                      <AppLink
                        href={`${hrefBase}${encodeURIComponent(r.screenName)}`}
                        className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition hover:bg-zinc-100/80 dark:hover:bg-white/5"
                      >
                        <Avatar row={r} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                            {r.displayName?.trim() || r.screenName}
                          </div>
                          <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                            @{r.screenName} · {r.appearances}
                            {t.statsUnitCircles} · {t.statsColMentions} {r.mentions}
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                          {relTime(r.lastSeen)}
                        </span>
                      </AppLink>
                    </li>
                  ))}
                </ul>
              </SectionCard>

              <SectionCard
                title={t.statsCirclesTitle}
                hint={t.statsCirclesHint}
                className="lg:col-span-2"
              >
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.circles.map((c) => (
                    <AppLink
                      key={c.screenName}
                      href={`${hrefBase}${encodeURIComponent(c.screenName)}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white/70 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm transition hover:border-sky-300 hover:text-sky-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-sky-500/50 dark:hover:text-sky-300"
                    >
                      <span className="truncate max-w-[10rem]">@{c.screenName}</span>
                      <span className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                        {c.users}
                      </span>
                    </AppLink>
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          <p className="mt-6 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
            {t.statsNote}
          </p>
        </>
      ) : null}
    </div>
  );
}
