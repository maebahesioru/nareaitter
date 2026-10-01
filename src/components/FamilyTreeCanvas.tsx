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
        if (/^https?:\/\//.test(src)) {
          img.crossOrigin = "anonymous";
          try {
            if (new URL(src).origin !== window.location.origin) img.referrerPolicy = "no-referrer";
          } catch {
            /* ignore */
          }
        }
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("load"));
        img.src = src;
      });
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("load");
}

function drawCropCircle(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw < 1 || ih < 1) return;
  const s = Math.max((r * 2) / iw, (r * 2) / ih);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s);
  ctx.restore();
}

// ── 家系図レイアウト ─────────────────────────────────────────────
// 世代ごとの行 + 夫婦（婚姻線で接続）+ 親→子の直角バス配線。
// 線は必ず「親の位置 → バス → 子の位置」で連続して描かれ、途中で切れない。

type TItem =
  | { kind: "single"; node: FamilyTreeNode; tier: ExtendedRelationType }
  | { kind: "couple"; nodes: [FamilyTreeNode, FamilyTreeNode]; tier: ExtendedRelationType }
  | { kind: "selfCouple"; spouse?: FamilyTreeNode };

type PlacedItem = {
  midX: number; // 接続線の基準X（夫婦は2円の中点）
  topY: number;
  bottomY: number;
  isParentSource: boolean; // 下方向のバス元になる（親・叔父など）
};

type PlacedRow = {
  tier: ExtendedRelationType | "selfRow";
  label?: string;
  y: number;
  radius: number;
  items: PlacedItem[];
  nodes: TNode[];
  couples: Couple[];
};

type TNode = { node: FamilyTreeNode; x: number; y: number; r: number; isSelf?: boolean };
type Couple = { x1: number; x2: number; y: number };
type Conn = { y: number; x1: number; x2: number; drops: { x: number; y1: number; y2: number }[] };
type Label = { x: number; y: number; text: string; align: "left" | "center" };

type Layout = {
  rows: PlacedRow[];
  conns: Conn[];
  labels: Label[];
  height: number;
};

function calcLayout(tree: ReturnType<typeof buildFamilyTree>, w: number, locale: "ja" | "en"): Layout {
  const ex = tree.extendedNodes;
  const M = 14;

  // ── 1) 行の構成 ─────────────────────────────
  const rowsSpec: { tier: ExtendedRelationType | "selfRow"; label?: string; items: TItem[] }[] = [];

  const asCoupleOrSingles = (nodes: FamilyTreeNode[], tier: ExtendedRelationType): TItem[] => {
    const out: TItem[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const pair = nodes.slice(i, i + 2);
      if (pair.length === 2) out.push({ kind: "couple", nodes: [pair[0], pair[1]], tier });
      else out.push({ kind: "single", node: pair[0], tier });
    }
    return out;
  };

  const ggp = ex.greatGrandparent ?? [];
  if (ggp.length) rowsSpec.push({ tier: "greatGrandparent", items: asCoupleOrSingles(ggp, "greatGrandparent") });
  const gp = ex.grandparent ?? [];
  if (gp.length) rowsSpec.push({ tier: "grandparent", items: asCoupleOrSingles(gp, "grandparent") });

  const parents = ex.parent ?? [];
  const uncles = ex.uncle ?? [];
  const parentItems: TItem[] = [];
  if (uncles[0]) parentItems.push({ kind: "single", node: uncles[0], tier: "uncle" });
  if (parents.length === 2) parentItems.push({ kind: "couple", nodes: [parents[0], parents[1]], tier: "parent" });
  else if (parents.length === 1) parentItems.push({ kind: "single", node: parents[0], tier: "parent" });
  if (uncles[1]) parentItems.push({ kind: "single", node: uncles[1], tier: "uncle" });
  if (parentItems.length) {
    rowsSpec.push({ tier: "parent", label: getRelationLabel("parent", locale), items: parentItems });
  }

  // 自分行: いとこ → 兄弟 → 自分+配偶者
  const cousins = ex.cousin ?? [];
  const sibs = ex.sibling ?? [];
  const spouse = (ex.spouse ?? [])[0];
  const selfItems: TItem[] = [
    ...cousins.map((n) => ({ kind: "single" as const, node: n, tier: "cousin" as const })),
    ...sibs.map((n) => ({ kind: "single" as const, node: n, tier: "sibling" as const })),
    { kind: "selfCouple" as const, spouse },
  ];
  const selfRowLabel = sibs.length ? getRelationLabel("sibling", locale) : cousins.length ? getRelationLabel("cousin", locale) : "";
  rowsSpec.push({ tier: "selfRow", label: selfRowLabel || undefined, items: selfItems });

  const nephews = ex.nephew ?? [];
  const children = ex.child ?? [];
  const childItems: TItem[] = [
    ...nephews.map((n) => ({ kind: "single" as const, node: n, tier: "nephew" as const })),
    ...children.map((n) => ({ kind: "single" as const, node: n, tier: "child" as const })),
  ];
  if (childItems.length) {
    rowsSpec.push({ tier: "child", label: getRelationLabel(children.length ? "child" : "nephew", locale), items: childItems });
  }

  const gc = ex.grandchild ?? [];
  if (gc.length) rowsSpec.push({ tier: "grandchild", items: gc.map((n) => ({ kind: "single" as const, node: n, tier: "grandchild" as const })) });
  const ggc = ex.greatGrandchild ?? [];
  if (ggc.length) rowsSpec.push({ tier: "greatGrandchild", items: ggc.map((n) => ({ kind: "single" as const, node: n, tier: "greatGrandchild" as const })) });

  // ── 2) 半径と行高（全行が横幅に収まるよう半径を決める） ─────────
  const unitsOf = (items: TItem[]) => items.reduce((acc, it) => acc + (it.kind === "couple" || it.kind === "selfCouple" ? 2.4 : 1), 0);
  let maxUnits = 3.2;
  for (const r of rowsSpec) maxUnits = Math.max(maxUnits, unitsOf(r.items) + (r.items.length - 1) * 0.85 + 0.4);
  const r = Math.max(13, Math.min(27, (w - M * 2) / maxUnits));
  const gap = r * 0.85;
  const coupleGap = r * 0.75;
  const nameFs = Math.max(8, Math.min(11, r * 0.42));
  const rowStep = r * 2 + nameFs + r * 2.2;

  // ── 3) 配置 ────────────────────────────────
  const rows: PlacedRow[] = [];
  const couples: Couple[] = [];
  const allNodes: TNode[] = [];
  const labels: Label[] = [];
  let y = M + r;

  for (const spec of rowsSpec) {
    const items = spec.items;
    const units = unitsOf(items) + (items.length - 1) * 0.85;
    let x = w / 2 - (units * r) / 2;
    const rowNodes: TNode[] = [];
    const rowCouples: Couple[] = [];
    const placed: PlacedItem[] = [];
    const isParentRow = spec.tier === "parent";
    const isAncestorRow = spec.tier === "greatGrandparent" || spec.tier === "grandparent";

    const putSingle = (node: FamilyTreeNode, tier: ExtendedRelationType): PlacedItem => {
      const cx = x + r;
      rowNodes.push({ node, x: cx, y, r });
      const item: PlacedItem = { midX: cx, topY: y - r, bottomY: y + r, isParentSource: isParentRow || isAncestorRow };
      x += r * 2 + gap;
      return item;
    };
    const putCouple = (a: FamilyTreeNode, b: FamilyTreeNode, tier: ExtendedRelationType): PlacedItem => {
      const ax = x + r;
      const bx = ax + r * 2 + coupleGap;
      rowNodes.push({ node: a, x: ax, y, r });
      rowNodes.push({ node: b, x: bx, y, r });
      rowCouples.push({ x1: ax + r, x2: bx - r, y });
      x = bx + r + gap;
      return { midX: (ax + bx) / 2, topY: y - r, bottomY: y, isParentSource: isParentRow || isAncestorRow };
    };

    for (const it of items) {
      if (it.kind === "single") placed.push(putSingle(it.node, it.tier));
      else if (it.kind === "couple") placed.push(putCouple(it.nodes[0], it.nodes[1], it.tier));
      else {
        // selfCouple
        const ax = x + r;
        rowNodes.push({ node: tree.root, x: ax, y, r, isSelf: true });
        if (it.spouse) {
          const bx = ax + r * 2 + coupleGap;
          rowNodes.push({ node: it.spouse, x: bx, y, r });
          rowCouples.push({ x1: ax + r, x2: bx - r, y });
          placed.push({ midX: (ax + bx) / 2, topY: y - r, bottomY: y + r, isParentSource: false });
          x = bx + r + gap;
        } else {
          placed.push({ midX: ax, topY: y - r, bottomY: y + r, isParentSource: false });
          x = ax + r + gap;
        }
      }
    }

    rows.push({ tier: spec.tier, label: spec.label, y, radius: r, items: placed, nodes: rowNodes, couples: rowCouples });
    for (const n of rowNodes) allNodes.push(n);
    for (const c of rowCouples) couples.push(c);
    if (spec.label) {
      labels.push({ x: M, y, text: spec.label, align: "left" });
    }
    y += rowStep;
  }

  // ── 4) 接続（バス配線） ─────────────────────
  const conns: Conn[] = [];
  const rowByTier = (tier: string) => rows.find((rr) => rr.tier === tier);

  const connect = (sources: PlacedItem[], targets: PlacedItem[], srcBottomLimit: number, tgtTopLimit: number) => {
    if (!sources.length || !targets.length) return;
    const busY = (srcBottomLimit + tgtTopLimit) / 2;
    const xs = [...sources.map((s) => s.midX), ...targets.map((t) => t.midX)];
    const x1 = Math.min(...xs);
    const x2 = Math.max(...xs);
    const drops: Conn["drops"] = [];
    for (const s of sources) drops.push({ x: s.midX, y1: s.bottomY, y2: busY });
    for (const t of targets) drops.push({ x: t.midX, y1: busY, y2: t.topY });
    conns.push({ y: busY, x1, x2, drops });
  };

  // 祖先チェーン: 曽祖父 → 祖父 → 親世代
  const ggpRow = rowByTier("greatGrandparent");
  const gpRow = rowByTier("grandparent");
  const parentRow = rowByTier("parent");
  if (ggpRow && gpRow) connect(ggpRow.items, gpRow.items, ggpRow.y + ggpRow.radius, gpRow.y - gpRow.radius);
  if (gpRow && parentRow) connect(gpRow.items, parentRow.items, gpRow.y + gpRow.radius, parentRow.y - parentRow.radius);

  const selfRow = rowByTier("selfRow")!;
  // 親（夫婦/単独）→ 兄弟 + 自分
  if (parentRow) {
    const parentSrc = parentRow.items.filter((it) => it.isParentSource);
    const selfAndSibs = selfRow.items.filter((_, idx) => idx >= (selfRow.items.length - 1) || true); // 全 items のうち self と sibling は後ろ側
    void selfAndSibs;
    const childTargets = selfRow.items.slice(Math.max(0, selfRow.items.length - 1 - (ex.sibling ?? []).length));
    // ↑ 自分+兄弟（いとこは除く）
    connect(parentSrc, childTargets, parentRow.y + parentRow.radius, selfRow.y - selfRow.radius);
  }
  // 叔父 → いとこ
  if (parentRow && cousins.length) {
    const uncleSrc = parentRow.items.filter((it, i) => {
      const spec = parentRow.nodes;
      void spec;
      void i;
      return it.isParentSource && !parentRow.couples.some((c) => c.y === it.topY && c.x1 < it.midX + 1 && c.x2 > it.midX - 1);
    });
    const cousinTargets = selfRow.items.slice(0, cousins.length);
    if (uncleSrc.length && cousinTargets.length) connect(uncleSrc, cousinTargets, parentRow.y + parentRow.radius, selfRow.y - selfRow.radius - r * 0.7);
  }

  // 自分夫婦 → 子ども（甥は除く）
  const childRow = rowByTier("child");
  if (childRow) {
    const selfCoupleItem = selfRow.items[selfRow.items.length - 1];
    const childTargets = childRow.items.slice(nephews.length);
    if (childTargets.length) connect([selfCoupleItem], childTargets, selfRow.y + selfRow.radius, childRow.y - childRow.radius);
    // 兄弟 → 甥・姪
    if (nephews.length) {
      const sibItems = selfRow.items.slice(cousins.length, cousins.length + sibs.length);
      const nephewTargets = childRow.items.slice(0, nephews.length);
      if (sibItems.length && nephewTargets.length) {
        connect(sibItems, nephewTargets, selfRow.y + selfRow.radius, childRow.y - childRow.radius - r * 0.7);
      }
    }
  }

  // 子ども → 孫 → 曽孫（グループバス）
  const gcRow = rowByTier("grandchild");
  const ggcRow = rowByTier("greatGrandchild");
  if (childRow && gcRow) connect(childRow.items, gcRow.items, childRow.y + childRow.radius, gcRow.y - gcRow.radius);
  if (gcRow && ggcRow) connect(gcRow.items, ggcRow.items, gcRow.y + gcRow.radius, ggcRow.y - ggcRow.radius);

  const height = Math.max(420, Math.round(y - rowStep + r + M + nameFs * 2.5 + 40));

  return { rows, conns, labels, height };
}

export function FamilyTreeCanvas({ self, users }: Props) {
  const { locale } = useLocale();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [captureReady, setCaptureReady] = useState(false);
  const tree = useMemo(() => buildFamilyTree(users, self.screenName), [users, self.screenName]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const m = () => {
      let w = Math.round(el.getBoundingClientRect().width);
      if (w < 16) w = Math.min(Math.max(window.innerWidth - 48, 280), 720);
      const layout = calcLayout(tree, w, locale as "ja" | "en");
      if (w > 0) setSize({ width: w, height: layout.height });
    };
    m();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(m) : null;
    ro?.observe(el);
    window.addEventListener("resize", m);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", m);
    };
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
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setCaptureReady(true);
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      const isDark = document.documentElement.classList.contains("dark");
      const bg = isDark ? "#09090b" : "#fafafa";
      const txt = isDark ? "#e4e4e7" : "#18181b";
      const sub = isDark ? "#a1a1aa" : "#52525b";
      const lbg = isDark ? "#27272a" : "#e4e4e7";
      const lc = isDark ? "#52525b" : "#94a3b8";
      const bc = isDark ? "#52525b" : "#cbd5e1";
      const rootRing = isDark ? "#a1a1aa" : "#71717a";

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const layout = calcLayout(tree, W, locale as "ja" | "en");

      // ── 接続線（直角バス）── 先に描いてノードで覆う
      ctx.strokeStyle = lc;
      ctx.fillStyle = lc;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.6;
      for (const c of layout.conns) {
        ctx.beginPath();
        ctx.moveTo(c.x1, c.y);
        ctx.lineTo(c.x2, c.y);
        ctx.stroke();
        for (const d of c.drops) {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y1);
          ctx.lineTo(d.x, d.y2);
          ctx.stroke();
        }
        // 接続点ドット（合流点の明示）
        for (const d of c.drops) {
          ctx.beginPath();
          ctx.arc(d.x, c.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // 婚姻線（夫婦の二重線）
      for (const row of layout.rows) {
        ctx.lineWidth = 2.6;
        ctx.globalAlpha = 0.95;
        for (const cp of row.couples) {
          ctx.beginPath();
          ctx.moveTo(cp.x1, cp.y);
          ctx.lineTo(cp.x2, cp.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc((cp.x1 + cp.x2) / 2, cp.y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = 0.6;
      }
      ctx.globalAlpha = 1;

      // ── ノード描画 ──
      const imgCache = new Map<string, HTMLImageElement>();
      const load = async (url?: string) => {
        if (!url?.trim()) return null;
        if (imgCache.has(url)) return imgCache.get(url)!;
        try {
          const i = await loadImage(url.trim());
          imgCache.set(url, i);
          return i;
        } catch {
          return null;
        }
      };

      const nameFs = Math.max(8, Math.min(11, (layout.rows[0]?.radius ?? 20) * 0.42));
      for (const row of layout.rows) {
        for (const n of row.nodes) {
          if (cancelled) return;
          const img = await load(n.node.user.avatarUrlPreview ?? n.node.user.avatarUrl);
          if (img) drawCropCircle(ctx, img, n.x, n.y, n.r);
          else {
            ctx.fillStyle = isDark ? "#3f3f46" : "#d4d4d8";
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.strokeStyle = n.isSelf ? rootRing : bc;
          ctx.lineWidth = n.isSelf ? 3 : 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.stroke();

          // 名前（自分は@ID大きめ、他人は表示名を小さく）
          const label = n.isSelf
            ? `@${self.screenName}`
            : (n.node.user.displayName || n.node.user.screenName || "");
          if (label) {
            const fs = n.isSelf ? Math.max(11, Math.min(14, W * 0.024)) : nameFs;
            ctx.font = `${n.isSelf ? "bold " : ""}${fs}px sans-serif`;
            ctx.fillStyle = n.isSelf ? txt : sub;
            ctx.textAlign = "center";
            let text = label;
            const maxW = n.r * 2.6;
            while (text.length > 3 && ctx.measureText(text).width > maxW) text = `${text.slice(0, -2)}…`;
            ctx.fillText(text, n.x, n.y + n.r + fs + 3);
            ctx.textAlign = "start";
          }
        }
      }

      // ── 世代ラベル（左端）──
      for (const l of layout.labels) {
        ctx.font = `bold ${Math.max(9, Math.min(11, W * 0.018))}px sans-serif`;
        const fs = Math.max(9, Math.min(11, W * 0.018));
        const m = ctx.measureText(l.text);
        const tw = m.width + 12;
        const th = fs + 7;
        ctx.fillStyle = lbg;
        ctx.beginPath();
        ctx.roundRect(l.x - 4, l.y - th / 2, tw, th, 5);
        ctx.fill();
        ctx.fillStyle = sub;
        ctx.fillText(l.text, l.x + 2, l.y + fs / 2 - 1);
      }

      if (!cancelled) setCaptureReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [size, tree, self, locale]);

  return (
    <div ref={wrapRef} className="relative w-full" data-circle-capture-ready={captureReady ? "true" : "false"}>
      <canvas
        ref={canvasRef}
        data-family-capture-canvas="true"
        className="block w-full"
        role="img"
        aria-label={`${self.screenName} の家族ツリー`}
        style={{ height: size.height || 600 }}
      />
    </div>
  );
}
