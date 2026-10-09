"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { AppLink } from "./AppLink";

/**
 * クッキー同意バナー。
 * - Google Consent Mode v2 の既定値(denied)は layout.tsx 側で設定済み。
 * - ここで「同意する」が選ばれたときだけ広告 Cookie を許可する。
 * - 選択は localStorage に保存し、再訪問時は表示しない。
 */
const KEY = "nareai-consent-v1";

type ConsentWindow = Window & { gtag?: (...args: unknown[]) => void };

function applyConsent(all: boolean) {
  const w = window as ConsentWindow;
  if (typeof w.gtag !== "function") return;
  w.gtag("consent", "update", {
    ad_storage: all ? "granted" : "denied",
    ad_user_data: all ? "granted" : "denied",
    ad_personalization: all ? "granted" : "denied",
  });
}

export function CookieConsent() {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "all" || saved === "essential") {
        // 以前の選択を Consent Mode に反映する(既定は denied のまま)
        applyConsent(saved === "all");
        return;
      }
    } catch {
      /* プライベートモード等 */
    }
    setOpen(true);
  }, []);

  const decide = (v: "all" | "essential") => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
    applyConsent(v === "all");
    setOpen(false);
    // 寄付ポップアップなど、同意後に表示したい UI へ通知する
    try {
      window.dispatchEvent(new Event("nareai-consent-decided"));
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] p-3 sm:p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-zinc-200 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 sm:flex-row sm:items-center">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-lg dark:bg-sky-500/15">
          🍪
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
            {t.consentTitle}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t.consentBody}{" "}
            <AppLink
              href={locale === "en" ? "/en/privacy" : "/privacy"}
              className="font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400/90"
            >
              {t.consentMore}
            </AppLink>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => decide("essential")}
            className="rounded-xl border border-zinc-300 px-3.5 py-2 text-[12.5px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {t.consentEssential}
          </button>
          <button
            onClick={() => decide("all")}
            className="rounded-xl bg-sky-600 px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-sky-500"
          >
            {t.consentAccept}
          </button>
        </div>
      </div>
    </div>
  );
}
