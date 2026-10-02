import { NextResponse } from "next/server";
import links from "@/data/amazon-links.json";

export const runtime = "nodejs";

type Item = { name: string; url: string; category: string };

const ALL: Item[] = (links as Item[]).filter(
  (x) =>
    x &&
    typeof x.url === "string" &&
    x.url.includes("tag=maebahesioru-22") &&
    typeof x.name === "string" &&
    x.name.trim().length >= 6 &&
    !/^[\d,]+\s*ポイント/.test(x.name.trim()),
);

/** カテゴリ別にまとめる（表示のバリエーション用） */
const BY_CATEGORY = (() => {
  const m = new Map<string, Item[]>();
  for (const it of ALL) {
    const arr = m.get(it.category);
    if (arr) arr.push(it);
    else m.set(it.category, [it]);
  }
  return [...m.entries()];
})();

function pickRandom<T>(arr: T[], k: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < k && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

/** ランダムなおすすめ商品リンク（テキストのみ・画像/価格なし＝規約安全） */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const n = Math.min(12, Math.max(1, Number(url.searchParams.get("n") ?? 5)));

  // カテゴリをシャッフルして、なるべく分野が被らないように選ぶ
  const cats = pickRandom(BY_CATEGORY, Math.min(n, BY_CATEGORY.length));
  const items: Item[] = cats.map(([, arr]) => arr[Math.floor(Math.random() * arr.length)]);
  // カテゴリ数が足りない場合の補充
  if (items.length < n) {
    const rest = pickRandom(ALL, n - items.length);
    items.push(...rest);
  }

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
