function cssRemPx(): number {
  if (typeof document === "undefined") return 16;
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function cssVwPx(): number {
  if (typeof window === "undefined") return 4;
  return window.innerWidth / 100;
}

/** Tailwind の clamp(amin rem, b vw, c rem) に相当 */
function clampRemVwRem(
  minRem: number,
  vwCoeff: number,
  maxRem: number,
): number {
  const rem = cssRemPx();
  const vw = cssVwPx();
  return Math.min(
    Math.max(minRem * rem, vwCoeff * vw),
    maxRem * rem,
  );
}

/** 周りアバター径の基準倍率（旧リング帯は廃止済み） */
const PEER_AVATAR_BASE_SCALE = 0.8;

/** 中央の自分アバター直径（px）— InteractionCircle の clamp に合わせる */
export function selfAvatarDiameterPx(): number {
  return clampRemVwRem(4.5, 17, 6.5);
}

/** 周りのアバター直径（px）。`avatarScaleFactor` はスコア由来のみ */
export function peerAvatarDiameterPx(avatarScaleFactor: number): number {
  const scale = PEER_AVATAR_BASE_SCALE * avatarScaleFactor;
  const base = clampRemVwRem(2.9, 11, 4.45);
  return scale * base;
}
