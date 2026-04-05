import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import {
  aggregateMentionAuthors,
  aggregateMentionTargets,
  buildYahooAuthorProfileImageMap,
  fetchMentionsBothParallel,
  normalizeScreenName,
  pickSelfProfileImageFromYahoo,
} from "@/lib/yahoo-realtime-fetch";
import { yahooAggregatesToCircleUsers } from "@/lib/yahoo-to-circle";
import { resolveCircleAvatarUrl } from "@/lib/x-profile-image";

/** Cloudflare Workers のリクエスト上限に合わせる（Vercel の 300s は使わない） */
export const maxDuration = 120;

/** GET の Cache-Control（s-maxage=300）に合わせ、同一ユーザーの再集計 CPU を抑える */
const YAHOO_PAYLOAD_REVALIDATE_SEC = 300;

type Body = {
  screenName?: string;
  /** true のときレスポンスに circleUsers を含める */
  buildCircle?: boolean;
};

async function buildYahooPayload(
  name: string,
  buildCircle: boolean,
): Promise<Record<string, unknown>> {
  const { mentionsToYou, mentionsFromYou } = await fetchMentionsBothParallel(name);

  const authorsToYou = aggregateMentionAuthors(mentionsToYou);
  const targetsFromYou = aggregateMentionTargets(mentionsFromYou, name);

  const payload: Record<string, unknown> = {
    screenName: name,
    counts: {
      mentionsToYou: mentionsToYou.length,
      mentionsFromYou: mentionsFromYou.length,
    },
    aggregates: {
      authorsToYou,
      targetsFromYou,
    },
  };

  if (buildCircle) {
    const yahooPeerImages = buildYahooAuthorProfileImageMap(mentionsToYou);
    const selfYahoo = pickSelfProfileImageFromYahoo(mentionsFromYou);
    const [circleUsers, selfHd] = await Promise.all([
      yahooAggregatesToCircleUsers(
        authorsToYou,
        targetsFromYou,
        name,
        yahooPeerImages,
      ),
      resolveCircleAvatarUrl(name),
    ]);
    payload.circleUsers = circleUsers;
    if (selfHd?.trim()) payload.selfAvatarUrl = selfHd.trim();
    if (selfYahoo) payload.selfAvatarUrlPreview = selfYahoo;
  }

  return payload;
}

function getCachedYahooPayload(name: string, buildCircle: boolean) {
  return unstable_cache(
    () => buildYahooPayload(name, buildCircle),
    [
      "yahoo-mentions-v1",
      name.toLowerCase(),
      buildCircle ? "circle" : "counts",
    ],
    { revalidate: YAHOO_PAYLOAD_REVALIDATE_SEC },
  )();
}

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
 * GET: CDN（s-maxage）で同一クエリの再実行を抑えられる → Invocations 削減。
 * POST: 後方互換（キャッシュヘッダなし）。
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
    const payload = await getCachedYahooPayload(name, buildCircle);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control":
          "public, s-maxage=300, stale-while-revalidate=1800, max-age=120",
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
    const payload = await getCachedYahooPayload(name, body.buildCircle === true);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "取得に失敗しました。しばらくしてからもう一度お試しください。" },
      { status: 502 },
    );
  }
}
