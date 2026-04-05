"use client";

import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";

export function LanguageSwitcher() {
  const { locale, t, hrefJa, hrefEn } = useLocale();

  return (
    <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
      <Link
        href={hrefJa}
        className={
          locale === "ja"
            ? "text-zinc-900 dark:text-zinc-100"
            : "underline-offset-2 hover:underline"
        }
        lang="ja"
      >
        {t.langJa}
      </Link>
      <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
        |
      </span>
      <Link
        href={hrefEn}
        prefetch={false}
        className={
          locale === "en"
            ? "text-zinc-900 dark:text-zinc-100"
            : "underline-offset-2 hover:underline"
        }
        lang="en"
      >
        {t.langEn}
      </Link>
    </div>
  );
}
