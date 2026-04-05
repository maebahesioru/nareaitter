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
  const title = `@${sn}`;
  const pageDesc = `@${sn} mutual circle (indicative). Based on public data from the last 30 days. No login required.`;

  const path = `/en/${encodeURIComponent(handle)}`;

  return {
    title,
    description: pageDesc,
    alternates: {
      canonical: path,
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
