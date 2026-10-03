"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CircleUser, SelfProfile } from "@/types/circle";
import {
  readYahooCircleCache,
  writeYahooCircleCache,
} from "@/lib/yahoo-client-cache";
import { AppLink } from "./AppLink";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useLocale } from "./LocaleProvider";
import { SaveCircleImageButton } from "./SaveCircleImageButton";
import { ShareButton } from "./ShareButton";
import { ThemeToggle } from "./ThemeToggle";
import { AmazonPicks } from "@/components/AmazonPicks";

const EMPTY_SELF: SelfProfile = { screenName: "", displayName: "" };

const InteractionCircle = dynamic(
  () =>
    import("./InteractionCircle").then((m) => ({ default: m.InteractionCircle })),
  { ssr: false },
);

const FamilyTreeCanvas = dynamic(
  () =>
    import("./FamilyTreeCanvas").then((m) => ({ default: m.FamilyTreeCanvas })),
  { ssr: false },
);

const AIDiagnosisPanel = dynamic(
  () =>
    import("./AIDiagnosisPanel").then((m) => ({ default: m.AIDiagnosisPanel })),
  { ssr: false },
);

const AccountValuePanel = dynamic(
  () =>
    import("./AccountValuePanel").then((m) => ({ default: m.AccountValuePanel })),
  { ssr: false },
);

const InteractionTable = dynamic(
  () =>
    import("./InteractionTable").then((m) => ({ default: m.InteractionTable })),
  { ssr: false },
);

type ViewMode = "circle" | "table" | "family" | "ai" | "value";

type YahooMentionsResponse = {
  screenName: string;
  counts: { mentionsToYou: number; mentionsFromYou: number };
  circleUsers?: CircleUser[];
  recentSelfTweets?: string[];
  selfActivity?: {
    topHours: number[];
    fromYou7d: number;
    toYou7d: number;
    weeklyTo?: number[];
    weeklyFrom?: number[];
    postGapMin?: number;
    weekdayType?: string;
    newConn14d?: number;
    dormant14d?: number;
    words?: string[];
    breadthTo?: number[];
    breadthFrom?: number[];
    maxSilenceDays?: number;
    avgPostPerDay?: number;
    tone?: { thanks?: number; love?: number; tired?: number; gloomy?: number };
    receivedBlocks?: number[];
    sentBlocks?: number[];
    revivalText?: string;
    revivalAt?: number;
    burstEpisodes?: number;
    peakDay?: { date: string; n: number };
  };
  communityWords?: string[];
  recentNewConn?: Array<{ screenName: string; displayName?: string; daysAgo?: number }>;
  selfStyle?: {
    avgLen?: number;
    keigoRate?: number;
    exclaimRate?: number;
    laugh?: string;
    streakDays?: number;
  };
  selfVocatives?: string[];
  profileDescription?: string;
  selfEmojis?: string[];
  recentMentionsToYou?: Array<{ from: string; text: string; at: number }>;
  topSentTargets?: Array<{ screenName: string; displayName?: string; n: number }>;
  selfAvatarUrl?: string;
  selfAvatarUrlPreview?: string;
  profileFollowers?: number;
  profileFollowing?: number;
  profileTweets?: number;
  profileLikes?: number;
  profileJoinedAt?: string;
  error?: string;
};

export type CircleAppProps = {
  initialScreenName?: string;
};

/** ネットワーク断・一時エラー（429/5xx・Failed to fetch等）に自動リトライ（指数バックオフ） */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      const transient = res.status === 429 || res.status >= 500;
      if (transient && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1200 * Math.pow(2, i)));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1200 * Math.pow(2, i)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetch failed");
}

export function CircleApp(props: CircleAppProps = {}) {
  const { initialScreenName } = props;
  const { locale, t, homePath } = useLocale();
  const captureRef = useRef<HTMLDivElement>(null);
  const autoLoadedKey = useRef<string | null>(null);
  const [users, setUsers] = useState<CircleUser[]>([]);
  const [self, setSelf] = useState<SelfProfile>(EMPTY_SELF);
  const [error, setError] = useState<string | null>(null);
  const [yahooHandle, setYahooHandle] = useState("");
  const [yahooLoading, setYahooLoading] = useState(false);
  const [yahooCounts, setYahooCounts] = useState<{
    toYou: number;
    fromYou: number;
  } | null>(null);
  const [maxUsers, setMaxUsers] = useState(9999);
  const [bidirOnly, setBidirOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("circle");
  const [selfTweets, setSelfTweets] = useState<string[]>([]);
  const [selfActivity, setSelfActivity] = useState<{
    topHours: number[];
    fromYou7d: number;
    toYou7d: number;
    weeklyTo?: number[];
    weeklyFrom?: number[];
    postGapMin?: number;
    weekdayType?: string;
    newConn14d?: number;
    dormant14d?: number;
    words?: string[];
    breadthTo?: number[];
    breadthFrom?: number[];
    maxSilenceDays?: number;
    avgPostPerDay?: number;
    tone?: { thanks?: number; love?: number; tired?: number; gloomy?: number };
    receivedBlocks?: number[];
    sentBlocks?: number[];
    revivalText?: string;
    revivalAt?: number;
    burstEpisodes?: number;
    peakDay?: { date: string; n: number };
  } | null>(null);
  const [promptExtras, setPromptExtras] = useState<{
    selfEmojis?: string[];
    recentMentionsToYou?: Array<{ from: string; text: string; at: number }>;
    topSentTargets?: Array<{ screenName: string; displayName?: string; n: number }>;
    communityWords?: string[];
    recentNewConn?: Array<{ screenName: string; displayName?: string; daysAgo?: number }>;
    selfStyle?: {
      avgLen?: number;
      keigoRate?: number;
      exclaimRate?: number;
      laugh?: string;
      streakDays?: number;
    };
    selfVocatives?: string[];
  } | null>(null);

  const fetchYahooMentions = useCallback(async (overrideHandle?: string) => {
    const name = (overrideHandle ?? yahooHandle).trim().replace(/^@+/, "");
    if (!name) {
      setError(t.errEnterName);
      return;
    }
    setError(null);
    setYahooLoading(true);
    setYahooCounts(null);

    const applySuccess = (data: YahooMentionsResponse) => {
      setYahooCounts({
        toYou: data.counts.mentionsToYou,
        fromYou: data.counts.mentionsFromYou,
      });
      setSelfTweets(data.recentSelfTweets ?? []);
      setSelfActivity(data.selfActivity ?? null);
      setPromptExtras({
        selfEmojis: data.selfEmojis,
        recentMentionsToYou: data.recentMentionsToYou,
        topSentTargets: data.topSentTargets,
        communityWords: data.communityWords,
        selfStyle: data.selfStyle,
        selfVocatives: data.selfVocatives,
        recentNewConn: data.recentNewConn,
      });
      const list = data.circleUsers ?? [];
      if (list.length === 0) {
        setError(t.noPeers);
      } else {
        setError(null);
      }
      setUsers(list);
      setSelf({
        screenName: data.screenName,
        displayName: data.screenName,
        avatarUrl: data.selfAvatarUrl,
        avatarUrlPreview: data.selfAvatarUrlPreview,
        mentionTotal: data.counts.mentionsToYou + data.counts.mentionsFromYou,
        profileFollowers: data.profileFollowers,
        profileFollowing: data.profileFollowing,
        profileTweets: data.profileTweets,
        profileLikes: data.profileLikes,
        profileJoinedAt: data.profileJoinedAt,
        profileDescription: data.profileDescription,
      });
      /** router.replace で / → /user に遷移するとページが差し替わり、再読み込みのように見えるため URL は変えない */
    };

    try {
      const cached = readYahooCircleCache(name);
      if (cached) {
        applySuccess(cached);
        return;
      }

      const q = new URLSearchParams({
        screenName: name,
        buildCircle: "1",
      });
      if (locale === "en") q.set("lang", "en");

      const res = await fetchWithRetry(`/api/yahoo-mentions?${q.toString()}`, {
        method: "GET",
      });
      const data = (await res.json()) as YahooMentionsResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? t.errFetch);
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }
      applySuccess(data);
      writeYahooCircleCache(name, {
        screenName: data.screenName,
        counts: data.counts,
        circleUsers: data.circleUsers,
        recentSelfTweets: data.recentSelfTweets,
        selfActivity: data.selfActivity,
        profileDescription: data.profileDescription,
        selfEmojis: data.selfEmojis,
        recentMentionsToYou: data.recentMentionsToYou,
        topSentTargets: data.topSentTargets,
        communityWords: data.communityWords,
        selfStyle: data.selfStyle,
        selfVocatives: data.selfVocatives,
        recentNewConn: data.recentNewConn,
        selfAvatarUrl: data.selfAvatarUrl,
        selfAvatarUrlPreview: data.selfAvatarUrlPreview,
        profileFollowers: data.profileFollowers,
        profileFollowing: data.profileFollowing,
        profileTweets: data.profileTweets,
        profileLikes: data.profileLikes,
        profileJoinedAt: data.profileJoinedAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errFetch);
    } finally {
      setYahooLoading(false);
    }
  }, [yahooHandle, locale, t]);

  useEffect(() => {
    const raw = initialScreenName?.trim();
    if (!raw) {
      autoLoadedKey.current = null;
      return;
    }
    const key = raw;
    if (autoLoadedKey.current === key) return;
    autoLoadedKey.current = key;
    const name = raw.replace(/^@+/, "");
    if (!name) return;
    setYahooHandle(name);
  }, [initialScreenName]);

  /** 「双方向のみ」: お互いにメンションし合っている相手だけに絞る（片方向だけの相手を除外） */
  const circleUsers = useMemo(
    () =>
      bidirOnly
        ? users.filter(
            (u) => (u.mentionsReceived ?? 0) > 0 && (u.mentionsSent ?? 0) > 0,
          )
        : users,
    [users, bidirOnly],
  );

  return (
    <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-x-8 px-4 pb-16 pt-10 sm:px-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,768px)_minmax(0,1fr)]">
      <aside className="hidden xl:block">
        <div className="sticky top-10 ml-auto w-full max-w-[330px]">
          <AmazonPicks variant="rail" />
        </div>
      </aside>

      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-10">
      <header className="text-center">
        <div className="mb-3 flex items-center justify-end gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
          <AppLink
            href={homePath}
            className="outline-offset-4 transition hover:text-zinc-700 focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500/60 dark:hover:text-zinc-100"
          >
            {t.appTitle}
          </AppLink>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t.tagline}
        </p>
        <div className="mx-auto mt-5 max-w-xl rounded-xl border border-emerald-500/25 bg-emerald-50/60 px-4 py-3 text-left text-xs leading-relaxed text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-950/25 dark:text-emerald-100/95">
          <p className="font-semibold text-emerald-800 dark:text-emerald-300">
            {t.trustHeadline}
          </p>
          <p className="mt-2 text-emerald-900/90 dark:text-emerald-100/85">
            {t.trustBody}
          </p>
          <p className="mt-2 border-t border-emerald-500/20 pt-2 text-emerald-900/88 dark:border-emerald-500/25 dark:text-emerald-100/82">
            {t.trustFootnote}
          </p>
        </div>
      </header>

      <section className="rounded-2xl border border-zinc-200/90 bg-white/70 p-5 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/40 dark:shadow-none">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {t.formTitle}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-500">
          {t.formDesc}
          <span className="mt-1 block text-zinc-500 dark:text-zinc-500">
            {t.formNote}
          </span>
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-500">
              {t.labelHandle}
            </label>
            <input
              type="text"
              value={yahooHandle}
              onChange={(e) => setYahooHandle(e.target.value)}
              autoComplete="off"
              className="mt-1.5 w-full rounded-xl border border-zinc-300/90 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-sky-500/50 focus:outline-none dark:border-white/10 dark:bg-black/30 dark:text-zinc-100"
            />
          </div>
          <button
            type="button"
            disabled={yahooLoading}
            onClick={() => void fetchYahooMentions()}
            className="shrink-0 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-emerald-900/30"
          >
            {yahooLoading ? t.btnLoading : t.btnShow}
          </button>
        </div>
        {yahooCounts && (
          <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
            {t.countsFound}{" "}
            {t.countsToYou}{" "}
            <strong className="text-zinc-900 dark:text-zinc-200">
              {yahooCounts.toYou}
            </strong>
            {t.countsUnit ? ` ${t.countsUnit}` : ""}
            {" · "}
            {t.countsFromYou}{" "}
            <strong className="text-zinc-900 dark:text-zinc-200">
              {yahooCounts.fromYou}
            </strong>
            {t.countsUnit ? ` ${t.countsUnit}` : ""}
          </p>
        )}
        {users.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {circleUsers.length > 0 && (
              <>
                <label className="shrink-0 text-xs font-medium text-zinc-600 dark:text-zinc-500">
                  表示人数: <strong className="text-zinc-900 dark:text-zinc-200">{Math.min(maxUsers, circleUsers.length)}</strong>/{circleUsers.length}
                </label>
                <input
                  type="range"
                  min={1}
                  max={circleUsers.length}
                  value={Math.min(maxUsers, circleUsers.length)}
                  onChange={(e) => setMaxUsers(Number(e.target.value))}
                  className="min-w-[120px] flex-1"
                />
              </>
            )}
            <label
              className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-500"
              title={t.bidirOnlyHint}
            >
              <input
                type="checkbox"
                checked={bidirOnly}
                onChange={(e) => setBidirOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-sky-500"
              />
              {t.bidirOnly}
            </label>
          </div>
        )}
      </section>

      {error && (
        <p
          className="rounded-xl border border-rose-400/50 bg-rose-100/80 px-4 py-3 text-center text-sm text-rose-900 dark:border-rose-500/35 dark:bg-rose-950/35 dark:text-rose-200"
          role="alert"
        >
          {error}
        </p>
      )}

      <div
        ref={captureRef}
        className="overflow-visible rounded-2xl border border-zinc-200/80 bg-zinc-50 p-4 dark:border-white/10 dark:bg-[#09090b] sm:p-6"
      >
        {self.screenName && users.length > 0 && (
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("circle")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "circle"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {t.tabCircle}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "table"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {t.tabTable}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("family")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "family"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {t.tabFamily}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("ai")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "ai"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {t.tabAI}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("value")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                viewMode === "value"
                  ? "bg-emerald-600 text-white shadow"
                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {t.tabValue}
            </button>
          </div>
        )}
        {self.screenName && users.length > 0 ? (
          <>
            <p className="mb-3 text-center text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              @{self.screenName}
              {viewMode === "circle"
                ? t.tableTitle
                : viewMode === "table"
                  ? t.tableDetailTitle
                  : viewMode === "family"
                    ? t.familyTitle
                    : viewMode === "ai"
                      ? t.aiTitle
                      : t.valueTitle}
            </p>
            {viewMode === "circle" ? (
              <>
                <InteractionCircle self={self} users={circleUsers} maxUsers={maxUsers} />
                <p className="mt-3 text-center text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {t.tableHint}
                </p>
              </>
            ) : viewMode === "table" ? (
              <InteractionTable users={users} />
            ) : viewMode === "family" ? (
              <>
                <FamilyTreeCanvas self={self} users={users} />
                <p className="mt-3 text-center text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {t.familyHint}
                </p>
              </>
            ) : viewMode === "ai" ? (
              <AIDiagnosisPanel self={self} users={users} selfTweets={selfTweets} selfActivity={selfActivity} extras={promptExtras} />
            ) : (
              <AccountValuePanel self={self} users={users} />
            )}
          </>
        ) : (
          <InteractionCircle self={self} users={circleUsers} maxUsers={maxUsers} />
        )}
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="flex flex-wrap items-start justify-center gap-6">
        <ShareButton
          targetRef={captureRef}
          profileScreenName={self.screenName || undefined}
          disabled={!self.screenName || users.length === 0}
          disabledReason={
            !self.screenName
              ? undefined
              : users.length === 0
                ? t.shareDisabled
                : undefined
          }
          fileNameBase={
            self.screenName
              ? `twitter-nareai-${self.screenName}`
              : "twitter-nareai-circle"
          }
        />
        <SaveCircleImageButton
          targetRef={captureRef}
          disabled={!self.screenName || users.length === 0}
          disabledReason={
            !self.screenName
              ? undefined
              : users.length === 0
                ? t.saveDisabled
                : undefined
          }
          fileNameBase={
            self.screenName
              ? `twitter-nareai-${self.screenName}`
              : "twitter-nareai-circle"
          }
        />
        </div>
        <p className="max-w-xl text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-600">
          {t.postSpamTip}
        </p>
      </div>

      <div className="xl:hidden">
        <AmazonPicks />
      </div>

      <footer className="space-y-2 text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-600">
        <p>{t.footerLegal}</p>
        <p>
          {t.footerBy}{" "}
          <a
            href="https://x.com/maebahesioru2"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sky-600 underline-offset-2 hover:text-sky-500 hover:underline dark:text-sky-400/90 dark:hover:text-sky-300"
          >
            @maebahesioru2
          </a>
        </p>
      </footer>
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-10 mr-auto w-full max-w-[330px]">
          <AmazonPicks variant="rail" />
        </div>
      </aside>
    </div>
  );
}
