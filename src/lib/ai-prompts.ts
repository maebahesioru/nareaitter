import type { CircleUser } from "@/types/circle";

export type DiagnosisType =
  | "death"
  | "retire"
  | "compatibility"
  | "crush"
  | "stalker"
  | "value";

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
  {
    id: "value",
    title: { ja: "アカウント売却価格推測", en: "Account Value Estimation" },
    desc: { ja: "フォロワー数・エンゲージメント・活動頻度からアカウントの推定売却価格をAIが算出します", en: "AI estimates account sale value from followers, engagement, activity" },
    needsPartner: false,
  },
];

function buildUserDataSection(users: CircleUser[]): string {
  if (users.length === 0) return "（データなし）";
  const top = users.slice(0, 20);
  return top.map((u, i) =>
    `  ${i + 1}. @${u.screenName} (メンション数: ${u.interactionCount ?? "?"}、交流スコア: ${u.interactionScore})`
  ).join("\n");
}

export function generatePrompt(
  type: DiagnosisType,
  locale: "ja" | "en",
  selfScreenName: string,
  users: CircleUser[],
  partnerScreenName?: string,
): string {
  const isJa = locale === "ja";
  const def = DIAGNOSIS_DEFS.find((d) => d.id === type)!;
  const base = isJa
    ? `以下はX（Twitter）ユーザー「@${selfScreenName}」の過去30日間のメンション交流データです。\n\nあなたは優秀なAI占い師／分析官です。このデータをもとに、「${def.title.ja}」をしてください。\n\n【診断してほしいこと】\n${def.desc.ja}\n\n【交流データ】\n`
    : `Below is the mention interaction data for X (Twitter) user "@${selfScreenName}" over the past 30 days.\n\nYou are an expert AI fortune teller / analyst. Based on this data, please perform "${def.title.en}".\n\n【What to diagnose】\n${def.desc.en}\n\n【Interaction Data】\n`;

  const userData = buildUserDataSection(users);

  let extra = "";
  if (partnerScreenName) {
    extra = isJa
      ? `\n【相性診断の相手】\n@${partnerScreenName}\n\nこの相手との相性を、メンションの頻度・相互交流のバランス・返信の速さなどから総合的に診断し、100点満点で採点してください。`
      : `\n【Compatibility Partner】\n@${partnerScreenName}\n\nPlease evaluate compatibility with this user based on mention frequency, interaction balance, and reply speed. Score out of 100.`;
  }

  const ending = isJa
    ? "\n【出力形式】\n1. 診断結果のタイトル\n2. 総合評価（点数または段階）\n3. 詳細な分析（箇条書き3〜5項目）\n4. 一言アドバイス\n\n面白おかしく、占い師のような文体でお願いします。"
    : "\n【Output Format】\n1. Diagnosis title\n2. Overall rating (score or grade)\n3. Detailed analysis (3-5 bullet points)\n4. One-line advice\n\nPlease use a fun, fortune-teller-like tone.";

  return base + userData + extra + ending;
}
