#!/bin/bash
# AI Learning Pulse 一键安装（macOS）
#
# 新电脑上只需在终端执行：
#   curl -fsSL https://raw.githubusercontent.com/Theo-Feng03/ai-learning-pulse/main/setup.sh | bash
#
# 自动完成：Homebrew/Node/pnpm/gh 安装 → GitHub 登录 → 克隆代码 →
# 依赖安装 → 数据库初始化 → 拉取私有数据仓库（没有则写入演示数据）。
# 可选参数：安装目录（默认 ~/Documents/AI_NEWS）。重复运行是安全的（幂等）。
set -euo pipefail

REPO_SLUG="Theo-Feng03/ai-learning-pulse"
TARGET_DIR="${1:-$HOME/Documents/AI_NEWS}"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

if [ "$(uname)" != "Darwin" ]; then
  echo "本脚本面向 macOS。其他系统请按 README 手动安装。"
  exit 1
fi

# ① Homebrew
if ! command -v brew >/dev/null 2>&1; then
  say "① 安装 Homebrew（可能需要输入开机密码）…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
  say "① Homebrew 已安装"
fi
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

# ② Node / pnpm / GitHub CLI
say "② 检查 Node / pnpm / GitHub CLI…"
for pkg in node pnpm gh; do
  if command -v "$pkg" >/dev/null 2>&1; then
    echo "  ✓ $pkg 已安装"
  else
    echo "  → 安装 $pkg…"
    brew install "$pkg"
  fi
done

# ③ GitHub 登录
say "③ GitHub 登录…"
if gh auth status >/dev/null 2>&1; then
  echo "  ✓ 已登录"
else
  gh auth login
fi
GH_USER=$(gh api user --jq .login)

# ④ 获取代码
say "④ 获取代码 → $TARGET_DIR"
if [ -d "$TARGET_DIR/.git" ]; then
  echo "  已存在，拉取最新代码…"
  git -C "$TARGET_DIR" pull --ff-only || true
else
  mkdir -p "$(dirname "$TARGET_DIR")"
  gh repo clone "$REPO_SLUG" "$TARGET_DIR"
fi
cd "$TARGET_DIR"

# ⑤ 依赖
say "⑤ 安装依赖…"
pnpm install

# ⑥ 配置与数据库
say "⑥ 初始化配置与数据库…"
[ -f .env ] || cp .env.example .env
SYNC_REPO_SLUG="$GH_USER/ai-learning-pulse-data"
if grep -q '^SYNC_REPO=""' .env; then
  sed -i '' "s|^SYNC_REPO=\"\"|SYNC_REPO=\"$SYNC_REPO_SLUG\"|" .env
  echo "  已配置同步仓库：$SYNC_REPO_SLUG"
fi
pnpm db:setup

# ⑦ 数据
say "⑦ 获取数据…"
if gh repo view "$SYNC_REPO_SLUG" >/dev/null 2>&1; then
  pnpm sync:pull
else
  echo "  未找到私有数据仓库 $SYNC_REPO_SLUG，写入演示数据代替。"
  echo "  （在已有数据的电脑上执行 pnpm sync:init 后，这台再运行 pnpm sync:pull 即可。）"
  pnpm seed:demo
fi

chmod +x ./*.command 2>/dev/null || true

say "✅ 安装完成！"
echo "启动方式（任选其一）："
echo "  · Finder 中双击「启动 AI Learning Pulse.command」"
echo "  · 终端执行：cd $TARGET_DIR && pnpm dev"
open . 2>/dev/null || true
