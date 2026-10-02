"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { proxiedImageSrc } from "@/lib/proxied-image-src";
import type { CircleUser, SelfProfile, FamilyTreeNode } from "@/types/circle";
import {
  buildFamilyTree,
  getRelationLabel,
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
// 世代ごとの行。子のクラスタは親の真下にぶら下がる（ハンギング配置）。
// 親子線は「親の中点から縦 → 対象の範囲だけ横 → 各子へ縦」のエルボー。
// 行全体を横断するバスは使わない。

type TItem =
  | { kind: "single"; node: FamilyTreeNode; tier: ExtendedRelationType }
  | { kind: "couple"; nodes: [FamilyTreeNode, FamilyTreeNode]; tier: ExtendedRelationType }
  | { kind: "selfCouple"; spouse?: FamilyTreeNode };

type PlacedItem = {
  midX: number;
  startY: number; // 降下線の始点（夫婦=婚姻線の高さ、単独=円の下端）
  topY: number;
  side: "single" | "couple";
  /** 名前ラベルのスタッガー段（0 or 1）。線のノックアウトに使う */
  nameShift: 0 | 1;
  tier?: ExtendedRelationType;
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

type TNode = { node: FamilyTreeNode; x: number; y: number; r: number; isSelf?: boolean; inCouple?: boolean };
type Couple = { x1: number; x2: number; y: number };
type Conn = {
  sX: number;
  sY: number;
  sSide: "single" | "couple";
  sShift: 0 | 1;
  busY: number;
  x1: number;
  x2: number;
  lane: 0 | 1;
  drops: { x: number; y1: number; y2: number }[];
};
type Label = { x: number; y: number; text: string };

type Layout = {
  rows: PlacedRow[];
  conns: Conn[];
  labels: Label[];
  height: number;
};

const GAP_U = 1.1;   // 単独同士の間隔（r単位）
const CGAP_U = 0.5;  // 夫婦内の間隔（狭くして「夫婦」を区別）

/** T 個のターゲットを N 個のソースへ順番に割り当てる（[t0,t1)・空区間はスキップ） */
function subranges(T: number, N: number): Array<[number, number] | null> {
  const out: Array<[number, number] | null> = [];
  for (let i = 0; i < N; i++) {
    const t0 = Math.floor((i * T) / N);
    const t1 = Math.floor(((i + 1) * T) / N);
    out.push(t1 <= t0 ? null : [t0, Math.min(t1, T)]);
  }
  return out;
}

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
  const gp = ex.grandparent ?? [];
  const parents = ex.parent ?? [];
  const uncles = ex.uncle ?? [];
  const cousins = ex.cousin ?? [];
  const sibs = ex.sibling ?? [];
  const spouse = (ex.spouse ?? [])[0];
  const nephews = ex.nephew ?? [];
  const children = ex.child ?? [];
  const gc = ex.grandchild ?? [];
  const ggc = ex.greatGrandchild ?? [];

  if (ggp.length) rowsSpec.push({ tier: "greatGrandparent", label: getRelationLabel("greatGrandparent", locale), items: asCoupleOrSingles(ggp, "greatGrandparent") });
  if (gp.length) rowsSpec.push({ tier: "grandparent", label: getRelationLabel("grandparent", locale), items: asCoupleOrSingles(gp, "grandparent") });

  // 親世代: 叔父は左（いとこが自分の行の左に居るため）、両親は右
  const parentItems: TItem[] = [];
  if (uncles[0]) parentItems.push({ kind: "single", node: uncles[0], tier: "uncle" });
  if (uncles[1]) parentItems.push({ kind: "single", node: uncles[1], tier: "uncle" });
  if (parents.length === 2) parentItems.push({ kind: "couple", nodes: [parents[0], parents[1]], tier: "parent" });
  else if (parents.length === 1) parentItems.push({ kind: "single", node: parents[0], tier: "parent" });
  if (parentItems.length) rowsSpec.push({ tier: "parent", label: getRelationLabel("parent", locale), items: parentItems });

  const selfItems: TItem[] = [
    ...cousins.map((n) => ({ kind: "single" as const, node: n, tier: "cousin" as const })),
    ...sibs.map((n) => ({ kind: "single" as const, node: n, tier: "sibling" as const })),
    { kind: "selfCouple" as const, spouse },
  ];
  const selfRowLabel = sibs.length ? getRelationLabel("sibling", locale) : cousins.length ? getRelationLabel("cousin", locale) : getRelationLabel("self", locale);
  rowsSpec.push({ tier: "selfRow", label: selfRowLabel, items: selfItems });

  const childItems: TItem[] = [
    ...nephews.map((n) => ({ kind: "single" as const, node: n, tier: "nephew" as const })),
    ...children.map((n) => ({ kind: "single" as const, node: n, tier: "child" as const })),
  ];
  if (childItems.length) rowsSpec.push({ tier: "child", label: getRelationLabel(children.length ? "child" : "nephew", locale), items: childItems });

  if (gc.length) rowsSpec.push({ tier: "grandchild", label: getRelationLabel("grandchild", locale), items: gc.map((n) => ({ kind: "single" as const, node: n, tier: "grandchild" as const })) });
  if (ggc.length) rowsSpec.push({ tier: "greatGrandchild", label: getRelationLabel("greatGrandchild", locale), items: ggc.map((n) => ({ kind: "single" as const, node: n, tier: "greatGrandchild" as const })) });

  // ── 2) 半径（実占有幅ベースで全行が収まるよう決定） ─────
  const spanUnitsOf = (items: TItem[]): number => {
    let u = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const width = it.kind === "single" ? 2 : 4 + CGAP_U;
      u += width + (i < items.length - 1 ? GAP_U : 0);
    }
    return u;
  };
  let r = 26;
  for (const spec of rowsSpec) {
    const spanU = spanUnitsOf(spec.items);
    if (spanU > 0) r = Math.min(r, (w - M * 2) / spanU);
  }
  r = Math.max(10.5, Math.min(26, r));
  const gap = r * GAP_U;
  const coupleGap = r * CGAP_U;
  const nameFs = Math.max(8, Math.min(11, r * 0.44));
  const rowStep = r * 2 + nameFs + r * 2.6;

  const widthOf = (it: TItem): number => (it.kind === "single" ? 2 * r : 4 * r + coupleGap);

  // ── 3) 配置（ハンギング） ─────────────────────
  const rows: PlacedRow[] = [];
  const couples: Couple[] = [];
  const labels: Label[] = [];
  const placedByTier = new Map<string, PlacedItem[]>();
  let y = M + r + 20;

  const packRow = (items: TItem[], desired?: number[]): number[] => {
    const widths = items.map(widthOf);
    const lefts: number[] = [];
    let x = M;
    for (let i = 0; i < items.length; i++) {
      const want = desired && Number.isFinite(desired[i]) ? desired[i] - widths[i] / 2 : x;
      const left = Math.max(x, want);
      lefts.push(left);
      x = left + widths[i] + gap;
    }
    const end = lefts.length ? lefts[lefts.length - 1] + widths[widths.length - 1] : M;
    if (end > w - M) {
      const shift = end - (w - M);
      const newStart = lefts[0] - shift;
      if (newStart >= M - 0.5) {
        for (let i = 0; i < lefts.length; i++) lefts[i] -= shift;
      } else {
        // 均等配置フォールバック
        const totalW = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, items.length - 1);
        let sx = Math.max(M, w / 2 - totalW / 2);
        for (let i = 0; i < items.length; i++) {
          lefts[i] = sx;
          sx += widths[i] + gap;
        }
      }
    }
    return lefts;
  };

  // グループ中央揃え: ソースの真下に「グループ全体」をセンタリングする
  const desiredCenteredFor = (
    widths: number[],
    from: number,
    to: number,
    sources: PlacedItem[] | undefined,
  ): number[] => {
    const out = new Array<number>(to - from).fill(NaN);
    if (!sources || !sources.length || to <= from) return out;
    const T = to - from;
    const subs = subranges(T, sources.length);
    subs.forEach((sr, i) => {
      if (!sr) return;
      const [a, b] = sr;
      let gw = 0;
      for (let k = a; k < b; k++) gw += widths[from + k] + (k < b - 1 ? gap : 0);
      let left = sources[i].midX - gw / 2;
      for (let k = a; k < b; k++) {
        out[k] = left + widths[from + k] / 2;
        left += widths[from + k] + gap;
      }
    });
    for (let k = 0; k < T; k++) if (!Number.isFinite(out[k])) out[k] = k > 0 ? out[k - 1] : NaN;
    for (let k = T - 1; k >= 0; k--) if (!Number.isFinite(out[k])) out[k] = k < T - 1 ? out[k + 1] : NaN;
    return out;
  };

  for (let ri = 0; ri < rowsSpec.length; ri++) {
    const spec = rowsSpec[ri];
    const items = spec.items;
    const widths = items.map(widthOf);

    // 希望中心を決める
    let desired: number[] | undefined;
    if (ri === 0) {
      // 先頭行は中央揃えの均等配置
      const totalW = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, items.length - 1);
      let sx = w / 2 - totalW / 2;
      desired = items.map((_, i) => {
        const c = sx + widths[i] / 2;
        sx += widths[i] + gap;
        return c;
      });
    } else if (spec.tier === "selfRow") {
      const uncleSrc = (placedByTier.get("parent") ?? []).filter((it) => it.tier === "uncle");
      const parentSrc = (placedByTier.get("parent") ?? []).filter((it) => it.tier === "parent");
      const dCous = desiredCenteredFor(widths, 0, cousins.length, uncleSrc.length ? uncleSrc : parentSrc.length ? parentSrc : undefined);
      const dRest = desiredCenteredFor(widths, cousins.length, items.length, parentSrc.length ? parentSrc : uncleSrc.length ? uncleSrc : undefined);
      desired = items.map((_, i) => (i < cousins.length ? (dCous[i] ?? NaN) : (dRest[i - cousins.length] ?? NaN)));
      if (!desired.some((v) => Number.isFinite(v))) desired = undefined;
    } else if (spec.tier === "child") {
      const sibSrc = (placedByTier.get("selfRow") ?? []).filter((it) => it.tier === "sibling");
      const selfSrc = (placedByTier.get("selfRow") ?? []).filter((it) => it.tier === "self" || it.tier === "spouse");
      const dNep = desiredCenteredFor(widths, 0, nephews.length, sibSrc.length ? sibSrc : undefined);
      const dCh = desiredCenteredFor(widths, nephews.length, items.length, selfSrc.length ? selfSrc : undefined);
      desired = items.map((_, i) => (i < nephews.length ? (dNep[i] ?? NaN) : (dCh[i - nephews.length] ?? NaN)));
      if (!desired.some((v) => Number.isFinite(v))) desired = undefined;
    } else {
      // ggp→gp→parent→gc→ggc: 直前の行から
      const prev = rows[rows.length - 1];
      desired = desiredCenteredFor(widths, 0, items.length, prev?.items);
    }

    const lefts = packRow(items, desired);

    // 実体化
    const rowNodes: TNode[] = [];
    const rowCouples: Couple[] = [];
    const placed: PlacedItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const left = lefts[i];
      if (it.kind === "single") {
        const cx = left + r;
        const nshift = ((rowNodes.length % 2) as 0 | 1);
        rowNodes.push({ node: it.node, x: cx, y, r });
        placed.push({ midX: cx, startY: y + r, topY: y - r, side: "single", nameShift: nshift, tier: it.tier });
      } else if (it.kind === "couple") {
        const ax = left + r;
        const bx = ax + 2 * r + coupleGap;
        rowNodes.push({ node: it.nodes[0], x: ax, y, r, inCouple: true });
        rowNodes.push({ node: it.nodes[1], x: bx, y, r, inCouple: true });
        rowCouples.push({ x1: ax + r, x2: bx - r, y });
        placed.push({ midX: (ax + bx) / 2, startY: y, topY: y, side: "couple", nameShift: 0, tier: it.tier });
      } else {
        const ax = left + r;
        rowNodes.push({ node: tree.root, x: ax, y, r, isSelf: true, inCouple: !!it.spouse });
        if (it.spouse) {
          const bx = ax + 2 * r + coupleGap;
          rowNodes.push({ node: it.spouse, x: bx, y, r, inCouple: true });
          rowCouples.push({ x1: ax + r, x2: bx - r, y });
          placed.push({ midX: (ax + bx) / 2, startY: y, topY: y, side: "couple", nameShift: 0, tier: "spouse" });
        } else {
          placed.push({ midX: ax, startY: y + r, topY: y - r, side: "single", nameShift: 0, tier: "self" });
        }
      }
    }

    rows.push({ tier: spec.tier, label: spec.label, y, radius: r, items: placed, nodes: rowNodes, couples: rowCouples });
    placedByTier.set(spec.tier, placed);
    for (const c of rowCouples) couples.push(c);
    if (spec.label) labels.push({ x: M, y: y - r - 9 - nameFs / 2, text: spec.label });
    y += rowStep;
  }

  // ── 4) エルボー配線 ──────────────────────────
  const conns: Conn[] = [];

  // lane 0 = 主系統（親→子）、lane 1 = 副系統（叔父→いとこ等）。
  // 行間の上下に分けてレーンを固定し、線の融合を防ぐ。
  const connectMapped = (sources: PlacedItem[], targets: PlacedItem[], lane: 0 | 1 = 0) => {
    if (!sources.length || !targets.length) return;
    const T = targets.length;
    const tTopMin = Math.min(...targets.map((t) => t.topY));
    const sStartMax = Math.max(...sources.map((s) => s.startY));
    const gapH = Math.max(20, tTopMin - sStartMax);
    const busY = sStartMax + gapH * (lane === 0 ? 0.55 : 0.85);
    const subs = subranges(T, sources.length);
    subs.forEach((sr, i) => {
      if (!sr) return;
      const sub = targets.slice(sr[0], sr[1]);
      if (!sub.length) return;
      const s = sources[i];
      const xs = [s.midX, ...sub.map((t) => t.midX)];
      conns.push({
        sX: s.midX,
        sY: s.startY,
        sSide: s.side,
        sShift: s.nameShift,
        busY,
        x1: Math.min(...xs),
        x2: Math.max(...xs),
        lane,
        drops: sub.map((t) => ({ x: t.midX, y1: busY, y2: t.topY })),
      });
    });
  };

  const ggpRow = rows.find((rr) => rr.tier === "greatGrandparent");
  const gpRow = rows.find((rr) => rr.tier === "grandparent");
  const parentRow = rows.find((rr) => rr.tier === "parent");
  const selfRow = rows.find((rr) => rr.tier === "selfRow")!;
  const childRow = rows.find((rr) => rr.tier === "child");
  const gcRow = rows.find((rr) => rr.tier === "grandchild");
  const ggcRow = rows.find((rr) => rr.tier === "greatGrandchild");

  if (ggpRow && gpRow) connectMapped(ggpRow.items, gpRow.items);
  if (gpRow && parentRow) connectMapped(gpRow.items, parentRow.items);

  const parentSrc = parentRow ? parentRow.items.filter((it) => it.tier === "parent") : [];
  const selfTargets = selfRow.items.filter((it) => it.tier === "sibling" || it.tier === "self" || it.tier === "spouse");
  const cousinTargets = selfRow.items.filter((it) => it.tier === "cousin");

  if (parentRow && parentSrc.length) connectMapped(parentSrc, selfTargets);

  if (parentRow && cousinTargets.length) {
    const uncleSrc = parentRow.items.filter((it) => it.tier === "uncle");
    if (uncleSrc.length) connectMapped(uncleSrc, cousinTargets, 1);
  }

  if (childRow) {
    const selfCoupleItem = selfRow.items.filter((it) => it.tier === "self" || it.tier === "spouse");
    const realChildren = childRow.items.filter((it) => it.tier === "child");
    const nephewItems = childRow.items.filter((it) => it.tier === "nephew");
    if (selfCoupleItem.length && realChildren.length) connectMapped(selfCoupleItem, realChildren);
    const sibItems = selfRow.items.filter((it) => it.tier === "sibling");
    if (sibItems.length && nephewItems.length) connectMapped(sibItems, nephewItems, 1);
  }

  if (childRow && gcRow) {
    const realChildren = childRow.items.filter((it) => it.tier === "child");
    if (realChildren.length) connectMapped(realChildren, gcRow.items);
  }
  if (gcRow && ggcRow) connectMapped(gcRow.items, ggcRow.items);

  const lastRowY = y - rowStep;
  const height = Math.max(420, Math.round(lastRowY + r + nameFs * 2.2 + M + 34));

  return { rows, conns, labels, height };
}

export function FamilyTreeCanvas({ self, users }: Props) {
  const { locale } = useLocale();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [captureReady, setCaptureReady] = useState(false);
  // アイコンが解決できないユーザーは自動除外（同ランク帯の次の人が繰り上がる）
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const filterPassesRef = useRef(0);
  const failedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setExcluded(new Set());
    filterPassesRef.current = 0;
    failedRef.current = new Set();
  }, [users]);

  const tree = useMemo(
    () => buildFamilyTree(users.filter((u) => !excluded.has(u.screenName)), self.screenName),
    [users, excluded, self.screenName],
  );

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
      const lc = isDark ? "#71717a" : "#94a3b8";
      const bc = isDark ? "#52525b" : "#cbd5e1";
      const rootRing = isDark ? "#a1a1aa" : "#71717a";
      const mlc = isDark ? "#b0b0ba" : "#64748b";

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const layout = calcLayout(tree, W, locale as "ja" | "en");
      const nameFs = Math.max(8, Math.min(11, (layout.rows[0]?.radius ?? 20) * 0.44));

      // ツリー全体のバウンディングボックスを中央へ寄せる（右偏りの解消）
      const M = 14;
      let minX = Infinity;
      let maxX = -Infinity;
      for (const row of layout.rows) {
        for (const n of row.nodes) {
          minX = Math.min(minX, n.x - n.r);
          maxX = Math.max(maxX, n.x + n.r);
        }
      }
      let treeDx = Number.isFinite(minX) ? W / 2 - (minX + maxX) / 2 : 0;
      treeDx = Math.max(treeDx, M - minX);
      treeDx = Math.min(treeDx, W - M - maxX);
      if (Math.abs(treeDx) < 3) treeDx = 0;
      ctx.save();
      ctx.translate(treeDx, 0);

      // 配線（エルボー）。降下線ソースの単独ノードは名前を右へずらすので、
      // 線はそのまま（途切れさせず）描く。
      const dropSources = new Set<string>();
      for (const c of layout.conns) {
        if (c.sSide === "single") dropSources.add(`${Math.round(c.sX)}@${Math.round(c.sY)}`);
      }
      ctx.strokeStyle = lc;
      ctx.fillStyle = lc;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.75;
      for (const c of layout.conns) {
        ctx.lineWidth = c.lane === 1 ? 1.1 : 1.4;
        ctx.beginPath();
        ctx.moveTo(c.sX, c.sY);
        ctx.lineTo(c.sX, c.busY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c.x1, c.busY);
        ctx.lineTo(c.x2, c.busY);
        ctx.stroke();
        for (const d of c.drops) {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y1);
          ctx.lineTo(d.x, d.y2);
          ctx.stroke();
        }
      }
      // 婚姻線
      for (const row of layout.rows) {
        ctx.strokeStyle = mlc;
        ctx.fillStyle = mlc;
        ctx.lineWidth = 2.6;
        ctx.globalAlpha = 1;
        for (const cp of row.couples) {
          ctx.beginPath();
          ctx.moveTo(cp.x1 + 1, cp.y);
          ctx.lineTo(cp.x2 - 1, cp.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc((cp.x1 + cp.x2) / 2, cp.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = lc;
      ctx.fillStyle = lc;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 1;

      // ノード
      const imgCache = new Map<string, HTMLImageElement | null>();
      // 複数ソースを順に試す: プレビュー → HD → サーバー側フォールバック解決
      const load = async (urls: Array<string | undefined>) => {
        for (const raw of urls) {
          const key = raw?.trim();
          if (!key) continue;
          if (imgCache.has(key)) {
            const hit = imgCache.get(key);
            if (hit) return hit;
            continue;
          }
          try {
            const i = await loadImage(key);
            imgCache.set(key, i);
            return i;
          } catch {
            imgCache.set(key, null);
          }
        }
        return null;
      };

      const nodeResults: [string, "ok" | "fail"][] = [];
      for (const row of layout.rows) {
        let ni = 0;
        for (const n of row.nodes) {
          if (cancelled) return;
          const stagger = n.isSelf ? 0 : ni % 2;
          ni += 1;
          const fallbackUrl = `/api/avatar-fallback?screen=${encodeURIComponent(n.isSelf ? self.screenName : n.node.user.screenName)}`;
          const img = n.isSelf
            ? await load([self.avatarUrlPreview, self.avatarUrl, fallbackUrl])
            : await load([n.node.user.avatarUrlPreview, n.node.user.avatarUrl, fallbackUrl]);
          nodeResults.push([n.isSelf ? "(self)" : n.node.user.screenName, img ? "ok" : "fail"]);
          if (img) drawCropCircle(ctx, img, n.x, n.y, n.r);
          else {
            // 画像が存在しないアカウント: 自動除外のため記録（最終手段で頭文字ディスク）
            if (!n.isSelf) failedRef.current.add(n.node.user.screenName);
            // 「デフォルトアバター」風の色付きディスク + 頭文字
            const pal = isDark
              ? ["#45516e", "#5d4a6e", "#496e52", "#6e5d45", "#6e4a55", "#4a6470"]
              : ["#c7d2e8", "#dbc9e8", "#c9e8d1", "#e8dbc9", "#e8c9d1", "#c9e0e8"];
            const key = n.isSelf ? self.screenName : n.node.user.screenName || "x";
            let hsh = 0;
            for (let ci = 0; ci < key.length; ci++) hsh = (hsh * 31 + key.charCodeAt(ci)) >>> 0;
            ctx.fillStyle = pal[hsh % pal.length];
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
            ctx.fill();
            const nm = (n.isSelf ? self.screenName : n.node.user.displayName || n.node.user.screenName || "?").trim();
            const initial = ([...nm][0] ?? "?").toUpperCase();
            ctx.font = `bold ${Math.max(12, Math.round(n.r * 0.8))}px sans-serif`;
            ctx.fillStyle = isDark ? "rgba(244,244,245,0.92)" : "rgba(39,39,42,0.85)";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(initial, n.x, n.y + n.r * 0.04);
            ctx.textAlign = "start";
            ctx.textBaseline = "alphabetic";
          }
          ctx.strokeStyle = n.isSelf ? rootRing : bc;
          ctx.lineWidth = n.isSelf ? 3 : 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
          ctx.stroke();

          const label = n.isSelf
            ? `@${self.screenName}`
            : (n.node.user.displayName || n.node.user.screenName || "");
          if (label) {
            const fs = n.isSelf ? Math.max(11, Math.min(14, W * 0.024)) : nameFs;
            ctx.font = `${n.isSelf ? "bold " : ""}${fs}px sans-serif`;
            ctx.fillStyle = n.isSelf ? txt : sub;
            const dropsDown = dropSources.has(`${Math.round(n.x)}@${Math.round(n.y + n.r)}`);
            let text = label;
            if (dropsDown) {
              // 降下線と重ならないよう、名前は線の右側へ
              const maxW = n.r * 1.95;
              while (text.length > 3 && ctx.measureText(text).width > maxW) text = `${text.slice(0, -2)}…`;
              ctx.textAlign = "start";
              ctx.fillText(text, n.x + 6, n.y + n.r + fs + 3 + stagger * (fs + 3));
            } else {
              // 夫婦メンバーは中点の降下線に届かない幅に制限
              const maxW = n.inCouple ? n.r * 1.85 : n.r * 2.7;
              while (text.length > 4 && ctx.measureText(text).width > maxW) text = `${text.slice(0, -2)}…`;
              ctx.textAlign = "center";
              ctx.fillText(text, n.x, n.y + n.r + fs + 3 + stagger * (fs + 3));
              ctx.textAlign = "start";
            }
          }
        }
      }

      ctx.restore();

      // 世代ラベル（各行の左上）
      for (const l of layout.labels) {
        const fs = Math.max(9, Math.min(11, W * 0.016));
        ctx.font = `bold ${fs}px sans-serif`;
        const m = ctx.measureText(l.text);
        const tw = m.width + 12;
        const th = fs + 8;
        ctx.fillStyle = lbg;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.roundRect(l.x - 4, l.y - th / 2, tw, th, 5);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = sub;
        ctx.fillText(l.text, l.x + 2, l.y + fs / 2 - 1);
      }

      // 失敗ユーザーがいれば除外して再構築（最大3パスで収束）
      let didExclude = false;
      const failedList = [...failedRef.current];
      if (!cancelled && failedList.length > 0 && filterPassesRef.current < 3) {
        filterPassesRef.current += 1;
        const toExclude = failedList;
        failedRef.current = new Set();
        setExcluded((prev) => {
          const next = new Set(prev);
          for (const s of toExclude) next.add(s);
          return next;
        });
        didExclude = true;
      }
      if (!cancelled && !didExclude) setCaptureReady(true);
      if (!cancelled) {
        const w = window as unknown as Record<string, unknown>;
        const hist = (w.__ftHistory as unknown[]) ?? [];
        hist.push({
          renderExcluded: excluded.size,
          pass: filterPassesRef.current,
          failed: failedList,
          drawn: layout.rows.reduce((s, rr) => s + rr.nodes.length, 0),
          didExclude,
          nodes: nodeResults,
        });
        w.__ftHistory = hist;
        w.__ftDebug = {
          excludedCount: excluded.size,
          passes: filterPassesRef.current,
          failedNow: failedList,
          drawnNodes: layout.rows.reduce((s, rr) => s + rr.nodes.length, 0),
          done: !didExclude,
        };
      }
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
