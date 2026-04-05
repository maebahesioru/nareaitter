"use client";

import { useMemo } from "react";
import { InteractionCircleCanvas } from "@/components/InteractionCircleCanvas";
import { useLocale } from "@/components/LocaleProvider";
import type { CircleUser, SelfProfile } from "@/types/circle";

type Props = {
  self: SelfProfile;
  users: CircleUser[];
};

export function InteractionCircle({ self, users }: Props) {
  const { t } = useLocale();
  const usersWithIcons = useMemo(
    () =>
      users.filter((u) =>
        Boolean(u.avatarUrl?.trim() || u.avatarUrlPreview?.trim()),
      ),
    [users],
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
