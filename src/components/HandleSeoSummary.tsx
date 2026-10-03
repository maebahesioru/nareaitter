import { peekServedYahooPayload } from "@/lib/yahoo-payload-server";

/**
 * ハンドルページ下部のサーバーレンダリング要約（SEO用）。
 *
 * - クローラーにも「ハンドル固有のテキスト＋内部リンク」を届けるために置く
 *   （クライアント側アプリだけだと、クローラー視点ではほぼ空ページになる）
 * - データはメモリキャッシュに乗っているときだけ使う（peek・フェッチしない）ので、
 *   コールドでもページ表示は遅くならない。無い場合は定型文にフォールバック
 * - 交流相手名は公開データそのままのテキストリンク（相互リンク網になる）
 */

type Props = {
  handle: string;
  locale?: "ja" | "en";
};

type CircleUserLite = { screenName?: string | null };

export function HandleSeoSummary({ handle, locale = "ja" }: Props) {
  let sn = handle;
  try {
    sn = decodeURIComponent(handle);
  } catch {
    /* keep raw */
  }
  sn = sn.replace(/^@/, "").trim().toLowerCase();
  if (!sn) return null;

  let count = 0;
  let topNames: string[] = [];
  try {
    const payload = peekServedYahooPayload(sn, true);
    const users = (payload?.circleUsers as CircleUserLite[] | undefined) ?? [];
    count = users.length;
    topNames = users
      .slice(0, 10)
      .map((u) => (u.screenName ?? "").trim())
      .filter(Boolean);
  } catch {
    /* fallback text below */
  }

  const hrefFor = (n: string) => (locale === "en" ? `/en/${n}` : `/${n}`);
  const sep = locale === "en" ? ", " : "、";

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-12 pt-2 text-center">
      <h2 className="text-sm font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
        {locale === "en" ? `@${sn} mutual circle` : `@${sn} の馴れ合い表`}
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
        {count > 0 ? (
          locale === "en" ? (
            <>
              Based on public data from the last 30 days, this account interacted
              with <strong className="text-zinc-700 dark:text-zinc-300">{count}</strong>{" "}
              people. Top:{" "}
              {topNames.map((n, i) => (
                <span key={n}>
                  {i > 0 ? sep : null}
                  <a
                    href={hrefFor(n)}
                    className="text-sky-600 underline-offset-2 hover:underline dark:text-sky-400/90"
                  >
                    {n}
                  </a>
                </span>
              ))}
            </>
          ) : (
            <>
              過去30日の公開データで{" "}
              <strong className="text-zinc-700 dark:text-zinc-300">{count}人</strong>{" "}
              と交流しています。主な交流相手:{" "}
              {topNames.map((n, i) => (
                <span key={n}>
                  {i > 0 ? sep : null}
                  <a
                    href={hrefFor(n)}
                    className="text-sky-600 underline-offset-2 hover:underline dark:text-sky-400/90"
                  >
                    {n}
                  </a>
                </span>
              ))}
            </>
          )
        ) : locale === "en" ? (
          <>
            A grid view of X interactions based on public data from the last 30
            days. Enter a username and press “Show circle” to generate it.
          </>
        ) : (
          <>
            Xの公開データから交流相手をグリッド表示する「馴れ合い表」です。
            ユーザー名を入れて「サークルを表示」を押すと作成できます。
          </>
        )}
      </p>
    </section>
  );
}
