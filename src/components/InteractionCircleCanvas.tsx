"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { layoutUsers } from "@/lib/layout-circle";
import { proxiedImageSrc } from "@/lib/proxied-image-src";
import { hexToDeadMask, spriteSliceSig } from "@/lib/sprite-sig";
import type { CircleUser, SelfProfile } from "@/types/circle";

type Props = {
  self: SelfProfile;
  usersWithIcons: CircleUser[];
};

/** preview が死んでいても hd で描けるように順に試す */
async function loadImageFirstAvailable(
  blobByOriginal: Map<string, string> | undefined,
  ...urls: (string | undefined)[]
): Promise<HTMLImageElement | null> {
  for (const raw of urls) {
    const u = raw?.trim();
    if (!u) continue;
    try {
      return await loadImage(u, blobByOriginal);
    } catch {
      /* 次の URL */
    }
  }
  return null;
}

/** 同一オリジン経由 → 失敗時は元 URL をブラウザが直接取得（Vercel 上でプロキシだけ落ちる場合の救済） */
async function loadImage(
  originalUrl: string,
  blobByOriginal?: Map<string, string>,
): Promise<HTMLImageElement> {
  const key = originalUrl.trim();
  const blobUrl = blobByOriginal?.get(key);
  if (blobUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("load"));
      img.src = blobUrl;
    });
  }

  const proxied = proxiedImageSrc(originalUrl);
  /**
   * raw の https CDN を描画すると canvas が汚染され、保存時の toDataURL / html-to-image が失敗する。
   * プロキシ可能な URL は同一オリジン (/api/image-proxy) のみ試す（プロキシ失敗時に raw へ落とさない）。
   */
  const attempts =
    proxied !== originalUrl ? [proxied] : [originalUrl];
  let last: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const src = attempts[i]!;
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        if (/^https?:\/\//.test(src)) {
          img.crossOrigin = "anonymous";
          try {
            if (new URL(src).origin !== window.location.origin) {
              img.referrerPolicy = "no-referrer";
            }
          } catch {
            /* ignore */
          }
        }
        // ハングしたリクエストがパイプラインの枠を永久に占有しないようにする
        const timer = window.setTimeout(() => {
          img.src = "";
          reject(new Error("timeout"));
        }, 20000);
        img.onload = () => {
          window.clearTimeout(timer);
          resolve(img);
        };
        img.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error("load"));
        };
        img.src = src;
      });
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("load");
}

function drawImageCoverInSquare(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  halfSide: number,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw < 1 || ih < 1) return;
  const side = halfSide * 2;
  const scale = Math.max(side / iw, side / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = cx - dw / 2;
  const dy = cy - dh / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - halfSide, cy - halfSide, side, side);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function gridDimensions(total: number): { cols: number; rows: number } {
  if (total <= 0) return { cols: 1, rows: 1 };
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  const rows = Math.ceil(total / cols);
  return { cols, rows };
}

function cellCenter(
  index: number,
  cols: number,
  W: number,
  rows: number,
): { cx: number; cy: number; cellW: number; cellH: number } {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const cellW = W / cols;
  const cellH = W / rows;
  return {
    cx: (col + 0.5) * cellW,
    cy: (row + 0.5) * cellH,
    cellW,
    cellH,
  };
}

/**
 * 軸に沿った正方形同士が重なるか（自分＝中央、相手＝各マス）。
 * 配置用にわずかに緩め、中央付近の有効マスを増やしてグリッドのまま詰める（描画は別スケール）。
 */
function peerSquareOverlapsSelf(
  cx: number,
  cy: number,
  halfPeer: number,
  W: number,
  halfSelf: number,
): boolean {
  const s = (halfSelf + halfPeer) * 0.96;
  return (
    Math.abs(cx - W / 2) < s &&
    Math.abs(cy - W / 2) < s
  );
}

type PeerCell = { cx: number; cy: number; cellW: number; cellH: number };

function peerHalfUniform(cellW: number, cellH: number): number {
  return (Math.min(cellW, cellH) / 2) * 1;
}

/** マス内でごく少し小さく描き、配置を詰めたときのはみ出しを抑える */
function peerHalfDraw(cellW: number, cellH: number): number {
  return peerHalfUniform(cellW, cellH) * 0.97;
}

type GridPickMode = "pack" | "maxCell";

/**
 * 相手グリッドを選ぶ。
 * - pack: 中央に近いマスを優先。マスが細かすぎる候補は minCellFrac で除外。
 * - maxCell: min(cellW,cellH) 最大。
 */
function pickPeerCellsForGrid(
  nPeers: number,
  W: number,
  halfSelf: number,
  minCellFrac: number | null,
  mode: GridPickMode,
): PeerCell[] | null {
  let best: PeerCell[] | null = null;
  let bestMinSide = -1;
  /** pack 用: 細いグリッドを後段で選ぶ */
  let bestMinSidePack = Infinity;
  let bestMeanDist = Infinity;
  let bestMaxDist = Infinity;

  for (let cols = 2; cols <= 18; cols++) {
    for (let rows = 2; rows <= 18; rows++) {
      if (cols * rows < nPeers) continue;
      const cellW = W / cols;
      const cellH = W / rows;
      const minSide = Math.min(cellW, cellH);
      if (minCellFrac !== null && minSide < W * minCellFrac) continue;

      const hp = peerHalfUniform(cellW, cellH);

      const candidates: { cell: PeerCell; d: number }[] = [];
      for (let idx = 0; idx < cols * rows; idx++) {
        const c = cellCenter(idx, cols, W, rows);
        if (peerSquareOverlapsSelf(c.cx, c.cy, hp, W, halfSelf)) continue;
        const d = Math.hypot(c.cx - W / 2, c.cy - W / 2);
        candidates.push({ cell: c, d });
      }
      candidates.sort((a, b) => a.d - b.d);
      if (candidates.length < nPeers) continue;

      const picked = candidates.slice(0, nPeers);
      const meanDist =
        picked.reduce((s, x) => s + x.d, 0) / Math.max(1, picked.length);
      const maxDist = Math.max(...picked.map((x) => x.d));

      if (mode === "maxCell") {
        if (minSide > bestMinSide) {
          bestMinSide = minSide;
          best = picked.map((x) => x.cell);
        }
      } else {
        const tieEps = W * 0.0004;
        const betterPack =
          meanDist < bestMeanDist - tieEps ||
          (Math.abs(meanDist - bestMeanDist) <= tieEps &&
            maxDist < bestMaxDist - tieEps) ||
          (Math.abs(meanDist - bestMeanDist) <= tieEps &&
            Math.abs(maxDist - bestMaxDist) <= tieEps &&
            minSide < bestMinSidePack);
        if (betterPack) {
          bestMeanDist = meanDist;
          bestMaxDist = maxDist;
          bestMinSidePack = minSide;
          best = picked.map((x) => x.cell);
        }
      }
    }
  }

  return best;
}

function bestPeerCellsAvoidingCenter(
  nPeers: number,
  W: number,
  halfSelf: number,
): PeerCell[] {
  if (nPeers <= 0) return [];

  const packed =
    pickPeerCellsForGrid(nPeers, W, halfSelf, 0.09, "pack") ??
    pickPeerCellsForGrid(nPeers, W, halfSelf, 0.07, "pack") ??
    pickPeerCellsForGrid(nPeers, W, halfSelf, null, "pack");
  if (packed && packed.length >= nPeers) return packed;

  const legacy = pickPeerCellsForGrid(nPeers, W, halfSelf, null, "maxCell");
  if (legacy && legacy.length >= nPeers) return legacy;

  for (let bump = 0; bump < 48; bump++) {
    const targetSlots = nPeers + 4 + bump;
    const { cols, rows } = gridDimensions(targetSlots);
    const cellW = W / cols;
    const cellH = W / rows;
    const hp = peerHalfUniform(cellW, cellH);
    const candidates: { cell: PeerCell; d: number }[] = [];
    for (let idx = 0; idx < cols * rows; idx++) {
      const c = cellCenter(idx, cols, W, rows);
      if (peerSquareOverlapsSelf(c.cx, c.cy, hp, W, halfSelf)) continue;
      const d = Math.hypot(c.cx - W / 2, c.cy - W / 2);
      candidates.push({ cell: c, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    if (candidates.length >= nPeers) {
      return candidates.slice(0, nPeers).map((x) => x.cell);
    }
  }
  return [];
}

/**
 * 中央の空白を目立たせないよう、自分を大きく（周りのリングの内側をなるべく埋める）。
 * 相手が多いほど少し小さくするが、下限を高めてチンケに見えないようにする。
 */
function halfSelfForCanvas(W: number, nPeers: number): number {
  if (nPeers <= 0) return W * 0.33;
  const s = Math.sqrt(Math.max(1, nPeers));
  /** グリッドのまま周りを詰めるため中央をやや小さめに */
  return W * Math.min(0.26, Math.max(0.155, 0.175 + 0.082 / s));
}

export function InteractionCircleCanvas({ self, usersWithIcons }: Props) {
  const { t } = useLocale();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobRevokeRef = useRef<(() => void) | null>(null);
  const [sizePx, setSizePx] = useState(0);
  const [captureReady, setCaptureReady] = useState(false);
  const slots = useMemo(
    () => layoutUsers(usersWithIcons),
    [usersWithIcons],
  );

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      let w = Math.round(el.getBoundingClientRect().width);
      if (w < 16 && typeof window !== "undefined") {
        w = Math.min(Math.max(window.innerWidth - 48, 280), 720);
      }
      if (w > 0) setSizePx(w);
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;
    ro?.observe(el);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(measure);
    });
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (sizePx < 16) {
      if (sizePx > 0) setCaptureReady(true);
      return;
    }

    let cancelled = false;
    setCaptureReady(false);

    const run = async () => {
      blobRevokeRef.current?.();
      blobRevokeRef.current = null;

      const W = sizePx;
      const dpr = Math.min(
        2.5,
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      );

      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(W * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${W}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        if (!cancelled) setCaptureReady(true);
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, W);

      const nPeers = slots.length;
      if (nPeers < 1 && !self.screenName) {
        if (!cancelled) setCaptureReady(true);
        return;
      }

      let halfSelf = halfSelfForCanvas(W, nPeers);
      let peerCells =
        nPeers > 0 ? bestPeerCellsAvoidingCenter(nPeers, W, halfSelf) : [];
      for (let shrink = 0; shrink < 18 && nPeers > 0 && peerCells.length < nPeers; shrink++) {
        halfSelf *= 0.94;
        peerCells = bestPeerCellsAvoidingCenter(nPeers, W, halfSelf);
      }

      const shouldUpgrade = (p?: string, h?: string) =>
        Boolean(p?.trim() && h?.trim() && p !== h);

      // 自分のアイコンは読み込みを開始だけしておく（スプライトと並行に進める）
      const selfImgPromise = loadImageFirstAvailable(
        undefined,
        self.avatarUrlPreview,
        self.avatarUrl,
      );

      // ── 画像取得: スプライト方式 + 個別取得フォールバック ──
      // スプライト: 約100セルを1枚のJPEGシートに合成したものを取得（≈10リクエストで全員ぶん）。
      // 個別取得: スプライトの欠損セル・リビジョン不一致・失敗時だけ従来のパイプラインで補う。
      const POOL = 36;
      /** セルが小さいときは 48px のプレビューで十分なので HD は取得しない（通信削減） */
      const HD_UPGRADE_MIN_SIDE_PX = 36;
      const SPRITE_CELL = 48;
      const SPRITE_COLS = 10;
      const SPRITE_CHUNK = 100;
      const SPRITE_POOL = 12;

      let active = 0;
      const waiters: Array<() => void> = [];
      const gate = async <T,>(fn: () => Promise<T>): Promise<T> => {
        while (active >= POOL) {
          await new Promise<void>((resolve) => waiters.push(resolve));
        }
        active += 1;
        try {
          return await fn();
        } finally {
          active -= 1;
          waiters.shift()?.();
        }
      };

      const total = slots.length;
      const chunkCount = Math.ceil(total / SPRITE_CHUNK);
      const createdBlobUrls: string[] = [];
      blobRevokeRef.current = () => {
        for (const u of createdBlobUrls) URL.revokeObjectURL(u);
      };

      type SpriteHit = { img: HTMLImageElement; dead: boolean[] } | null;

      let spriteActive = 0;
      const spriteWaiters: Array<() => void> = [];
      const spriteGate = async <T,>(fn: () => Promise<T>): Promise<T> => {
        while (spriteActive >= SPRITE_POOL) {
          await new Promise<void>((resolve) => spriteWaiters.push(resolve));
        }
        spriteActive += 1;
        try {
          return await fn();
        } finally {
          spriteActive -= 1;
          spriteWaiters.shift()?.();
        }
      };

      const loadSprite = async (
        start: number,
        count: number,
        sig: string,
      ): Promise<SpriteHit> => {
        const url = `/api/avatar-sprite?screenName=${encodeURIComponent(
          self.screenName,
        )}&from=${start}&count=${count}&sig=${sig}`;
        let res: Response;
        try {
          res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        } catch {
          return null;
        }
        if (!res.ok) return null; // 409（リビジョン不一致）含む → 個別取得へ
        const fromHdr = Number.parseInt(res.headers.get("X-Sprite-From") ?? "", 10);
        const countHdr = Number.parseInt(res.headers.get("X-Sprite-Count") ?? "", 10);
        const cellHdr = Number.parseInt(res.headers.get("X-Sprite-Cell") ?? "", 10);
        const colsHdr = Number.parseInt(res.headers.get("X-Sprite-Cols") ?? "", 10);
        if (
          fromHdr !== start ||
          countHdr !== count ||
          cellHdr !== SPRITE_CELL ||
          colsHdr !== SPRITE_COLS
        ) {
          return null;
        }
        const dead = hexToDeadMask(res.headers.get("X-Sprite-Dead") ?? "", count);
        try {
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          createdBlobUrls.push(objUrl);
          const img = await loadImage(objUrl);
          return { img, dead };
        } catch {
          return null;
        }
      };

      const spriteJobs: Promise<SpriteHit>[] = [];
      for (let start = 0; start < total; start += SPRITE_CHUNK) {
        const end = Math.min(total, start + SPRITE_CHUNK);
        const sig = spriteSliceSig(slots.slice(start, end).map((s) => s.user));
        spriteJobs.push(spriteGate(() => loadSprite(start, end - start, sig)));
      }

      // スプライト取得を開始したので、自分のアイコンの完了を待って先に描く
      const selfImg = await selfImgPromise;
      if (!cancelled && selfImg && self.screenName) {
        drawImageCoverInSquare(ctx, selfImg, W / 2, W / 2, halfSelf);
      }

      const spriteResolved: SpriteHit[] = new Array(chunkCount).fill(null);
      const spriteDoneFlags: boolean[] = new Array(chunkCount).fill(false);
      const perImageJobs: (Promise<HTMLImageElement | null> | null)[] =
        new Array(total).fill(null);

      const ensureChunk = async (c: number): Promise<void> => {
        if (spriteDoneFlags[c]) return;
        spriteDoneFlags[c] = true;
        const hit = await spriteJobs[c];
        spriteResolved[c] = hit;
        const start = c * SPRITE_CHUNK;
        const end = Math.min(total, start + SPRITE_CHUNK);
        for (let k = start; k < end; k++) {
          const within = k - start;
          const covered = hit !== null && !hit.dead[within];
          if (covered) continue;
          // フォールバック条件:
          //  - チャンク全体が失敗（409等） → 全セル従来の個別取得
          //  - 死んだセルは「大きなマス×HD持ち」だけ救済（404を何度も引かない）
          const cell = peerCells[k];
          const side = cell ? Math.min(cell.cellW, cell.cellH) : 0;
          const hasHd = Boolean(slots[k].user.avatarUrl?.trim());
          const needFetch =
            hit === null ||
            (hasHd && side >= HD_UPGRADE_MIN_SIDE_PX);
          if (!needFetch) continue;
          const slot = slots[k];
          perImageJobs[k] = gate(() =>
            loadImageFirstAvailable(
              undefined,
              slot.user.avatarUrlPreview,
              slot.user.avatarUrl,
            ),
          );
        }
      };

      // HD差し替えは従来どおり（拡張レイヤーなので後回し）
      const hdJobs: (Promise<HTMLImageElement | null> | null)[] = slots.map(
        (slot, i) => {
          const cell = peerCells[i];
          if (!cell) return null;
          const side = Math.min(cell.cellW, cell.cellH);
          if (side < HD_UPGRADE_MIN_SIDE_PX) return null;
          const hdUrl = slot.user.avatarUrl?.trim();
          if (!hdUrl) return null;
          // プレビューと同一URLなら差し替える意味がない
          // （プレビュー無しのHD救済ユーザーもここでHD化される）
          if ((slot.user.avatarUrlPreview ?? "").trim() === hdUrl) return null;
          return gate(async () => {
            try {
              return await loadImage(hdUrl);
            } catch {
              return null;
            }
          });
        },
      );

      for (let i = 0; i < total; i++) {
        if (cancelled) return;
        const cell = peerCells[i];
        if (!cell) continue;
        const c = Math.floor(i / SPRITE_CHUNK);
        await ensureChunk(c);
        if (cancelled) return;
        const half = peerHalfDraw(cell.cellW, cell.cellH);
        const hit = spriteResolved[c];
        const within = i - c * SPRITE_CHUNK;
        if (hit && !hit.dead[within]) {
          // スプライトからセルを切り出して描画（サーバー側でcover済み）
          const sx = (within % SPRITE_COLS) * SPRITE_CELL;
          const sy = Math.floor(within / SPRITE_COLS) * SPRITE_CELL;
          ctx.drawImage(
            hit.img,
            sx,
            sy,
            SPRITE_CELL,
            SPRITE_CELL,
            cell.cx - half,
            cell.cy - half,
            half * 2,
            half * 2,
          );
        } else {
          const job = perImageJobs[i];
          if (job) {
            const loaded = await job;
            if (cancelled) return;
            if (loaded) {
              drawImageCoverInSquare(ctx, loaded, cell.cx, cell.cy, half);
            }
          }
        }
        const hdJob = hdJobs[i];
        if (hdJob) {
          void hdJob.then((hd) => {
            if (!cancelled && hd) {
              drawImageCoverInSquare(ctx, hd, cell.cx, cell.cy, half);
            }
          });
        }
      }

      // HD差し替えの完了を待ってからキャプチャ可能にする（保存画質を保証）
      await Promise.all(
        hdJobs.filter((p): p is Promise<HTMLImageElement | null> => p !== null),
      );
      if (cancelled) return;

      // 自分を最前面に（ピアのマスは中央を避けて配置されるので1回で足りる）
      if (selfImg && self.screenName) {
        drawImageCoverInSquare(ctx, selfImg, W / 2, W / 2, halfSelf);
      }

      // HD版の自分アイコン
      if (!cancelled && self.screenName && shouldUpgrade(self.avatarUrlPreview, self.avatarUrl)) {
        try {
          const hd = await loadImage(self.avatarUrl!.trim());
          if (!cancelled) drawImageCoverInSquare(ctx, hd, W / 2, W / 2, halfSelf);
        } catch { /* skip */ }
      }

      if (!cancelled) setCaptureReady(true);
    };

    void run();

    return () => {
      cancelled = true;
      blobRevokeRef.current?.();
      blobRevokeRef.current = null;
    };
  }, [sizePx, self, slots]);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      data-circle-capture-ready={captureReady ? "true" : "false"}
    >
      <canvas
        ref={canvasRef}
        data-circle-export-canvas="true"
        className="block h-full w-full"
        role="img"
        aria-label={
          self.screenName
            ? `@${self.screenName}${t.ariaCircle}`
            : t.ariaCircleDefault
        }
      />
    </div>
  );
}
