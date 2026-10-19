#!/usr/bin/env bash
# ============================================================================
# 智慧花园 — 自签证书生成（仅供内网 / 本机联调）
# ============================================================================
#
# ⚠️ 先读这段再决定要不要用 ⚠️
#
# 自签证书**不能用于正式环境**，而且 APP 里也基本用不了：
# React Native 的 fetch 走系统 TLS 栈，会校验证书链。自签证书不在系统信任
# 列表里，请求会直接以 TLS 错误失败（不是返回 404/500，是连不上），
# 表现是「知识库检查永远 error」。
#
# 所以这个脚本的适用场景只有：
#   - 用浏览器打开调试（浏览器可以手动点「继续访问」）
#   - 配 curl -k 验证静态目录和 version.json 的正确性
#   - 想先把 Nginx + 静态目录跑通，证书的事之后再换 Let's Encrypt
#
# 要在 APP 上真正跑通 HTTPS，需要：
#   - 有域名 → Let's Encrypt（免费，见 deploy/README.md）
#   - 只有 IP → 内网调试可让服务端暂时只提供 HTTP；HTTPS 需自备受信证书
#
# 用法:
#   ./deploy/generate-self-signed-cert.sh                       # localhost
#   ./deploy/generate-self-signed-cert.sh 192.168.1.10          # 内网 IP
#   ./deploy/generate-self-signed-cert.sh garden.example.com    # 域名
#
# 输出: deploy/certs/{fullchain.pem,privkey.pem}（该目录已 gitignore）
# ============================================================================

set -euo pipefail

HOST="${1:-localhost}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${2:-$SCRIPT_DIR/certs}"
DAYS=825

if ! command -v openssl >/dev/null 2>&1; then
    echo "❌ 未找到 openssl，请先安装"
    exit 1
fi

# 现代客户端**忽略 CN**，只看 subjectAltName。
# 少了 SAN 的话证书会被直接判为不匹配 —— 这是自签证书最常见的坑。
if printf '%s' "$HOST" | grep -qE '^[0-9]+(\.[0-9]+){3}$'; then
    SAN="IP:$HOST"
else
    SAN="DNS:$HOST"
fi
SAN="$SAN,IP:127.0.0.1,DNS:localhost"

mkdir -p "$OUT_DIR"

# MSYS2_ARG_CONV_EXCL 是给 Git Bash / MSYS2 用的。
#
# Windows 上的 Git Bash 会把参数里以 / 开头的东西当 Unix 路径自动转换，
# 于是 "/CN=example.com" 被改写成 "D:/Git/CN=example.com"，openssl 报
# 「subject name 格式不对」。这里只把 /CN 这一个参数排除在转换之外，
# 同时保留对 -keyout/-out 路径的正常转换 —— 两者都需要，不能图省事用
# MSYS_NO_PATHCONV=1 一刀切：那样 /CN 是好了，但 /d/... 路径又没人转了，
# openssl 会报 "Can't open ... No such file or directory"。
#
# 注：Linux/macOS 上这个变量无人理会，脚本行为一致。
#
# 失败时必须把 openssl 的报错打出来 —— 起初我用 2>/dev/null 静音，
# 结果脚本只报一句「生成失败」，真正原因全被吞掉，多花了两次排查。
if ! MSYS2_ARG_CONV_EXCL="/CN" openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "$OUT_DIR/privkey.pem" \
        -out "$OUT_DIR/fullchain.pem" \
        -days "$DAYS" \
        -subj "/CN=$HOST" \
        -addext "subjectAltName=$SAN" \
        2>"$OUT_DIR/.openssl.err"; then
    echo "❌ openssl 生成证书失败："
    sed 's/^/   /' "$OUT_DIR/.openssl.err"
    rm -f "$OUT_DIR/.openssl.err"
    exit 1
fi
rm -f "$OUT_DIR/.openssl.err"

chmod 600 "$OUT_DIR/privkey.pem"

echo "✅ 自签证书已生成"
echo "   主体: CN=$HOST"
echo "   SAN : $SAN"
echo "   有效期: $DAYS 天"
echo "   输出: $OUT_DIR/"
echo ""
echo "在 nginx 配置里指向它们："
echo "   ssl_certificate     $OUT_DIR/fullchain.pem;"
echo "   ssl_certificate_key $OUT_DIR/privkey.pem;"
echo ""
echo "⚠️  APP 的 fetch 会拒绝自签证书 —— 正式环境请换 Let's Encrypt。"
