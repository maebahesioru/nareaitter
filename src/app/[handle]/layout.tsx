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
  const title = `@${sn} の馴れ合い表`;
  const pageDesc = `@${sn} の馴れ合い表（馴れ合いサークル）。Xの公開データから交流相手をグリッド表示。ログイン不要・勝手に投稿されません。`;

  const path = `/${encodeURIComponent(handle)}`;
  const enPath = `/en/${encodeURIComponent(handle)}`;

  return {
    title,
    description: pageDesc,
    alternates: {
      canonical: path,
      languages: {
        ja: path,
        en: enPath,
      },
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
