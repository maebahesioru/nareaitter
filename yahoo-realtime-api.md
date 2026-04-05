# Yahoo リアルタイム検索 API 調査メモ

認証不要で叩けるAPIの調査結果。

---

## エンドポイント

```
GET https://search.yahoo.co.jp/realtime/api/v1/pagination
```

---

## パラメータ

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `p` | 文字列 | 検索クエリ（URLエンコード） |
| `md` | `h` / `t` | ソート順。`h`=話題順、`h` 以外の値または省略=新着順（`t`, `r`, `l` 等どの値でも新着順になる） |
| `results` | 数値 | 取得件数。**最大40**（50以上はエラー） |
| `mtype` | `image` / `video` | メディア種別フィルタ。`image`=画像のみ、`video`=動画（animatedGif・YouTubeを含む）のみ |
| `oldestTweetId` | ツイートID | ページネーション用カーソル。前ページの最後のツイートIDを渡す |
| `start` | 数値 | 取得開始位置（1始まり）。`results=40` なら `start=1, 41, 81...` でページ並列取得が可能 |
| `since` | Unixタイムスタンプ | この時刻以降のツイートのみ取得。日付文字列は無効、タイムスタンプのみ有効 |
| `until` | Unixタイムスタンプ | この時刻以前のツイートのみ取得。日付文字列は無効、タイムスタンプのみ有効 |

### 無効・非推奨パラメータ
以下は値を変えても結果が変わらない（全て検証済み）：
- `rkf` — `1` のみ `totalResultsAvailable` が約170件少なくなる（特定ツイートをカウントから除外するフィルタと思われる）が、実際に返るエントリの内容は変わらない。ログ・内部集計用と思われる
- `b` — オフセット指定を試みたが無効
- `span` — 自動更新の表示期間設定（秒）。絞り込みには効かない
- `interval` — 自動更新間隔（秒）。絞り込みには効かない
- `lang` — 言語指定。効かない
- `safe` — セーフサーチ。効かない
- `mtype=gif` / `mtype=animatedGif` / `mtype=all` — `mtype` なしと同じ結果（実質無効）



---

## レスポンス構造

```json
{
  "timeline": {
    "head": {
      "totalResultsAvailable": 14000,
      "totalResultsReturned": 40,
      "oldestTweetId": "..."  // 新着順のときのみ存在。人気順(md=h)では返ってこない
    },
    "mediaTweet": true,       // クエリが空（p=""）のとき false、それ以外は常に true
    "entry": [
      {
        // --- 識別 ---
        "id": "ツイートID",
        "url": "https://x.com/...",                          // ツイートURL
        "detailUrl": "/realtime/search/tweet/...?detail=1",  // Yahoo内詳細ページURL
        "detailQuoteUrl": "/realtime/search/tweet/...?tl=quote", // 引用ツイート詳細URL

        // --- 本文 ---
        "displayTextBody": "本文（\tSTART\tキーワード\tEND\t形式でハイライト）",
        "displayText": "本文（ハイライトタグなし）",
        "displayTextFragments": "本文（ハッシュタグ等を改行区切りで分割）",
        "displayTextEntities": "ハッシュタグ・メンション・URLを改行区切りで列挙",

        // --- 時刻 ---
        "createdAt": 1234567890,  // Unixタイムスタンプ（秒）

        // --- エンゲージメント ---
        "replyCount": 6,
        "rtCount": 45,
        "qtCount": 7,
        "likesCount": 123,
        "replyUrl": "https://x.com/intent/tweet?in_reply_to=...",
        "rtUrl": "https://x.com/intent/retweet?tweet_id=...",
        "likesUrl": "https://x.com/intent/like?tweet_id=...",

        // --- ユーザー ---
        "userId": "ユーザーID",
        "screenName": "username",
        "name": "表示名",
        "profileImage": "https://rts-pctr.c.yimg.jp/...",
        "userUrl": "https://x.com/username",
        "badge": {
          "show": true,
          "type": "blue",   // "blue"=個人認証(#1DA1F2)、"business"=企業認証(#DBAB00)、"none"=なし
          "color": "#1DA1F2"
        },

        // --- エンティティ ---
        "hashtags": [{ "text": "テキスト", "indices": [0, 5] }],
        "hashtagUrls": { "テキスト": "/realtime/search?p=%23..." },
        "mentions": [{ "screenName": "username", "indices": [0, 8] }],
        "mentionUrls": { "username": "https://x.com/username" },
        "replyMentions": [],      // リプライ先のメンション
        "replyMentionUrls": {},
        "urls": [
          {
            "url": "https://t.co/...",
            "displayUrl": "example.com/...",
            "expandedUrl": "https://example.com/...",
            "indices": [0, 23]
          }
        ],
        "inReplyTo": "リプライ先ツイートID（リプライでない場合は空文字）",

        // --- メディア ---
        "mediaType": ["photo"],  // ["photo"] | ["video"] | ["animated_gif"] | []
        "media": [
          {
            "type": "image",  // "image" | "video" | "animatedGif" | "youTube"
            "item": {
              "url": "https://t.co/...",          // t.co短縮URL
              "displayUrl": "pic.x.com/...",
              "mediaUrl": "https://rts-pctr.c.yimg.jp/...",       // 画像本体URL
              "thumbnailImageUrl": "https://rts-pctr.c.yimg.jp/...",
              "sizes": {
                "viewer": { "width": 800, "height": 1200 }
              },
              "duration": 43418  // 動画のみ。ミリ秒
            },
            "metaImageUrl": "https://rts-pctr.c.yimg.jp/..."  // OGP用画像URL
          }
        ],

        // --- 引用ツイート ---
        "quotedTweet": {  // 引用ツイートがある場合のみ存在。entry と同じ構造のサブセット
          "id": "...",
          "url": "...",
          "detailUrl": "...",
          "badge": { "show": true, "type": "blue", "color": "#1DA1F2" },
          "displayTextBody": "...",
          "urls": [],
          "replyMentions": [],
          "replyMentionUrls": {},
          "createdAt": 1234567890,
          "userId": "...",
          "name": "...",
          "screenName": "...",
          "profileImage": "...",
          "userUrl": "...",
          "media": []
        },

        // --- センシティブ ---
        "possiblySensitive": false,

        // --- 内部用（基本的に使わない） ---
        "tweetThemeNormal": ["..."],   // ツイートのトピック分類ID（Yahoo内部のみ既知、解読不可）
        "userThemeNormal": ["..."],    // ユーザーの興味・ジャンル分類ID（同上）
        "twitterContextID": [],        // 通常は空配列。用途不明
        "videoClassifyId": []          // 動画ツイートのみ付く動画種別分類ID（例: 8080100000）
      }
    ]
  }
}
```

---

## ページネーション

### 人気順（`md=h`）
- `oldestTweetId` がレスポンスの `head` に含まれない
- 代わりに **最後のエントリのID** を次リクエストの `oldestTweetId` に渡すと次ページが取れる
- 重複なしで動作確認済み

### 新着順（`md=h` なし）
- `head.oldestTweetId` が返ってくる場合がある
- 同様に最後のエントリIDでもページネーション可能

---

## クエリ演算子

`p` パラメータに渡すクエリで使える演算子（全て動作確認済み）。

| 構文 | 説明 | 例 |
|------|------|-----|
| `A B` | AND検索（スペース区切り） | `アニメ 画像` |
| `(A B)` | OR検索 | `(アニメ 漫画)` |
| `A OR B` | OR検索（`(A B)` と同じ結果） | `アニメ OR 漫画` |
| `A -B` | NOT検索（B を除外） | `アニメ -漫画` |
| `ID:username` | 特定ユーザーの投稿のみ | `ID:nhk_news` |
| `@username` | 特定ユーザー宛ての投稿 | `@nhk_news` |
| `#hashtag` | ハッシュタグ検索 | `#アニメ` |
| `URL:domain` | 特定URLを含む投稿（前方一致） | `URL:yahoo.co.jp` |

### 動作しない構文
- `from:username` → 0件（`ID:username` を使う）
- `to:username` → 0件（`@username` を使う）

---

## レート制限

- 500連続・1000並列リクエストでもエラーなし（全て200）
- レスポンスヘッダーに `X-RateLimit-*` 等の制限情報なし
- **確認できる範囲ではレート制限は存在しない**
- ただし User-Agent を一般的なブラウザに偽装しないとブロックされる場合がある

---

## 注意事項

- `start` パラメータの上限は **10000件固定**（人気順・新着順ともに `start=10001` 以降は常に0件）。10000件超えは `oldestTweetId` カーソルに切り替えて取得する
- 10000件を超えて取得したい場合は `oldestTweetId` カーソルを使う。カーソルは10000件制限を受けず、600ページ(18000件超)以降も継続取得できることを確認済み
- `mtype=image` を付けると40件全部メディアあり。付けないと20件中6件程度しかメディアなし
- `displayTextBody` のキーワードハイライトは `\tSTART\t` と `\tEND\t` で囲まれる（除去が必要）
- `displayTextFragments` の `\n` はハッシュタグ・URL・メンションの区切り文字として使われており、実際のツイートの改行ではない。ツイート本文の改行はAPIから取得できない
- X の oEmbed API（`https://publish.twitter.com/oembed?url=...`）なら `<br>` タグで改行が取れるが、1ツイートずつリクエストが必要
- プロフィール画像URLは `rts-pctr.c.yimg.jp` ドメイン（next.config.tsのremotePatternsに要追加）
- 日本語ツイートに特化したインデックスのため、海外ユーザーのツイートはほぼ取得できない（英語クエリでも日本語ツイートが返る）
- User-Agentを一般的なブラウザに偽装しないとブロックされる場合がある

---

## ページ並列取得

`start` パラメータでオフセット指定が可能なため、複数ページを同時にリクエストできる。
逐次取得と比較して約4倍の速度向上を確認済み（4ページ並列時）。

```typescript
const starts = [1, 41, 81, 121]; // results=40 の場合
const pages = await Promise.all(
  starts.map(start =>
    fetch(`https://search.yahoo.co.jp/realtime/api/v1/pagination?${new URLSearchParams({
      p: query, md: "h", results: "40", mtype: "image", start: String(start),
    })}`, { headers })
      .then(r => r.json())
      .then(d => d.timeline.entry)
  )
);
const entries = pages.flat(); // 重複なし
```

### 10000件超えの取得

`start` の上限は10000件固定。それ以上取得する場合は `start` で10000件並列取得後、最後のIDを `oldestTweetId` に渡してカーソルで続きを逐次取得できる（重複なしを確認済み）。

```typescript
// フェーズ1: start で並列取得（最大10000件）
const starts = Array.from({ length: 250 }, (_, i) => i * 40 + 1); // 1, 41, ..., 9961
const pages = await Promise.all(starts.map(start => fetchPage({ start })));
const entries = pages.flat();

// フェーズ2: 最後のIDからカーソルで続きを逐次取得
let cursor = entries.at(-1)?.id;
while (cursor) {
  const page = await fetchPage({ oldestTweetId: cursor });
  if (!page.length) break;
  entries.push(...page);
  cursor = page.at(-1)?.id;
}
```

---

## 使用例

```typescript
const params = new URLSearchParams({
  p: query,
  md: "h",           // 人気順
  results: "40",
  mtype: "image",
  ...(cursor ? { oldestTweetId: cursor } : {}),
});

const res = await fetch(`https://search.yahoo.co.jp/realtime/api/v1/pagination?${params}`, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://search.yahoo.co.jp/realtime/search",
  },
});

const data = await res.json();
const entries = data.timeline.entry;
const nextCursor = data.timeline.head?.oldestTweetId ?? entries.at(-1)?.id ?? null;
```

---

## 動画再生について

### 問題
`video.twimg.com` の m3u8 はブラウザから直接アクセスすると 403 になる。
`Referer: https://x.com/` ヘッダーがないとブロックされるため。

### 調査結果
- m3u8（プレイリスト）→ `Referer: https://x.com/` が必須
- セグメント（.mp4 / .m4s）→ Referer なしでも 200

### 解決策
サーバーサイドで m3u8 をプロキシし、`Referer` を付与した上でセグメントURLを絶対URLに書き換えて返す。
ブラウザ側は hls.js でプロキシ済み m3u8 を再生する（Chrome は HLS ネイティブ非対応のため）。

```
GET /api/video?url=<encoded_m3u8_url>
```

- m3u8 の場合：以下を全て `/api/video?url=...` 経由の絶対URLに書き換えて返す
  - 通常のURIライン（`#` で始まらない行）
  - タグ内の URI 属性（`#EXT-X-MAP:URI="..."`, `#EXT-X-MEDIA:URI="..."` 等）← **これを忘れると init セグメントが localhost:3000 に直接リクエストされて 404 になる**
- セグメントの場合：そのままプロキシ（Referer なしでも取得可能だが念のため付与）
