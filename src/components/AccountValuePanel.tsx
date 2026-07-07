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
  if (yen >= 10000) return `${(yen / 10000).toFixed(1)}万円`;
  return `${yen.toLocaleString()}円`;
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
      const h = Math.round(w * 1.05);
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
      const cardBg = isDark ? "#1a1a2e" : "#f0fdf4";
      const accent = "#059669";
      const text = isDark ? "#e4e4e7" : "#18181b";
      const sub = isDark ? "#a1a1aa" : "#71717a";

      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      const cardX = W * 0.04, cardY = H * 0.03, cardW = W * 0.92, cardH = H * 0.94;
      ctx.fillStyle = cardBg;
      drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 2;
      drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 16);
      ctx.stroke();

      const cx = cardX + cardW / 2;

      // タイトル
      const titleY = cardY + H * 0.06;
      ctx.fillStyle = sub;
      ctx.font = `bold ${Math.max(11, W * 0.022)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(`@${self.screenName}`, cx, titleY);
      ctx.fillText("アカウント推定売却価格", cx, titleY + H * 0.04);

      // 価格（大きく）
      const priceY = cardY + H * 0.2;
      ctx.fillStyle = accent;
      ctx.font = `bold ${Math.max(26, W * 0.065)}px sans-serif`;
      ctx.fillText(formatPrice(result.estimatedPriceYen), cx, priceY);

      // グレード
      const gradeColors: Record<string, string> = { S: "#eab308", A: "#059669", B: "#2563eb", C: "#71717a", D: "#ef4444" };
      const gradeY = priceY + H * 0.07;
      ctx.fillStyle = gradeColors[result.grade] ?? sub;
      ctx.font = `bold ${Math.max(14, W * 0.032)}px sans-serif`;
      ctx.fillText(result.gradeJa, cx, gradeY);

      // 内訳
      const detY = gradeY + H * 0.08;
      const detFont = Math.max(9, W * 0.016);
      ctx.fillStyle = text;
      ctx.font = `${detFont}px sans-serif`;
      const details = [
        `フォロワー: ${result.metrics.followers.toLocaleString()}人`,
        `ツイート: ${result.metrics.tweets.toLocaleString()}件`,
        `アカウント年齢: ${result.metrics.accountAgeDays > 0 ? `${Math.floor(result.metrics.accountAgeDays / 365)}年${result.metrics.accountAgeDays % 365}日` : "不明"}`,
        `交流相手: ${result.metrics.uniqueUsers}人`,
        `総メンション: ${result.metrics.totalMentions.toLocaleString()}件`,
        `平均交流スコア: ${result.metrics.avgScore}`,
      ];
      for (let i = 0; i < details.length; i++) {
        ctx.fillText(details[i], cx, detY + i * H * 0.03);
      }

      // 自分のアイコン（でかく）
      const selfR = Math.max(28, W * 0.085);
      const selfIconY = detY + details.length * H * 0.03 + H * 0.06 + selfR;
      const selfAvatarSrc = self.avatarUrlPreview?.trim() || self.avatarUrl?.trim();
      let selfImg: HTMLImageElement | null = null;

      if (selfAvatarSrc) {
        try { selfImg = await loadImage(selfAvatarSrc); } catch { /* fallback */ }
      }

      if (!cancelled) {
        if (selfImg) {
          drawCropCircle(ctx, selfImg, cx, selfIconY, selfR);
        } else {
          drawFallbackAvatar(ctx, self.displayName || self.screenName, cx, selfIconY, selfR, 0);
        }

        // 自分の名前
        ctx.fillStyle = text;
        ctx.textAlign = "center";
        ctx.font = `bold ${Math.max(11, W * 0.022)}px sans-serif`;
        ctx.fillText(`@${self.screenName}`, cx, selfIconY + selfR + Math.max(14, W * 0.02));
      }

      // 注釈
      ctx.fillStyle = sub;
      ctx.font = `${Math.max(8, W * 0.013)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("※この価格は交流データからの簡易推測であり、実際の取引価格を保証するものではありません", cx, cardY + cardH - 20);
      ctx.fillText("フォロワー数・アカウント年齢・投稿頻度などは計算に含まれていません", cx, cardY + cardH - 8);

      ctx.textAlign = "start";
      if (!cancelled) setCaptureReady(true);
    })();

    return () => { cancelled = true; };
  }, [size, result, self]);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ aspectRatio: "1 / 1.05" }} data-circle-capture-ready={captureReady ? "true" : "false"}>
      <canvas ref={canvasRef} data-circle-export-canvas="true" className="block w-full"
        role="img" aria-label={`@${self.screenName} のアカウント推定売却価格`}
        style={{ height: size.height || 400 }} />
    </div>
  );
}
