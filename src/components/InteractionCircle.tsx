"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractionCircleCanvas } from "@/components/InteractionCircleCanvas";
import { useLocale } from "@/components/LocaleProvider";
import type { CircleUser, SelfProfile } from "@/types/circle";

type Props = {
  self: SelfProfile;
  users: CircleUser[];
  maxUsers?: number;
};

export function InteractionCircle({ self, users, maxUsers }: Props) {
  const { t } = useLocale();
  // アイコンを描画できなかったユーザーを自動除外し、次の候補者を繰り上げる
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const handledRef = useRef<Set<string>>(new Set());
  const passesRef = useRef(0);

  useEffect(() => {
    setExcluded(new Set());
    handledRef.current = new Set();
    passesRef.current = 0;
  }, [users]);

  const handleMissing = useCallback((names: string[]) => {
    if (passesRef.current >= 3) return;
    const fresh = names.filter((n) => !handledRef.current.has(n));
    if (fresh.length === 0) return;
    passesRef.current += 1;
    for (const n of fresh) handledRef.current.add(n);
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const n of fresh) next.add(n);
      return next;
    });
  }, []);

  const usersWithIcons = useMemo(
    () =>
      users
        .filter((u) => !excluded.has(u.screenName))
        .filter((u) =>
          Boolean(u.avatarUrl?.trim() || u.avatarUrlPreview?.trim()),
        )
        .slice(0, maxUsers ?? users.length),
    [users, maxUsers, excluded],
  );

  return (
    <div className="relative mx-auto w-full max-w-[min(96vw,720px)]">
      <div className="relative w-full overflow-hidden rounded-xl border border-zinc-200/60 bg-zinc-100/40 dark:border-white/10 dark:bg-zinc-950/40">
        <div className="relative w-full">
          <div className="block w-full pt-[100%]" aria-hidden />
          <div className="absolute inset-0">
            {self.screenName && (
              <InteractionCircleCanvas
                self={self}
                usersWithIcons={usersWithIcons}
                onMissing={handleMissing}
              />
            )}
            <div className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center px-3">
              <div className="relative flex max-w-[15rem] flex-col items-center">
                {!self.screenName ? (
                  <p className="pointer-events-auto text-center text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {t.emptyPrompt}
                  </p>
                ) : null}
              </div>
            </div>

            {self.screenName && usersWithIcons.length === 0 && (
              <p className="absolute bottom-2 left-0 right-0 z-[5] text-center text-xs text-zinc-500 dark:text-zinc-400">
                {t.noPeers}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
