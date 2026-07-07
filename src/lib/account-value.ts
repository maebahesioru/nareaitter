import type { CircleUser, SelfProfile } from "@/types/circle";

export type AccountValueResult = {
  estimatedPriceYen: number;
  metrics: {
    followers: number;
    tweets: number;
    accountAgeDays: number;
    totalMentions: number;
    uniqueUsers: number;
    avgScore: number;
    topUserScore: number;
  };
  grade: string;
  gradeJa: string;
};

function parseAccountAgeDays(joinedAt?: string): number {
  if (!joinedAt) return 0;
  try {
    const d = new Date(joinedAt);
    if (isNaN(d.getTime())) return 0;
    return Math.max(1, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

export function estimateAccountValue(users: CircleUser[], profile: SelfProfile): AccountValueResult {
  const uniqueUsers = users.length;
  const totalMentions = profile.mentionTotal ?? users.reduce((s, u) => s + (u.interactionCount ?? 0), 0);
  const avgScore = uniqueUsers > 0
    ? users.reduce((s, u) => s + u.interactionScore, 0) / uniqueUsers
    : 0;
  const topUserScore = users[0]?.interactionScore ?? 0;
  const followers = profile.profileFollowers ?? 0;
  const tweets = profile.profileTweets ?? 0;
  const accountAgeDays = parseAccountAgeDays(profile.profileJoinedAt);

  // 計算ロジック
  let price = 0;

  // フォロワー数ベース: 1フォロワーあたり0.5〜2円（スコアに応じて変動）
  const followerRate = 0.5 + (avgScore / 100) * 1.5;
  price += Math.round(followers * followerRate);

  // ツイート数ボーナス
  price += tweets * 0.1;

  // 交流ボーナス（活発な交流はアカウント価値を上げる）
  price += totalMentions * 3;

  // アカウント年齢ボーナス（古いほど信頼性が高い、最大+50,000円）
  const ageBonus = Math.min(50000, accountAgeDays * 5);
  price += ageBonus;

  // ユニーク交流相手ボーナス
  price += uniqueUsers * avgScore * 10;

  price = Math.round(price);

  let grade = "C";
  let gradeJa = "Cランク";
  if (price >= 1000000) { grade = "S"; gradeJa = "Sランク（超優良）"; }
  else if (price >= 300000) { grade = "A"; gradeJa = "Aランク（優良）"; }
  else if (price >= 100000) { grade = "B"; gradeJa = "Bランク（普通）"; }
  else if (price >= 30000) { grade = "C"; gradeJa = "Cランク（低価格）"; }
  else { grade = "D"; gradeJa = "Dランク（価値なし）"; }

  return {
    estimatedPriceYen: price,
    metrics: {
      followers,
      tweets,
      accountAgeDays,
      totalMentions,
      uniqueUsers,
      avgScore: Math.round(avgScore),
      topUserScore,
    },
    grade,
    gradeJa,
  };
}
