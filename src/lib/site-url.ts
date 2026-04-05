/**
 * 本番は `NEXT_PUBLIC_SITE_URL`（末尾スラッシュなし）。
 * Vercel: `VERCEL_URL` / Cloudflare Pages: `CF_PAGES_URL` をフォールバック。
 */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }
  const cfPages = process.env.CF_PAGES_URL?.trim();
  if (cfPages) {
    return cfPages.replace(/\/$/, "").replace(/^http:\/\//i, "https://");
  }
  return "http://localhost:3000";
}

export function getMetadataBase(): URL {
  return new URL(`${getSiteUrl()}/`);
}
