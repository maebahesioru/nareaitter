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
  needsPartner: boolean;
};

export const DIAGNOSIS_DEFS: PromptDef[] = [
  {
    id: "death",
    title: { ja: "死亡時期・死因推測", en: "Death Prediction" },
    desc: { ja: "過去のツイート傾向から死亡時期と死因をAIが推測します", en: "AI predicts death date and cause from tweet patterns" },
    needsPartner: false,
  },
  {
    id: "retire",
    title: { ja: "引退時期推測", en: "Retirement Prediction" },
    desc: { ja: "アカウントの活動パターンから引退時期をAIが推測します", en: "AI predicts retirement date from account activity" },
    needsPartner: false,
  },
  {
    id: "compatibility",
    title: { ja: "相性診断", en: "Compatibility Test" },
    desc: { ja: "2人のメンション傾向から相性をAIが診断します", en: "AI diagnoses compatibility from mention patterns of two users" },
    needsPartner: true,
  },
  {
    id: "crush",
    title: { ja: "秘密の片思い推測", en: "Secret Crush Detection" },
    desc: { ja: "メンション頻度の偏りや返信速度から片思いの相手をAIが推測します", en: "AI detects secret crush from mention frequency and reply speed" },
    needsPartner: false,
  },
  {
    id: "stalker",
    title: { ja: "こっそり見てる人推測", en: "Secret Viewer Detection" },
    desc: { ja: "自分へのメンションがないのに相互フォロワーなどからこっそり見てる人をAIが推測します", en: "AI detects users who watch without mentioning" },
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
};

function fmtDate(iso?: string): string {
  return iso ? iso.slice(0, 10).replace(/-/g, "/") : "?";
}

function buildSelfSection(self: SelfInfo, selfTweets: string[] | undefined, isJa: boolean): string {
  const stats = [
    `@${self.screenName}`,
    self.displayName && self.displayName !== self.screenName ? `表示名「${self.displayName}」` : null,
    self.profileFollowers != null ? (isJa ? `フォロワー ${self.profileFollowers}` : `followers ${self.profileFollowers}`) : null,
    self.profileFollowing != null ? (isJa ? `フォロー ${self.profileFollowing}` : `following ${self.profileFollowing}`) : null,
    self.profileTweets != null ? (isJa ? `ツイート ${self.profileTweets}` : `tweets ${self.profileTweets}`) : null,
    self.profileJoinedAt ? (isJa ? `アカウント作成 ${self.profileJoinedAt}` : `joined ${self.profileJoinedAt}`) : null,
  ]
    .filter(Boolean)
    .join("、");
  const tweetList = (selfTweets ?? []).map((t) => `- 「${t}」`).join("\n");
  return (
    (isJa ? "【自分のプロフィール】" : "【My Profile】") +
    `\n${stats}\n\n` +
    (isJa ? "【自分の最近の投稿（メンション付き・新しい順）】" : "【My recent posts (with mentions, newest first)】") +
    `\n${tweetList || (isJa ? "（データなし）" : "(no data)")}`
  );
}

function userLine(u: CircleUser, idx: number, isJa: boolean): string {
  const name = u.displayName && u.displayName !== u.screenName ? `${u.displayName}／` : "";
  const head = `  ${idx + 1}. @${u.screenName}（${name}メンション計 ${u.interactionCount ?? "?"}（相手→自分 ${u.mentionsReceived ?? "?"}・自分→相手 ${u.mentionsSent ?? "?"}）・最終交流 ${fmtDate(u.lastInteractionAt)}）`;
  const lines = [head];
  if (u.latestFromThem) lines.push(`      相手の最近の投稿: 「${u.latestFromThem}」`);
  if (u.latestToThem) lines.push(`      自分→相手の最近の投稿: 「${u.latestToThem}」`);
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
): string {
  const isJa = locale === "ja";
  const def = DIAGNOSIS_DEFS.find((d) => d.id === type)!;
  const base = isJa
    ? `以下はX（Twitter）ユーザー「@${self.screenName}」の過去30日間の公開データ（メンション交流・実際の投稿文面・プロフィール）です。\n\nあなたは優秀なAI占い師／分析官です。このデータをもとに、「${def.title.ja}」をしてください。\n実際の投稿文面（語調・話題・頻度）を根拠として必ず引用しながら分析してください。\n\n【診断してほしいこと】\n${def.desc.ja}\n\n`
    : `Below is 30 days of public data (mention interactions, actual post texts, profile) for X user "@${self.screenName}".\n\nYou are an expert AI fortune teller / analyst. Based on this data, perform "${def.title.en}".\nCite the actual post texts (tone, topics, frequency) as evidence in your analysis.\n\n【What to diagnose】\n${def.desc.en}\n\n`;

  const selfSection = buildSelfSection(self, selfTweets, isJa);
  const userData = buildUserDataSection(users, isJa);

  const usersHeader = isJa ? "【交流相手データ（トップ20）】" : "【Interaction partners (top 20)】";

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

  return base + selfSection + "\n\n" + usersHeader + "\n" + userData + extra + ending;
}
