import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_JP } from "next/font/google";
import { headers } from "next/headers";
import { DonationPopup } from "@/components/DonationPopup";
import { HtmlLang } from "@/components/HtmlLang";
import { LocaleProvider } from "@/components/LocaleProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SITE_DESCRIPTION } from "@/lib/site-meta";
import { getMetadataBase } from "@/lib/site-url";
import { JsonLd } from "./JsonLd";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Cloudflare Workers では env に本番 URL が無いことが多い。リクエストの Host で metadataBase を合わせないと OG 解決などで不整合になり得る */
export async function generateMetadata(): Promise<Metadata> {
  let metadataBase = getMetadataBase();
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? "https";
      metadataBase = new URL(`${proto}://${host}/`);
    }
  } catch {
    /* ビルド時など */
  }

  return {
    metadataBase,
    title: {
      default: "Twitter馴れ合いサークル",
      template: "%s — Twitter馴れ合いサークル",
    },
    description: SITE_DESCRIPTION,
    applicationName: "Twitter馴れ合いサークル",
    keywords: [
      "Twitter",
      "X",
      "エックス",
      "馴れ合いサークル",
      "交流",
      "メンション",
      "グリッド",
      "可視化",
    ],
    authors: [{ name: "maebahesioru2", url: "https://x.com/maebahesioru2" }],
    creator: "maebahesioru2",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    openGraph: {
      type: "website",
      locale: "ja_JP",
      url: "/",
      siteName: "Twitter馴れ合いサークル",
      title: "Twitter馴れ合いサークル",
      description: SITE_DESCRIPTION,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "Twitter馴れ合いサークル — X の交流を一覧表示",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Twitter馴れ合いサークル",
      description: SITE_DESCRIPTION,
      creator: "@maebahesioru2",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    alternates: {
      canonical: "/",
      languages: {
        ja: "/",
        en: "/en",
      },
    },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
    },
    other: {
      "google-adsense-account": "ca-pub-9868361167191737",
    },
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? {
          verification: {
            google: process.env.GOOGLE_SITE_VERIFICATION,
          },
        }
      : {}),
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${notoSansJp.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        {/** next/script の data-nscript は AdSense が拒否するため、素の script で読み込む */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9868361167191737"
          crossOrigin="anonymous"
        />
        <JsonLd />
        <LocaleProvider>
          <HtmlLang />
          <ThemeProvider>
            <DonationPopup />
            {children}
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
