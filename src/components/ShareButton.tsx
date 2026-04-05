"use client";

import { useTheme } from "next-themes";
import { useCallback, useState, type RefObject } from "react";
import {
  captureCircleElementToPngDataUrl,
  dataUrlToPngFile,
} from "@/lib/circle-capture-png";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  targetRef: RefObject<HTMLElement | null>;
  fileNameBase: string;
  /** 表示中なら共有テキストの URL を /user または /en/user に揃える（トップのまま取得した場合も） */
  profileScreenName?: string;
  disabled?: boolean;
  disabledReason?: string;
};

export function ShareButton({
  targetRef,
  fileNameBase,
  profileScreenName,
  disabled = false,
  disabledReason,
}: Props) {
  const { t, locale } = useLocale();
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { resolvedTheme } = useTheme();

  const share = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (disabled) return;

    const path =
      profileScreenName &&
      (locale === "en"
        ? `/en/${encodeURIComponent(profileScreenName)}`
        : `/${encodeURIComponent(profileScreenName)}`);
    const url = path
      ? `${window.location.origin}${path}`
      : window.location.href;
    setBusy(true);
    setHint(null);

    const safe =
      fileNameBase.replace(/[^\w\u3000-\u30ff\u3040-\u309f\u4e00-\u9faf\-]/g, "_") ||
      "twitter-nareai-circle";
    const pngName = `${safe}-share.png`;

    try {
      const el = targetRef.current;
      const isLight = resolvedTheme === "light";

      let imageFile: File | null = null;
      if (el) {
        try {
          const dataUrl = await captureCircleElementToPngDataUrl(el, isLight);
          imageFile = await dataUrlToPngFile(dataUrl, pngName);
        } catch {
          imageFile = null;
        }
      }

      const textWithUrl = `${t.shareText}\n${url}`;

      if (navigator.share) {
        const canFiles =
          imageFile &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [imageFile] });

        if (canFiles && imageFile) {
          try {
            await navigator.share({
              title: t.shareTitle,
              text: textWithUrl,
              files: [imageFile],
            });
            return;
          } catch (e) {
            const err = e as Error;
            if (err?.name === "AbortError") return;
          }
        }

        try {
          await navigator.share({
            title: t.shareTitle,
            text: textWithUrl,
            url,
          });
          if (!canFiles) {
            setHint(t.shareHintLinkOnly);
            window.setTimeout(() => setHint(null), 3200);
          }
          return;
        } catch (e) {
          const err = e as Error;
          if (err?.name === "AbortError") return;
          throw e;
        }
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textWithUrl);
        setHint(t.shareHintCopied);
        window.setTimeout(() => setHint(null), 2500);
      } else {
        window.prompt("Copy", textWithUrl);
      }
    } catch (e) {
      const err = e as Error;
      if (err?.name === "AbortError") {
        return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(`${t.shareText}\n${url}`);
          setHint(t.shareHintUrlCopied);
          window.setTimeout(() => setHint(null), 2500);
        } else {
          setHint(t.shareHintFailed);
          window.setTimeout(() => setHint(null), 3000);
        }
      } catch {
        setHint(t.shareHintFailed);
        window.setTimeout(() => setHint(null), 3000);
      }
    } finally {
      setBusy(false);
    }
  }, [disabled, fileNameBase, profileScreenName, locale, resolvedTheme, targetRef, t]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={share}
        disabled={busy || disabled}
        title={
          disabled
            ? (disabledReason ?? t.shareDisabled)
            : undefined
        }
        className="rounded-xl border border-zinc-300/90 bg-white/90 px-5 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-sky-400/60 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-zinc-800/80 dark:text-zinc-200 dark:shadow-none dark:hover:border-sky-500/40 dark:hover:bg-zinc-800 dark:hover:text-white"
      >
        {busy ? t.shareBusy : t.shareBtn}
      </button>
      {hint && (
        <p className="max-w-md text-center text-xs text-zinc-600 dark:text-zinc-400" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
