#!/bin/zsh
# 双击同步数据：先拉取另一台电脑的最新数据合并进本地，再把本地数据推送到私有仓库。
# 换电脑前双击一次即可。合并前会自动备份本地数据库（prisma/backups/，保留最近 10 份）。

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/Library/pnpm:$PATH"

echo "开始同步数据（私有仓库）…"
if pnpm sync:push; then
  echo
  echo "✓ 同步完成：本机与云端快照已一致。"
else
  echo
  echo "✗ 同步失败。本地数据未受影响，可稍后重试。"
fi
read -r "?按回车关闭…"
