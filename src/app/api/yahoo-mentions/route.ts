import { NextRequest, NextResponse } from "next/server";
import { normalizeScreenName } from "@/lib/yahoo-realtime-fetch";
import { getServedYahooPayload } from "@/lib/yahoo-payload-server";

export const maxDuration = 120;

type Body = {
  screenName?: string;
  /** true のときレスポンスに circleUsers を含める */
  buildCircle?: boolean;
};

function parseBuildCircle(searchParams: URLSearchParams, body?: Body): boolean {
  if (body) return body.buildCircle === true;
  const v = searchParams.get("buildCircle");
  if (v === "0" || v === "false") return false;
  return true;
}

function langEn(searchParams: URLSearchParams): boolean {
  return searchParams.get("lang") === "en";
}

/**
 * GET: CDN（s-maxage）で同一クエリの再実行を抑えられる → 負荷削減。
 * POST: 後方互換（キャッシュヘッダなし）。
 * キャッシュ層は yahoo-payload-server（unstable_cache + メモリSWR）。
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const en = langEn(sp);
  const raw = sp.get("screenName") ?? "";
  let name: string;
  try {
    name = normalizeScreenName(raw);
  } catch {
    return NextResponse.json(
      {
        error: en
          ? "Invalid username format."
          : "ユーザー名の形式が正しくありません。",
      },
      { status: 400 },
    );
  }

  if (!name) {
    return NextResponse.json(
      {
        error: en
          ? "Enter a username (e.g. nhk_news)."
          : "ユーザー名を入力してください（例: nhk_news）。",
      },
      { status: 400 },
    );
  }

  const buildCircle = parseBuildCircle(sp);

  try {
    const { payload, mode } = await getServedYahooPayload(name, buildCircle);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=1800, max-age=120",
        "X-Nareai-Cache": mode,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: en
          ? "Could not load data. Please try again later."
          : "取得に失敗しました。しばらくしてからもう一度お試しください。",
      },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "入力を読み取れませんでした。" }, { status: 400 });
  }

  const raw = body.screenName ?? "";
  let name: string;
  try {
    name = normalizeScreenName(raw);
  } catch {
    return NextResponse.json(
      { error: "ユーザー名の形式が正しくありません。" },
      { status: 400 },
    );
  }

  if (!name) {
    return NextResponse.json(
      { error: "ユーザー名を入力してください（例: nhk_news）。" },
      { status: 400 },
    );
  }

  try {
    const { payload, mode } = await getServedYahooPayload(
      name,
      body.buildCircle === true,
    );
    return NextResponse.json(payload, {
      headers: { "X-Nareai-Cache": mode },
    });
  } catch {
    return NextResponse.json(
      { error: "取得に失敗しました。しばらくしてからもう一度お試しください。" },
      { status: 502 },
    );
  }
}
