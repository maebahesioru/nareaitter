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
  const pageDesc = `@${sn} の交流サークル（目安）。過去30日分の公開データに基づきます。ログイン不要。`;

  const path = `/${encodeURIComponent(handle)}`;

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
      locale: "ja_JP",
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

export default function HandleLayout({ children }: { children: ReactNode }) {
  return children;
}
