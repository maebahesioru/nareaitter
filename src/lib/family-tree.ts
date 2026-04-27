import type { CircleUser, FamilyRelationType, FamilyTreeData, FamilyTreeNode } from "@/types/circle";

export type { FamilyRelationType, FamilyTreeNode, FamilyTreeData };

export type ExtendedRelationType =
  | "self"
  | "spouse"
  | "parent"
  | "grandparent"
  | "greatGrandparent"
  | "child"
  | "grandchild"
  | "greatGrandchild"
  | "sibling"
  | "uncle"
  | "cousin"
  | "nephew"
  | "extended";

type TierDef = {
  relation: ExtendedRelationType;
  rankStart: number;
  rankEnd: number;
  maxCount: number;
};

const TIERS: TierDef[] = [
  { relation: "spouse",            rankStart: 0,    rankEnd: 0.06,  maxCount: 1 },
  { relation: "parent",            rankStart: 0.06, rankEnd: 0.14,  maxCount: 2 },
  { relation: "grandparent",       rankStart: 0.14, rankEnd: 0.24,  maxCount: 4 },
  { relation: "greatGrandparent",  rankStart: 0.24, rankEnd: 0.33,  maxCount: 4 },
  { relation: "sibling",           rankStart: 0.33, rankEnd: 0.46,  maxCount: 6 },
  { relation: "child",             rankStart: 0.46, rankEnd: 0.58,  maxCount: 4 },
  { relation: "grandchild",        rankStart: 0.58, rankEnd: 0.67,  maxCount: 2 },
  { relation: "greatGrandchild",   rankStart: 0.67, rankEnd: 0.75,  maxCount: 2 },
  { relation: "uncle",             rankStart: 0.75, rankEnd: 0.82,  maxCount: 2 },
  { relation: "nephew",            rankStart: 0.82, rankEnd: 0.88,  maxCount: 2 },
  { relation: "cousin",            rankStart: 0.88, rankEnd: 1.0,   maxCount: 2 },
];

function assignTier(index: number, total: number): ExtendedRelationType {
  const normalizedRank = total > 1 ? index / (total - 1) : 0;
  for (const tier of TIERS) {
    if (normalizedRank >= tier.rankStart && normalizedRank < tier.rankEnd) {
      return tier.relation;
    }
  }
  return "cousin";
}

export function buildFamilyTree(
  users: CircleUser[],
  selfScreenName: string,
): FamilyTreeData & { extendedNodes: Record<ExtendedRelationType, FamilyTreeNode[]> } {
  const sorted = [...users].sort((a, b) => b.interactionScore - a.interactionScore);
  const totalUsers = sorted.length;

  const extendedNodes: Record<ExtendedRelationType, FamilyTreeNode[]> = {
    self: [],
    spouse: [],
    parent: [],
    grandparent: [],
    greatGrandparent: [],
    child: [],
    grandchild: [],
    greatGrandchild: [],
    sibling: [],
    uncle: [],
    cousin: [],
    nephew: [],
    extended: [],
  };

  const tierCounts: Record<ExtendedRelationType, number> = {
    self: 0, spouse: 0, parent: 0, grandparent: 0, greatGrandparent: 0,
    child: 0, grandchild: 0, greatGrandchild: 0,
    sibling: 0, uncle: 0, cousin: 0, nephew: 0, extended: 0,
  };

  for (let i = 0; i < sorted.length; i++) {
    const user = sorted[i];
    const baseRelation = assignTier(i, totalUsers);
    const tier = TIERS.find((t) => t.relation === baseRelation);
    const confidence = Math.round(Math.max(10, Math.min(90, (1 - i / Math.max(1, totalUsers)) * 80 + 10)));

    if (tier && tierCounts[baseRelation] < tier.maxCount) {
      const node: FamilyTreeNode = {
        user,
        relation: baseRelation as FamilyRelationType,
        confidence,
      };
      extendedNodes[baseRelation].push(node);
      tierCounts[baseRelation]++;
    }
    // 上限を超えたユーザーは表示しない
  }

  const root: FamilyTreeNode = {
    user: {
      id: `self-${selfScreenName}`,
      screenName: selfScreenName,
      displayName: selfScreenName,
      interactionScore: 100,
    },
    relation: "self",
    confidence: 100,
  };

  const branches: Record<FamilyRelationType, FamilyTreeNode[]> = {
    self: extendedNodes.self,
    spouse: extendedNodes.spouse,
    parent: [...extendedNodes.parent, ...extendedNodes.grandparent, ...extendedNodes.greatGrandparent],
    child: [...extendedNodes.child, ...extendedNodes.grandchild, ...extendedNodes.greatGrandchild],
    sibling: [...extendedNodes.sibling, ...extendedNodes.uncle, ...extendedNodes.cousin, ...extendedNodes.nephew],
    relative: extendedNodes.extended,
  };

  return { root, branches, extendedNodes };
}

// ── 全表示用の定数（99 は事実上限なし） ──

export const ANCESTOR_TIERS: ExtendedRelationType[] = ["greatGrandparent", "grandparent", "parent"];
export const PEER_TIERS: ExtendedRelationType[] = ["spouse", "sibling"];
export const DESCENDANT_TIERS: ExtendedRelationType[] = ["child", "grandchild", "greatGrandchild"];
export const EXTENDED_TIERS: ExtendedRelationType[] = ["uncle", "nephew", "cousin"];
export const ALL_TIERS: ExtendedRelationType[] = [
  "greatGrandparent", "grandparent", "parent",
  "spouse", "sibling",
  "child", "grandchild", "greatGrandchild",
  "uncle", "nephew", "cousin",
];

const RELATION_LABELS: Record<ExtendedRelationType, { ja: string; en: string }> = {
  self: { ja: "自分", en: "Self" },
  spouse: { ja: "配偶者", en: "Spouse" },
  parent: { ja: "親", en: "Parent" },
  grandparent: { ja: "祖父母", en: "Grandparent" },
  greatGrandparent: { ja: "曽祖父母", en: "Great-grandparent" },
  child: { ja: "子ども", en: "Child" },
  grandchild: { ja: "孫・孫の配偶者", en: "Grandchild & spouse" },
  greatGrandchild: { ja: "曽孫", en: "Great-grandchild" },
  sibling: { ja: "兄弟・姉妹", en: "Sibling" },
  uncle: { ja: "叔父・叔母・伯父・伯母", en: "Uncle/Aunt" },
  cousin: { ja: "いとこ・はとこ", en: "Cousin" },
  nephew: { ja: "甥・姪", en: "Nephew/Niece" },
  extended: { ja: "その他の遠戚", en: "Extended Family" },
};

const RELATION_EMOJIS: Record<ExtendedRelationType, string> = {
  self: "👤", spouse: "💑", parent: "👨‍👦",
  grandparent: "👴", greatGrandparent: "🧓",
  child: "👶", grandchild: "👼", greatGrandchild: "🍼",
  sibling: "👫", uncle: "🧑‍🧑‍🧒", cousin: "👯",
  nephew: "🧒", extended: "👨‍👩‍👧‍👦",
};

export function getRelationLabel(relation: ExtendedRelationType, locale: "ja" | "en"): string {
  return RELATION_LABELS[relation][locale];
}

export function getRelationEmoji(relation: ExtendedRelationType): string {
  return RELATION_EMOJIS[relation];
}
