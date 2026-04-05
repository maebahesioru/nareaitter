import { toPng } from "html-to-image";

function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  return Promise.all(
    imgs.map(
      (img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              const done = () => resolve();
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
            }),
    ),
  ).then(() => undefined);
}

async function waitForCircleCanvasReady(root: HTMLElement): Promise<void> {
  if (!root.querySelector("canvas")) return;
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (root.querySelector("[data-circle-capture-ready='true']")) return;
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
  }
}

function tryExportCircleCanvasDirect(el: HTMLElement): string | null {
  /**
   * キャプチャ枠に「@…の馴れ合い表」や注記の <p> があるときは canvas だけだとそれらが含まれない。
   * その場合は html-to-image で el 全体を撮る必要がある。
   */
  if (el.querySelector(":scope > p")) return null;

  const canvas = el.querySelector(
    "canvas[data-circle-export-canvas]",
  ) as HTMLCanvasElement | null;
  if (!canvas || canvas.width < 16 || canvas.height < 16) return null;
  try {
    /** 既に DPR 込みで描画済みのバッファをそのまま出す（html-to-image より大幅に速い） */
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** サークル表示ブロックを PNG（data URL）にする。可能なら canvas 直出力、否则 html-to-image */
export async function captureCircleElementToPngDataUrl(
  el: HTMLElement,
  isLight: boolean,
): Promise<string> {
  await waitForImages(el);
  await waitForCircleCanvasReady(el);
  await new Promise<void>((r) => {
    requestAnimationFrame(() => requestAnimationFrame(() => r()));
  });

  const direct = tryExportCircleCanvasDirect(el);
  if (direct) return direct;

  const baseOpts = {
    /** 既に load 済みなら再取得を避けてキャプチャを速くする */
    cacheBust: false,
    backgroundColor: isLight ? "#fafafa" : "#09090b",
    skipFonts: true,
    filter: (node: Node) =>
      node instanceof Element
        ? node.closest("[data-exclude-from-capture]") === null
        : true,
  } as const;

  const dpr =
    typeof window !== "undefined" ? window.devicePixelRatio || 1.5 : 1.5;
  /** 画質と速度のバランス（以前よりやや抑えめ） */
  const pixelRatio = Math.min(2, Math.max(1.25, Math.min(dpr, 2)));

  try {
    return await toPng(el, {
      ...baseOpts,
      pixelRatio,
    });
  } catch {
    return await toPng(el, {
      ...baseOpts,
      pixelRatio: 1.25,
    });
  }
}

export async function dataUrlToPngFile(
  dataUrl: string,
  filename: string,
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename.endsWith(".png") ? filename : `${filename}.png`, {
    type: "image/png",
  });
}

/**
 * 「画像を保存」専用。共有シート（Web Share API）は使わず、常に Blob URL + `a[download]`。
 * （共有ボタンと挙動を分ける。iOS ではタブ表示になることもあるが、シェア UI は出さない。）
 */
export async function savePngDataUrlToDevice(
  dataUrl: string,
  filename: string,
): Promise<void> {
  const name = filename.endsWith(".png") ? filename : `${filename}.png`;
  const file = await dataUrlToPngFile(dataUrl, name);

  const blobUrl = URL.createObjectURL(file);
  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    a.style.display = "none";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  }
}
