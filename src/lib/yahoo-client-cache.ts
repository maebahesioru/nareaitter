import type { CircleUser } from "@/types/circle";

/** セッション内で同一ユーザーの再 fetch を減らし Function Invocations を抑える */
const KEY_PREFIX = "nareai-yahoo-v14:";
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
    breadthTo?: number[];
    breadthFrom?: number[];
    maxSilenceDays?: number;
    avgPostPerDay?: number;
    tone?: { thanks?: number; love?: number; tired?: number; gloomy?: number };
    receivedBlocks?: number[];
    sentBlocks?: number[];
    revivalText?: string;
    revivalAt?: number;
    burstEpisodes?: number;
    peakDay?: { date: string; n: number };
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
  recentNewConn?: Array<{ screenName: string; displayName?: string; daysAgo?: number }>;
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
  const key = KEY_PREFIX + screenName.toLowerCase();
  const save = () =>
    sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  try {
    save();
    return;
  } catch {
    /* 容量超過 → 古いエントリを捨てて再試行（特大サークルは1件が大きい） */
  }
  try {
    const others: Array<[string, number]> = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || k === key || !k.startsWith(KEY_PREFIX)) continue;
      let t = 0;
      try {
        t =
          (JSON.parse(sessionStorage.getItem(k) ?? "{}") as { t?: number }).t ??
          0;
      } catch {
        /* t 不明は最古扱い */
      }
      others.push([k, t]);
    }
    others.sort((a, b) => a[1] - b[1]);
    for (const [k] of others.slice(0, 3)) sessionStorage.removeItem(k);
    try {
      save();
      return;
    } catch {
      for (const [k] of others) sessionStorage.removeItem(k);
      save();
    }
  } catch {
    /* 諦める（プライベートモード等） */
  }
}
