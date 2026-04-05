import type { Metadata } from "next";
import type { ReactNode } from "react";

const DESC =
  "Grid view of your X (Twitter) mutual interactions. Uses public data from the last 30 days. No login required; we never post on your behalf.";

export const metadata: Metadata = {
  title: {
    default: "Twitter Mutual Circle",
    template: "%s — Twitter Mutual Circle",
  },
  description: DESC,
  openGraph: {
    locale: "en_US",
    url: "/en",
    siteName: "Twitter Mutual Circle",
    title: "Twitter Mutual Circle",
    description: DESC,
  },
  twitter: {
    title: "Twitter Mutual Circle",
    description: DESC,
  },
  alternates: {
    canonical: "/en",
    languages: {
      ja: "/",
      en: "/en",
    },
  },
};

export default function EnLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
