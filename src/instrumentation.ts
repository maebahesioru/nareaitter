/**
 * サーバー起動時のフック。Node ランタイムでのみ DNS キャッシュを有効化する。
 * （実装は instrumentation-dns.ts。Edge バンドルに node:dns を持ち込まないための分離）
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installDnsLookupCache } = await import("./instrumentation-dns");
    installDnsLookupCache();
  }
}
