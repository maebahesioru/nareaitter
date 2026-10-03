import { SITE_DESCRIPTION } from "@/lib/site-meta";
import { getSiteUrl } from "@/lib/site-url";

export function JsonLd() {
  const url = getSiteUrl();
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Twitter馴れ合いサークル",
    alternateName: ["馴れ合い表", "馴れ合いったー", "なれあいサークル", "Twitter Mutual Circle"],
    description: SITE_DESCRIPTION,
    url,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript. Requires HTML5.",
    isAccessibleForFree: true,
    inLanguage: ["ja", "en"],
    featureList: [
      "X（Twitter）の交流をグリッド状に一覧表示",
      "過去30日分の公開データを集計",
      "ログイン不要・アカウント連携不要",
      "交流一覧・家族ツリー・AI診断・売却価格予想",
    ],
    screenshot: `${url}/opengraph-image`,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "JPY",
    },
    author: {
      "@type": "Person",
      name: "maebahesioru2",
      url: "https://x.com/maebahesioru2",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
