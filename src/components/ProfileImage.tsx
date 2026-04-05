"use client";

import { proxiedImageSrc } from "@/lib/proxied-image-src";

type Props = {
  screenName: string;
  avatarUrl?: string;
  className?: string;
};

export function ProfileImage({ screenName, avatarUrl, className = "" }: Props) {
  const src = avatarUrl?.trim();
  if (!src) {
    return (
      <div
        className={`h-full w-full bg-zinc-300 dark:bg-zinc-600 ${className}`}
        aria-hidden
      />
    );
  }

  const displaySrc = proxiedImageSrc(src);

  /* プロキシは同一オリジンなので crossOrigin 不要。直リンク時のみ anonymous */
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={displaySrc}
      alt={`@${screenName}`}
      width={400}
      height={400}
      className={`h-full w-full object-cover [image-rendering:auto] ${className}`}
      crossOrigin={displaySrc.startsWith("/api/image-proxy") ? undefined : "anonymous"}
      referrerPolicy="no-referrer"
      loading="eager"
      decoding="async"
    />
  );
}
