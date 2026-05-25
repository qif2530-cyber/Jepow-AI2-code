#!/bin/bash
# 修复 jepow.com 仍显示旧首页：Nginx 静态目录指向错误
# 用法: sudo bash fix-nginx-dist.sh

set -e

PROJECT_DIR="${PROJECT_DIR:-/home/admin/Jepow-AI2-code}"
NGINX_SITE="/etc/nginx/sites-available/jepow"

if [ ! -f "$NGINX_SITE" ]; then
  echo "未找到 $NGINX_SITE，请手动检查: grep -r root /etc/nginx/"
  exit 1
fi

echo ">>> 当前 Nginx root 配置:"
grep -n "root " "$NGINX_SITE" || true

sudo sed -i "s|/home/admin/Jepow-AI/dist|${PROJECT_DIR}/dist|g" "$NGINX_SITE"
sudo sed -i "s|root /var/www[^;]*|root ${PROJECT_DIR}/dist|g" "$NGINX_SITE" 2>/dev/null || true

echo ">>> 修改后:"
grep -n "root " "$NGINX_SITE" || true

sudo nginx -t
sudo systemctl reload nginx

echo ">>> 完成。请用无痕窗口打开 https://jepow.com 验证"
