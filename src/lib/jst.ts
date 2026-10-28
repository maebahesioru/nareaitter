/**
 * JST（UTC+9）固定の時刻ヘルパー。
 *
 * サーバー（Docker の node:22-alpine）は TZ=UTC で動くため、`new Date(t).getHours()` は
 * UTC の「時」を返してしまう。JST の 21 時は UTC の 12 時になり、活動時間帯が 9 時間ずれる。
 * ここでは epoch 秒に +9h してから `getUTC*` を使うことで、実行環境の TZ に依存せず
 * 常に日本時間の値を返す。
 */

const JST_OFFSET_SEC = 9 * 3600;

/** epoch 秒 → JST の Date（getUTC* 系で読む前提） */
export function jstDate(sec: number): Date {
  return new Date((sec + JST_OFFSET_SEC) * 1000);
}

/** epoch 秒 → JST の「時」(0-23) */
export function jstHour(sec: number): number {
  return jstDate(sec).getUTCHours();
}

/** epoch 秒 → JST の曜日 (0=日 … 6=土) */
export function jstWeekday(sec: number): number {
  return jstDate(sec).getUTCDay();
}

/** epoch 秒 → JST の「月日」(M/D) */
export function jstMonthDay(sec: number): string {
  const d = jstDate(sec);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
