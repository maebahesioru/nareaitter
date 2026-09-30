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
import { resolveCircleAvatarUrl, resolveProfileData } from "@/lib/x-profile-image";

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
  };

  // aggregates はクライアント未使用のため通常レスポンスには含めない（ペイロード削減）
  if (!buildCircle) {
    payload.aggregates = {
      authorsToYou,
      targetsFromYou,
    };
  }

  if (buildCircle) {
    const yahooPeerImages = buildYahooAuthorProfileImageMap(mentionsToYou);
    const selfYahoo = pickSelfProfileImageFromYahoo(mentionsFromYou);
    const [circleUsers, selfHd, profileData] = await Promise.all([
      yahooAggregatesToCircleUsers(
        authorsToYou,
        targetsFromYou,
        name,
        yahooPeerImages,
      ),
      resolveCircleAvatarUrl(name),
      resolveProfileData(name),
    ]);
    payload.circleUsers = circleUsers;
    if (selfHd?.trim()) payload.selfAvatarUrl = selfHd.trim();
    if (selfYahoo) payload.selfAvatarUrlPreview = selfYahoo;
    if (profileData) {
      payload.profileFollowers = profileData.followers;
      payload.profileFollowing = profileData.following;
      payload.profileTweets = profileData.tweets;
      payload.profileLikes = profileData.likes;
      payload.profileJoinedAt = profileData.joinedAt;
    }
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

// ── メモリSWR層 ─────────────────────────────────
// unstable_cache は期限切れ後の「最初の1人」に再構築コスト(3〜5秒)を払わせる。
// 薄いSWRキャッシュを上に置き、古いコピーを即返しつつ裏で再構築する。
// → 2回目以降の同一ユーザーは実質いつでも即応答（再構築はユーザーを待たせない）

/** これ以内なら「新鮮」としてそのまま返す */
const MEM_FRESH_MS = 180_000;
/** 裏での再構築が失敗したらこの間は再試行しない */
const MEM_FAIL_RETRY_MS = 60_000;
/** 保持件数（1件最大 ~450KB なので控えめに） */
const MEM_MAX = 64;

type MemEntry = {
  payload?: Record<string, unknown>;
  ts: number;
  pending?: Promise<Record<string, unknown>>;
  cooldownUntil?: number;
};

const memCache = new Map<string, MemEntry>();

type ServeMode = "fresh" | "swr" | "build";

function serveWithSWR(
  key: string,
  build: () => Promise<Record<string, unknown>>,
): Promise<{ payload: Record<string, unknown>; mode: ServeMode }> {
  const now = Date.now();
  const entry = memCache.get(key);

  if (entry?.payload && now - entry.ts <= MEM_FRESH_MS) {
    return Promise.resolve({ payload: entry.payload, mode: "fresh" });
  }

  if (entry?.payload && entry.cooldownUntil && now < entry.cooldownUntil) {
    return Promise.resolve({ payload: entry.payload, mode: "swr" });
  }

  if (entry?.pending) {
    // 再構築中: 古いコピーがあれば即返し（SWR）、なければ完了を待つ
    return entry.payload
      ? Promise.resolve({ payload: entry.payload, mode: "swr" })
      : entry.pending.then((payload) => ({ payload, mode: "build" }));
  }

  const pending = build().then(
    (payload) => {
      if (memCache.size >= MEM_MAX) {
        let oldestKey: string | null = null;
        let oldestTs = Infinity;
        for (const [k, v] of memCache) {
          if (v.ts < oldestTs) {
            oldestTs = v.ts;
            oldestKey = k;
          }
        }
        if (oldestKey) memCache.delete(oldestKey);
      }
      memCache.set(key, { payload, ts: Date.now() });
      return payload;
    },
    (err: unknown) => {
      if (entry?.payload) {
        memCache.set(key, {
          payload: entry.payload,
          ts: entry.ts,
          cooldownUntil: Date.now() + MEM_FAIL_RETRY_MS,
        });
      } else {
        memCache.delete(key);
      }
      throw err;
    },
  );

  memCache.set(key, { payload: entry?.payload, ts: entry?.ts ?? 0, pending });

  // 裏で走る再構築が失敗しても unhandledRejection にしない（cooldownで再試行管理）
  void pending.catch(() => {});

  return entry?.payload
    ? Promise.resolve({ payload: entry.payload, mode: "swr" })
    : pending.then((payload) => ({ payload, mode: "build" }));
}

function getServedYahooPayload(name: string, buildCircle: boolean) {
  const key = `${name.toLowerCase()}:${buildCircle ? "circle" : "counts"}`;
  return serveWithSWR(key, () => getCachedYahooPayload(name, buildCircle));
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
