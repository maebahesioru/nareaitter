import type { CircleUser } from "@/types/circle";

/** セッション内で同一ユーザーの再 fetch を減らし Function Invocations を抑える */
const KEY_PREFIX = "nareai-yahoo-v11:";
/** 鮮度とのトレードオフ。Yahoo の profile 画像 URL（rts-pctr 等）は短時間で失効しやすい */
const TTL_MS = 8 * 60 * 1000;

export type YahooCircleClientCache = {
  screenName: string;
  counts: { mentionsToYou: number; mentionsFromYou: number };
  circleUsers?: CircleUser[];
  recentSelfTweets?: string[];
  selfActivity?: {
    topHours: number[];
    fromYou7d: number;
    toYou7d: number;
    weeklyTo?: number[];
    weeklyFrom?: number[];
    postGapMin?: number;
    weekdayType?: string;
    newConn14d?: number;
    dormant14d?: number;
    words?: string[];
  };
  communityWords?: string[];
  selfStyle?: {
    avgLen?: number;
    keigoRate?: number;
    exclaimRate?: number;
    laugh?: string;
    streakDays?: number;
  };
  selfVocatives?: string[];
  profileDescription?: string;
  selfEmojis?: string[];
  recentMentionsToYou?: Array<{ from: string; text: string; at: number }>;
  topSentTargets?: Array<{ screenName: string; displayName?: string; n: number }>;
  selfAvatarUrl?: string;
  selfAvatarUrlPreview?: string;
  profileFollowers?: number;
  profileFollowing?: number;
  profileTweets?: number;
  profileLikes?: number;
  profileJoinedAt?: string;
};

export function readYahooCircleCache(
  screenName: string,
): YahooCircleClientCache | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + screenName.toLowerCase());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      t: number;
      data: YahooCircleClientCache;
    };
    if (Date.now() - parsed.t > TTL_MS) {
      sessionStorage.removeItem(KEY_PREFIX + screenName.toLowerCase());
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeYahooCircleCache(
  screenName: string,
  data: YahooCircleClientCache,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      KEY_PREFIX + screenName.toLowerCase(),
      JSON.stringify({ t: Date.now(), data }),
    );
  } catch {
    /* 容量超過などは無視 */
  }
}
