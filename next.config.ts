import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // 親ディレクトリに別の lockfile がある環境で警告を抑止
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com", pathname: "/**" },
      { protocol: "https", hostname: "abs.twimg.com", pathname: "/**" },
      { protocol: "https", hostname: "s.yimg.jp", pathname: "/**" },
    ],
  },
};

export default nextConfig;
