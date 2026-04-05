"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { addEnPrefix, stripEnPrefix } from "@/lib/i18n/paths";
import { messages, type Locale, type Messages } from "@/lib/i18n/messages";

type LocaleContextValue = {
  locale: Locale;
  t: Messages;
  homePath: string;
  hrefJa: string;
  hrefEn: string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const value = useMemo((): LocaleContextValue => {
    const isEn = pathname === "/en" || pathname.startsWith("/en/");
    const locale: Locale = isEn ? "en" : "ja";
    const t = messages[locale];
    const homePath = locale === "en" ? "/en" : "/";
    const hrefJa = stripEnPrefix(pathname);
    const hrefEn = addEnPrefix(pathname);
    return { locale, t, homePath, hrefJa, hrefEn };
  }, [pathname]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}
