// Docker 停止時に即座に終了するためのエントリ。
// Next 標準の stop は keep-alive 接続（Traefik の コネクションプール等）が残ると
// サーバクローズが完了せず、docker stop がタイムアウト（実測 31 秒）まで待たされる。
// 新コンテナ起動後に停止されるため、即時終了で問題ない。
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
require("./server.js");
