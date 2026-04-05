"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";

const OFUSE_URL = "https://ofuse.me/maebahesioru";

/** React Strict Mode の再マウントでも閉じたままにする + 再訪問時は出さない */
const DISMISSED_KEY = "nareai-donation-dismissed-v1";

export function DonationPopup() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem(DISMISSED_KEY) === "1") {
        return;
      }
    } catch {
      /* プライベートモード等 */
    }
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(DISMISSED_KEY, "1");
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="donation-popup-title"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-default border-0 bg-black/55 backdrop-blur-[2px] dark:bg-black/70"
        aria-label={t.donationClose}
        onClick={dismiss}
      />
      <div
        className="relative z-10 flex max-h-[min(90dvh,520px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pb-4">
          <h2
            id="donation-popup-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {t.donationTitle}
          </h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            <p>{t.donationP1}</p>
            <p>{t.donationP2}</p>
          </div>
        </div>
        <div className="relative z-20 flex shrink-0 flex-col gap-3 border-t border-zinc-200/80 p-6 pt-4 dark:border-white/10 sm:flex-row sm:justify-end sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <a
            href={OFUSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] touch-manipulation items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-emerald-900/25 transition hover:bg-emerald-500 dark:shadow-emerald-900/40"
          >
            {t.donationCta}
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-[44px] touch-manipulation items-center justify-center rounded-xl border border-zinc-300/90 bg-zinc-50 px-5 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            {t.donationClose}
          </button>
        </div>
      </div>
    </div>
  );
}
