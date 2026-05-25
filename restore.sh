#!/bin/bash
echo "🔍 正在从自动备份中恢复您的数据..."

# 解决 EACCES 权限被拒绝的问题
echo "🔐 尝试修改文件权限以允许覆盖..."
sudo chmod 777 db.json 2>/dev/null || true
sudo rm -f db.json 2>/dev/null || true

node restore.js
pm2 restart all
echo "✅ 搞定！请刷新您的网页！"

