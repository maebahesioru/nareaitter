import type { CircleUser, SelfProfile } from "@/types/circle";

/** 査定の根拠1項目（内訳表示用） */
export type ValueFactor = {
  id: string;
  label: string;
  value: string;
  /** 価格への寄与（円・負あり） */
  yen: number;
  comment: string;
};

export type AccountValueResult = {
  estimatedPriceYen: number;
  priceLow: number;
  priceHigh: number;
  confidence: "high" | "mid" | "low";
  confidenceLabel: string;
  factors: ValueFactor[];
  grade: string;
  gradeJa: string;
  metrics: {
    followers: number;
    following: number;
    tweets: number;
    likes: number;
    accountAgeDays: number;
    totalMentions: number;
    received30d: number;
    sent30d: number;
    uniqueUsers: number;
    mutualUsers: number;
    coreUsers: number;
    avgScore: number;
    topUserScore: number;
    topShare: number;
  };
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

/** フォロワー数→基盤価値（逓減カーブ。実売相場を参考にした段階レート） */
function followerBaseValue(f: number): number {
  const tiers: Array<[number, number]> = [
    [1000, 2.2],
    [5000, 1.4],
    [20000, 0.9],
    [100000, 0.6],
    [Infinity, 0.35],
  ];
  let val = 0;
  let prev = 0;
  for (const [cap, rate] of tiers) {
    if (f <= prev) break;
    val += (Math.min(f, cap) - prev) * rate;
    prev = cap;
  }
  return Math.round(val);
}

/** きりのいい金額に丸める（表示用レンジ） */
function roundNice(v: number): number {
  if (v >= 100000) return Math.round(v / 10000) * 10000;
  if (v >= 10000) return Math.round(v / 1000) * 1000;
  if (v >= 1000) return Math.round(v / 100) * 100;
  return Math.round(v / 10) * 10;
}

export function estimateAccountValue(users: CircleUser[], profile: SelfProfile): AccountValueResult {
  const uniqueUsers = users.length;
  const followers = profile.profileFollowers ?? 0;
  const following = profile.profileFollowing ?? 0;
  const tweets = profile.profileTweets ?? 0;
  const likes = profile.profileLikes ?? 0;
  const accountAgeDays = parseAccountAgeDays(profile.profileJoinedAt);
  const years = accountAgeDays / 365;

  const totalMentions = profile.mentionTotal ?? users.reduce((s, u) => s + (u.interactionCount ?? 0), 0);
  const received30d = users.reduce((s, u) => s + (u.mentionsReceived ?? 0), 0);
  const sent30d = users.reduce((s, u) => s + (u.mentionsSent ?? 0), 0);
  const mutualUsers = users.filter((u) => (u.mentionsReceived ?? 0) > 0 && (u.mentionsSent ?? 0) > 0).length;
  const coreUsers = users.filter((u) => (u.interactionCount ?? 0) >= 5).length;
  const avgScore = uniqueUsers > 0 ? users.reduce((s, u) => s + u.interactionScore, 0) / uniqueUsers : 0;
  const topUserScore = users[0]?.interactionScore ?? 0;
  const topShare = totalMentions > 0 ? (users[0]?.interactionCount ?? 0) / totalMentions : 0;

  const factors: ValueFactor[] = [];

  // 1) フォロワー基盤（本体価格）
  const base = followerBaseValue(followers);
  factors.push({
    id: "followers",
    label: "フォロワー基盤",
    value: `${followers.toLocaleString()}人`,
    yen: base,
    comment: followers < 100 ? "小規模だがニッチ需要あり" : followers < 1000 ? "駆け出し規模" : followers < 10000 ? "中堅規模" : "大口案件",
  });

  // 2) エンゲージメント（30日の被メンション ÷ フォロワー）
  const engRate = received30d / Math.max(100, followers);
  const engYen = Math.round(Math.min(40000, received30d * 8 * Math.min(3, Math.max(0.4, engRate * 8))));
  factors.push({
    id: "engagement",
    label: "エンゲージメント",
    value: `被メンション ${received30d}件/30日`,
    yen: engYen,
    comment: engRate >= 0.5 ? "フォロワーに対し異常な交流量（化け物）" : engRate >= 0.15 ? "比率は良好で生きている垢" : "交流は控えめ",
  });

  // 3) 交流ネットワーク
  const netYen = Math.min(80000, uniqueUsers * 40 + mutualUsers * 120 + coreUsers * 200);
  factors.push({
    id: "network",
    label: "交流ネットワーク",
    value: `相手 ${uniqueUsers}人（相互${mutualUsers}・濃い${coreUsers}）`,
    yen: netYen,
    comment: mutualUsers >= 50 ? "相互の網が濃くコミュニティ内で有力" : mutualUsers >= 10 ? "そこそこの人的ネットワーク" : "ネットワークは薄め",
  });

  // 4) 投稿の継続性
  const tweetsPerDay = accountAgeDays > 0 ? tweets / accountAgeDays : 0;
  const contYen =
    Math.min(20000, sent30d * 6) +
    (accountAgeDays > 0 ? Math.min(8000, Math.round(tweetsPerDay * 1200)) : 0);
  factors.push({
    id: "continuity",
    label: "投稿の継続性",
    value: accountAgeDays > 0 ? `${tweets.toLocaleString()}件・${tweetsPerDay.toFixed(1)}/日` : `${tweets.toLocaleString()}件・ペース不明`,
    yen: contYen,
    comment:
      accountAgeDays > 0
        ? tweetsPerDay >= 3 ? "ヘビーユーザー（高頻度稼働）" : tweetsPerDay >= 0.5 ? "安定稼働中" : "低頻度（休眠気味）"
        : sent30d >= 30 ? `30日で${sent30d}件のメンション送信（活発）` : sent30d > 0 ? "交流は控えめ" : "30日の交流なし",
  });

  // 5) アカウント年齢
  const ageYen = Math.min(30000, Math.round(years * 4000));
  factors.push({
    id: "age",
    label: "アカウント年齢",
    value: accountAgeDays > 0 ? `${Math.floor(accountAgeDays / 365)}年${accountAgeDays % 365}日` : "不明",
    yen: ageYen,
    comment: accountAgeDays <= 0 ? "作成日不明（加点なし）" : years >= 5 ? "古参の風格（安定資産）" : years >= 2 ? "そこそこの年季" : "若いアカウント",
  });

  // 6) フォロー比（権威性）
  const ratio = following > 0 ? followers / following : followers > 0 ? 99 : 0;
  let ratioYen = 0;
  let ratioComment = "フォロー数不明";
  if (following > 3 || followers > 3) {
    if (ratio >= 3) { ratioYen = Math.min(20000, Math.round(base * 0.12)); ratioComment = "一方的に持たれる側（権威あり）"; }
    else if (ratio >= 1) { ratioYen = Math.round(base * 0.04); ratioComment = "健全なバランス"; }
    else { ratioYen = -Math.min(20000, Math.round(base * 0.15)); ratioComment = "フォロー過多（フォロバ依存気味）"; }
  }
  factors.push({
    id: "ratio",
    label: "フォロー比",
    value: following > 0 ? `${ratio.toFixed(2)}倍（${followers}/${following}）` : "—",
    yen: ratioYen,
    comment: ratioComment,
  });

  // 7) 交流の集中リスク（1人依存は減点・広く分散は加点）
  let concYen = 0;
  let concComment = "交流データ不足";
  if (uniqueUsers >= 5) {
    if (topShare >= 0.35) { concYen = -Math.round(Math.min(30000, netYen * 0.35)); concComment = "特定の1人に交流が集中（属人的リスク）"; }
    else if (topShare <= 0.08) { concYen = Math.round(Math.min(15000, netYen * 0.15)); concComment = "交流が広く分散（組織的価値）"; }
    else concComment = "適度に分散";
  }
  factors.push({
    id: "concentration",
    label: "交流の集中度",
    value: totalMentions > 0 ? `最大相手シェア ${Math.round(topShare * 100)}%` : "—",
    yen: concYen,
    comment: concComment,
  });

  // 8) いいね履歴（副次シグナル）
  const likeYen = likes > 0 ? Math.min(5000, Math.round(likes * 0.02)) : 0;
  factors.push({
    id: "likes",
    label: "いいね履歴",
    value: likes > 0 ? `${likes.toLocaleString()}件` : "不明",
    yen: likeYen,
    comment: likes >= 10000 ? "大量のエンゲージ履歴" : likes > 0 ? "そこそこアクティブ" : "データなし",
  });

  const raw = factors.reduce((s, f) => s + f.yen, 0);
  const estimatedPriceYen = Math.max(0, Math.round(raw));

  // 確度（データ充実度で決まる）
  let confScore = 0;
  if (followers > 0) confScore += 1;
  if (users.length >= 50) confScore += 1;
  else if (users.length > 0) confScore += 0.5;
  if (totalMentions >= 50) confScore += 1;
  else if (totalMentions > 0) confScore += 0.3;
  const confidence: "high" | "mid" | "low" = confScore >= 2.5 ? "high" : confScore >= 1.5 ? "mid" : "low";
  const spread = confidence === "high" ? 0.18 : confidence === "mid" ? 0.3 : 0.5;
  const priceLow = roundNice(Math.max(0, estimatedPriceYen * (1 - spread)));
  const priceHigh = roundNice(estimatedPriceYen * (1 + spread));

  let grade = "C";
  let gradeJa = "Cランク（低価格）";
  if (estimatedPriceYen >= 300000) { grade = "S"; gradeJa = "Sランク（超優良）"; }
  else if (estimatedPriceYen >= 100000) { grade = "A"; gradeJa = "Aランク（優良）"; }
  else if (estimatedPriceYen >= 30000) { grade = "B"; gradeJa = "Bランク（普通）"; }
  else if (estimatedPriceYen >= 5000) { grade = "C"; gradeJa = "Cランク（低価格）"; }
  else { grade = "D"; gradeJa = "Dランク（価値なし）"; }

  return {
    estimatedPriceYen,
    priceLow,
    priceHigh,
    confidence,
    confidenceLabel: confidence === "high" ? "確度: 高（データ充実）" : confidence === "mid" ? "確度: 中（概ね良好）" : "確度: 低（データ少なめ）",
    factors,
    grade,
    gradeJa,
    metrics: {
      followers,
      following,
      tweets,
      likes,
      accountAgeDays,
      totalMentions,
      received30d,
      sent30d,
      uniqueUsers,
      mutualUsers,
      coreUsers,
      avgScore: Math.round(avgScore),
      topUserScore,
      topShare,
    },
  };
}
