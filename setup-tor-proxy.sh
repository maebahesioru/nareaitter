#!/bin/bash
# nareaitter用 Tor + privoxy セットアップ
# serverpc (Debian 13) で実行

set -e

echo "=== Tor + privoxy setup for nareaitter ==="

# Torインストール
if ! command -v tor &>/dev/null; then
    apt-get update && apt-get install -y tor
fi

# 日本の出口ノード優先
if ! grep -q "ExitNodes" /etc/tor/torrc; then
    cat >> /etc/tor/torrc << 'EOF'
ExitNodes {jp}
StrictNodes 0
EOF
fi

systemctl enable tor
systemctl restart tor
sleep 3

# privoxyインストール
if ! command -v privoxy &>/dev/null; then
    apt-get install -y privoxy
fi

# privoxy最小設定（全フィルタ無効）
cat > /etc/privoxy/config << 'EOF'
listen-address 127.0.0.1:8118
toggle 0
enable-remote-toggle 0
enable-remote-http-toggle 0
enable-edit-actions 0
enforce-blocks 0
buffer-limit 4096
forward-socks5 / 127.0.0.1:9050 .
EOF

systemctl restart privoxy
sleep 2

# 動作確認
echo "=== Testing Tor+privoxy → Yahoo API ==="
curl -s --proxy http://127.0.0.1:8118 \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Accept: application/json" \
  "https://search.yahoo.co.jp/realtime/api/v1/pagination?p=%40nhk_news&results=1&start=1" | head -c 50
echo ""

echo "=== Done ==="
echo "Set nareaitter env: YAHOO_PROXY=http://127.0.0.1:8118"
