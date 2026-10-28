"use client";

import { useState } from "react";

/**
 * Twemoji の SVG を配信している CDN。
 * （Twitter 本家の maxcdn は終了しているので、メンテナンスが続いている fork を使う）
 */
const BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg";

/** 絵文字をコードポイント列に分解する（異体字セレクタはファイル名に含めない）。 */
function codepoints(emoji: string): string[] {
  const out: string[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp === undefined || cp === 0xfe0f) continue;
    out.push(cp.toString(16));
  }
  return out;
}

/** 404 になりうる表記を順に返す（Twemoji の命名規則に合わせる）。 */
function candidates(emoji: string): string[] {
  const cps = codepoints(emoji);
  if (cps.length === 0) return [];
  const urls = [`${BASE}/${cps.join("-")}.svg`];
  if (cps.length > 1) {
    // ❤️‍🔥 のように「テキスト既定の字形 + ZWJ」は FE0F を挟まないとファイルが無い
    urls.push(`${BASE}/${cps[0]}-fe0f-${cps.slice(1).join("-")}.svg`);
  }
  return urls;
}

/**
 * 絵文字を Twemoji の画像として表示する。
 * 取得できなかった場合は元の文字（OS の絵文字フォント）にフォールバックする。
 */
export function Twemoji({
  emoji,
  className = "h-4 w-4",
}: {
  emoji: string;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const urls = candidates(emoji);

  if (urls.length === 0 || index >= urls.length) {
    return <span className="leading-none">{emoji}</span>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={urls[index]}
      alt={emoji}
      draggable={false}
      loading="lazy"
      decoding="async"
      className={`${className} shrink-0 select-none`}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}
