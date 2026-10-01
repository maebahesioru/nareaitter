import { unstable_cache } from "next/cache";
import {
  aggregateMentionAuthors,
  aggregateMentionTargets,
  buildYahooAuthorProfileImageMap,
  cleanSnippet,
  fetchMentionsBothParallel,
  pickSelfProfileImageFromYahoo,
} from "@/lib/yahoo-realtime-fetch";
import { spriteSliceSig } from "@/lib/sprite-sig";
import { yahooAggregatesToCircleUsers } from "@/lib/yahoo-to-circle";
import { resolveCircleAvatarUrl, resolveProfileData } from "@/lib/x-profile-image";

/** 同一ユーザーの再集計 CPU を抑える（GET の s-maxage=300 と揃える） */
const YAHOO_PAYLOAD_REVALIDATE_SEC = 300;

type CircleUserLite = { avatarUrlPreview?: string | null };

// ── 直近リビジョンの保持（スプライト用） ─────────────
// クライアントは最大5分前のペイロード（CDNキャッシュ）を見ていることがある。
// そのリビジョンのURL列でもスプライトを合成できるよう、直近数回ぶんの
// circleUsers を名前ごとに保持してシグネチャで引けるようにする。

const REV_KEEP_PER_NAME = 4;
const REV_KEEP_GLOBAL = 24;
const REV_TTL_MS = 15 * 60 * 1000;

type RevEntry = { users: CircleUserLite[]; ts: number };
const revCache = new Map<string, RevEntry[]>();

function rememberRevision(name: string, users: CircleUserLite[]): void {
  const key = name.toLowerCase();
  const list = revCache.get(key) ?? [];
  list.unshift({ users, ts: Date.now() });
  revCache.set(key, list.slice(0, REV_KEEP_PER_NAME));

  // 全体上限を超えたら最古を落とす
  let total = 0;
  for (const [, entries] of revCache) total += entries.length;
  if (total > REV_KEEP_GLOBAL) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    let oldestIdx = -1;
    for (const [k, entries] of revCache) {
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].ts < oldestTs) {
          oldestTs = entries[i].ts;
          oldestKey = k;
          oldestIdx = i;
        }
      }
    }
    if (oldestKey) {
      const entries = revCache.get(oldestKey)!;
      entries.splice(oldestIdx, 1);
      if (entries.length === 0) revCache.delete(oldestKey);
    }
  }
}

/** 指定シグネチャに一致するリビジョンのスライスを探す（新しい順） */
export function findCircleUsersForSig(
  name: string,
  from: number,
  count: number,
  sig: string,
): CircleUserLite[] | null {
  const entries = revCache.get(name.toLowerCase()) ?? [];
  const now = Date.now();
  for (const e of entries) {
    if (now - e.ts > REV_TTL_MS) continue;
    const slice = e.users.slice(from, from + count);
    if (slice.length > 0 && spriteSliceSig(slice) === sig) return slice;
  }
  return null;
}

/**
 * なれあいサークルのペイロードを構築する。
 * yahoo-mentions ルートと avatar-sprite ルートの両方から使う。
 */
export async function buildYahooPayload(
  name: string,
  buildCircle: boolean,
): Promise<Record<string, unknown>> {
  const T0 = Date.now();
  const { mentionsToYou, mentionsFromYou } = await fetchMentionsBothParallel(name);
  if (buildCircle) {
    console.log(
      `[payload] ${name} yahoo=${Date.now() - T0}ms to=${mentionsToYou.length} from=${mentionsFromYou.length}`,
    );
  }

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
    const T1 = Date.now();
    // 自分の最近の投稿（診断プロンプトの文脈用・最新8件）
    const selfRecent = [...mentionsFromYou]
      .sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0))
      .slice(0, 8)
      .map((e) => cleanSnippet(e.displayText, 100))
      .filter((t): t is string => Boolean(t));
    if (selfRecent.length) payload.recentSelfTweets = selfRecent;
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
    console.log(
      `[payload] ${name} circle=${Date.now() - T1}ms users=${circleUsers.length} total=${Date.now() - T0}ms`,
    );
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

  if (buildCircle && Array.isArray(payload.circleUsers)) {
    rememberRevision(name, payload.circleUsers as CircleUserLite[]);
  }

  return payload;
}

function getCachedYahooPayload(name: string, buildCircle: boolean) {
  return unstable_cache(
    () => buildYahooPayload(name, buildCircle),
    [
      "yahoo-mentions-v4",
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
/**
 * ビルドの上限時間。超えたら「失敗」扱いで pending を捨てる。
 * これがないと、実行時間リミット等で resolve も reject もされないビルドの promise が
 * pending に残り、以後の全リクエストがそれを待ち続けて永久ハングする（実測 2026-10-01）。
 */
const MEM_BUILD_TIMEOUT_MS = 90_000;

function withBuildTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("payload build timeout")),
      MEM_BUILD_TIMEOUT_MS,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

type MemEntry = {
  payload?: Record<string, unknown>;
  ts: number;
  pending?: Promise<Record<string, unknown>>;
  cooldownUntil?: number;
};

const memCache = new Map<string, MemEntry>();

export type ServeMode = "fresh" | "swr" | "build";

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
      : entry.pending.then((payload) => ({ payload, mode: "build" as const }));
  }

  const pending = withBuildTimeout(build()).then(
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
    : pending.then((payload) => ({ payload, mode: "build" as const }));
}

export function getServedYahooPayload(name: string, buildCircle: boolean) {
  const key = `${name.toLowerCase()}:${buildCircle ? "circle" : "counts"}`;
  return serveWithSWR(key, () => getCachedYahooPayload(name, buildCircle));
}
