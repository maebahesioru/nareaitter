import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Twitter馴れ合いサークル",
    short_name: "馴れ合いサークル",
    description:
      "X（Twitter）の交流をグリッド状に一覧表示。集計は過去30日分の公開データに限ります。",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#0ea5e9",
    lang: "ja",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
