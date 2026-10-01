/**
 * スプライトのシグネチャと欠損マスク（クライアント・サーバー共有）
 *
 * - セルURL: プレビュー（Yahoo 48px）優先、無ければHD（pbs）。
 *   プレビューが無いユーザーもスプライトに載せる（個別取得を減らす）。
 * - シグネチャ: スライスのURL列から計算する FNV-1a 32bit ハッシュ。
 *   クライアントが持つデータとサーバーが合成に使ったデータが同一リビジョンかを検証する。
 * - 欠損マスク: スプライト内のセルごとの「合成できなかった（死んだURL等）」ビット。
 *   hex文字列でヘッダに載せる（120セル = 30文字）。
 */

type PreviewLike = { avatarUrlPreview?: string | null; avatarUrl?: string | null };

/** セルに使うURL（プレビュー優先、無ければHD） */
export function spriteCellUrl(user: PreviewLike): string {
  return (user.avatarUrlPreview ?? "").trim() || (user.avatarUrl ?? "").trim();
}

function fnv1a32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** スライス（描画順）のシグネチャ。URL欠落は空文字として扱う */
export function spriteSliceSig(slice: PreviewLike[]): string {
  const joined = slice.map(spriteCellUrl).join("\n");
  return fnv1a32(joined).toString(16).padStart(8, "0");
}

/** 欠損ビット列 → hex（左詰め: index i は byte i>>3 の bit i&7） */
export function deadMaskToHex(dead: boolean[]): string {
  const bytes = new Uint8Array(Math.ceil(dead.length / 8));
  for (let i = 0; i < dead.length; i++) {
    if (dead[i]) bytes[i >> 3] |= 1 << (i & 7);
  }
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** hex → 欠損ビット列（サーバー・クライアント共通の解釈） */
export function hexToDeadMask(hex: string, length: number): boolean[] {
  const dead = new Array<boolean>(length).fill(false);
  for (let i = 0; i < length; i++) {
    const byteIdx = i >> 3;
    const byteHex = hex.slice(byteIdx * 2, byteIdx * 2 + 2);
    if (byteHex.length < 2) continue;
    const b = parseInt(byteHex, 16);
    if (Number.isFinite(b) && (b & (1 << (i & 7))) !== 0) dead[i] = true;
  }
  return dead;
}
