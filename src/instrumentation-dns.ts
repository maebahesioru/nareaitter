/**
 * DNS ルックアップのメモリキャッシュ（Node ランタイム専用）。
 *
 * 背景（2026-10-01 実測）:
 *   VM100 の Docker 埋め込み DNS (127.0.0.11) は、dockerd が忙しいときなどに
 *   1 回の解決に 0.7〜3.6 秒かかることがある（平常時 40ms）。
 *   Node の fetch は接続ごとに dns.lookup を呼ぶため、数百リクエストを投げる
 *   ビルドではこの遅延が積み上がり、数十秒〜2分のスローの原因になる。
 *   使用ホスト名は数種類しかないので、60秒 TTL のキャッシュでほぼ完全に消える。
 */
import dns from "node:dns";

const TTL_MS = 60_000;
const MAX_ENTRIES = 512;

type CachedResult =
  | { kind: "single"; address: string; family: number; t: number }
  | { kind: "all"; addresses: Array<{ address: string; family: number }>; t: number };

export function installDnsLookupCache(): void {
  try {
    const origLookup = dns.lookup;
    const cache = new Map<string, CachedResult>();

    const patched = (
      hostname: string,
      optionsOrCb: unknown,
      maybeCb?: unknown,
    ): void => {
      let cb: (...args: unknown[]) => void;
      let opts: { family?: number; hints?: number; all?: boolean } = {};
      if (typeof optionsOrCb === "function") {
        cb = optionsOrCb as (...args: unknown[]) => void;
      } else if (typeof optionsOrCb === "number") {
        opts = { family: optionsOrCb };
        cb = maybeCb as (...args: unknown[]) => void;
      } else {
        opts = (optionsOrCb ?? {}) as typeof opts;
        cb = maybeCb as (...args: unknown[]) => void;
      }

      const family = opts.family ?? 0;
      const hints = opts.hints ?? 0;
      // 特殊オプションはキャッシュせず素通し（安全側）
      if (
        typeof hostname !== "string" ||
        (family !== 0 && family !== 4 && family !== 6) ||
        hints !== 0
      ) {
        origLookup(hostname as never, optionsOrCb as never, maybeCb as never);
        return;
      }

      const key = `${hostname}|${family}|${opts.all ? 1 : 0}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.t < TTL_MS) {
        queueMicrotask(() => {
          if (hit.kind === "all") cb(null, hit.addresses);
          else cb(null, hit.address, hit.family);
        });
        return;
      }

      const realCb = (
        err: NodeJS.ErrnoException | null,
        a: unknown,
        f: unknown,
      ) => {
        if (!err) {
          if (cache.size >= MAX_ENTRIES) cache.clear();
          if (opts.all && Array.isArray(a)) {
            cache.set(key, {
              kind: "all",
              addresses: (a as Array<{ address: string; family: number }>).slice(),
              t: Date.now(),
            });
          } else if (typeof a === "string") {
            cache.set(key, {
              kind: "single",
              address: a,
              family: typeof f === "number" ? f : 4,
              t: Date.now(),
            });
          }
        }
        cb(err, a, f);
      };
      origLookup(hostname as never, { ...opts } as never, realCb as never);
    };

    (dns as unknown as { lookup: unknown }).lookup = patched;
    console.log("[instrumentation] dns lookup cache enabled (ttl 60s)");
  } catch {
    /* 失敗しても致命的ではない（キャッシュなしで動く） */
  }
}
