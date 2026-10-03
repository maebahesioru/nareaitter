/** Yahoo リアルタイム検索 API（pagination）の entry サブセット */
export type YahooRealtimeEntry = {
  id: string;
  displayText?: string;
  createdAt?: number;
  screenName?: string;
  name?: string;
  profileImage?: string;
  /** 投稿者の数値ユーザーID（ハンドル変更の名寄せに使う） */
  userId?: number | string;
  mentions?: { screenName?: string; name?: string; indices?: number[] }[];
  userUrl?: string;
  url?: string;
};

export type YahooPaginationResponse = {
  timeline?: {
    head?: {
      totalResultsAvailable?: number;
      totalResultsReturned?: number;
      oldestTweetId?: string;
    };
    entry?: YahooRealtimeEntry[];
  };
};
