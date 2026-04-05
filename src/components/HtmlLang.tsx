"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** ルートに合わせて html lang を切り替え */
export function HtmlLang() {
  const pathname = usePathname() || "/";
  const isEn = pathname === "/en" || pathname.startsWith("/en/");

  useEffect(() => {
    document.documentElement.lang = isEn ? "en" : "ja";
  }, [isEn]);

  return null;
}
