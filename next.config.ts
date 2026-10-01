import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // 親ディレクトリに別の lockfile がある環境で警告を抑止
  outputFileTracingRoot: path.join(__dirname),
  // Docker 実行に必要最小限のファイルだけを .next/standalone に吐く（イメージ縮小・コピー高速化）
  output: "standalone",
  experimental: {
    // Turbopack のビルドキャッシュを .next/cache に永続化（Docker 側で cache mount する前提）
    turbopackFileSystemCacheForBuild: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com", pathname: "/**" },
      { protocol: "https", hostname: "abs.twimg.com", pathname: "/**" },
      { protocol: "https", hostname: "s.yimg.jp", pathname: "/**" },
    ],
  },
};

export default nextConfig;
