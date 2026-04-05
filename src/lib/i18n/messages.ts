export type Locale = "ja" | "en";

export type Messages = {
  appTitle: string;
  tagline: string;
  trustHeadline: string;
  trustBody: string;
  trustFootnote: string;
  formTitle: string;
  formDesc: string;
  formNote: string;
  labelHandle: string;
  btnShow: string;
  btnLoading: string;
  countsFound: string;
  countsToYou: string;
  countsFromYou: string;
  countsUnit: string;
  tableTitle: string;
  tableHint: string;
  footerLegal: string;
  footerBy: string;
  emptyPrompt: string;
  noPeers: string;
  ariaCircle: string;
  ariaCircleDefault: string;
  shareTitle: string;
  shareText: string;
  shareBusy: string;
  shareBtn: string;
  shareHintLinkOnly: string;
  shareHintCopied: string;
  shareHintUrlCopied: string;
  shareHintFailed: string;
  shareDisabled: string;
  saveBusy: string;
  saveBtn: string;
  saveNoTarget: string;
  saveFailed: string;
  saveFailedWith: string;
  saveDisabled: string;
  themeLight: string;
  themeDark: string;
  donationTitle: string;
  donationP1: string;
  donationP2: string;
  donationCta: string;
  donationClose: string;
  langJa: string;
  langEn: string;
  errEnterName: string;
  errFetch: string;
};

export const messages: Record<Locale, Messages> = {
  ja: {
    appTitle: "Twitter馴れ合いサークル",
    tagline: "誰とよくつながっているかを、グリッド状にざっくり一覧できます。",
    trustHeadline:
      "ログイン不要・勝手に投稿されない！・類似の「馴れ合いサークル」ツールより安心寄り",
    trustBody:
      "ユーザー名を入れるだけで使えます。アカウント連携は不要です。勝手に投稿されることはありません。",
    trustFootnote:
      "※収集・集計の対象は、公開投稿のうち過去30日分に限ります。それより前のやりとりは含まれません。",
    formTitle: "ユーザー名を入力",
    formDesc: "X（Twitter）のユーザー名を入力して取得してください。",
    formNote: "※データは過去30日分のみを対象にしています。",
    labelHandle: "X のユーザー名（@は省略可）",
    btnShow: "サークルを表示",
    btnLoading: "表示中…",
    countsFound: "見つかった件数／",
    countsToYou: "あなた宛:",
    countsFromYou: "あなたから相手へ:",
    countsUnit: "件",
    tableTitle: "の馴れ合い表",
    tableHint:
      "中心に近いほど、過去30日の公開データ上でメンションのやりとりが多い相手です。",
    footerLegal:
      "収集・集計は過去30日分の公開データに限ります。表示は公開の情報をもとにした目安です。結果が欠けたりずれる場合があります。本サービスからあなたの X にログインしたり、勝手に投稿したりすることはありません。",
    footerBy: "制作者:",
    emptyPrompt:
      "上のフォームで X のユーザー名を入力し、「サークルを表示」でここに表示されます。",
    noPeers: "周りに表示できるユーザーがいませんでした",
    ariaCircle: "の交流サークル",
    ariaCircleDefault: "交流サークル",
    shareTitle: "Twitter馴れ合いサークル",
    shareText: "Twitter馴れ合いサークル — X の交流をグリッドで一覧表示",
    shareBusy: "画像を準備中…",
    shareBtn: "シェア",
    shareHintLinkOnly: "この端末では画像を付けず、リンクのみ共有しました",
    shareHintCopied: "テキストとURLをコピーしました",
    shareHintUrlCopied: "URLをコピーしました",
    shareHintFailed: "共有を完了できませんでした",
    shareDisabled:
      "先にユーザー名を入力して「サークルを表示」を押してください",
    saveBusy: "画像を生成中…",
    saveBtn: "画像を保存（PNG）",
    saveNoTarget: "保存対象がありません。",
    saveFailed: "保存に失敗しました。",
    saveFailedWith: "保存に失敗しました（{msg}）",
    saveDisabled:
      "先にユーザー名を入力して「サークルを表示」を押してください",
    themeLight: "ライトモードに切り替え",
    themeDark: "ダークモードに切り替え",
    donationTitle: "寄付のお願い",
    donationP1:
      "このサービスは広告なし・完全無料で提供しています。課金や広告収入はなく、運営まわりの費用は寄付にすべて頼る形です。",
    donationP2:
      "そのため、サービスを続けるには OFUSE からのご支援が欠かせません。可能であればご協力をお願いします。",
    donationCta: "OFUSE で支援する",
    donationClose: "閉じる",
    langJa: "日本語",
    langEn: "English",
    errEnterName: "X のユーザー名（例: nhk_news）を入力してください。",
    errFetch: "取得に失敗しました。",
  },
  en: {
    appTitle: "Twitter Mutual Circle",
    tagline:
      "See who you interact with most in a simple grid — based on public X data.",
    trustHeadline: "No login · We never post for you · Privacy-friendly",
    trustBody:
      "Just enter a username. No account linking. We never post on your behalf.",
    trustFootnote:
      "Data covers public posts from the last 30 days only. Older interactions are not included.",
    formTitle: "Enter a username",
    formDesc: "Enter an X (Twitter) username to load the circle.",
    formNote: "Only the last 30 days of data are included.",
    labelHandle: "X username (@ optional)",
    btnShow: "Show circle",
    btnLoading: "Loading…",
    countsFound: "Mentions found — ",
    countsToYou: "To you:",
    countsFromYou: "From you:",
    countsUnit: "",
    tableTitle: " mutual circle",
    tableHint:
      "Closer to the center means more @-mention activity with that account in the last 30 days (public data).",
    footerLegal:
      "Aggregation covers public data from the last 30 days only. Display is indicative and may be incomplete. This service does not log into your X account or post on your behalf.",
    footerBy: "Author:",
    emptyPrompt:
      "Enter an X username above and tap “Show circle” to display it here.",
    noPeers: "No surrounding users to display",
    ariaCircle: " mutual interaction circle",
    ariaCircleDefault: "Interaction circle",
    shareTitle: "Twitter Mutual Circle",
    shareText:
      "Twitter Mutual Circle — grid view of your X interactions",
    shareBusy: "Preparing image…",
    shareBtn: "Share",
    shareHintLinkOnly: "Shared link only (images not supported on this device)",
    shareHintCopied: "Copied text and URL",
    shareHintUrlCopied: "URL copied",
    shareHintFailed: "Could not complete share",
    shareDisabled: "Enter a username and tap “Show circle” first",
    saveBusy: "Generating image…",
    saveBtn: "Save image (PNG)",
    saveNoTarget: "Nothing to save.",
    saveFailed: "Could not save.",
    saveFailedWith: "Could not save ({msg})",
    saveDisabled: "Enter a username and tap “Show circle” first",
    themeLight: "Switch to light mode",
    themeDark: "Switch to dark mode",
    donationTitle: "Support this project",
    donationP1:
      "This site is free and runs without ads. Running costs rely entirely on donations.",
    donationP2:
      "If you find it useful, please consider supporting via OFUSE.",
    donationCta: "Support on OFUSE",
    donationClose: "Close",
    langJa: "日本語",
    langEn: "English",
    errEnterName: "Enter an X username (e.g. nhk_news).",
    errFetch: "Failed to load data.",
  },
};

export function formatSaveFailed(template: string, msg: string): string {
  return template.replace("{msg}", msg);
}
