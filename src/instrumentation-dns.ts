/**
 * DNS ルックアップのメモリキャッシュ + single-flight（Node ランタイム専用）。
 *
 * 背景（2026-10-01 実測）:
 *   VM100 の Docker 埋め込み DNS (127.0.0.11) は、dockerd が忙しいときなどに
 *   1 回の解決に 0.7〜3.6 秒かかることがある（平常時 40ms）。
 *   Node の fetch は接続ごとに dns.lookup を呼ぶため、数百リクエストを投げる
 *   処理ではこの遅延が積み上がる。さらに、コンテナ再起動直後の「コールド」状態で
 *   並列リクエスト（例: スプライト合成の 28 並列 × 画像取得）が同時に lookup すると
 *   埋め込み DNS が輻輳して一部がタイムアウトし、それが一時失敗として焼き込まれる。
 *
 * 対策:
 *   1. 60 秒 TTL のメモリキャッシュ（成功のみ）
 *   2. single-flight: 同一ホストへの並列コールド lookup を 1 本の実 lookup に集約し、
 *      完了時に全ウェイターへ配る（輻輳の根本を断つ）
 */
import dns from "node:dns";

const TTL_MS = 60_000;
const MAX_ENTRIES = 512;

type CachedResult =
  | { kind: "single"; address: string; family: number; t: number }
  | { kind: "all"; addresses: Array<{ address: string; family: number }>; t: number };

type Waiter = (err: NodeJS.ErrnoException | null, a: unknown, f: unknown) => void;

export function installDnsLookupCache(): void {
  try {
    const origLookup = dns.lookup;
    const cache = new Map<string, CachedResult>();
    /** 実行中の実 lookup にぶら下がるウェイター（single-flight） */
    const inflight = new Map<string, Waiter[]>();

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

      // single-flight: 同一キーの実 lookup が進行中なら結果を共有する
      const waiting = inflight.get(key);
      if (waiting) {
        waiting.push(cb as unknown as Waiter);
        return;
      }
      inflight.set(key, [cb as unknown as Waiter]);

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
        const waiters = inflight.get(key) ?? [];
        inflight.delete(key);
        for (const w of waiters) {
          w(err, a, f);
        }
      };
      origLookup(hostname as never, { ...opts } as never, realCb as never);
    };

    (dns as unknown as { lookup: unknown }).lookup = patched;
    console.log("[instrumentation] dns lookup cache enabled (ttl 60s, single-flight)");
  } catch {
    /* 失敗しても致命的ではない（キャッシュなしで動く） */
  }
}
