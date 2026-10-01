import { isProxyableImageHostname } from "@/lib/image-proxy-hosts";

const UPSTREAM_HEADERS: Record<string, string> = {
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "https://x.com/",
  "Sec-Fetch-Dest": "image",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
};

/** Yahoo 画像（rts-pctr 等）は Referer によって 403 になることがあるため順に試す */
const YIMG_REFERERS = [
  "https://search.yahoo.co.jp/realtime/search",
  "https://search.yahoo.co.jp/realtime/",
  "https://search.yahoo.co.jp/",
  "https://www.yahoo.co.jp/",
] as const;

export class UpstreamImageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "UpstreamImageError";
  }
}

function isYimgHost(hostname: string): boolean {
  return hostname.endsWith(".yimg.jp") || hostname.endsWith(".yimg.com");
}

// ── 404のネガティブメモ ───────────────────────────
// 消えたアバター(404)は毎回リトライしても無駄で、Referer 4連続試行のせいで
// パイプラインの枠を長時間占有する。1時間だけ「死んでる」と記憶して即404を返す。

const NEGATIVE_TTL_MS = 60 * 60 * 1000;
const NEGATIVE_MAX = 20000;
const deadUntil = new Map<string, number>();

export function isKnownDeadImage(url: string): boolean {
  const until = deadUntil.get(url);
  if (until === undefined) return false;
  if (Date.now() > until) {
    deadUntil.delete(url);
    return false;
  }
  return true;
}

function markDeadImage(url: string): void {
  if (deadUntil.size >= NEGATIVE_MAX) deadUntil.clear();
  deadUntil.set(url, Date.now() + NEGATIVE_TTL_MS);
}

async function fetchYimgImage(url: string): Promise<Response> {
  const ua = UPSTREAM_HEADERS["User-Agent"]!;
  let last: Response | null = null;
  for (const referer of YIMG_REFERERS) {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        "User-Agent": ua,
        Referer: referer,
      },
      next: { revalidate: 604800 },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return res;
    // 404/410 は Referer を変えても無駄なので即諦める
    if (res.status === 404 || res.status === 410) return res;
    last = res;
  }
  return last!;
}

/** GET / batch 共通。許可ホストの https 画像を取得 */
export async function fetchProxiedImageUpstream(rawUrl: string): Promise<{
  arrayBuffer: ArrayBuffer;
  contentType: string;
}> {
  let target: URL;
  try {
    target = new URL(rawUrl.trim());
  } catch {
    throw new Error("invalid url");
  }
  if (target.protocol !== "https:" || !isProxyableImageHostname(target.hostname)) {
    throw new Error("forbidden host");
  }

  // 死んでると分かっているURLはネットワークに一切出ない
  const cacheKey = target.toString();
  if (isKnownDeadImage(cacheKey)) {
    throw new UpstreamImageError("upstream 404 (memoized)", 404);
  }

  const res = isYimgHost(target.hostname)
    ? await fetchYimgImage(cacheKey)
    : await fetch(cacheKey, {
        redirect: "follow",
        headers: UPSTREAM_HEADERS,
        next: { revalidate: 604800 },
        signal: AbortSignal.timeout(8000),
      });

  if (!res.ok) {
    if (res.status === 404 || res.status === 410) {
      markDeadImage(cacheKey);
    }
    throw new UpstreamImageError(`upstream ${res.status}`, res.status);
  }

  const arrayBuffer = await res.arrayBuffer();
  const ct = res.headers.get("content-type") ?? "image/jpeg";
  return {
    arrayBuffer,
    contentType: ct.startsWith("image/") ? ct : "image/jpeg",
  };
}
