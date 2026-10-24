import { NextRequest, NextResponse, after } from "next/server";
import { normalizeScreenName } from "@/lib/yahoo-realtime-fetch";
import { backfillStatsAvatars } from "@/lib/stats-avatar-backfill";
import { rebuildAndRecordStats } from "@/lib/yahoo-payload-server";
import { getStatsMeta } from "@/lib/stats-store";

export const maxDuration = 120;

type Body = { screenName?: string };

/**
 * 統計のシード用。指定ハンドルのサークルを必ずビルドし直して集計へ1件足す。
 * サイト閲覧による自然な集計を待たずにランキングを作れるようにするための入口。
 */
const inflight = new Set<string>();
const globalForIngest = globalThis as unknown as {
  __nareaiStatsIngestGate?: { at: number };
};
const gate = (globalForIngest.__nareaiStatsIngestGate ??= { at: 0 });
const MIN_INTERVAL_MS = 4_000;

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "入力を読み取れませんでした。" }, { status: 400 });
  }

  const raw = body.screenName ?? "";
  let name: string;
  try {
    name = normalizeScreenName(raw);
  } catch {
    return NextResponse.json(
      { error: "ユーザー名の形式が正しくありません。" },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json(
      { error: "ユーザー名を入力してください（例: nhk_news）。" },
      { status: 400 },
    );
  }
  const key = name.toLowerCase();
  if (inflight.has(key)) {
    return NextResponse.json(
      { error: "このハンドルは集計中です。少し待ってから再試行してください。" },
      { status: 429 },
    );
  }
  const now = Date.now();
  if (now - gate.at < MIN_INTERVAL_MS) {
    return NextResponse.json(
      { error: "集計リクエストが続いています。数秒おいてから再試行してください。" },
      { status: 429 },
    );
  }
  gate.at = now;

  inflight.add(key);
  try {
    let payload = await rebuildAndRecordStats(name);
    let circleUsers = Array.isArray(payload.circleUsers)
      ? (payload.circleUsers as Array<{
          screenName?: string;
          displayName?: string;
          interactionCount?: number;
        }>)
      : [];
    // 一時的な取得失敗（Yahoo 側のレート制限など）で空になることがあるため1回だけ引き直す
    if (circleUsers.length === 0) {
      await new Promise((r) => setTimeout(r, 3_500));
      payload = await rebuildAndRecordStats(name);
      circleUsers = Array.isArray(payload.circleUsers)
        ? (payload.circleUsers as Array<{
            screenName?: string;
            displayName?: string;
            interactionCount?: number;
          }>)
        : [];
    }
    if (circleUsers.length === 0) {
      return NextResponse.json(
        {
          error:
            "サークルを作れませんでした。相手が見つからないか、いま取得が混み合っています。少し待って再試行してください。",
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    after(() => {
      void backfillStatsAvatars(24).catch(() => {});
    });
    return NextResponse.json(
      {
        ok: true,
        screenName: name,
        circleUsers: circleUsers.length,
        top: circleUsers.slice(0, 5).map((u) => ({
          screenName: u.screenName ?? "",
          displayName: u.displayName ?? "",
          n: u.interactionCount ?? 0,
        })),
        stats: getStatsMeta(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[stats-ingest] failed", name, err);
    return NextResponse.json(
      { error: "集計に失敗しました。ハンドルを確認して再試行してください。" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    inflight.delete(key);
  }
}
