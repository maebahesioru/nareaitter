import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/messages";

/**
 * 本文内のインラインリンク記法: `[[表示名|URL]]`
 * 記法を1つだけ用意して、条項ごとに自由にリンクを埋め込めるようにする。
 */
const INLINE_LINK = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_LINK.lastIndex = 0;
  while ((m = INLINE_LINK.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const [, label, href] = m;
    nodes.push(
      href.startsWith("/") ? (
        <Link key={`${keyPrefix}-${m.index}`} href={href} className="font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400/90">
          {label}
        </Link>
      ) : (
        <a
          key={`${keyPrefix}-${m.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400/90"
        >
          {label}
        </a>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block = { h: { ja: string; en: string }; body: { ja: string[]; en: string[] } };

const SECTIONS: Block[] = [
  {
    h: { ja: "第1条 基本方針", en: "1. Overview" },
    body: {
      ja: [
        "本ポリシーは、「Twitter馴れ合いサークル(馴れ合い表)」(以下「当サイト」)における、利用者情報の取り扱いを定めるものです。",
      ],
      en: [
        "This policy explains how user information is handled on “Twitter Mutual Circle” (the “Site”).",
      ],
    },
  },
  {
    h: { ja: "第2条 収集・集計する情報", en: "2. Data we process" },
    body: {
      ja: [
        "当サイトは、X(Twitter)の公開データ(過去30日分の公開リプライ・メンション)のみを集計して表示します。ログインやアカウント連携は不要で、利用者に代わって投稿することはありません。",
        "氏名・住所・電話番号などの個人情報の入力を求めることはありません。",
        "入力されたユーザー名は、サークル表を生成するためだけに使用されます。",
        "当サイトは Cloudflare の提供する、Cookie を使用しない匿名のアクセス解析を利用しています。",
      ],
      en: [
        "The Site aggregates and displays X (Twitter) public data only (public replies and mentions from the last 30 days). No login or account linking is required, and we never post on your behalf.",
        "We do not ask you to enter personal information such as your name, address, or phone number.",
        "The username you enter is used solely to generate the circle grid.",
        "The Site uses Cloudflare's cookieless, anonymous analytics.",
      ],
    },
  },
  {
    h: { ja: "第3条 広告の配信", en: "3. Advertising" },
    body: {
      ja: [
        "当サイトは、Google AdSense による広告、および Amazon アソシエイトによる商品リンクを掲載しています。",
        "Google をはじめとする第三者配信事業者は、利用者の興味に応じた広告を表示するため、Cookie(DoubleClick Cookie など)を使用することがあります。",
        "パーソナライズ広告は [[広告設定|https://www.google.com/settings/ads]] で無効にできます。また、[[aboutads.info|https://www.aboutads.info/choices/]] では第三者配信事業者の Cookie をまとめて無効にできます。",
        "Amazonのアソシエイトとして、当サイトは適格販売により収入を得ています。",
      ],
      en: [
        "The Site displays ads through Google AdSense and product links through the Amazon Associates program.",
        "Google and other third-party ad vendors may use cookies (such as the DoubleClick cookie) to serve ads based on your interests.",
        "You can disable personalized advertising at [[Ad Settings|https://www.google.com/settings/ads]], and opt out of third-party vendor cookies at [[aboutads.info|https://www.aboutads.info/choices/]].",
        "As an Amazon Associate, the Site earns from qualifying purchases.",
      ],
    },
  },
  {
    h: { ja: "第4条 Cookie の管理", en: "4. Managing cookies" },
    body: {
      ja: [
        "広告に関する Cookie は、欧州経済領域(EEA)などの利用者に対しては、クッキーバナーで同意が選択された場合にのみ有効になります(Google Consent Mode v2)。",
        "当サイトでは、テーマ・言語などの表示設定の保存にブラウザの localStorage を使用しています(Cookie ではありません)。",
        "Cookie はブラウザの設定から削除・無効化できます。",
      ],
      en: [
        "For users in the EEA and similar regions, advertising cookies are enabled only after you choose “Accept” in the cookie banner (Google Consent Mode v2).",
        "Display settings such as theme and language are stored in your browser's localStorage (not cookies).",
        "You can delete or block cookies in your browser settings.",
      ],
    },
  },
  {
    h: { ja: "第5条 第三者への提供", en: "5. Sharing with third parties" },
    body: {
      ja: [
        "当方が取得した情報を、法令に基づく場合を除き、第三者へ提供・販売することはありません。",
      ],
      en: [
        "We do not provide or sell collected information to third parties, except as required by law.",
      ],
    },
  },
  {
    h: { ja: "第6条 お問い合わせ", en: "6. Contact" },
    body: {
      ja: [
        "本ポリシーに関するお問い合わせは、[[X(@maebahesioru2)|https://x.com/maebahesioru2]] の DM までお願いします。",
      ],
      en: [
        "For questions about this policy, please DM us on [[X (@maebahesioru2)|https://x.com/maebahesioru2]].",
      ],
    },
  },
  {
    h: { ja: "第7条 改定", en: "7. Changes" },
    body: {
      ja: [
        "本ポリシーは、必要に応じて予告なく改定されることがあります。改定後の内容は、本ページに掲載した時点から適用されます。",
      ],
      en: [
        "This policy may be revised as needed without prior notice. Revisions take effect when posted on this page.",
      ],
    },
  },
];

export function PrivacyPolicy({ locale }: { locale: Locale }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-400">
        Legal
      </p>
      <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
        {locale === "ja" ? "プライバシーポリシー" : "Privacy Policy"}
      </h1>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
        {locale === "ja" ? "制定日: 2026年10月9日" : "Established 2026-10-09"}
      </p>

      <div className="mt-8 space-y-4">
        {SECTIONS.map((s) => (
          <section
            key={s.h.ja}
            className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
              {s.h[locale]}
            </h2>
            <div className="mt-2 space-y-2">
              {s.body[locale].map((p, i) => (
                <p
                  key={i}
                  className="text-[13.5px] leading-relaxed text-zinc-600 dark:text-zinc-400"
                >
                  {renderInline(p, `s-${s.h.ja}-${i}`)}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 text-center text-xs">
        <Link
          href={locale === "en" ? "/en" : "/"}
          className="font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400/90"
        >
          {locale === "ja" ? "← トップに戻る" : "← Back to home"}
        </Link>
      </p>
    </main>
  );
}
