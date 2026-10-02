import type { CircleUser } from "@/types/circle";

export type DiagnosisType =
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
  const d = new Date(t * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
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

function buildSelfSection(
  self: SelfInfo,
  selfTweets: string[] | undefined,
  selfActivity: SelfActivity | undefined,
  isJa: boolean,
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
    if (selfActivity.revivalText && selfActivity.maxSilenceDays && selfActivity.maxSilenceDays >= 3) {
      activityLines.push(
        isJa
          ? `最長沈黙(${selfActivity.maxSilenceDays}日)明けの一言: 「${selfActivity.revivalText}」`
          : `After longest silence (${selfActivity.maxSilenceDays}d): "${selfActivity.revivalText}"`,
      );
    }
    if (selfActivity.burstEpisodes !== undefined && selfActivity.burstEpisodes > 0) {
      activityLines.push(isJa ? `連投エピソード(15分以内に3連投): ${selfActivity.burstEpisodes}回` : `Burst episodes: ${selfActivity.burstEpisodes}`);
    }
    if (selfActivity.peakDay) {
      activityLines.push(isJa ? `最も投稿が多かった日: ${selfActivity.peakDay.date}（${selfActivity.peakDay.n}件）` : `Peak day: ${selfActivity.peakDay.date} (${selfActivity.peakDay.n})`);
    }
  }
  const tweetList = (selfTweets ?? []).map((t) => `- 「${t}」`).join("\n");
  const bioLine = self.profileDescription ? `\nプロフィール文: 「${self.profileDescription}」` : "";
  return (
    (isJa ? "【自分のプロフィール】" : "【My Profile】") +
    `\n${stats}${bioLine}` +
    (activityLines.length ? `\n${activityLines.join("\n")}` : "") +
    `\n\n` +
    (isJa ? "【自分の最近の投稿（新しい順・メンションの有無は混在）】" : "【My recent posts (newest first; with/without mentions)】") +
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
  if (u.bio) facts.push(`bio「${u.bio}」`);
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
  if (facts.length) lines.push(`      ${facts.join("・")}`);
  if (u.latestFromThem) lines.push(`      相手の最近の投稿: 「${u.latestFromThem}」`);
  if (u.latestFromThem2) lines.push(`      相手の1つ前の投稿: 「${u.latestFromThem2}」`);
  if (u.latestToThem) lines.push(`      自分→相手の最近の投稿: 「${u.latestToThem}」`);
  if (u.latestToThem2) lines.push(`      自分→相手の1つ前の投稿: 「${u.latestToThem2}」`);
  if (u.firstFromThem || u.firstToThem) {
    const fm: string[] = [];
    if (u.firstFromThem) fm.push(`相手「${u.firstFromThem}」`);
    if (u.firstToThem) fm.push(`自分「${u.firstToThem}」`);
    lines.push(`      初対面のやり取り: ${fm.join(" → ")}`);
  }
  if (u.exchange?.length) {
    lines.push(`      【最近のやり取り（新しい順）】`);
    for (const x of u.exchange) {
      lines.push(`        ${fmtTs(x.t)} ${x.dir === "from" ? "相手→自分" : "自分→相手"}: 「${x.text}」`);
    }
  }
  return lines.join("\n");
}

function buildUserDataSection(users: CircleUser[], isJa: boolean, selfTopHour?: number, selfLaugh?: string): string {
  if (users.length === 0) return isJa ? "（データなし）" : "(no data)";
  return users.slice(0, 25).map((u, i) => userLine(u, i, isJa, selfTopHour, selfLaugh)).join("\n");
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
): string {
  const isJa = locale === "ja";
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
        .map((m) => `- ${fmtTs(m.at)} @${m.from}: 「${m.text}」`)
        .join("\n");
      parts.push(isJa ? `【最近届いたメンション（全体・新しい順）】\n${rows}` : `【Latest mentions received】\n${rows}`);
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

  const ending = isJa
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
