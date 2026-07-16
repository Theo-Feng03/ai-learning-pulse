#!/bin/zsh
# 双击启动 AI Learning Pulse：启动本地服务并自动打开资讯收件箱。
# 关闭本窗口（或按 Ctrl+C）即停止服务。

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/Library/pnpm:$PATH"

# 判断某端口上跑的是否是本应用（必须 200 且页面包含产品名，避免误认其他项目的服务）
is_our_app() {
  local body
  body=$(curl -s --max-time 2 "http://localhost:$1/") || return 1
  [[ "$body" == *"AI Learning Pulse"* ]]
}

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

PORT=3000
if is_our_app 3000; then
  echo "✓ 服务已在运行，直接打开收件箱"
  open "http://localhost:3000/inbox"
  exit 0
elif port_in_use 3000; then
  echo "⚠ 端口 3000 被其他程序占用，本应用改用端口 3210"
  PORT=3210
  if is_our_app 3210; then
    echo "✓ 服务已在运行，直接打开收件箱"
    open "http://localhost:3210/inbox"
    exit 0
  fi
fi

if ! command -v pnpm >/dev/null; then
  echo "✗ 未找到 pnpm，请先安装（brew install pnpm）"
  read -r "?按回车关闭…"
  exit 1
fi

# 已配置 SYNC_REPO 时，启动前先拉取另一台电脑的最新数据
if grep -q '^SYNC_REPO=".\+"' .env 2>/dev/null; then
  echo "同步：拉取另一台电脑的最新数据…"
  pnpm sync:pull || echo "⚠ 同步失败（可能离线），使用本地现有数据继续启动"
  echo
fi

echo "正在启动 AI Learning Pulse（端口 $PORT）…首次启动约需 5-10 秒"
echo "服务就绪后会自动打开浏览器；关闭本窗口即停止服务。"
echo "提示：换到另一台电脑前，双击「同步数据.command」推送本机数据。"
echo

# 后台等待服务就绪后打开浏览器
(
  for _ in {1..60}; do
    if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; then
      open "http://localhost:$PORT/inbox"
      exit 0
    fi
    sleep 1
  done
) &

exec pnpm exec next dev --port "$PORT"
