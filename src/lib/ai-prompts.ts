import type { CircleUser } from "@/types/circle";
import { jstDate } from "@/lib/jst";

export type DiagnosisType =
  | "narikiri"
  | "death"
  | "retire"
  | "compatibility"
  | "crush"
  | "stalker";

type PromptDef = {
  id: DiagnosisType;
  title: { ja: string; en: string };
  desc: { ja: string; en: string };
  hints: { ja: string; en: string };
  needsPartner: boolean;
};

export const DIAGNOSIS_DEFS: PromptDef[] = [
  {
    id: "narikiri",
    title: { ja: "なりきりチャット", en: "Roleplay Chat" },
    desc: { ja: "全ツイート＋文脈データから「なりきりプロンプト」を生成。コピーしてAIアプリに貼ると、この人として会話できる", en: "Generate a roleplay prompt from ALL posts + context data. Paste into an AI app and chat as this person" },
    hints: {
      ja: "口調・語彙・絵文字・笑い方・呼称・話題・交流相手をデータから忠実に再現するのが目的。プロフィール・活動統計・交流相手・文体プロファイルの全カラムを根拠に使うこと。",
      en: "Goal: faithfully reproduce tone, vocabulary, emojis, laugh style, nicknames, topics, and partners from the data.",
    },
    needsPartner: false,
  },
  {
    id: "death",
    title: { ja: "死亡時期・死因推測", en: "Death Prediction" },
    desc: { ja: "過去のツイート傾向から死亡時期と死因をAIが推測します", en: "AI predicts death date and cause from tweet patterns" },
    hints: {
      ja: "投稿間隔・活動時間帯・語調や話題の変化・交流相手の入れ替わりを根拠に、このアカウントの『活動が止まる時期』とその理由（＝ネット上の死因）を推測してください。",
      en: "Infer when this account's activity stops and why (the online 'cause of death') from posting gaps, active hours, tone/topic changes, and interaction turnover.",
    },
    needsPartner: false,
  },
  {
    id: "retire",
    title: { ja: "引退時期推測", en: "Retirement Prediction" },
    desc: { ja: "アカウントの活動パターンから引退時期をAIが推測します", en: "AI predicts retirement date from account activity" },
    hints: {
      ja: "直近7日の勢い・投稿ペースの推移・交流の広がり（新しい相手が増えているか）から、界隈からの引退（離脱）時期と引き金を推測してください。",
      en: "Predict the retirement (leaving the community) timing and trigger from the last-7-days momentum, posting pace trend, and whether new connections are still forming.",
    },
    needsPartner: false,
  },
  {
    id: "compatibility",
    title: { ja: "相性診断", en: "Compatibility Test" },
    desc: { ja: "2人のメンション傾向から相性をAIが診断します", en: "AI diagnoses compatibility from mention patterns of two users" },
    hints: {
      ja: "送受信バランス・交流の継続期間・直近の勢い・文面のノリや話題の噛み合いを根拠に診断してください。",
      en: "Judge from send/receive balance, how long they've interacted, recent momentum, and how well their tones/topics mesh.",
    },
    needsPartner: true,
  },
  {
    id: "crush",
    title: { ja: "秘密の片思い推測", en: "Secret Crush Detection" },
    desc: { ja: "メンション頻度の偏りや返信速度から片思いの相手をAIが推測します", en: "AI detects secret crush from mention frequency and reply speed" },
    hints: {
      ja: "自分→相手と相手→自分の回数の偏り・直近の勢い・文面の親密さ（呼び方・絵文字・照れ）から、片思いの相手を順位付けしてください。",
      en: "Rank likely secret crushes from directional mention imbalance, recent momentum, and intimacy cues in the texts (nicknames, emoji, bashfulness).",
    },
    needsPartner: false,
  },
  {
    id: "stalker",
    title: { ja: "こっそり見てる人推測", en: "Secret Viewer Detection" },
    desc: { ja: "自分へのメンションがないのに相互フォロワーなどからこっそり見てる人をAIが推測します", en: "AI detects users who watch without mentioning" },
    hints: {
      ja: "交流データは『関わった相手』だけなので、交流が極端に薄いのにデータに現れる相手・自分の投稿への言及パターンから、こっそり見ていそうな相手を推測してください（断定はしない）。",
      en: "The data covers only people who interacted; infer likely silent viewers from barely-interacting yet visible connections (no definitive claims).",
    },
    needsPartner: false,
  },
];

export type SelfInfo = {
  screenName: string;
  displayName?: string;
  profileFollowers?: number;
  profileFollowing?: number;
  profileTweets?: number;
  profileLikes?: number;
  profileJoinedAt?: string;
  profileDescription?: string;
};

export type OutputMode = "text" | "image";

export type PromptExtras = {
  selfEmojis?: string[];
  recentMentionsToYou?: Array<{ from: string; text: string; at: number }>;
  topSentTargets?: Array<{ screenName: string; displayName?: string; n: number }>;
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
};

function trendArrow(w: number[] | undefined, isJa: boolean): string {
  if (!w?.length || w.length < 4) return "";
  const first = (w[0] + w[1]) / 2;
  const last = (w[w.length - 2] + w[w.length - 1]) / 2;
  if (first <= 0) return "";
  const r = last / first;
  if (r >= 1.3) return isJa ? "（加速中↑）" : " (accelerating)";
  if (r <= 0.7) return isJa ? "（減速中↓）" : " (slowing down)";
  return isJa ? "（横ばい）" : " (steady)";
}

function fmtTs(t: number): string {
  if (!t) return "?";
  const d = jstDate(t);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

function fmtSec(s: number): string {
  return s < 90 ? `${s}秒` : `${Math.round(s / 60)}分`;
}

function daysSinceTs(iso?: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return undefined;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function hourLabel(h: number): string {
  const type = h >= 22 || h <= 4 ? "夜型" : h >= 5 && h <= 9 ? "朝型" : "日中〜夕方型";
  return `${type}（${h}時台中心）`;
}

export type SelfActivity = {
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

function fmtDate(iso?: string): string {
  return iso ? iso.slice(0, 10).replace(/-/g, "/") : "?";
}

function fmtHours(hours: number[] | undefined): string {
  if (!hours?.length) return "";
  const labels = hours.map((h) => `${h}時台`);
  const isNight = hours.some((h) => h >= 22 || h <= 4);
  const isMorning = hours.some((h) => h >= 5 && h <= 9);
  const type = isNight ? "夜型" : isMorning ? "朝型" : "日中型";
  return `${type}（多い時間帯: ${labels.join("・")}）`;
}

/**
 * プロンプトに載せる投稿・メンション本文の掃除（2026-10-16）:
 * - URL（https://t.co/... 等のリンク）を除去。日本語に直接くっついていても壊さないよう
 *   URLに使える文字だけを食う（「ちなみにhttps://t.co/xxは今は…」→「ちなみには今は…」）
 * - 連続空白を1つに・前後をtrim
 * - 除去の結果なにも残らない場合は null（呼び出し側で行ごと省く）
 */
export function sanitizePromptText(raw: string): string | null {
  const cleaned = raw
    .replace(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi, "")
    .replace(/\b(?:t\.co|pic\.twitter\.com)\/[A-Za-z0-9_\-]+/gi, "")
    .replace(/[ \t\u3000]+/g, " ")
    .trim();
  return cleaned.length ? cleaned : null;
}

/** テキスト配列を掃除して空要素を落とす */
function sanitizePromptTexts(list: string[] | undefined): string[] {
  const out: string[] = [];
  for (const t of list ?? []) {
    const c = sanitizePromptText(t);
    if (c) out.push(c);
  }
  return out;
}

/**
 * プロンプトをチャットAIの「1メッセージ上限」に収まるよう行単位で分割する（2026-10-16）。
 * ChatGPTは1メッセージの長さ制限（実質コンテキスト基準: 無料16kトークン / Plus 32k / Pro 128k）があり
 * 「送信したメッセージが長すぎます」で弾かれるため、順番に貼り付けて送信できるよう分割する。
 * 既定18,000字/通 = 日本語実測1.41字/トークン換算で約12.8kトークン → 無料プラン(16k)でも
 * 返信ぶんの余裕を残して送れるサイズ。**内容は一切失わない**（分割マーカーのみ付与）。
 */
export function splitPromptForChat(
  prompt: string,
  locale: "ja" | "en",
  maxChars = 18000,
): string[] {
  if (prompt.length <= maxChars) return [prompt];
  const lines = prompt.split("\n");
  const rawParts: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const line of lines) {
    const add = line.length + 1;
    if (cur.length > 0 && len + add > maxChars) {
      rawParts.push(cur.join("\n"));
      cur = [];
      len = 0;
    }
    cur.push(line);
    len += add;
  }
  if (cur.length) rawParts.push(cur.join("\n"));
  const n = rawParts.length;
  return rawParts.map((p, i) => {
    const top =
      i === 0
        ? locale === "ja"
          ? `（全${n}通に分割。順番に貼り付けて送信してください）`
          : `(Split into ${n} messages. Send them in order.)`
        : locale === "ja"
          ? `（続き ${i + 1}/${n}）`
          : `(Continuation ${i + 1}/${n})`;
    const bottom =
      i < n - 1
        ? locale === "ja"
          ? `（続きは次のメッセージで ${i + 2}/${n} を貼り付けて送信）`
          : `(Next: paste part ${i + 2}/${n} in the next message)`
        : "";
    return [top, p, bottom].filter(Boolean).join("\n");
  });
}

function buildSelfSection(
  self: SelfInfo,
  selfTweets: string[] | undefined,
  selfActivity: SelfActivity | undefined,
  isJa: boolean,
  framing: "self" | "target" = "self",
): string {
  const stats = [
    `@${self.screenName}`,
    self.displayName && self.displayName !== self.screenName ? `表示名「${self.displayName}」` : null,
    self.profileFollowers != null ? (isJa ? `フォロワー ${self.profileFollowers}` : `followers ${self.profileFollowers}`) : null,
    self.profileFollowing != null ? (isJa ? `フォロー ${self.profileFollowing}` : `following ${self.profileFollowing}`) : null,
    self.profileTweets != null ? (isJa ? `ツイート ${self.profileTweets}` : `tweets ${self.profileTweets}`) : null,
    self.profileLikes != null ? (isJa ? `いいね ${self.profileLikes}` : `likes ${self.profileLikes}`) : null,
    self.profileJoinedAt ? (isJa ? `アカウント作成 ${self.profileJoinedAt}` : `joined ${self.profileJoinedAt}`) : null,
  ]
    .filter(Boolean)
    .join("、");
  const activityLines: string[] = [];
  if (selfActivity) {
    const h = fmtHours(selfActivity.topHours);
    if (h) activityLines.push(isJa ? `活動時間帯: ${h}` : `Active hours: ${h}`);
    activityLines.push(
      isJa
        ? `直近7日の投稿: ${selfActivity.fromYou7d}件・受け取ったメンション: ${selfActivity.toYou7d}件`
        : `Last 7 days: ${selfActivity.fromYou7d} posts, ${selfActivity.toYou7d} mentions received`,
    );
    if (selfActivity.weeklyTo?.length) {
      activityLines.push(
        isJa
          ? `週次トレンド(被メンション・4週前→今週): ${selfActivity.weeklyTo.join("→")}${trendArrow(selfActivity.weeklyTo, isJa)}`
          : `Weekly mentions received (4w ago -> now): ${selfActivity.weeklyTo.join("->")}${trendArrow(selfActivity.weeklyTo, isJa)}`,
      );
    }
    if (selfActivity.weeklyFrom?.length) {
      activityLines.push(
        isJa
          ? `週次トレンド(自分の投稿): ${selfActivity.weeklyFrom.join("→")}`
          : `Weekly own posts: ${selfActivity.weeklyFrom.join("->")}`,
      );
    }
    if (selfActivity.postGapMin !== undefined) {
      const m = selfActivity.postGapMin;
      const gapText = m < 120 ? `約${m}分おき` : `約${Math.round(m / 6) / 10}時間おき`;
      activityLines.push(isJa ? `投稿間隔: 中央値 ${gapText}` : `Posting gap: median ~${Math.round(m / 60)}min`);
    }
    if (selfActivity.weekdayType) {
      activityLines.push(isJa ? `曜日傾向: ${selfActivity.weekdayType}` : `Weekday pattern: ${selfActivity.weekdayType}`);
    }
    if (selfActivity.newConn14d !== undefined || selfActivity.dormant14d !== undefined) {
      activityLines.push(
        isJa
          ? `界隈の出入り(直近2週間): 新しく交流が始まった相手 ${selfActivity.newConn14d ?? 0}人・交流が絶えた相手 ${selfActivity.dormant14d ?? 0}人`
          : `Churn (2w): ${selfActivity.newConn14d ?? 0} new connections, ${selfActivity.dormant14d ?? 0} gone quiet`,
      );
    }
    if (selfActivity.words?.length) {
      activityLines.push(isJa ? `自分の頻出ワード: ${selfActivity.words.join("・")}` : `My frequent words: ${selfActivity.words.join(", ")}`);
    }
    if (selfActivity.breadthTo?.length) {
      activityLines.push(
        isJa
          ? `交流の広がり(自分と関わった相手の人数・4週前→今週): ${selfActivity.breadthTo.join("→")}人`
          : `Partners per week (4w ago -> now): ${selfActivity.breadthTo.join("->")}`,
      );
    }
    if (selfActivity.breadthFrom?.length) {
      activityLines.push(
        isJa
          ? `自分から絡んだ相手の人数: ${selfActivity.breadthFrom.join("→")}人`
          : `Targets per week: ${selfActivity.breadthFrom.join("->")}`,
      );
    }
    if (selfActivity.avgPostPerDay !== undefined) {
      activityLines.push(isJa ? `平均投稿数: 約${selfActivity.avgPostPerDay}件/日` : `Avg posts: ~${selfActivity.avgPostPerDay}/day`);
    }
    if (selfActivity.maxSilenceDays !== undefined) {
      activityLines.push(
        isJa ? `この期間で最も長く沈黙したのは ${selfActivity.maxSilenceDays}日間` : `Longest silence: ${selfActivity.maxSilenceDays} days`,
      );
    }
    if (selfActivity.tone) {
      const t = selfActivity.tone;
      const bits: string[] = [];
      if (t.thanks) bits.push(isJa ? `感謝${t.thanks}%` : `thanks ${t.thanks}%`);
      if (t.love) bits.push(isJa ? `好意${t.love}%` : `affection ${t.love}%`);
      if (t.tired) bits.push(isJa ? `疲弊${t.tired}%` : `tired ${t.tired}%`);
      if (t.gloomy) bits.push(isJa ? `悲観${t.gloomy}%` : `gloomy ${t.gloomy}%`);
      if (bits.length) activityLines.push(isJa ? `感情語の出現率: ${bits.join("・")}` : `Emotion words: ${bits.join(", ")}`);
    }
    if (selfActivity.receivedBlocks?.length) {
      const bl = isJa ? ["朝", "昼", "夕", "夜", "深夜", "未明"] : ["morning", "noon", "evening", "night", "late", "dawn"];
      const recv = selfActivity.receivedBlocks.map((n, i) => `${bl[i]}${n}`).join("・");
      const sent = selfActivity.sentBlocks?.map((n, i) => `${bl[i]}${n}`).join("・");
      activityLines.push(isJa ? `時間帯別(被メンション): ${recv}` : `By time (received): ${recv}`);
      if (sent) activityLines.push(isJa ? `時間帯別(自分の投稿): ${sent}` : `By time (own posts): ${sent}`);
    }
    const cleanRevival = selfActivity.revivalText
      ? sanitizePromptText(selfActivity.revivalText)
      : null;
    if (cleanRevival && selfActivity.maxSilenceDays && selfActivity.maxSilenceDays >= 3) {
      activityLines.push(
        isJa
          ? `最長沈黙(${selfActivity.maxSilenceDays}日)明けの一言: 「${cleanRevival}」`
          : `After longest silence (${selfActivity.maxSilenceDays}d): "${cleanRevival}"`,
      );
    }
    if (selfActivity.burstEpisodes !== undefined && selfActivity.burstEpisodes > 0) {
      activityLines.push(isJa ? `連投エピソード(15分以内に3連投): ${selfActivity.burstEpisodes}回` : `Burst episodes: ${selfActivity.burstEpisodes}`);
    }
    if (selfActivity.peakDay) {
      activityLines.push(isJa ? `最も投稿が多かった日: ${selfActivity.peakDay.date}（${selfActivity.peakDay.n}件）` : `Peak day: ${selfActivity.peakDay.date} (${selfActivity.peakDay.n})`);
    }
  }
  const cleanTweets = sanitizePromptTexts(selfTweets);
  const tweetList = cleanTweets.join("\n");
  const cleanBio = self.profileDescription ? sanitizePromptText(self.profileDescription) : null;
  const bioLine = cleanBio ? `\nプロフィール文: 「${cleanBio}」` : "";
  const profileHead =
    framing === "target"
      ? isJa
        ? "【プロフィール・活動統計】"
        : "【Profile & activity stats】"
      : isJa
        ? "【自分のプロフィール】"
        : "【My Profile】";
  const tweetsHead =
    framing === "target"
      ? isJa
        ? `【投稿の全件（新しい順・${cleanTweets.length}件）】`
        : `【All posts (newest first, ${cleanTweets.length})】`
      : isJa
        ? "【自分の最近の投稿（新しい順・メンションの有無は混在）】"
        : "【My recent posts (newest first; with/without mentions)】";
  return (
    profileHead +
    `\n${stats}${bioLine}` +
    (activityLines.length ? `\n${activityLines.join("\n")}` : "") +
    `\n\n` +
    tweetsHead +
    `\n${tweetList || (isJa ? "（データなし）" : "(no data)")}`
  );
}

function trendLabel(u: CircleUser, isJa: boolean): string {
  const n = u.interactionCount ?? 0;
  const n7 = u.mentionsLast7d ?? 0;
  if (n <= 0) return "";
  const expected = (n / 30) * 7;
  if (n7 === 0) return isJa ? "直近7日: 0件（最近止まり気味）" : "last7d: 0 (gone quiet)";
  if (n7 > expected * 1.5) return isJa ? `直近7日: ${n7}件（最近活発↑）` : `last7d: ${n7} (heating up)`;
  return isJa ? `直近7日: ${n7}件（安定）` : `last7d: ${n7} (steady)`;
}

function userLine(u: CircleUser, idx: number, isJa: boolean, selfTopHour?: number, selfLaugh?: string): string {
  const name = u.displayName && u.displayName !== u.screenName ? `${u.displayName}／` : "";
  const span =
    u.firstInteractionAt || u.lastInteractionAt
      ? `・交流期間 ${fmtDate(u.firstInteractionAt)}〜${fmtDate(u.lastInteractionAt)}`
      : "";
  const trend = trendLabel(u, isJa);
  const ds = daysSinceTs(u.lastInteractionAt);
  const lastBit = ds === undefined ? "" : ds === 0 ? (isJa ? "・最終交流: 今日" : "・last: today") : ds === 1 ? (isJa ? "・最終交流: 昨日" : "・last: yesterday") : isJa ? `・最終交流から${ds}日` : `・last: ${ds}d ago`;
  const head = `  ${idx + 1}. @${u.screenName}（${name}メンション計 ${u.interactionCount ?? "?"}（相手→自分 ${u.mentionsReceived ?? "?"}・自分→相手 ${u.mentionsSent ?? "?"}）${span}${lastBit}${trend ? `・${trend}` : ""}）`;
  const lines = [head];
  const facts: string[] = [];
  const cleanUserBio = u.bio ? sanitizePromptText(u.bio) : null;
  if (cleanUserBio) facts.push(`bio「${cleanUserBio}」`);
  if (u.activeHour !== undefined) facts.push(`活動: ${hourLabel(u.activeHour)}`);
  if (u.replyThemMin !== undefined || u.replyMeMin !== undefined) {
    const rp: string[] = [];
    if (u.replyThemMin !== undefined) rp.push(`相手→自分 約${u.replyThemMin}分`);
    if (u.replyMeMin !== undefined) rp.push(`自分→相手 約${u.replyMeMin}分`);
    facts.push(`返信速度(中央値): ${rp.join(" / ")}`);
  }
  if (u.fastestThemSec !== undefined || u.fastestMeSec !== undefined) {
    const fr: string[] = [];
    if (u.fastestThemSec !== undefined) fr.push(isJa ? `相手→自分 ${fmtSec(u.fastestThemSec)}` : `them->me ${fmtSec(u.fastestThemSec)}`);
    if (u.fastestMeSec !== undefined) fr.push(isJa ? `自分→相手 ${fmtSec(u.fastestMeSec)}` : `me->them ${fmtSec(u.fastestMeSec)}`);
    facts.push(isJa ? `最速レス: ${fr.join(" / ")}` : `Fastest reply: ${fr.join(" / ")}`);
  }
  if (u.topEmojis?.length) facts.push(`絵文字: ${u.topEmojis.join(" ")}`);
  if (u.vocative) facts.push(`呼び方「${u.vocative}」`);
  if (u.avgLen !== undefined || u.laugh || u.keigoRate !== undefined) {
    const st: string[] = [];
    if (u.avgLen !== undefined) st.push(`平均${u.avgLen}字`);
    if (u.laugh) st.push(u.laugh + (selfLaugh && u.laugh === selfLaugh ? "（自分と同じ）" : ""));
    if (u.keigoRate !== undefined && u.keigoRate >= 40) st.push("敬語多め");
    facts.push(`文体: ${st.join("・")}`);
  }
  if (u.weekly?.length) facts.push(`週次: ${u.weekly.join("→")}`);
  if (u.activeHour !== undefined && selfTopHour !== undefined) {
    const diff = Math.min(Math.abs(u.activeHour - selfTopHour), 24 - Math.abs(u.activeHour - selfTopHour));
    if (diff <= 2) facts.push(isJa ? "生活リズム: 似てる" : "rhythm: similar");
    else if (diff >= 6) facts.push(isJa ? "生活リズム: 真逆" : "rhythm: opposite");
  }
  if (facts.length) lines.push(`  ${facts.join("・")}`);
  const q1 = u.latestFromThem ? sanitizePromptText(u.latestFromThem) : null;
  if (q1) lines.push(`  相手最新「${q1}」`);
  const q2 = u.latestFromThem2 ? sanitizePromptText(u.latestFromThem2) : null;
  if (q2) lines.push(`  相手前回「${q2}」`);
  const q3 = u.latestToThem ? sanitizePromptText(u.latestToThem) : null;
  if (q3) lines.push(`  自分最新「${q3}」`);
  const q4 = u.latestToThem2 ? sanitizePromptText(u.latestToThem2) : null;
  if (q4) lines.push(`  自分前回「${q4}」`);
  {
    const fm: string[] = [];
    const f1 = u.firstFromThem ? sanitizePromptText(u.firstFromThem) : null;
    if (f1) fm.push(`相手「${f1}」`);
    const f2 = u.firstToThem ? sanitizePromptText(u.firstToThem) : null;
    if (f2) fm.push(`自分「${f2}」`);
    if (fm.length) lines.push(`  初対面: ${fm.join("→")}`);
  }
  if (u.exchange?.length) {
    const rows = u.exchange
      .map((x) => {
        const c = sanitizePromptText(x.text);
        return c
          ? `  ${fmtTs(x.t)} ${x.dir === "from" ? "相手→自分" : "自分→相手"}「${c}」`
          : null;
      })
      .filter((r): r is string => Boolean(r));
    if (rows.length) {
      lines.push(`  【最近のやり取り（新しい順）】`);
      for (const r of rows) lines.push(r);
    }
  }
  return lines.join("\n");
}

function buildUserDataSection(users: CircleUser[], isJa: boolean, selfTopHour?: number, selfLaugh?: string): string {
  if (users.length === 0) return isJa ? "（データなし）" : "(no data)";
  return users.slice(0, 25).map((u, i) => userLine(u, i, isJa, selfTopHour, selfLaugh)).join("\n");
}

function buildNarikiriPrompt(
  locale: "ja" | "en",
  self: SelfInfo,
  users: CircleUser[],
  selfTweets: string[] | undefined,
  selfActivity: SelfActivity | undefined,
  extras: PromptExtras | undefined,
): string {
  const isJa = locale === "ja";
  const display =
    self.displayName && self.displayName !== self.screenName
      ? `「${self.displayName}」(@${self.screenName})`
      : `@${self.screenName}`;

  const header = isJa
    ? `あなたはX（Twitter）ユーザー ${display} になりきってください。\n\n以下はこの人物の過去30日間の公開データ（投稿の全件・交流相手・活動統計・プロフィール）です。口調・語彙・絵文字・笑い方・呼称・ノリ・話題をこのデータから読み取り、本人として会話してください。`
    : `Roleplay as the X (Twitter) user ${display}.\n\nBelow is this person's public data from the last 30 days (ALL posts, interaction partners, activity stats, profile). Read their tone, vocabulary, emojis, laugh style, nicknames, and topics from the data, and converse as them.`;

  const selfPart = buildSelfSection(self, selfTweets, selfActivity, isJa, "target");

  const usersPart =
    (isJa ? "【交流相手（トップ25）】" : "【Interaction partners (top 25)】") +
    "\n" +
    buildUserDataSection(users, isJa, selfActivity?.topHours?.[0], extras?.selfStyle?.laugh);

  const parts: string[] = [];
  if (extras) {
    if (extras.selfEmojis?.length) {
      parts.push(isJa ? `【よく使う絵文字】\n${extras.selfEmojis.join(" ")}` : `【Frequent emojis】\n${extras.selfEmojis.join(" ")}`);
    }
    if (extras.selfVocatives?.length) {
      parts.push(isJa ? `【界隈での呼ばれ方】\n${extras.selfVocatives.join("・")}` : `【Known as】\n${extras.selfVocatives.join(", ")}`);
    }
    if (extras.topSentTargets?.length) {
      const rows = extras.topSentTargets
        .map((t) => `- @${t.screenName}${t.displayName ? `（${t.displayName}）` : ""}: ${t.n}回`)
        .join("\n");
      parts.push(isJa ? `【よくメンションする相手】\n${rows}` : `【Most-mentioned people】\n${rows}`);
    }
    if (extras.communityWords?.length) {
      parts.push(isJa ? `【界隈の頻出ワード】\n${extras.communityWords.join("・")}` : `【Community words】\n${extras.communityWords.join(", ")}`);
    }
    if (extras.recentMentionsToYou?.length) {
      const rows = extras.recentMentionsToYou
        .map((m) => {
          const c = sanitizePromptText(m.text);
          return c ? `- ${fmtTs(m.at)} @${m.from}: 「${c}」` : null;
        })
        .filter((r): r is string => Boolean(r))
        .join("\n");
      if (rows) {
        parts.push(
          isJa
            ? `【最近届いたメンション（参考情報・他者の発言。本人のセリフとして使わない）】\n${rows}`
            : `【Recent mentions received (context only - other people's words, never use as own lines)】\n${rows}`,
        );
      }
    }
    if (extras.recentNewConn?.length) {
      const rows = extras.recentNewConn
        .map((n) => `- @${n.screenName}${n.displayName ? `（${n.displayName}）` : ""}: ${n.daysAgo ?? "?"}日前に知り合った`)
        .join("\n");
      parts.push(isJa ? `【最近知り合った相手】\n${rows}` : `【Newest connections】\n${rows}`);
    }
    const st = extras.selfStyle;
    if (st) {
      const bits: string[] = [];
      if (st.avgLen !== undefined) bits.push(isJa ? `平均${st.avgLen}字` : `avg ${st.avgLen} chars`);
      if (st.keigoRate !== undefined) bits.push(isJa ? (st.keigoRate >= 40 ? "敬語多め" : st.keigoRate >= 15 ? "タメ口と敬語が混在" : "基本タメ口") : `keigo ${st.keigoRate}%`);
      if (st.exclaimRate !== undefined) bits.push(isJa ? `！付き${st.exclaimRate}%` : `exclaims ${st.exclaimRate}%`);
      if (st.laugh) bits.push(isJa ? `笑い方=${st.laugh}` : `laugh=${st.laugh}`);
      if (st.streakDays !== undefined) bits.push(isJa ? (st.streakDays > 0 ? `${st.streakDays}日連続投稿中` : "最近は投稿が途切れ気味") : `${st.streakDays} day streak`);
      parts.push(isJa ? `【文体・継続状況】\n${bits.join("・")}` : `【Writing style & streak】\n${bits.join(" · ")}`);
    }
  }
  const extrasSection = parts.length ? "\n\n" + parts.join("\n\n") : "";

  const legend = isJa
    ? "\n\n【データの見方】投稿は実際の文面そのまま（1行=1投稿）。交流期間=この30日データ内。週次=4週前→今週。返信速度=中央値。"
    : "\n\n【How to read】Posts are verbatim (one line = one post). Span=within this 30d window. Weekly=4w ago -> now. Reply speed=median.";

  // zetaプロンプトの知見を反映（2026-10-16）: モブ乱入防止・相手の心情描写禁止・反復禁止・出力完結
  const rules = isJa
    ? "【ルール】\n・文体・口調・絵文字・笑い方は投稿群を忠実に真似る（語尾・ｗ/笑/草・一人称・相手の呼び方を揃える）\n・データに無い具体的な事実（場所・人間関係・出来事）を断定して創作しない。データにない人物を勝手に登場させない\n・私（相手）の心情や行動を勝手に描写しない。あなたの発言だけで返す\n・「AIです」「データによると」は禁止。統計や数字を会話に持ち出さない\n・同じ文・同じ内容を繰り返さない。返答は途中で途切れさせない\n・1回の返答は投稿1件分くらいの長さ（2〜4文程度）で"
    : "【Rules】\n- Faithfully mimic tone, vocabulary, emojis and laugh style (endings, w/kusa, first person, nicknames)\n- Do not invent specific facts (places, relationships, events) absent from the data, and never bring in people who don't appear in the data\n- Never narrate the user's feelings or actions; reply only as yourself\n- Never say \"I am an AI\" or cite the data/stats in conversation\n- Do not repeat the same sentence or content; never cut off mid-reply\n- Keep each reply about one post long (2-4 sentences)";

  const ending = isJa
    ? "【出力形式】\n1. 準備メモ・解説は出力しない（口調・語彙・絵文字・話題・ノリの整理は内部で行う）。いきなり、この人物としての最初の一言を、実際の投稿と同じノリで1つ書く\n2. 以降は私が話しかけるたび、常にこの人物としてだけ返答する（解説や地の文は書かない・キャラを崩さない）"
    : "【Output format】\n1. No prep notes or explanations (analyze tone/vocabulary/emojis/topics internally). Start directly with one opening line to me in their style\n2. After that, always reply only as this person whenever I speak (no narration, never break character)";

  return header + "\n\n" + selfPart + "\n\n" + usersPart + extrasSection + legend + "\n\n" + rules + "\n\n" + ending;
}

export function generatePrompt(
  type: DiagnosisType,
  locale: "ja" | "en",
  self: SelfInfo,
  users: CircleUser[],
  partnerScreenName?: string,
  selfTweets?: string[],
  selfActivity?: SelfActivity,
  extras?: PromptExtras,
  outputMode: OutputMode = "text",
): string {
  const isJa = locale === "ja";
  if (type === "narikiri") {
    return buildNarikiriPrompt(locale, self, users, selfTweets, selfActivity, extras);
  }
  const def = DIAGNOSIS_DEFS.find((d) => d.id === type)!;
  const base = isJa
    ? `以下はX（Twitter）ユーザー「@${self.screenName}」の過去30日間の公開データ（メンション交流・実際の投稿文面・活動統計・プロフィール）です。\n\nあなたは優秀なAI占い師／分析官です。このデータをもとに、「${def.title.ja}」をしてください。\n実際の投稿文面（語調・話題・頻度）を根拠として必ず引用しながら分析してください。\n\n【診断してほしいこと】\n${def.desc.ja}\n\n【着眼ポイント】\n${def.hints.ja}\n\n`
    : `Below is 30 days of public data (mention interactions, actual post texts, activity stats, profile) for X user "@${self.screenName}".\n\nYou are an expert AI fortune teller / analyst. Based on this data, perform "${def.title.en}".\nCite the actual post texts (tone, topics, frequency) as evidence in your analysis.\n\n【What to diagnose】\n${def.desc.en}\n\n【Key angles】\n${def.hints.en}\n\n`;

  const selfSection = buildSelfSection(self, selfTweets, selfActivity, isJa);
  const userData = buildUserDataSection(users, isJa, selfActivity?.topHours?.[0], extras?.selfStyle?.laugh);

  const usersHeader = isJa ? "【交流相手データ（トップ25）】" : "【Interaction partners (top 25)】";

  let extrasSection = "";
  if (extras) {
    const parts: string[] = [];
    if (extras.selfEmojis?.length) {
      parts.push(isJa ? `【自分のよく使う絵文字】\n${extras.selfEmojis.join(" ")}` : `【My frequent emojis】\n${extras.selfEmojis.join(" ")}`);
    }
    if (extras.topSentTargets?.length) {
      const rows = extras.topSentTargets
        .map((t) => `- @${t.screenName}${t.displayName ? `（${t.displayName}）` : ""}: ${t.n}回`)
        .join("\n");
      parts.push(isJa ? `【自分が最もメンションした相手】\n${rows}` : `【People I mention most】\n${rows}`);
    }
    if (extras.recentMentionsToYou?.length) {
      const rows = extras.recentMentionsToYou
        .map((m) => {
          const c = sanitizePromptText(m.text);
          return c ? `- ${fmtTs(m.at)} @${m.from}: 「${c}」` : null;
        })
        .filter((r): r is string => Boolean(r))
        .join("\n");
      if (rows) {
        parts.push(isJa ? `【最近届いたメンション（全体・新しい順）】\n${rows}` : `【Latest mentions received】\n${rows}`);
      }
    }
    if (extras.communityWords?.length) {
      parts.push(isJa ? `【界隈の頻出ワード（届いたメンションから）】\n${extras.communityWords.join("・")}` : `【Community frequent words】\n${extras.communityWords.join(", ")}`);
    }
    if (extras.selfVocatives?.length) {
      parts.push(isJa ? `【界隈の呼称傾向（メンション内でよく見る呼び方）】\n${extras.selfVocatives.join("・")}` : `【Vocative style in mentions】\n${extras.selfVocatives.join(", ")}`);
    }
    if (extras.recentNewConn?.length) {
      const rows = extras.recentNewConn
        .map((n) => `- @${n.screenName}${n.displayName ? `（${n.displayName}）` : ""}: ${n.daysAgo ?? "?"}日前に知り合った`)
        .join("\n");
      parts.push(isJa ? `【最近知り合った相手】\n${rows}` : `【Newest connections】\n${rows}`);
    }
    const st = extras.selfStyle;
    if (st) {
      const bits: string[] = [];
      if (st.avgLen !== undefined) bits.push(isJa ? `平均${st.avgLen}字` : `avg ${st.avgLen} chars`);
      if (st.keigoRate !== undefined) bits.push(isJa ? (st.keigoRate >= 40 ? "敬語多め" : st.keigoRate >= 15 ? "タメ口と敬語が混在" : "基本タメ口") : `keigo ${st.keigoRate}%`);
      if (st.exclaimRate !== undefined) bits.push(isJa ? `！付き${st.exclaimRate}%` : `exclaims ${st.exclaimRate}%`);
      if (st.laugh) bits.push(isJa ? `笑い方=${st.laugh}` : `laugh style=${st.laugh}`);
      if (st.streakDays !== undefined) bits.push(isJa ? (st.streakDays > 0 ? `${st.streakDays}日連続投稿中` : "最近は投稿が途切れ気味") : `${st.streakDays} day streak`);
      parts.push(isJa ? `【自分の文体・継続状況】\n${bits.join("・")}` : `【My writing style & streak】\n${bits.join(" · ")}`);
    }
    if (parts.length) extrasSection = "\n\n" + parts.join("\n\n");
  }

  const legend = isJa
    ? "\n\n【データの見方】メンション計=双方向の合計。返信速度=1時間以内の反応ペアから算出した中央値。交流期間=この30日データ内での初回〜最終。直近7日=勢いの指標。"
    : "\n\n【How to read】Total=both directions. Reply speed=median of reactions within 1h. Span=first-last in this 30d window. last7d=momentum.";

  let extra = "";
  if (partnerScreenName) {
    const partner = users.find((u) => u.screenName.toLowerCase() === partnerScreenName.toLowerCase());
    const partnerLine = partner
      ? userLine(partner, 0, isJa, selfActivity?.topHours?.[0], extras?.selfStyle?.laugh)
      : isJa
        ? `  @${partnerScreenName}（この相手のデータは今回の取得範囲にありません）`
        : `  @${partnerScreenName} (no data in this range)`;
    extra = isJa
      ? `\n\n【相性診断の相手】\n${partnerLine}\n\nこの相手との相性を、メンションの頻度・相互交流のバランス・投稿文面のノリの相性などから総合的に診断し、100点満点で採点してください。`
      : `\n\n【Compatibility Partner】\n${partnerLine}\n\nEvaluate compatibility with this user based on mention frequency, interaction balance, and tone/style of posts. Score out of 100.`;
  }

  const ending = outputMode === "image"
    ? isJa
      ? "\n\n【出力形式（画像生成プロンプト）】\nこの診断結果をX（Twitter）に貼れる「1枚の画像」にするための画像生成プロンプトを作成してください。\n\n1. 画像生成プロンプト（英語・1段落・画像生成AIにそのまま貼れる形式）\n   - 縦長 9:16 のSNS投稿用カード風\n   - 診断の雰囲気が一目で伝わる画風を診断内容に合わせて選ぶ（例: 占いカード/タロット/不気味な予言書/ラブレター風 など）\n   - このアカウントの実データ（返信速度・週次トレンド・絵文字・呼称・活動時間帯・頻出ワードなど）から視覚的モチーフを1つ以上必ず反映すること\n2. 画像内に入れる日本語テキスト（タイトル+短い一言・各20字以内。画像内で長文は潰れるため短く）\n3. 投稿キャプション（日本語・1行・ハッシュタグなし）\n\n面白おかしく、占い師のような文体で。診断の根拠になったデータの数字を、キャプションか画像内テキストに1つ以上入れること。\n※注意: データに示されていない具体的な出来事・場所・人間関係・本名などを創作しないこと。根拠は必ず上記データ内の文面と数値に限定してください。"
      : "\n\n【Output Format (image generation prompt)】\nCreate an image-generation prompt that turns this diagnosis into a single shareable image for X (Twitter).\n\n1. Image generation prompt (English, one paragraph, ready to paste into an image AI)\n   - Vertical 9:16 card for social posting\n   - Choose a visual style fitting the diagnosis (fortune card / tarot / eerie prophecy / love letter, etc.)\n   - Include at least one visual motif drawn from this account's real data (reply speed, weekly trend, emojis, nickname, active hours, frequent words)\n2. Japanese text to render inside the image (title + one-liner, <=20 chars each)\n3. Post caption (Japanese, one line, no hashtags)\n\nUse a fun, fortune-teller tone. Include at least one real number from the analysis in the caption or in-image text.\nNote: do NOT invent specific events, places, relationships, or real names not present in the data above; ground every claim in the provided texts and numbers."
    : isJa
      ? "\n\n【出力形式】\n1. 診断結果のタイトル\n2. 総合評価（点数または段階）\n3. 詳細な分析（箇条書き3〜5項目・各項目に実際の投稿文面を1つ以上引用）\n4. 一言アドバイス\n\n面白おかしく、占い師のような文体でお願いします。\n※注意: データに示されていない具体的な出来事・場所・人間関係・本名などを創作しないこと。根拠は必ず上記データ内の文面と数値に限定してください。"
      : "\n\n【Output Format】\n1. Diagnosis title\n2. Overall rating (score or grade)\n3. Detailed analysis (3-5 bullets, each citing at least one actual post text)\n4. One-line advice\n\nUse a fun, fortune-teller-like tone.\nNote: do NOT invent specific events, places, relationships, or real names not present in the data above; ground every claim in the provided texts and numbers.";

  const radar: string[] = [];
  const cooled = users
    .filter((u) => u.weekly && (u.weekly[3] ?? 0) >= 3 && (u.weekly[4] ?? 0) <= 1)
    .slice(0, 3)
    .map((u) => `- @${u.screenName}（先週${u.weekly![3]}件→今週${u.weekly![4] ?? 0}件）`);
  const heated = users
    .filter((u) => u.weekly && (u.weekly[4] ?? 0) >= 3 && (u.weekly[2] ?? 0) + (u.weekly[3] ?? 0) <= 2)
    .slice(0, 3)
    .map((u) => `- @${u.screenName}（今週${u.weekly![4]}件へ急増）`);
  if (cooled.length) radar.push(isJa ? `【今週ぱったり止まった相手】\n${cooled.join("\n")}` : `【Went quiet this week】\n${cooled.join("\n")}`);
  if (heated.length) radar.push(isJa ? `【急に距離が縮まった相手】\n${heated.join("\n")}` : `【Suddenly closer】\n${heated.join("\n")}`);
  const radarSection = radar.length ? "\n\n" + radar.join("\n\n") : "";

  return base + selfSection + extrasSection + legend + "\n\n" + usersHeader + "\n" + userData + radarSection + extra + ending;
}
