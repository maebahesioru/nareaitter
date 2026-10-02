import { unstable_cache } from "next/cache";
import {
  aggregateMentionAuthors,
  aggregateMentionTargets,
  buildYahooAuthorProfileImageMap,
  cleanSnippet,
  extractEmojis,
  fetchMentionsBothParallel,
  fetchSelfRecentTweets,
  pickSelfProfileImageFromYahoo,
} from "@/lib/yahoo-realtime-fetch";
import { fetchUserBio } from "@/lib/x-profile-image";

/** 頻出フレーズ抽出（日本語連続文字のn-gram・長さ重み付け＋部分重複排除） */
function topPhrases(texts: string[], k = 6): string[] {
  const counts = new Map<string, number>();
  for (const tx of texts) {
    const runs = (tx ?? "").match(/[\u3041-\u30FF\u4E00-\u9FFF]{2,}/g) ?? [];
    for (const run of runs) {
      for (let n = 2; n <= Math.min(5, run.length); n++) {
        for (let i = 0; i + n <= run.length; i++) {
          const g = run.slice(i, i + n);
          counts.set(g, (counts.get(g) ?? 0) + 1);
        }
      }
    }
  }
  const cands = [...counts.entries()].filter(([, cnt]) => cnt >= 6);
  cands.sort((a, b) => b[1] * Math.pow(b[0].length, 1.6) - a[1] * Math.pow(a[0].length, 1.6));
  const windows = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i + 3 <= s.length; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const out: string[] = [];
  const outWins: Set<string>[] = [];
  for (const [g] of cands) {
    if (out.length >= k) break;
    if (out.some((o) => o.includes(g) || g.includes(o))) continue;
    const gw = windows(g);
    const frag = outWins.some((ow) => {
      let shared = 0;
      for (const w of gw) if (ow.has(w)) shared += 1;
      return shared / Math.max(1, Math.min(gw.size, ow.size)) >= 0.5;
    });
    if (frag) continue;
    out.push(g);
    outWins.push(gw);
  }
  return out;
}

/** 週次バケット（index0=4週前 〜 index4=直近7日） */
function weeklyBuckets(entries: { createdAt?: number }[], nowSec: number): number[] {
  const w = [0, 0, 0, 0, 0];
  for (const e of entries) {
    const t = e.createdAt ?? 0;
    if (t <= 0) continue;
    const age = nowSec - t;
    if (age < 0 || age >= 35 * 86400) continue;
    const idx = 4 - Math.min(4, Math.floor(age / (7 * 86400)));
    w[idx] += 1;
  }
  return w;
}
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
    // 自分の最近の投稿（メンション無しも含む・診断の文脈用）と活動統計
    const selfTimeline = await fetchSelfRecentTweets(name, 12);
    if (selfTimeline.length) {
      payload.recentSelfTweets = selfTimeline.map((t) =>
        t.hasMention ? t.text : `${t.text}`,
      );
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const hours = new Array<number>(24).fill(0);
    for (const e of mentionsFromYou) {
      if (typeof e.createdAt === "number" && e.createdAt > 0) {
        const h = new Date(e.createdAt * 1000).getHours();
        hours[h] += 1;
      }
    }
    const topHours = hours
      .map((cnt, h) => ({ h, cnt }))
      .filter((x) => x.cnt > 0)
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 3)
      .map((x) => x.h);
    const fromYou7d = mentionsFromYou.filter(
      (e) => (e.createdAt ?? 0) >= nowSec - 7 * 86400,
    ).length;
    const toYou7d = mentionsToYou.filter(
      (e) => (e.createdAt ?? 0) >= nowSec - 7 * 86400,
    ).length;
    // 週次トレンド・投稿間隔・曜日・頻出ワード
    const weeklyTo = weeklyBuckets(mentionsToYou, nowSec);
    const weeklyFrom = weeklyBuckets(mentionsFromYou, nowSec);
    const tsSorted = mentionsFromYou
      .map((e) => e.createdAt ?? 0)
      .filter((t) => t > 0)
      .sort((a, b) => a - b);
    let postGapMin: number | undefined;
    if (tsSorted.length >= 5) {
      const gaps: number[] = [];
      for (let i = 1; i < tsSorted.length; i++) {
        const g = tsSorted[i] - tsSorted[i - 1];
        if (g > 60) gaps.push(g); // 1分未満の連投は除外
      }
      if (gaps.length) {
        gaps.sort((a, b) => a - b);
        postGapMin = Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)] / 60));
      }
    }
    const wd = new Array<number>(7).fill(0);
    for (const t of tsSorted) wd[new Date(t * 1000).getDay()] += 1;
    const wdTotal = wd.reduce((a, b) => a + b, 0);
    let weekdayType: string | undefined;
    if (wdTotal >= 10) {
      const weekend = wd[0] + wd[6];
      const weekendRatio = weekend / wdTotal;
      weekdayType = weekendRatio >= 0.4 ? "土日型" : weekendRatio <= 0.18 ? "平日型" : "満遍なく";
    }
    const fromYouTexts = mentionsFromYou.map((e) => e.displayText ?? "");
    const toYouTexts = mentionsToYou.map((e) => e.displayText ?? "");
    // 自分の文体プロファイル
    const selfTextsClean = fromYouTexts.map((t) => t.replace(/https?:\/\/\S+/g, "").trim()).filter(Boolean);
    let selfStyle: Record<string, unknown> | undefined;
    if (selfTextsClean.length >= 5) {
      const n = selfTextsClean.length;
      const avgLen = Math.round(selfTextsClean.reduce((s, t) => s + t.length, 0) / n);
      const keigoN = selfTextsClean.filter((t) => /(です|ます|でした|ません|ください)/.test(t)).length;
      const exN = selfTextsClean.filter((t) => /[！!]/.test(t)).length;
      let sw = 0;
      let swarau = 0;
      let skusa = 0;
      for (const t of selfTextsClean) {
        sw += (t.match(/[wｗ]{2,}/g) ?? []).length;
        swarau += (t.match(/笑/g) ?? []).length;
        skusa += (t.match(/草/g) ?? []).length;
      }
      const lmax = Math.max(sw, swarau, skusa);
      const laugh = lmax >= 3 ? (lmax === sw ? "ｗ派" : lmax === swarau ? "笑派" : "草派") : undefined;
      // 連続投稿日数
      const daySet = new Set(tsSorted.map((t) => new Date(t * 1000).toDateString()));
      let streakDays = 0;
      const startOffset = daySet.has(new Date().toDateString()) ? 0 : 1;
      for (let i = startOffset; i < 400; i++) {
        const d = new Date(Date.now() - i * 86400000);
        if (daySet.has(d.toDateString())) streakDays += 1;
        else break;
      }
      selfStyle = {
        avgLen,
        keigoRate: Math.round((keigoN / n) * 100),
        exclaimRate: Math.round((exN / n) * 100),
        laugh,
        streakDays,
      };
    }
    if (selfStyle) payload.selfStyle = selfStyle;
    // 界隈からの呼ばれ方
    const vociGlobal = new Map<string, number>();
    for (const t of toYouTexts) {
      for (const m of t.matchAll(/([^\s@＠。、！？!?…「」]{2,8})(さん|ちゃん|くん|君|氏|たん|りん|殿)/gu)) {
        const v = m[1] + m[2];
        vociGlobal.set(v, (vociGlobal.get(v) ?? 0) + 1);
      }
    }
    const selfVocatives = [...vociGlobal.entries()].filter(([, cnt]) => cnt >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => v);
    if (selfVocatives.length) payload.selfVocatives = selfVocatives;
    payload.selfActivity = {
      topHours,
      fromYou7d,
      toYou7d,
      weeklyTo,
      weeklyFrom,
      postGapMin,
      weekdayType,
      words: topPhrases(fromYouTexts),
    };
    const communityWords = topPhrases(toYouTexts);
    if (communityWords.length) payload.communityWords = communityWords;
    // 自分のよく使う絵文字
    const selfEmojiCounts = new Map<string, number>();
    for (const e of mentionsFromYou) {
      for (const ch of extractEmojis(e.displayText ?? "")) {
        selfEmojiCounts.set(ch, (selfEmojiCounts.get(ch) ?? 0) + 1);
      }
    }
    const selfEmojis = [...selfEmojiCounts.entries()]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([e]) => e);
    if (selfEmojis.length) payload.selfEmojis = selfEmojis;
    // 最近届いたメンション（全体の最新3件）
    payload.recentMentionsToYou = [...mentionsToYou]
      .sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0))
      .slice(0, 3)
      .map((e) => ({
        from: e.screenName ?? "",
        text: cleanSnippet(e.displayText, 100) ?? "",
        at: e.createdAt ?? 0,
      }))
      .filter((x) => x.from && x.text);
    // 自分が最もメンションした相手トップ3
    payload.topSentTargets = Object.entries(targetsFromYou)
      .sort((a, b) => (b[1]?.n ?? 0) - (a[1]?.n ?? 0))
      .slice(0, 3)
      .map(([sn, agg]) => ({ screenName: sn, displayName: agg?.name, n: agg?.n ?? 0 }));
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
    // 上位8人のプロフィール文（bio）を取得して添付
    await Promise.all(
      circleUsers.slice(0, 8).map(async (u) => {
        const bio = await fetchUserBio(u.screenName);
        if (bio) (u as { bio?: string }).bio = bio;
      }),
    );
    payload.circleUsers = circleUsers;
    // 界隈の出入り（直近14日）
    const nowMs = Date.now();
    const d14 = 14 * 86400 * 1000;
    const newConn14d = circleUsers.filter((u) => {
      const f = u.firstInteractionAt ? Date.parse(u.firstInteractionAt) : NaN;
      return Number.isFinite(f) && nowMs - f <= d14;
    }).length;
    const dormant14d = circleUsers.filter((u) => {
      const l = u.lastInteractionAt ? Date.parse(u.lastInteractionAt) : NaN;
      return Number.isFinite(l) && nowMs - l > d14;
    }).length;
    (payload.selfActivity as Record<string, unknown>).newConn14d = newConn14d;
    (payload.selfActivity as Record<string, unknown>).dormant14d = dormant14d;
    if (selfHd?.trim()) payload.selfAvatarUrl = selfHd.trim();
    if (selfYahoo) payload.selfAvatarUrlPreview = selfYahoo;
    if (profileData) {
      payload.profileFollowers = profileData.followers;
      payload.profileFollowing = profileData.following;
      payload.profileTweets = profileData.tweets;
      payload.profileLikes = profileData.likes;
      payload.profileJoinedAt = profileData.joinedAt;
      if (profileData.description) payload.profileDescription = profileData.description;
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
      "yahoo-mentions-v12",
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
