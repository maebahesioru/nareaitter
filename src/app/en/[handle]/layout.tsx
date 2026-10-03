import type { Metadata } from "next";
import type { ReactNode } from "react";

type Props = { children: ReactNode; params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  let label = handle;
  try {
    label = decodeURIComponent(handle);
  } catch {
    /* keep raw */
  }
  const sn = label.replace(/^@/, "");
  const title = `@${sn} mutual circle`;
  const pageDesc = `@${sn} mutual interaction circle (indicative). Based on public data from the last 30 days. No login required; we never post on your behalf.`;

  const path = `/en/${encodeURIComponent(handle)}`;
  const jaPath = `/${encodeURIComponent(handle)}`;

  return {
    title,
    description: pageDesc,
    alternates: {
      canonical: path,
      languages: {
        ja: jaPath,
        en: path,
      },
    },
    openGraph: {
      title,
      description: pageDesc,
      url: path,
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: pageDesc,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function EnHandleLayout({ children }: { children: ReactNode }) {
  return children;
}
