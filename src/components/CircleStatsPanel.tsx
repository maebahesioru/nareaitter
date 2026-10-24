"use client";

import { useMemo } from "react";
import { useLocale } from "@/components/LocaleProvider";
import type { CircleUser } from "@/types/circle";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** ジニ係数: 0=完全に均等 / 1=1人に全集中 */
function gini(values: number[]): number {
  const xs = values.filter((v) => v > 0).sort((a, b) => a - b);
  const n = xs.length;
  const sum = xs.reduce((a, b) => a + b, 0);
  if (n === 0 || sum === 0) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (i + 1) * xs[i];
  return (2 * acc) / (n * sum) - (n + 1) / n;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

/** 分 → 読みやすい表記 */
function formatMinutes(min: number, secLabel: string, minLabel: string): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  if (min < 1) return `${round1(min * 60)}${secLabel}`;
  return `${round1(min)}${minLabel}`;
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200/90 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="text-[10px] font-medium leading-tight text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums leading-none text-zinc-900 dark:text-zinc-50">
        {value}
      </div>
      {sub ? (
        <div className="mt-1 truncate text-[10px] text-zinc-500 dark:text-zinc-400">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function ChipRow({
  title,
  items,
  emoji,
}: {
  title: string;
  items: Array<{ key: string; n: number }>;
  emoji?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
        {title}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {items.length === 0 ? (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
        ) : (
          items.slice(0, 10).map((it) => (
            <span
              key={it.key}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200/90 bg-white/80 px-2 py-0.5 text-[11px] text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200"
            >
              <span className={emoji ? "text-sm leading-none" : ""}>{it.key}</span>
              {it.n > 1 ? (
                <span className="tabular-nums text-[10px] text-zinc-500 dark:text-zinc-400">
                  {it.n}
                </span>
              ) : null}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export function CircleStatsPanel({ users }: { users: CircleUser[] }) {
  const { t } = useLocale();

  const stats = useMemo(() => {
    const counts = users.map((u) => Math.max(0, u.interactionCount ?? 0));
    const total = counts.reduce((a, b) => a + b, 0);
    const n = users.length;
    const sentTotal = users.reduce((a, u) => a + Math.max(0, u.mentionsSent ?? 0), 0);
    const recvTotal = users.reduce((a, u) => a + Math.max(0, u.mentionsReceived ?? 0), 0);
    const mutual = users.filter(
      (u) => (u.mentionsReceived ?? 0) > 0 && (u.mentionsSent ?? 0) > 0,
    ).length;
    const sortedCounts = [...counts].sort((a, b) => b - a);
    const top5 = sortedCounts.slice(0, 5).reduce((a, b) => a + b, 0);
    const top10 = sortedCounts.slice(0, 10).reduce((a, b) => a + b, 0);

    const replyMins = users
      .slice(0, 20)
      .map((u) => u.replyThemMin)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);

    const emojis = new Map<string, number>();
    const vocatives = new Map<string, number>();
    const laughs = new Map<string, number>();
    for (const u of users.slice(0, 20)) {
      for (const e of u.topEmojis ?? []) {
        if (e) emojis.set(e, (emojis.get(e) ?? 0) + 1);
      }
      if (u.vocative) vocatives.set(u.vocative, (vocatives.get(u.vocative) ?? 0) + 1);
      if (u.laugh) laughs.set(u.laugh, (laughs.get(u.laugh) ?? 0) + 1);
    }

    const hours = new Array(24).fill(0);
    for (const u of users.slice(0, 64)) {
      if (typeof u.activeHour === "number" && u.activeHour >= 0 && u.activeHour < 24) {
        hours[u.activeHour] += 1;
      }
    }

    let oldestMs = Number.POSITIVE_INFINITY;
    for (const u of users) {
      if (!u.firstInteractionAt) continue;
      const ms = Date.parse(u.firstInteractionAt);
      if (Number.isFinite(ms) && ms < oldestMs) oldestMs = ms;
    }
    const daysKnown = Number.isFinite(oldestMs)
      ? Math.max(0, Math.floor((Date.now() - oldestMs) / 86_400_000))
      : null;

    const anyBasis = sentTotal + recvTotal > 0 ? sentTotal + recvTotal : 1;
    const toMap = (m: Map<string, number>) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, cnt]) => ({ key, n: cnt }));

    return {
      total,
      n,
      avg: n > 0 ? total / n : 0,
      med: median(counts),
      top5Share: total > 0 ? (top5 / total) * 100 : 0,
      top10Share: total > 0 ? (top10 / total) * 100 : 0,
      gini: gini(counts),
      mutual,
      mutualPct: n > 0 ? (mutual / n) * 100 : 0,
      sentPct: (sentTotal / anyBasis) * 100,
      recvPct: (recvTotal / anyBasis) * 100,
      sentTotal,
      recvTotal,
      replyMedian: median(replyMins),
      hasReply: replyMins.length > 0,
      daysKnown,
      topCounts: sortedCounts.slice(0, 10),
      hours,
      emojis: toMap(emojis),
      vocatives: toMap(vocatives),
      laughs: toMap(laughs),
    };
  }, [users]);

  const hourMax = Math.max(1, ...stats.hours);
  const topMax = Math.max(1, ...stats.topCounts);

  return (
    <div className="space-y-4 text-left">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile
          label={t.circleStatsTotal}
          value={fmt(stats.total)}
          sub={`${t.circleStatsPerPeer} ${fmt(Math.round(stats.avg * 10) / 10)}`}
        />
        <Tile
          label={t.circleStatsPeers}
          value={`${fmt(stats.n)}${t.statsUnitPeople}`}
          sub={`${t.circleStatsMedian} ${fmt(stats.med)}`}
        />
        <Tile
          label={t.circleStatsTopShare}
          value={`${round1(stats.top5Share)}%`}
          sub={`${t.circleStatsGini} ${stats.gini.toFixed(2)}`}
        />
        <Tile
          label={t.circleStatsMutual}
          value={`${round1(stats.mutualPct)}%`}
          sub={`${fmt(stats.mutual)} / ${fmt(stats.n)}`}
        />
        <Tile
          label={t.circleStatsReplySpeed}
          value={
            stats.hasReply
              ? formatMinutes(stats.replyMedian, t.circleStatsSeconds, t.circleStatsMinutes)
              : "—"
          }
          sub={t.circleStatsMedian}
        />
        <Tile
          label={t.circleStatsOldest}
          value={stats.daysKnown === null ? "—" : `${fmt(stats.daysKnown)}${t.circleStatsDays}`}
          sub={t.circleStatsGiniHint}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200/90 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
            {t.circleStatsConcentration}
          </div>
          <div className="mt-2 space-y-1">
            {stats.topCounts.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  {i + 1}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400"
                    style={{ width: `${Math.max(2, (c / topMax) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  {c}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">
            {t.circleStatsTop10} {round1(stats.top10Share)}%
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200/90 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
              {t.circleStatsDirection}
            </span>
            <span className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
              {fmt(stats.sentTotal)} / {fmt(stats.recvTotal)}
            </span>
          </div>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10">
            <div
              className="h-full bg-sky-400"
              style={{ width: `${Math.max(1, stats.sentPct)}%` }}
              title={`${t.circleStatsYouToThem} ${round1(stats.sentPct)}%`}
            />
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${Math.max(1, stats.recvPct)}%` }}
              title={`${t.circleStatsThemToYou} ${round1(stats.recvPct)}%`}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
              {t.circleStatsYouToThem} {round1(stats.sentPct)}%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {t.circleStatsThemToYou} {round1(stats.recvPct)}%
            </span>
          </div>

          <div className="mt-3 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
            {t.circleStatsHours}
          </div>
          <div className="mt-1.5 flex h-14 items-end gap-[2px]">
            {stats.hours.map((v, h) => (
              <div
                key={h}
                className="flex h-full flex-1 items-end"
                title={`${h}:00 — ${v}`}
              >
                <div
                  className="w-full rounded-t-[2px] bg-gradient-to-t from-sky-400/60 to-emerald-400/90"
                  style={{ height: `${Math.max(3, (v / hourMax) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-[9px] tabular-nums text-zinc-500 dark:text-zinc-400">
            {[0, 6, 12, 18, 23].map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ChipRow title={t.circleStatsEmojis} items={stats.emojis} emoji />
        <ChipRow title={t.circleStatsVocatives} items={stats.vocatives} />
        <ChipRow title={t.circleStatsLaughs} items={stats.laughs} />
      </div>

      <p className="text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        {t.circleStatsHint}
      </p>
    </div>
  );
}
