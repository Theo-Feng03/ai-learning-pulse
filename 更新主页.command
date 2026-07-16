#!/bin/zsh
# 双击更新线上主页：重新导出 showcase.json 并推送到 GitHub Pages。
# 在本地发布新的学习记录之后运行这个。

cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/Library/pnpm:$PATH"

# 从 git remote 推导 Pages 地址（无需手工配置）
origin=$(git remote get-url origin 2>/dev/null)
slug=${origin#*github.com}; slug=${slug#[:/]}; slug=${slug%.git}
user=${slug%%/*}; repo=${slug##*/}
pages_url="https://$(echo "$user" | tr '[:upper:]' '[:lower:]').github.io/${repo}/"

echo "① 导出展示数据…"
if ! pnpm site:update; then
  echo "✗ 导出失败，线上页面未改动。"
  read -r "?按回车关闭…"
  exit 1
fi

if git diff --quiet docs/showcase.json; then
  echo "ℹ 展示数据没有变化（没有新发布/撤回的记录），无需推送。"
  read -r "?按回车关闭…"
  exit 0
fi

echo "② 提交并推送…"
git add docs/showcase.json
git commit -m "更新学习记录（$(date '+%Y-%m-%d %H:%M')）"
if git push; then
  echo
  echo "✓ 已推送。约 1 分钟后生效："
  echo "  $pages_url"
else
  echo "✗ 推送失败，请检查网络或 GitHub 登录状态（gh auth status）。"
fi
read -r "?按回车关闭…"
