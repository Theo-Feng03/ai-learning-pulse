#!/bin/bash
# 生成 macOS 应用「AI Learning Pulse.app」并安装到 ~/Applications。
# 点击图标：后台启动本地服务（不弹终端）→ 就绪后自动打开浏览器。
# 实现：osacompile 生成系统原生 applet（Launch Services 可靠识别），再替换图标。
# 用法：bash scripts/make-app.sh   （重复运行会覆盖更新，安全）
set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_DIR="$PWD"
APP_NAME="AI Learning Pulse"
APP_DIR="$HOME/Applications/$APP_NAME.app"
BUILD_DIR="$PROJECT_DIR/.app-build"

echo "① 渲染应用图标…"
mkdir -p "$BUILD_DIR/AppIcon.iconset"
if [ ! -f "$BUILD_DIR/icon-1024.png" ]; then
  pnpm exec playwright screenshot --viewport-size="1024,1024" \
    "file://$PROJECT_DIR/scripts/app/icon.html" "$BUILD_DIR/icon-1024.png" >/dev/null
fi
for size in 16 32 128 256 512; do
  sips -z $size $size "$BUILD_DIR/icon-1024.png" \
    --out "$BUILD_DIR/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z $double $double "$BUILD_DIR/icon-1024.png" \
    --out "$BUILD_DIR/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$BUILD_DIR/AppIcon.iconset" -o "$BUILD_DIR/AppIcon.icns"

echo "② 生成 $APP_DIR …"
mkdir -p "$HOME/Applications"
rm -rf "$APP_DIR"
osacompile -o "$APP_DIR" \
  -e "do shell script \"/bin/bash '$PROJECT_DIR/scripts/app/launch.sh' > /dev/null 2>&1 &\""

# 替换 applet 默认图标
cp "$BUILD_DIR/AppIcon.icns" "$APP_DIR/Contents/Resources/applet.icns"
touch "$APP_DIR"

echo "✅ 完成：$APP_DIR"
echo "   · 在启动台 / 访达的「应用程序」里可以找到它，拖到 Dock 常驻"
echo "   · 点击图标 = 启动服务并打开收件箱；停止服务：pnpm stop"
