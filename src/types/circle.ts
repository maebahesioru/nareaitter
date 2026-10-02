export type CircleUser = {
  id: string;
  screenName: string;
  displayName: string;
  /** Yahoo profileImage など。先に仮表示 */
  avatarUrlPreview?: string;
  /** fxtwitter / vxtwitter（高画質）。取れたら preview の上に描き直す */
  avatarUrl?: string;
  /** 0–100 想定。大きいほどアイコンがやや大きくなりやすい */
  interactionScore: number;
  /** 相手との馴れ合い回数（合算）。API から付くときはサイズ計算に使う */
  interactionCount?: number;
  /** 内訳: 相手→あなたのメンション回数（表示期間内） */
  mentionsReceived?: number;
  /** 内訳: あなた→相手のメンション回数（表示期間内） */
  mentionsSent?: number;
  /** 最後にやりとりした日時（ISO 8601）。不明なら undefined */
  lastInteractionAt?: string;
  /** 相手の最新投稿（自分宛メンション）の文面。上位ユーザーのみ */
  latestFromThem?: string;
  /** 自分の最新投稿（相手宛メンション）の文面。上位ユーザーのみ */
  latestToThem?: string;
  /** 相手の1つ前の投稿文面（トップ20のみ） */
  latestFromThem2?: string;
  /** 自分の1つ前の投稿文面（トップ20のみ） */
  latestToThem2?: string;
  /** 直近7日間の交流回数（上位ユーザーのみ） */
  mentionsLast7d?: number;
  /** 最初に交流した日時（ISO 8601・上位ユーザーのみ） */
  firstInteractionAt?: string;
  /** プロフィール文（上位8人のみ） */
  bio?: string;
  /** 相手の最も多い活動時間帯（0-23・上位ユーザーのみ） */
  activeHour?: number;
  /** 相手のよく使う絵文字（上位20人のみ） */
  topEmojis?: string[];
  /** 相手→自分の返信速度（中央値・分・上位20人のみ） */
  replyThemMin?: number;
  /** 相手が使いがちな呼称（上位20人のみ） */
  vocative?: string;
  /** 笑い方の癖（ｗ派/笑派/草派・上位20人のみ） */
  laugh?: string;
  /** 平均文字数（上位20人のみ） */
  avgLen?: number;
  /** 初対面時の相手の文面（上位20人のみ） */
  firstFromThem?: string;
  /** 初対面時の自分の文面（上位20人のみ） */
  firstToThem?: string;
  /** 相手の週次カウント（上位20人のみ・4週前→今週） */
  weekly?: number[];
  /** 相手の敬語率 0-100（上位20人のみ） */
  keigoRate?: number;
  /** 最速レス 相手→自分（秒・上位20人のみ） */
  fastestThemSec?: number;
  /** 最速レス 自分→相手（秒・上位20人のみ） */
  fastestMeSec?: number;
  /** 自分→相手の返信速度（中央値・分・上位20人のみ） */
  replyMeMin?: number;
  /** 直近のやり取りの流れ（上位5人のみ・新しい順） */
  exchange?: Array<{ t: number; dir: "from" | "to"; text: string }>;
};

export type FamilyRelationType = "self" | "parent" | "spouse" | "child" | "sibling" | "relative";

export type FamilyTreeNode = {
  user: CircleUser;
  relation: FamilyRelationType;
  confidence: number; // 0-100
  children?: FamilyTreeNode[];
};

export type FamilyTreeData = {
  root: FamilyTreeNode;
  branches: Record<FamilyRelationType, FamilyTreeNode[]>;
};

export type SelfProfile = {
  screenName: string;
  displayName: string;
  /** Yahoo 本人投稿の profileImage（仮） */
  avatarUrlPreview?: string;
  /** fxtwitter / vxtwitter（高画質） */
  avatarUrl?: string;
  /** あなたへの＋あなたからのメンション件数の合計（表示期間内） */
  mentionTotal?: number;
  /** fxtwitter プロフィール（アカウント売却推定に使用） */
  profileFollowers?: number;
  profileFollowing?: number;
  profileTweets?: number;
  profileLikes?: number;
  profileJoinedAt?: string;
  /** プロフィール文（bio） */
  profileDescription?: string;
};

/** グリッド上の相手ユーザー1件（位置は canvas 側で行列から決定） */
export type CircleLayoutSlot = {
  user: CircleUser;
  /** interactionScore 由来のサイズ倍率 */
  avatarScaleFactor: number;
};
