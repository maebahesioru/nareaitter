/** FixTweet（fxtwitter）と BetterTwitFix（vxtwitter）の User API を並列で使う */

const FX_USER_API = "https://api.fxtwitter.com";
const VX_USER_API = "https://api.vxtwitter.com";

type FxTwitterUserResponse = {
  code: number;
  message: string;
  user?: {
    avatar_url?: string;
    banner_url?: string;
    followers?: number;
    following?: number;
    tweets?: number;
    likes?: number;
    created_at?: string;
  };
};

export type XProfileData = {
  followers: number;
  following: number;
  tweets: number;
  likes: number;
  joinedAt: string;
};

/**
 * API が返す URL は多くが `_normal`（~48px）。可能な限り `_400x400`（400px 系）に差し替え。
 */
export function upscaledTwitterProfileImageUrl(url: string): string {
  const raw = url.trim();
  try {
    const u = new URL(raw);
    if (!u.hostname.endsWith("pbs.twimg.com") || !u.pathname.includes("/profile_images/")) {
      return raw;
    }
    let p = u.pathname;
    p = p
      .replace(/_normal(\.[a-z]+)$/i, "_400x400$1")
      .replace(/_mini(\.[a-z]+)$/i, "_400x400$1")
      .replace(/_bigger(\.[a-z]+)$/i, "_400x400$1")
      .replace(/_reasonably_small(\.[a-z]+)$/i, "_400x400$1")
      .replace(/_200x200(\.[a-z]+)$/i, "_400x400$1");
    u.pathname = p;
    return u.toString();
  } catch {
    return raw;
  }
}

/** アバター取得の結果。dead=true は「アカウントが存在しない」等の確定失敗（リトライ無意味） */
type AvatarProbe = { url: string | null; dead: boolean };

async function fetchAvatarFxtwitter(cleanScreenName: string): Promise<AvatarProbe> {
  try {
    const res = await fetch(
      `${FX_USER_API}/${encodeURIComponent(cleanScreenName)}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) },
    );
    if (res.status === 404 || res.status === 410) return { url: null, dead: true };
    if (!res.ok) return { url: null, dead: false };
    const data = (await res.json()) as FxTwitterUserResponse;
    if (data.code === 404) return { url: null, dead: true };
    if (data.code !== 200 || !data.user?.avatar_url?.trim()) {
      return { url: null, dead: false };
    }
    return {
      url: upscaledTwitterProfileImageUrl(data.user.avatar_url.trim()),
      dead: false,
    };
  } catch {
    return { url: null, dead: false };
  }
}

/** vxtwitter はフラット JSON（profile_image_url）。fxtwitter とは形が異なる */
async function fetchAvatarVxtwitter(cleanScreenName: string): Promise<AvatarProbe> {
  try {
    const res = await fetch(
      `${VX_USER_API}/${encodeURIComponent(cleanScreenName)}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) },
    );
    if (res.status === 404 || res.status === 410) return { url: null, dead: true };
    if (!res.ok) return { url: null, dead: false };
    const data = (await res.json()) as { profile_image_url?: string };
    const raw = data.profile_image_url?.trim();
    if (!raw) return { url: null, dead: false };
    return { url: upscaledTwitterProfileImageUrl(raw), dead: false };
  } catch {
    return { url: null, dead: false };
  }
}

/** 一時的な 429 / 空振り向け（長すぎると表全体が数分待ちになる） */
const AVATAR_RETRY_ATTEMPTS = 3;
const AVATAR_RETRY_BASE_DELAY_MS = 120;

/**
 * fxtwitter を先に試し、失敗したときだけ vxtwitter にフォールバックする。
 * 両方で「存在しない(404)」なら dead=true（リトライしても無駄と判定）。
 */
async function fetchXAvatarUrlOnce(cleanScreenName: string): Promise<AvatarProbe> {
  const fx = await fetchAvatarFxtwitter(cleanScreenName);
  if (fx.url) return fx;
  const vx = await fetchAvatarVxtwitter(cleanScreenName);
  if (vx.url) return vx;
  return { url: null, dead: fx.dead && vx.dead };
}

/**
 * 同一プロセス内の再取得を抑える。人気アカウントは複数のサークルに繰り返し現れるため、
 * ここが効くと全体の取得数が大きく下がる。
 */
const AVATAR_MEM_TTL_MS = 6 * 60 * 60 * 1000;
const AVATAR_MEM_MAX = 4096;
const avatarMem = new Map<string, { t: number; url: string }>();

function readAvatarMem(key: string): string | null {
  const hit = avatarMem.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > AVATAR_MEM_TTL_MS) {
    avatarMem.delete(key);
    return null;
  }
  return hit.url;
}

function writeAvatarMem(key: string, url: string): void {
  if (avatarMem.size >= AVATAR_MEM_MAX) avatarMem.clear();
  avatarMem.set(key, { t: Date.now(), url });
}

/** 確定死（存在しないアカウント等）のネガティブメモ。再ビルドのたびに無駄なリトライをしない */
const AVATAR_DEAD_TTL_MS = 6 * 60 * 60 * 1000;
const avatarDeadMem = new Map<string, number>();

function isAvatarKnownDead(key: string): boolean {
  const until = avatarDeadMem.get(key);
  if (until === undefined) return false;
  if (Date.now() > until) {
    avatarDeadMem.delete(key);
    return false;
  }
  return true;
}

function writeAvatarDeadMem(key: string): void {
  if (avatarDeadMem.size >= AVATAR_MEM_MAX) avatarDeadMem.clear();
  avatarDeadMem.set(key, Date.now() + AVATAR_DEAD_TTL_MS);
}

/**
 * 上記を最大 {@link AVATAR_RETRY_ATTEMPTS} 回。失敗のたびに間隔を空けて再試行（自分・相手共通）。
 * 両サービスが404を返したら確定死として即諦める（リトライラダーで数秒浪費しない）。
 */
export async function fetchXAvatarUrl(screenName: string): Promise<string | null> {
  const clean = screenName.replace(/^@/, "").trim();
  if (!clean) return null;
  const key = clean.toLowerCase();
  const cached = readAvatarMem(key);
  if (cached) return cached;
  if (isAvatarKnownDead(key)) return null;
  for (let attempt = 0; attempt < AVATAR_RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) =>
        setTimeout(r, AVATAR_RETRY_BASE_DELAY_MS * attempt),
      );
    }
    const probe = await fetchXAvatarUrlOnce(clean);
    if (probe.url?.trim()) {
      const trimmed = probe.url.trim();
      writeAvatarMem(key, trimmed);
      return trimmed;
    }
    if (probe.dead) {
      writeAvatarDeadMem(key);
      return null;
    }
  }
  return null;
}

/** サークル用。全試行で失敗したときは null（表示から除外） */
export async function resolveCircleAvatarUrl(screenName: string): Promise<string | null> {
  return fetchXAvatarUrl(screenName);
}

/**
 * fxtwitter の完全なユーザープロファイルを取得する。
 * アカウント推定売却価格などの計算に使用。
 */
export async function resolveProfileData(screenName: string): Promise<XProfileData | null> {
  const clean = screenName.replace(/^@/, "").trim();
  if (!clean) return null;

  for (let attempt = 0; attempt < AVATAR_RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, AVATAR_RETRY_BASE_DELAY_MS * attempt));
    }
    try {
      const res = await fetch(
        `${FX_USER_API}/${encodeURIComponent(clean)}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as FxTwitterUserResponse;
      if (data.code !== 200 || !data.user) continue;

      return {
        followers: data.user.followers ?? 0,
        following: data.user.following ?? 0,
        tweets: data.user.tweets ?? 0,
        likes: data.user.likes ?? 0,
        joinedAt: data.user.created_at ?? "",
      };
    } catch {
      // retry
    }
  }
  return null;
}
