import { resolveCircleAvatarUrl } from "@/lib/x-profile-image";
import {
  getAvatarBackfillTargets,
  noteAvatarAttempt,
  setUserAvatar,
} from "@/lib/stats-store";

/**
 * 統計ストアのアバターを fxtwitter / vxtwitter 経由で解決して保存する。
 *
 * サークル画面（CircleApp）は CircleUser.avatarUrl に fxtwitter の高画質URL
 * （pbs.twimg.com の _400x400）を入れて image-proxy 経由で表示している。
 * 統計側も同じものを持たせたいが、ペイロードビルド時には相手が上位20〜64人
 * ぶんしかHD解決されないので、未取得のユーザーを後から追いかけて埋める。
 *
 * 1回の呼び出しで最大 limit 人。並列3・1人あたり最大3.5秒で、
 * 失敗した相手は6時間スキップする（noteAvatarAttempt）。
 */

const inflight = new Set<string>();
let running = false;

export async function backfillStatsAvatars(limit = 30, gapMs = 250): Promise<number> {
  if (running) return 0;
  running = true;
  let saved = 0;
  try {
    const queue = getAvatarBackfillTargets(limit).filter(
      (s) => !inflight.has(s.toLowerCase()),
    );
    const worker = async () => {
      for (;;) {
        const screen = queue.shift();
        if (!screen) return;
        const key = screen.toLowerCase();
        if (inflight.has(key)) continue;
        inflight.add(key);
        if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
        try {
          const hd = await resolveCircleAvatarUrl(screen);
          if (hd && setUserAvatar(screen, hd)) saved += 1;
          noteAvatarAttempt(screen);
        } catch {
          noteAvatarAttempt(screen);
        } finally {
          inflight.delete(key);
        }
      }
    };
    await Promise.all([worker(), worker()]);
  } finally {
    running = false;
  }
  return saved;
}
