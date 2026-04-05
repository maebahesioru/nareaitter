import type { CircleLayoutSlot, CircleUser } from "@/types/circle";

/**
 * 相手一覧。自分は canvas 中央の別枠、相手はその周りのマスに中心に近い順で並べるため、
 * 馴れ合い回数降順（なければスコア降順）。avatarScaleFactor は互換のため 1 固定。
 */
export function layoutUsers(users: CircleUser[]): CircleLayoutSlot[] {
  const sorted = [...users].sort((a, b) => {
    const ac = a.interactionCount ?? 0;
    const bc = b.interactionCount ?? 0;
    if (ac > 0 || bc > 0) {
      if (bc !== ac) return bc - ac;
    }
    return b.interactionScore - a.interactionScore;
  });
  return sorted.map((user) => ({
    user,
    avatarScaleFactor: 1,
  }));
}
