#!/bin/bash
# 停止后台运行的 AI Learning Pulse 服务（只停本应用，不误伤其他项目）
stopped=0
for port in 3000 3210; do
  if curl -s --max-time 2 "http://localhost:$port/" 2>/dev/null | grep -q "AI Learning Pulse"; then
    pid=$(lsof -tiTCP:$port -sTCP:LISTEN | head -1)
    if [ -n "$pid" ]; then
      kill "$pid" && echo "✓ 已停止（端口 $port，进程 $pid）"
      stopped=1
    fi
  fi
done
[ "$stopped" = "0" ] && echo "没有正在运行的 AI Learning Pulse 服务"
exit 0
