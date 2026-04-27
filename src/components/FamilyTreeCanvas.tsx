"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { proxiedImageSrc } from "@/lib/proxied-image-src";
import type { CircleUser, SelfProfile, FamilyTreeNode } from "@/types/circle";
import {
  buildFamilyTree,
  getRelationLabel,
  getRelationEmoji,
  type ExtendedRelationType,
} from "@/lib/family-tree";

type Props = { self: SelfProfile; users: CircleUser[] };

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

function drawCropCircle(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (iw < 1 || ih < 1) return;
  const s = Math.max((r * 2) / iw, (r * 2) / ih);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip(); ctx.drawImage(img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s); ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, fs: number, txt: string, bg: string, bc: string) {
  ctx.save();
  ctx.font = `bold ${fs}px sans-serif`;
  const m = ctx.measureText(text);
  const tw = m.width + 14, th = fs + 8;
  const lx = x - tw / 2, ly = y - th / 2;
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(lx, ly, tw, th, 5); ctx.fill();
  ctx.strokeStyle = bc; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(lx, ly, tw, th, 5); ctx.stroke();
  ctx.fillStyle = txt;
  ctx.fillText(text, lx + 7, ly + fs + 2);
  ctx.restore();
}

// ── レイアウト型 ──
type GenNode = { node: FamilyTreeNode; x: number; y: number; r: number };
type GenRow = { relation: ExtendedRelationType; label: string; emoji: string; nodes: GenNode[]; y: number };

function calcLayout(
  tree: ReturnType<typeof buildFamilyTree>,
  w: number, locale: "ja" | "en",
): { root: GenNode; rows: GenRow[]; neededHeight: number } {
  const cx = w / 2;
  const nodeR = Math.min(w, 720) * 0.045;
  const gapX = nodeR * 2.6;
  const rowH = nodeR * 2.8;

  const rows: GenRow[] = [];

  function layoutTier(rel: ExtendedRelationType, startY: number): number {
    const all = tree.extendedNodes[rel];
    if (!all?.length) return startY;
    const perRow = Math.max(1, Math.floor(w * 0.92 / gapX));
    for (let r = 0; r < Math.ceil(all.length / perRow); r++) {
      const chunk = all.slice(r * perRow, (r + 1) * perRow);
      const tw = (chunk.length - 1) * gapX;
      const sx = cx - tw / 2;
      const y = startY + r * rowH;
      rows.push({
        relation: rel,
        label: r === 0 ? getRelationLabel(rel, locale) : "",
        emoji: r === 0 ? getRelationEmoji(rel) : "",
        nodes: chunk.map((n, i) => ({ node: n, x: sx + i * gapX, y, r: nodeR })),
        y,
      });
    }
    return startY + Math.ceil(all.length / perRow) * rowH;
  }

  // 祖先（上）
  let yUp = 40;
  yUp = layoutTier("greatGrandparent", yUp);
  yUp = layoutTier("grandparent", yUp);
  yUp = layoutTier("parent", yUp);

  // 自分（中央）
  const selfY = yUp + rowH;
  const root: GenNode = { node: tree.root, x: cx, y: selfY, r: nodeR * 1.5 };

  // 兄弟・配偶者（同列）
  const spouseAll = tree.extendedNodes.spouse || [];
  const sibAll = tree.extendedNodes.sibling || [];

  const sibStart = cx - root.r - gapX * 1.5;
  for (let i = 0; i < sibAll.length; i++) {
    const x = Math.max(nodeR, sibStart - i * gapX);
    rows.push({
      relation: "sibling",
      label: i === 0 ? getRelationLabel("sibling", locale) : "",
      emoji: i === 0 ? getRelationEmoji("sibling") : "",
      nodes: [{ node: sibAll[i], x, y: selfY, r: nodeR }],
      y: selfY,
    });
  }

  const spouseStart = cx + root.r + gapX * 1.5;
  for (let i = 0; i < spouseAll.length; i++) {
    const x = Math.min(w - nodeR, spouseStart + i * gapX);
    rows.push({
      relation: "spouse",
      label: i === 0 ? getRelationLabel("spouse", locale) : "",
      emoji: i === 0 ? getRelationEmoji("spouse") : "",
      nodes: [{ node: spouseAll[i], x, y: selfY, r: nodeR }],
      y: selfY,
    });
  }

  // 子孫（下）
  let yDown = selfY + root.r + rowH;
  yDown = layoutTier("child", yDown);
  yDown = layoutTier("grandchild", yDown);
  yDown = layoutTier("greatGrandchild", yDown);

  // 拡張親戚
  yDown = layoutTier("uncle", yDown);
  yDown = layoutTier("nephew", yDown);
  yDown = layoutTier("cousin", yDown);

  const neededHeight = yDown + 40;

  return { root, rows, neededHeight };
}

export function FamilyTreeCanvas({ self, users }: Props) {
  const { locale } = useLocale();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [captureReady, setCaptureReady] = useState(false);
  const tree = useMemo(() => buildFamilyTree(users, self.screenName), [users, self.screenName]);

  useLayoutEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const m = () => {
      let w = Math.round(el.getBoundingClientRect().width);
      if (w < 16) w = Math.min(Math.max(window.innerWidth - 48, 280), 720);
      // レイアウトを計算して高さを決める
      const layout = calcLayout(tree, w, locale as "ja" | "en");
      const h = Math.round(Math.max(400, layout.neededHeight));
      if (w > 0) setSize({ width: w, height: h });
    };
    m();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(m) : null;
    ro?.observe(el);
    window.addEventListener("resize", m);
    return () => { ro?.disconnect(); window.removeEventListener("resize", m); };
  }, [tree, locale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width < 16) return;
    let cancelled = false;
    setCaptureReady(false);

    void (async () => {
      const { width: W, height: H } = size;
      const dpr = Math.min(2.5, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setCaptureReady(true); return; }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);

      const isDark = document.documentElement.classList.contains("dark");
      const bg = isDark ? "#09090b" : "#fafafa";
      const txt = isDark ? "#e4e4e7" : "#18181b";
      const lbg = isDark ? "#27272a99" : "#e4e4e799";
      const lc = isDark ? "#52525b" : "#cbd5e1";
      const bc = isDark ? "#52525b" : "#cbd5e1";

      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      const layout = calcLayout(tree, W, locale as "ja" | "en");

      const imgCache = new Map<string, HTMLImageElement>();
      const load = async (url?: string) => {
        if (!url?.trim()) return null;
        if (imgCache.has(url)) return imgCache.get(url)!;
        try { const i = await loadImage(url.trim()); imgCache.set(url, i); return i; } catch { return null; }
      };

      // ── 接続線（家系図風） ──
      ctx.strokeStyle = lc; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.4;

      // 祖先の水平ブラケット＋垂直線
      const ancestorRels = new Set(["greatGrandparent", "grandparent", "parent"]);
      const descendantRels = new Set(["child", "grandchild", "greatGrandchild"]);

      for (const row of layout.rows) {
        const nodes = row.nodes;
        if (nodes.length === 0) continue;

        if (ancestorRels.has(row.relation) || descendantRels.has(row.relation)) {
          const isAbove = nodes[0].y < layout.root.y;
          const bracketY = isAbove
            ? nodes[0].y + nodes[0].r + (layout.root.y - layout.root.r - nodes[0].y - nodes[0].r) / 2
            : nodes[0].y - nodes[0].r - (nodes[0].y - nodes[0].r - layout.root.y - layout.root.r) / 2;

          if (nodes.length === 1) {
            ctx.beginPath(); ctx.moveTo(layout.root.x, layout.root.y + (isAbove ? -layout.root.r : layout.root.r));
            ctx.lineTo(nodes[0].x, nodes[0].y + (isAbove ? nodes[0].r : -nodes[0].r));
            ctx.stroke();
          } else {
            const first = nodes[0], last = nodes[nodes.length - 1];
            ctx.beginPath(); ctx.moveTo(first.x, bracketY); ctx.lineTo(last.x, bracketY); ctx.stroke();
            for (const n of nodes) {
              ctx.beginPath(); ctx.moveTo(n.x, n.y + (isAbove ? n.r : -n.r)); ctx.lineTo(n.x, bracketY); ctx.stroke();
            }
            const bx = (first.x + last.x) / 2;
            ctx.beginPath(); ctx.moveTo(bx, bracketY);
            ctx.lineTo(layout.root.x, layout.root.y + (isAbove ? -layout.root.r : layout.root.r));
            ctx.stroke();
          }
        }

        // 配偶者・兄弟: 水平線で自分につなぐ
        if (row.relation === "spouse" || row.relation === "sibling") {
          for (const n of nodes) {
            ctx.beginPath();
            const fromX = row.relation === "spouse" ? n.x - n.r : n.x + n.r;
            const toX = row.relation === "spouse" ? layout.root.x + layout.root.r : layout.root.x - layout.root.r;
            ctx.moveTo(fromX, n.y); ctx.lineTo(toX, n.y); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      // ── ノード描画 ──
      const fs = Math.max(9, Math.min(11, W * 0.02));
      let lastLabelRel = "";
      for (const row of layout.rows) {
        if (cancelled) return;
        // ラベル（最初の行のみ、重複防止）
        if (row.label && row.relation !== lastLabelRel) {
          const fn = row.nodes[0];
          const labelY = Math.max(8, fn.y - fn.r - 16);
          drawLabel(ctx, fn.x, labelY, `${row.emoji} ${row.label}`, fs, txt, lbg, lc);
        }
        lastLabelRel = row.relation;

        for (const { node, x, y, r } of row.nodes) {
          const img = await load(node.user.avatarUrlPreview ?? node.user.avatarUrl);
          if (img) drawCropCircle(ctx, img, x, y, r);
          else { ctx.fillStyle = isDark ? "#3f3f46" : "#d4d4d8"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
          ctx.strokeStyle = bc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // 自分
      if (!cancelled) {
        const sImg = await load(self.avatarUrlPreview ?? self.avatarUrl);
        if (sImg) drawCropCircle(ctx, sImg, layout.root.x, layout.root.y, layout.root.r);
        else { ctx.fillStyle = isDark ? "#3f3f46" : "#d4d4d8"; ctx.beginPath(); ctx.arc(layout.root.x, layout.root.y, layout.root.r, 0, Math.PI*2); ctx.fill(); }
        ctx.strokeStyle = isDark ? "#a1a1aa" : "#71717a"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(layout.root.x, layout.root.y, layout.root.r, 0, Math.PI*2); ctx.stroke();
        const sfs = Math.max(11, Math.min(14, W * 0.026));
        ctx.font = `bold ${sfs}px sans-serif`; ctx.fillStyle = txt; ctx.textAlign = "center";
        ctx.fillText(`@${self.screenName}`, layout.root.x, layout.root.y + layout.root.r + sfs + 8);
        ctx.textAlign = "start";
      }

      if (!cancelled) setCaptureReady(true);
    })();

    return () => { cancelled = true; };
  }, [size, tree, self, locale]);

  return (
    <div ref={wrapRef} className="relative w-full" data-circle-capture-ready={captureReady ? "true" : "false"}>
      <canvas ref={canvasRef} data-family-capture-canvas="true" className="block w-full"
        role="img" aria-label={`${self.screenName} の家族ツリー`}
        style={{ height: size.height || 600 }} />
    </div>
  );
}
