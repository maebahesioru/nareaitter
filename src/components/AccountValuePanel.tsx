"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CircleUser, SelfProfile } from "@/types/circle";
import { proxiedImageSrc } from "@/lib/proxied-image-src";
import { estimateAccountValue } from "@/lib/account-value";

type Props = {
  self: SelfProfile;
  users: CircleUser[];
};

function formatPrice(yen: number): string {
  if (yen >= 100000) return `${(yen / 10000).toFixed(1)}万円`;
  if (yen >= 10000) return `${(yen / 10000).toFixed(2)}万円`;
  return `${yen.toLocaleString()}円`;
}

function formatYenSigned(yen: number): string {
  const sign = yen >= 0 ? "+" : "−";
  const v = Math.abs(yen);
  if (v >= 10000) return `${sign}${(v / 10000).toFixed(1)}万円`;
  return `${sign}${v.toLocaleString()}円`;
}

async function loadImage(originalUrl: string): Promise<HTMLImageElement> {
  const proxied = proxiedImageSrc(originalUrl);
  const attempts = proxied !== originalUrl ? [proxied] : [originalUrl];
  let last: unknown;
  for (const src of attempts) {
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        if (/^https?:\/\//.test(src)) { img.crossOrigin = "anonymous"; try { if (new URL(src).origin !== window.location.origin) img.referrerPolicy = "no-referrer"; } catch { /* ignore */ } }
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("load"));
        img.src = src;
      });
    } catch (e) { last = e; }
  }
  throw last instanceof Error ? last : new Error("load");
}

const fallbackColors = [
  "#f43f5e","#f97316","#facc15","#22c55e","#06b6d4",
  "#3b82f6","#8b5cf6","#ec4899","#14b8a6","#f59e0b",
];

function drawCropCircle(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (iw < 1 || ih < 1) return;
  const s = Math.max((r * 2) / iw, (r * 2) / ih);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip(); ctx.drawImage(img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s); ctx.restore();
}

function drawFallbackAvatar(ctx: CanvasRenderingContext2D, name: string, cx: number, cy: number, r: number, idx: number) {
  const color = fallbackColors[idx % fallbackColors.length];
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  const init = (name || "?").charAt(0).toUpperCase();
  const fs = Math.max(10, r * 0.9);
  ctx.font = `bold ${fs}px sans-serif`; ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(init, cx, cy);
  ctx.restore();
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function AccountValuePanel({ self, users }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [captureReady, setCaptureReady] = useState(false);

  const result = useMemo(
    () => estimateAccountValue(users, self),
    [users, self],
  );

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const m = () => {
      let w = Math.round(el.getBoundingClientRect().width);
      if (w < 16) w = Math.min(Math.max(window.innerWidth - 48, 280), 720);
      const h = Math.round(w * 1.52);
      if (w > 0) setSize({ width: w, height: h });
    };
    m();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(m) : null;
    ro?.observe(el);
    window.addEventListener("resize", m);
    return () => { ro?.disconnect(); window.removeEventListener("resize", m); };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width < 16) return;
    let cancelled = false;
    setCaptureReady(false);

    void (async () => {
      const { width: W, height: H } = size;
      const dpr = Math.min(2.5, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setCaptureReady(true); return; }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);

      const isDark = document.documentElement.classList.contains("dark");
      const bg = isDark ? "#09090b" : "#fafafa";
      const cardBg = isDark ? "#12121f" : "#f8fafc";
      const accent = "#059669";
      const plus = isDark ? "#34d399" : "#059669";
      const minus = isDark ? "#f87171" : "#dc2626";
      const text = isDark ? "#e4e4e7" : "#18181b";
      const sub = isDark ? "#a1a1aa" : "#71717a";
      const line = isDark ? "#27272a" : "#e4e4e7";

      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      const cardX = W * 0.04, cardY = H * 0.02, cardW = W * 0.92, cardH = H * 0.96;
      ctx.fillStyle = cardBg;
      drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 2;
      drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
      ctx.stroke();

      const cx = cardX + cardW / 2;
      const padX = cardX + W * 0.05;

      // ── ヘッダ（自分アイコン + @name）──
      const avatarR = Math.max(18, W * 0.052);
      const avatarY = cardY + W * 0.02 + avatarR;
      const selfAvatarSrc = self.avatarUrlPreview?.trim() || self.avatarUrl?.trim();
      let selfImg: HTMLImageElement | null = null;
      if (selfAvatarSrc) {
        try { selfImg = await loadImage(selfAvatarSrc); } catch { /* fallback */ }
      }
      if (cancelled) return;
      if (selfImg) drawCropCircle(ctx, selfImg, cx, avatarY, avatarR);
      else drawFallbackAvatar(ctx, self.displayName || self.screenName, cx, avatarY, avatarR, 0);
      ctx.strokeStyle = isDark ? "#3f3f46" : "#d4d4d8"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, avatarY, avatarR, 0, Math.PI * 2); ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = text;
      ctx.font = `bold ${Math.max(12, W * 0.026)}px sans-serif`;
      const nameY = avatarY + avatarR + Math.max(16, W * 0.034);
      ctx.fillText(`@${self.screenName}`, cx, nameY);

      ctx.fillStyle = sub;
      ctx.font = `${Math.max(9, W * 0.016)}px sans-serif`;
      ctx.fillText("アカウント推定査定額（多項目査定）", cx, nameY + Math.max(12, W * 0.024));

      // ── 価格（大）──
      const priceY = nameY + H * 0.085;
      ctx.fillStyle = accent;
      ctx.font = `bold ${Math.max(26, W * 0.062)}px sans-serif`;
      ctx.fillText(formatPrice(result.estimatedPriceYen), cx, priceY);

      // レンジ
      ctx.fillStyle = sub;
      ctx.font = `${Math.max(9, W * 0.017)}px sans-serif`;
      const rangeY = priceY + Math.max(14, W * 0.03);
      ctx.fillText(`推定レンジ ${formatPrice(result.priceLow)} 〜 ${formatPrice(result.priceHigh)}`, cx, rangeY);

      // グレード + 確度
      const gradeColors: Record<string, string> = { S: "#eab308", A: "#059669", B: "#2563eb", C: "#71717a", D: "#ef4444" };
      const gradeY = rangeY + Math.max(16, W * 0.034);
      ctx.fillStyle = gradeColors[result.grade] ?? sub;
      ctx.font = `bold ${Math.max(13, W * 0.03)}px sans-serif`;
      ctx.fillText(result.gradeJa, cx, gradeY);
      ctx.fillStyle = sub;
      ctx.font = `${Math.max(8, W * 0.014)}px sans-serif`;
      ctx.fillText(result.confidenceLabel, cx, gradeY + Math.max(11, W * 0.022));

      // ── 内訳（セパレータ）──
      const sepY = gradeY + Math.max(22, W * 0.042);
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padX, sepY); ctx.lineTo(cardX + cardW - (padX - cardX), sepY); ctx.stroke();

      ctx.fillStyle = text;
      ctx.font = `bold ${Math.max(9, W * 0.017)}px sans-serif`;
      ctx.textAlign = "start";
      ctx.fillText("査定の内訳", padX, sepY + Math.max(14, W * 0.028));

      // ── ファクター行 ──
      const rowH = H * 0.052;
      let rowY = sepY + Math.max(26, W * 0.05);
      const labelFs = Math.max(9, W * 0.0175);
      const subFs = Math.max(8, W * 0.0145);
      const yenFs = Math.max(9, W * 0.017);
      const rightX = cardX + cardW - (padX - cardX);

      for (const f of result.factors) {
        // 行1: ラベル（左） + 寄与額（右）
        ctx.fillStyle = text;
        ctx.font = `bold ${labelFs}px sans-serif`;
        ctx.textAlign = "start";
        ctx.fillText(f.label, padX, rowY);

        ctx.textAlign = "end";
        ctx.fillStyle = f.yen > 0 ? plus : f.yen < 0 ? minus : sub;
        ctx.font = `bold ${yenFs}px sans-serif`;
        ctx.fillText(f.yen !== 0 ? formatYenSigned(f.yen) : "±0円", rightX, rowY);

        // 行2: 値 + コメント（サブ）
        ctx.textAlign = "start";
        ctx.fillStyle = sub;
        ctx.font = `${subFs}px sans-serif`;
        const subText = `${f.value}${f.comment ? ` ・ ${f.comment}` : ""}`;
        let st = subText;
        const maxSubW = cardW - (padX - cardX) * 2;
        while (st.length > 4 && ctx.measureText(st).width > maxSubW) st = `${st.slice(0, -2)}…`;
        ctx.fillText(st, padX, rowY + subFs + 6);

        rowY += rowH;
      }

      // ── 注記 ──
      ctx.textAlign = "center";
      ctx.fillStyle = sub;
      ctx.font = `${Math.max(8, W * 0.0125)}px sans-serif`;
      const noteY = cardY + cardH - Math.max(30, W * 0.05);
      ctx.fillText("査定額は公開データ（プロフィール・30日の交流・投稿傾向）からの推定です。実際の取引価格を保証しません。", cx, noteY);
      ctx.fillText("レンジ幅はデータの確度を表します（充実しているほど狭くなります）。", cx, noteY + Math.max(11, W * 0.021));

      ctx.textAlign = "start";
      if (!cancelled) setCaptureReady(true);
    })();

    return () => { cancelled = true; };
  }, [size, result, self]);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ aspectRatio: "1 / 1.52" }} data-circle-capture-ready={captureReady ? "true" : "false"}>
      <canvas ref={canvasRef} data-circle-export-canvas="true" className="block w-full"
        role="img" aria-label={`@${self.screenName} のアカウント推定売却価格`}
        style={{ height: size.height || 600 }} />
    </div>
  );
}
