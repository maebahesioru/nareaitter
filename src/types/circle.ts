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
};

/** グリッド上の相手ユーザー1件（位置は canvas 側で行列から決定） */
export type CircleLayoutSlot = {
  user: CircleUser;
  /** interactionScore 由来のサイズ倍率 */
  avatarScaleFactor: number;
};
