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
  footerSister: string;
  footerSisterName: string;
  footerPrivacy: string;
  consentTitle: string;
  consentBody: string;
  consentAccept: string;
  consentEssential: string;
  consentMore: string;
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
  saveLongPressHint: string;
  saveLongPressClose: string;
  postSpamTip: string;
  bidirOnly: string;
  bidirOnlyHint: string;
  highlightPlaceholder: string;
  highlightStatusFound: string;
  highlightStatusNotFound: string;
  captureCredit: string;
  fewPeersNote: string;
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
  tabCircle: string;
  tabTable: string;
  tabFamily: string;
  tabAI: string;
  tabValue: string;
  tableDetailTitle: string;
  tableColRank: string;
  tableColUser: string;
  tableColTotal: string;
  tableColReceived: string;
  tableColSent: string;
  tableColLast: string;
  tableFilterPlaceholder: string;
  tableShownLabel: string;
  tableNoMatch: string;
  tableSortHint: string;
  aiTitle: string;
  valueTitle: string;
  familyTitle: string;
  familyHint: string;
  relationSelf: string;
  relationSpouse: string;
  relationParent: string;
  relationChild: string;
  relationSibling: string;
  relationRelative: string;
  relationGrandparent: string;
  relationGreatGrandparent: string;
  relationGrandchild: string;
  relationUncle: string;
  relationCousin: string;
  relationNephew: string;
  relationExtended: string;
  statsTitle: string;
  statsTagline: string;
  statsBack: string;
  statsStatCircles: string;
  statsStatUsers: string;
  statsStatMentions: string;
  statsStatUpdated: string;
  statsAppearTitle: string;
  statsAppearHint: string;
  statsMentionsTitle: string;
  statsMentionsHint: string;
  statsRankTitle: string;
  statsRankHint: string;
  statsColUser: string;
  statsColAppear: string;
  statsColAvgRank: string;
  statsColMentions: string;
  statsColBest: string;
  statsUnitCircles: string;
  statsUnitTimes: string;
  statsUnitRank: string;
  statsUnitPeople: string;
  statsEmojisTitle: string;
  statsEmojisHint: string;
  statsLaughsTitle: string;
  statsVocativesTitle: string;
  statsHoursTitle: string;
  statsHoursHint: string;
  statsCirclesTitle: string;
  statsRecentTitle: string;
  statsRecentHint: string;
  statsTrendTitle: string;
  statsTrendHint: string;
  statsFastestTitle: string;
  statsFastestHint: string;
  statsReplyTitle: string;
  statsReplyHint: string;
  statsFastestMeTitle: string;
  statsFastestMeHint: string;
  statsReplyMeTitle: string;
  statsReplyMeHint: string;
  statsOwnerTitle: string;
  statsOwnerHint: string;
  statsOwnerLongest: string;
  statsOwnerKeigo: string;
  statsOwnerEmojis: string;
  statsOwnerWords: string;
  statsOwnerLaughs: string;
  statsOwnerMoreTitle: string;
  statsOwnerMoreHint: string;
  statsOwnerFollowers: string;
  statsOwnerExclaim: string;
  statsOwnerTone: string;
  statsOwnerToneThanks: string;
  statsOwnerToneLove: string;
  statsOwnerToneTired: string;
  statsOwnerToneGloomy: string;
  statsOwnerHoursTitle: string;
  statsOwnerHoursHint: string;
  statsOwnerWeekday: string;
  statsOwnerNewConn: string;
  statsOwnerDormant: string;
  statsOwnerPeakDay: string;
  statsOwnerAge: string;
  statsOwnerAgeHint: string;
  statsLongestTitle: string;
  statsLongestHint: string;
  statsKeigoTitle: string;
  statsKeigoHint: string;
  statsRisingTitle: string;
  statsRisingHint: string;
  statsBondTitle: string;
  statsBondHint: string;
  statsGrowthTitle: string;
  statsGrowthHint: string;
  statsUnitSec: string;
  statsUnitMin: string;
  statsUnitChars: string;
  statsUnitPercent: string;
  statsUnitDays: string;
  statsToday: string;
  statsYesterday: string;
  statsDaysAgo: string;
  statsCirclesHint: string;
  statsIngestTitle: string;
  statsIngestHint: string;
  statsIngestPlaceholder: string;
  statsIngestBtn: string;
  statsIngestBusy: string;
  statsIngestOk: string;
  statsIngestErr: string;
  statsLoading: string;
  statsEmpty: string;
  statsNote: string;
  statsError: string;
  statsNavLink: string;
  tabStats: string;
  statsOf: string;
  circleStatsTotal: string;
  circleStatsPerPeer: string;
  circleStatsPeers: string;
  circleStatsMedian: string;
  circleStatsTopShare: string;
  circleStatsGini: string;
  circleStatsGiniHint: string;
  circleStatsMutual: string;
  circleStatsReplySpeed: string;
  circleStatsSeconds: string;
  circleStatsMinutes: string;
  circleStatsOldest: string;
  circleStatsDays: string;
  circleStatsConcentration: string;
  circleStatsTop10: string;
  circleStatsDirection: string;
  circleStatsYouToThem: string;
  circleStatsThemToYou: string;
  circleStatsHours: string;
  circleStatsEmojis: string;
  circleStatsVocatives: string;
  circleStatsLaughs: string;
  circleStatsHint: string;
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
      "中心に近いほど、過去30日の公開データ上でメンションのやりとりが多い相手です。いいねやフォローは集計に含まれません。",
    footerLegal:
      "収集・集計は過去30日分の公開データに限ります。表示は公開の情報をもとにした目安です。結果が欠けたりずれる場合があります。本サービスからあなたの X にログインしたり、勝手に投稿したりすることはありません。",
    footerBy: "制作者:",
    footerSister: "姉妹サイト:",
    footerSisterName: "ツイッタラー世論調査",
    footerPrivacy: "プライバシーポリシー",
    consentTitle: "Cookies の使用について",
    consentBody:
      "このサイトは表示設定の保存や荒らし対策に Cookie / localStorage を使用します。加えて、広告配信のために Google AdSense を利用しており、Google とそのパートナーが Cookie を使用して、興味関心に応じた広告を配信します。「必須のみ」を選んだ場合、広告用の Cookie は使用されません。",
    consentAccept: "同意する",
    consentEssential: "必須のみ",
    consentMore: "プライバシーポリシーを見る",
    emptyPrompt:
      "上のフォームで X のユーザー名を入力し、「サークルを表示」でここに表示されます。",
    noPeers:
      "表示できる相手が見つかりませんでした（過去30日の公開リプライ・メンションが対象です。交流が増えると表示されます）",
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
    saveLongPressHint:
      "画像を長押しして「写真に追加」を選ぶと保存できます",
    saveLongPressClose: "閉じる",
    postSpamTip:
      "※結果を投稿するとき、文面によっては X のスパム判定を受ける場合があります。一言変えると引っかかりにくくなるようです。",
    bidirOnly: "双方向のみ",
    bidirOnlyHint:
      "お互いにメンションし合っている相手だけを表示します（片方向だけの相手を除外）",
    highlightPlaceholder: "自分のIDをハイライト",
    highlightStatusFound: "ハイライト中",
    highlightStatusNotFound: "このサークルには見つかりません",
    captureCredit: "nareaitter.hikamers.app（ログイン不要・連携なし）",
    fewPeersNote:
      "交流が少なめです。過去30日の公開リプライ・メンションが対象のため、交流が増えると表示も増えます。",
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
    errFetch:
      "取得に失敗しました。サーバーが混み合っているか、一時的な問題の可能性があります。少し待ってからもう一度お試しください。",
    tabCircle: "サークル",
    tabTable: "交流一覧",
    tabFamily: "家族ツリー",
    tabAI: "AI診断",
    tabValue: "売却価格",
    tableDetailTitle: "の交流一覧",
    tableColRank: "順位",
    tableColUser: "ユーザー",
    tableColTotal: "合計",
    tableColReceived: "相手→あなた",
    tableColSent: "あなた→相手",
    tableColLast: "最終交流",
    tableFilterPlaceholder: "ユーザー名で絞り込み",
    tableShownLabel: "表示",
    tableNoMatch: "該当するユーザーがいません",
    tableSortHint:
      "見出しをクリックすると並べ替えできます。回数は過去30日分の公開データ（あなた宛て／あなたからの合算）です。",
    aiTitle: "のAI診断",
    valueTitle: "のアカウント推定売却価格",
    familyTitle: "の家族ツリー",
    familyHint:
      "メンションのやり取りから、Twitter上の「家族」関係を予測表示しています。あくまで目安です。",
    relationSelf: "自分",
    relationSpouse: "配偶者",
    relationParent: "親",
    relationChild: "子ども",
    relationSibling: "兄弟・姉妹",
    relationRelative: "親戚",
    relationGrandparent: "祖父母",
    relationGreatGrandparent: "曽祖父母",
    relationGrandchild: "孫",
    relationUncle: "叔父・叔母",
    relationCousin: "いとこ",
    relationNephew: "甥・姪",
    relationExtended: "その他の親戚",
    statsTitle: "馴れ合い統計",
    statsTagline:
      "このサイトで集計されたサークルを横断して、「誰が一番よく出てくるか」をランキングしています。",
    statsBack: "サークルに戻る",
    statsStatCircles: "集計サークル",
    statsStatUsers: "集計ユーザー",
    statsStatMentions: "延べ交流",
    statsStatUpdated: "最終更新",
    statsAppearTitle: "サークル登場ランキング",
    statsAppearHint:
      "何人もの人のサークルに名前が出てくる人ほど上位。界隈の「常連」の目安です。",
    statsMentionsTitle: "総交流数ランキング",
    statsMentionsHint: "集計対象のサークルでのメンション数の合計です。",
    statsRankTitle: "サークル内の平均順位が高い人",
    statsRankHint:
      "2サークル以上に登場した人だけを対象に、サークル内順位の平均が小さい順に並べています。",
    statsColUser: "ユーザー",
    statsColAppear: "登場",
    statsColAvgRank: "平均順位",
    statsColMentions: "延べ交流",
    statsColBest: "最高",
    statsUnitCircles: "サークル",
    statsUnitRank: "位",
    statsUnitPeople: "人",
    statsEmojisTitle: "よく使われる絵文字",
    statsEmojisHint: "各サークル上位64人がよく使う絵文字を集計しています（同じ絵文字の表記ゆれはまとめています）。",
    statsLaughsTitle: "笑い方ランキング",
    statsVocativesTitle: "呼ばれ方ランキング",
    statsHoursTitle: "活動時間帯",
    statsHoursHint: "各サークル上位64人の活動ピーク時間を集計しています。",
    statsRecentTitle: "最近つながった人",
    statsRecentHint: "最後に交流があったのが新しい順です（サークル横断）。",
    statsTrendTitle: "日次の推移",
    statsTrendHint: "記録した日ごとの延べ交流数。棒が高いほど賑わった日です。",
    statsFastestTitle: "返信が速い人",
    statsFastestHint: "相手→あなたの最速レス（記録した中で最短）。",
    statsReplyTitle: "返信が速い人（中央値）",
    statsReplyHint: "相手→あなたの返信速度の中央値を平均したもの。",
    statsFastestMeTitle: "あなたが最速で返した相手",
    statsFastestMeHint: "あなた→相手の最速レス（記録した中で最短）。",
    statsReplyMeTitle: "あなたが返すのが速い相手（中央値）",
    statsReplyMeHint: "あなた→相手の返信速度の中央値を平均したもの。",
    statsOwnerTitle: "サークル主たちの傾向",
    statsOwnerHint: "サークルを作った人自身の喋り方をまとめたもの。",
    statsOwnerLongest: "サークル主の平均文字数",
    statsOwnerKeigo: "サークル主の敬語率",
    statsOwnerEmojis: "サークル主がよく使う絵文字",
    statsOwnerWords: "界隈でよく出る言葉",
    statsOwnerLaughs: "サークル主の笑い方",
    statsOwnerMoreTitle: "サークル主の中身",
    statsOwnerMoreHint:
      "フォロワー数・感嘆符の多さ・感情語・投稿する時間帯と、界隈での喋り方の内訳。",
    statsOwnerFollowers: "フォロワーが多いサークル主",
    statsOwnerExclaim: "感嘆符（！）が多いサークル主",
    statsOwnerTone: "感情語の平均",
    statsOwnerToneThanks: "感謝",
    statsOwnerToneLove: "好意",
    statsOwnerToneTired: "疲れ",
    statsOwnerToneGloomy: "陰り",
    statsOwnerHoursTitle: "サークル主が投稿する時間帯",
    statsOwnerHoursHint: "各サークル主の一番多い1時間を合算したもの。",
    statsOwnerWeekday: "平日型 / 休日型",
    statsOwnerNewConn: "14日で新しくつながった人",
    statsOwnerDormant: "14日以上返してない相手",
    statsOwnerPeakDay: "最多投稿日",
    statsOwnerAge: "アカウント年齢の中央値",
    statsOwnerAgeHint: "サークル主のアカウント開設からの日数の中央値です。",
    statsLongestTitle: "長文の人",
    statsLongestHint: "相手のメンションの平均文字数。取得時に80文字で切っているため「81+」は頭打ち（同点は交流数順）。",
    statsKeigoTitle: "敬語の人",
    statsKeigoHint: "相手のメンションに占める敬語の割合。",
    statsRisingTitle: "今週よく絡んでる人",
    statsRisingHint: "直近7日間の交流回数（サークル横断の延べ）。",
    statsBondTitle: "付き合いが長い人",
    statsBondHint: "最初に交流してからの日数。",
    statsGrowthTitle: "伸びてる人",
    statsGrowthHint: "この記録期間内での延べ交流の増加数。",
    statsUnitSec: "秒",
    statsUnitMin: "分",
    statsUnitChars: "文字",
    statsUnitPercent: "%",
    statsUnitDays: "日",
    statsUnitTimes: "回",
    statsToday: "今日",
    statsYesterday: "昨日",
    statsDaysAgo: "{n}日前",
    statsCirclesTitle: "集計済みサークル",
    statsCirclesHint: "ここに並ぶサークルのぶんだけランキングが育ちます。",
    statsIngestTitle: "集計に追加する",
    statsIngestHint:
      "ハンドルを入れると、その人のサークルを生成してランキングに足します（1件10秒前後）。",
    statsIngestPlaceholder: "例: maebahesioru2",
    statsIngestBtn: "集計する",
    statsIngestBusy: "集計中…",
    statsIngestOk: "集計しました: @{handle}（{users}人）",
    statsIngestErr: "集計に失敗しました。ハンドルを確認してください。",
    statsLoading: "読み込み中…",
    statsEmpty:
      "まだ集計データがありません。下のフォームからハンドルを追加すると、ここにランキングが出ます。",
    statsNote:
      "※このサイトで表示されたサークルの履歴から積み上げた累積値です。各サークルの上位120人を対象に集計し、ランキングは上位50人まで表示しています。",
    statsError: "統計を読み込めませんでした。",
    statsNavLink: "サイト全体の統計を見る",
    tabStats: "統計",
    statsOf: "の統計",
    circleStatsTotal: "延べ交流",
    circleStatsPerPeer: "1人あたり平均",
    circleStatsPeers: "相手の人数",
    circleStatsMedian: "中央値",
    circleStatsTopShare: "上位5人のシェア",
    circleStatsGini: "ジニ係数",
    circleStatsGiniHint: "0に近いほど均等",
    circleStatsMutual: "双方向の相手",
    circleStatsReplySpeed: "返信速度（相手→あなた）",
    circleStatsSeconds: "秒",
    circleStatsMinutes: "分",
    circleStatsOldest: "最古の交流から",
    circleStatsDays: "日",
    circleStatsConcentration: "交流回数の多い順（上位10人）",
    circleStatsTop10: "上位10人で全体の",
    circleStatsDirection: "やりとりの向き",
    circleStatsYouToThem: "あなた→相手",
    circleStatsThemToYou: "相手→あなた",
    circleStatsHours: "活動時間帯（上位64人）",
    circleStatsEmojis: "よく使う絵文字",
    circleStatsVocatives: "呼ばれ方",
    circleStatsLaughs: "笑い方",
    circleStatsHint: "このサークルのデータから計算した傾向です。上位20〜64人の情報を使う項目があります。",
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
      "Closer to the center means more @-mention activity with that account in the last 30 days (public data). Likes and follows are not counted.",
    footerLegal:
      "Aggregation covers public data from the last 30 days only. Display is indicative and may be incomplete. This service does not log into your X account or post on your behalf.",
    footerBy: "Author:",
    footerSister: "Sister site:",
    footerSisterName: "Tsuittara Yoron Chosa",
    footerPrivacy: "Privacy Policy",
    consentTitle: "About Cookies",
    consentBody:
      "This site uses cookies / localStorage to remember your display settings and for anti-spam. It also serves ads through Google AdSense: Google and its partners use cookies to deliver ads based on your interests. If you choose “Essential only”, no advertising cookies are used.",
    consentAccept: "Accept",
    consentEssential: "Essential only",
    consentMore: "Read the privacy policy",
    emptyPrompt:
      "Enter an X username above and tap “Show circle” to display it here.",
    noPeers:
      "No one to display yet. Only public replies and mentions from the last 30 days count — it grows as you interact.",
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
    saveLongPressHint:
      "Long-press the image and choose “Add to Photos” / “Save Image” to keep it",
    saveLongPressClose: "Close",
    postSpamTip:
      "Note: X may flag some result posts as spam. Changing the wording slightly helps avoid it.",
    bidirOnly: "Mutual only",
    bidirOnlyHint:
      "Show only people who mention each other in both directions",
    highlightPlaceholder: "Highlight my handle",
    highlightStatusFound: "Highlighted",
    highlightStatusNotFound: "Not found in this circle",
    captureCredit: "nareaitter.hikamers.app (no login, no linking)",
    fewPeersNote:
      "Few interactions so far. Only public replies and mentions from the last 30 days count — this grows as you interact.",
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
    errFetch:
      "Failed to load data. The server may be busy or having a temporary issue — please wait a moment and try again.",
    tabCircle: "Circle",
    tabTable: "Interactions",
    tabFamily: "Family Tree",
    tabAI: "AI Diagnosis",
    aiTitle: "'s AI Diagnosis",
    tabValue: "Value",
    valueTitle: "'s Account Value Est.",
    tableDetailTitle: "'s Interactions",
    tableColRank: "Rank",
    tableColUser: "User",
    tableColTotal: "Total",
    tableColReceived: "They→You",
    tableColSent: "You→They",
    tableColLast: "Last seen",
    tableFilterPlaceholder: "Filter by username",
    tableShownLabel: "Shown",
    tableNoMatch: "No matching users",
    tableSortHint:
      "Click a column header to sort. Counts combine mentions in both directions from the last 30 days of public data.",
    familyTitle: "'s Family Tree",
    familyHint:
      "Predicts 'family' relationships on Twitter based on mention patterns. Results are approximate.",
    relationSelf: "Self",
    relationSpouse: "Spouse",
    relationParent: "Parent",
    relationChild: "Child",
    relationSibling: "Sibling",
    relationRelative: "Relative",
    relationGrandparent: "Grandparent",
    relationGreatGrandparent: "Great-grandparent",
    relationGrandchild: "Grandchild",
    relationUncle: "Uncle/Aunt",
    relationCousin: "Cousin",
    relationNephew: "Nephew/Niece",
    relationExtended: "Extended Family",
    statsTitle: "Mutual Circle Stats",
    statsTagline:
      "Cross-circle rankings built from the circles generated on this site — who shows up the most.",
    statsBack: "Back to circles",
    statsStatCircles: "Circles",
    statsStatUsers: "Users",
    statsStatMentions: "Mentions",
    statsStatUpdated: "Updated",
    statsAppearTitle: "Most circles appeared in",
    statsAppearHint:
      "People who show up in many different circles rank highest — a proxy for scene regulars.",
    statsMentionsTitle: "Total mentions",
    statsMentionsHint: "Sum of mentions across all tracked circles.",
    statsRankTitle: "Best average rank",
    statsRankHint:
      "Only people in 2+ circles. Sorted by average position inside their circles.",
    statsColUser: "User",
    statsColAppear: "Circles",
    statsColAvgRank: "Avg rank",
    statsColMentions: "Mentions",
    statsColBest: "Best",
    statsUnitCircles: "circles",
    statsUnitRank: "",
    statsUnitPeople: "people",
    statsEmojisTitle: "Top emojis",
    statsEmojisHint: "Emojis used most by the top 64 of each circle (visual variants are merged).",
    statsLaughsTitle: "Laugh styles",
    statsVocativesTitle: "How people call you",
    statsHoursTitle: "Active hours",
    statsHoursHint: "Peak activity hours of the top 64 of each circle.",
    statsRecentTitle: "Recently active",
    statsRecentHint: "Sorted by the most recent interaction, across circles.",
    statsTrendTitle: "Daily trend",
    statsTrendHint: "Total interactions per recorded day. Taller bars mean a busier day.",
    statsFastestTitle: "Fastest responders",
    statsFastestHint: "Their quickest reply to you, among recorded circles.",
    statsReplyTitle: "Fastest responders (median)",
    statsReplyHint: "Average of the median reply time from them to you.",
    statsFastestMeTitle: "People you reply to fastest",
    statsFastestMeHint: "Your fastest reply per person (shortest recorded).",
    statsReplyMeTitle: "People you reply to fastest (median)",
    statsReplyMeHint: "Average of your median reply time to each person.",
    statsOwnerTitle: "How circle owners talk",
    statsOwnerHint: "Writing style of the people who built the circles.",
    statsOwnerLongest: "Owners by average length",
    statsOwnerKeigo: "Owners by keigo rate",
    statsOwnerEmojis: "Emojis owners use most",
    statsOwnerWords: "Words that keep showing up",
    statsOwnerLaughs: "How owners laugh",
    statsOwnerMoreTitle: "Inside the owners",
    statsOwnerMoreHint:
      "Followers, exclamation marks, tone words, posting hours and how they talk here.",
    statsOwnerFollowers: "Owners with the most followers",
    statsOwnerExclaim: "Owners who overuse ！",
    statsOwnerTone: "Average tone words",
    statsOwnerToneThanks: "Thanks",
    statsOwnerToneLove: "Affection",
    statsOwnerToneTired: "Tired",
    statsOwnerToneGloomy: "Gloomy",
    statsOwnerHoursTitle: "When owners post",
    statsOwnerHoursHint: "Each owner's busiest hour, summed.",
    statsOwnerWeekday: "Weekday type / weekend type",
    statsOwnerNewConn: "New connections in 14 days",
    statsOwnerDormant: "Silent for 14+ days",
    statsOwnerPeakDay: "Busiest day",
    statsOwnerAge: "Median account age",
    statsOwnerAgeHint: "Median days since each circle owner's account was created.",
    statsLongestTitle: "Longest messages",
    statsLongestHint: "Average characters per mention from them. Text is cut at 80 chars upstream, so \"81+\" means capped (ties ordered by interactions).",
    statsKeigoTitle: "Most polite",
    statsKeigoHint: "Share of their mentions that use keigo.",
    statsRisingTitle: "Most active this week",
    statsRisingHint: "Interactions in the last 7 days, summed across circles.",
    statsBondTitle: "Longest-running connections",
    statsBondHint: "Days since the first interaction.",
    statsGrowthTitle: "Fastest growing",
    statsGrowthHint: "Increase in interactions during the recorded period.",
    statsUnitSec: "s",
    statsUnitMin: "min",
    statsUnitChars: "chars",
    statsUnitPercent: "%",
    statsUnitDays: "d",
    statsUnitTimes: "x",
    statsToday: "today",
    statsYesterday: "yesterday",
    statsDaysAgo: "{n}d ago",
    statsCirclesTitle: "Tracked circles",
    statsCirclesHint: "The rankings grow with every circle listed here.",
    statsIngestTitle: "Add to the stats",
    statsIngestHint:
      "Enter a handle to build their circle and add it to the rankings (about 10s each).",
    statsIngestPlaceholder: "e.g. maebahesioru2",
    statsIngestBtn: "Add",
    statsIngestBusy: "Adding…",
    statsIngestOk: "Added @{handle} ({users} people)",
    statsIngestErr: "Could not add that handle. Check the spelling and try again.",
    statsLoading: "Loading…",
    statsEmpty:
      "No data yet. Add a handle with the form below and the rankings will appear here.",
    statsNote:
      "Cumulative values from circles viewed on this site. The top 120 people of each circle are counted; rankings show up to 50.",
    statsError: "Could not load the stats.",
    statsNavLink: "Site-wide stats",
    tabStats: "Stats",
    statsOf: " — stats",
    circleStatsTotal: "Total mentions",
    circleStatsPerPeer: "Per person",
    circleStatsPeers: "People",
    circleStatsMedian: "Median",
    circleStatsTopShare: "Top 5 share",
    circleStatsGini: "Gini",
    circleStatsGiniHint: "0 = even",
    circleStatsMutual: "Mutual",
    circleStatsReplySpeed: "Reply speed (them→you)",
    circleStatsSeconds: "s",
    circleStatsMinutes: "m",
    circleStatsOldest: "Oldest contact",
    circleStatsDays: "d",
    circleStatsConcentration: "By mentions (top 10)",
    circleStatsTop10: "Top 10 share",
    circleStatsDirection: "Direction",
    circleStatsYouToThem: "You→them",
    circleStatsThemToYou: "Them→you",
    circleStatsHours: "Active hours (top 64)",
    circleStatsEmojis: "Emojis",
    circleStatsVocatives: "Vocatives",
    circleStatsLaughs: "Laugh styles",
    circleStatsHint: "Computed from this circle's data. Some figures use only the top 20–64 people.",
  },
};

export function formatSaveFailed(template: string, msg: string): string {
  return template.replace("{msg}", msg);
}
