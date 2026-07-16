#!/bin/bash
# AI Learning Pulse.app 的实际启动逻辑（图标点击后执行）。
# 项目路径由脚本自身位置推导，无需生成时写入。
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/Library/pnpm:$PATH"
cd "$PROJECT_DIR" || exit 1

notify() { osascript -e "display notification \"$1\" with title \"AI Learning Pulse\"" 2>/dev/null || true; }

is_our_app() {
  local body
  body=$(curl -s --max-time 2 "http://localhost:$1/") || return 1
  [[ "$body" == *"AI Learning Pulse"* ]]
}
port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

PORT=3000
if is_our_app 3000; then
  open "http://localhost:3000/inbox"; exit 0
elif port_in_use 3000; then
  PORT=3210
  if is_our_app 3210; then open "http://localhost:3210/inbox"; exit 0; fi
fi

notify "正在启动服务…"
mkdir -p logs
# 启动前拉取另一台电脑的数据（配置了同步时）
if grep -q '^SYNC_REPO=".\+"' .env 2>/dev/null; then
  pnpm sync:pull >> logs/app.log 2>&1 || true
fi

nohup pnpm exec next dev --port "$PORT" >> logs/app.log 2>&1 &
disown

for _ in $(seq 1 60); do
  if is_our_app "$PORT"; then
    open "http://localhost:$PORT/inbox"
    notify "已就绪（端口 $PORT）。服务在后台运行，停止请执行 pnpm stop。"
    exit 0
  fi
  sleep 1
done
notify "启动超时，请查看 logs/app.log"
exit 1
