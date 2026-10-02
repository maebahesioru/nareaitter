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
};

function fmtTs(t: number): string {
  if (!t) return "?";
  const d = new Date(t * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

function hourLabel(h: number): string {
  const type = h >= 22 || h <= 4 ? "夜型" : h >= 5 && h <= 9 ? "朝型" : "日中〜夕方型";
  return `${type}（${h}時台中心）`;
}

export type SelfActivity = { topHours: number[]; fromYou7d: number; toYou7d: number };

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

function userLine(u: CircleUser, idx: number, isJa: boolean): string {
  const name = u.displayName && u.displayName !== u.screenName ? `${u.displayName}／` : "";
  const span =
    u.firstInteractionAt || u.lastInteractionAt
      ? `・交流期間 ${fmtDate(u.firstInteractionAt)}〜${fmtDate(u.lastInteractionAt)}`
      : "";
  const trend = trendLabel(u, isJa);
  const head = `  ${idx + 1}. @${u.screenName}（${name}メンション計 ${u.interactionCount ?? "?"}（相手→自分 ${u.mentionsReceived ?? "?"}・自分→相手 ${u.mentionsSent ?? "?"}）${span}${trend ? `・${trend}` : ""}）`;
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
  if (u.topEmojis?.length) facts.push(`絵文字: ${u.topEmojis.join(" ")}`);
  if (facts.length) lines.push(`      ${facts.join("・")}`);
  if (u.latestFromThem) lines.push(`      相手の最近の投稿: 「${u.latestFromThem}」`);
  if (u.latestFromThem2) lines.push(`      相手の1つ前の投稿: 「${u.latestFromThem2}」`);
  if (u.latestToThem) lines.push(`      自分→相手の最近の投稿: 「${u.latestToThem}」`);
  if (u.latestToThem2) lines.push(`      自分→相手の1つ前の投稿: 「${u.latestToThem2}」`);
  if (u.exchange?.length) {
    lines.push(`      【最近のやり取り（新しい順）】`);
    for (const x of u.exchange) {
      lines.push(`        ${fmtTs(x.t)} ${x.dir === "from" ? "相手→自分" : "自分→相手"}: 「${x.text}」`);
    }
  }
  return lines.join("\n");
}

function buildUserDataSection(users: CircleUser[], isJa: boolean): string {
  if (users.length === 0) return isJa ? "（データなし）" : "(no data)";
  return users.slice(0, 20).map((u, i) => userLine(u, i, isJa)).join("\n");
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
  const userData = buildUserDataSection(users, isJa);

  const usersHeader = isJa ? "【交流相手データ（トップ20）】" : "【Interaction partners (top 20)】";

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
    if (parts.length) extrasSection = "\n\n" + parts.join("\n\n");
  }

  const legend = isJa
    ? "\n\n【データの見方】メンション計=双方向の合計。返信速度=1時間以内の反応ペアから算出した中央値。交流期間=この30日データ内での初回〜最終。直近7日=勢いの指標。"
    : "\n\n【How to read】Total=both directions. Reply speed=median of reactions within 1h. Span=first-last in this 30d window. last7d=momentum.";

  let extra = "";
  if (partnerScreenName) {
    const partner = users.find((u) => u.screenName.toLowerCase() === partnerScreenName.toLowerCase());
    const partnerLine = partner
      ? userLine(partner, 0, isJa)
      : isJa
        ? `  @${partnerScreenName}（この相手のデータは今回の取得範囲にありません）`
        : `  @${partnerScreenName} (no data in this range)`;
    extra = isJa
      ? `\n\n【相性診断の相手】\n${partnerLine}\n\nこの相手との相性を、メンションの頻度・相互交流のバランス・投稿文面のノリの相性などから総合的に診断し、100点満点で採点してください。`
      : `\n\n【Compatibility Partner】\n${partnerLine}\n\nEvaluate compatibility with this user based on mention frequency, interaction balance, and tone/style of posts. Score out of 100.`;
  }

  const ending = isJa
    ? "\n\n【出力形式】\n1. 診断結果のタイトル\n2. 総合評価（点数または段階）\n3. 詳細な分析（箇条書き3〜5項目・各項目に実際の投稿文面を1つ以上引用）\n4. 一言アドバイス\n\n面白おかしく、占い師のような文体でお願いします。"
    : "\n\n【Output Format】\n1. Diagnosis title\n2. Overall rating (score or grade)\n3. Detailed analysis (3-5 bullets, each citing at least one actual post text)\n4. One-line advice\n\nUse a fun, fortune-teller-like tone.";

  return base + selfSection + extrasSection + legend + "\n\n" + usersHeader + "\n" + userData + extra + ending;
}
