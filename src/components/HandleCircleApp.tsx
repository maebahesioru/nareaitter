"use client";

import { useParams } from "next/navigation";
import { CircleApp } from "@/components/CircleApp";

/** `/[handle]` はサーバーで params を渡さず、クライアントで解読して RSC ペイロードを抑える */
export function HandleCircleApp() {
  const params = useParams<{ handle?: string | string[] }>();
  const raw = params.handle;
  const segment = Array.isArray(raw) ? raw[0] : raw;

  let initial: string | undefined;
  if (typeof segment === "string" && segment) {
    try {
      initial = decodeURIComponent(segment);
    } catch {
      initial = segment;
    }
  }

  return <CircleApp initialScreenName={initial} />;
}
