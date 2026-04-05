"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CircleApp } from "@/components/CircleApp";

function HomeCircleAppInner() {
  const sp = useSearchParams();
  const raw = sp.get("u")?.trim();
  let initial: string | undefined;
  if (raw) {
    try {
      initial = decodeURIComponent(raw);
    } catch {
      initial = raw;
    }
  }
  return <CircleApp initialScreenName={initial} />;
}

/** トップは静的のまま、`/?u=` だけクライアントで読む（Suspense 必須） */
export function HomeCircleApp() {
  return (
    <Suspense fallback={<CircleApp />}>
      <HomeCircleAppInner />
    </Suspense>
  );
}
