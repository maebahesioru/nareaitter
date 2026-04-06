"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
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

const EMPTY_SELF: SelfProfile = { screenName: "", displayName: "" };

/** インライン style（vw・三角関数）由来の SSR/CSR 不一致を避ける */
const InteractionCircle = dynamic(
  () =>
    import("./InteractionCircle").then((m) => ({ default: m.InteractionCircle })),
  { ssr: false },
);

type YahooMentionsResponse = {
  screenName: string;
  counts: { mentionsToYou: number; mentionsFromYou: number };
  circleUsers?: CircleUser[];
  selfAvatarUrl?: string;
  selfAvatarUrlPreview?: string;
  error?: string;
};

export type CircleAppProps = {
  initialScreenName?: string;
};

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

      const res = await fetch(`/api/yahoo-mentions?${q.toString()}`, {
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
        selfAvatarUrl: data.selfAvatarUrl,
        selfAvatarUrlPreview: data.selfAvatarUrlPreview,
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pb-16 pt-10 sm:px-6">
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
          <div className="mt-4 flex items-center gap-3">
            <label className="shrink-0 text-xs font-medium text-zinc-600 dark:text-zinc-500">
              表示人数: <strong className="text-zinc-900 dark:text-zinc-200">{Math.min(maxUsers, users.length)}</strong>/{users.length}
            </label>
            <input
              type="range"
              min={1}
              max={users.length}
              value={maxUsers}
              onChange={(e) => setMaxUsers(Number(e.target.value))}
              className="flex-1"
            />
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
        {self.screenName && users.length > 0 ? (
          <>
            <p className="mb-3 text-center text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              @{self.screenName}
              {t.tableTitle}
            </p>
            <InteractionCircle self={self} users={users} maxUsers={maxUsers} />
            <p className="mt-3 text-center text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {t.tableHint}
            </p>
          </>
        ) : (
          <InteractionCircle self={self} users={users} maxUsers={maxUsers} />
        )}
      </div>

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
  );
}
