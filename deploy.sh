#!/bin/bash

# ==========================================
# Jepow-AI 安全一键部署脚本 (保护数据版)
# ==========================================

# 1. 设置颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}>>> 开始执行一键部署...${NC}"

# 2. 检查目录
PROJECT_DIR="$(pwd)"
if [[ ! "$PROJECT_DIR" == *"Jepow-AI"* ]]; then
    if [ -d "/home/admin/Jepow-AI2-code" ]; then
        PROJECT_DIR="/home/admin/Jepow-AI2-code"
    else
        PROJECT_DIR="/home/admin/Jepow-AI"
    fi
fi

if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}错误: 找不到项目目录 $PROJECT_DIR${NC}"
    exit 1
fi

cd $PROJECT_DIR || exit
echo -e "${GREEN}>>> 已进入项目目录: $(pwd)${NC}"

# 3. 数据隔离保护 (迁移旧数据)
DATA_DIR="$HOME/.jepow-data"
echo -e "${GREEN}>>> 检查并初始化持久化数据目录 ($DATA_DIR)...${NC}"
mkdir -p "$DATA_DIR/uploads"
mkdir -p "$DATA_DIR/backups"

# 确保 Nginx (www-data) 有读取权限
chmod 755 "$HOME" 2>/dev/null || true
chmod 755 "$DATA_DIR" 2>/dev/null || true
chmod 755 "$DATA_DIR/uploads" 2>/dev/null || true

# 如果当前目录遗留了旧数据库且新目录没有，自动迁移过去
if [ -f "$PROJECT_DIR/db.json" ] && [ ! -f "$DATA_DIR/db.json" ]; then
    echo -e "${GREEN}>>> 发现本地旧数据，正在迁移至安全目录以防丢失...${NC}"
    cp "$PROJECT_DIR/db.json" "$DATA_DIR/db.json"
fi

if [ -d "$PROJECT_DIR/uploads" ] && [ ! -L "$PROJECT_DIR/uploads" ]; then
    echo -e "${GREEN}>>> 正在同步旧上传文件并创建软链接...${NC}"
    cp -r "$PROJECT_DIR/uploads/"* "$DATA_DIR/uploads/" 2>/dev/null || true
    # 尝试删除，如果因为权限不足(如之前用root运行过)删除失败，则重命名以让路给软链接
    rm -rf "$PROJECT_DIR/uploads" 2>/dev/null || mv "$PROJECT_DIR/uploads" "$PROJECT_DIR/uploads_backup_$(date +%s)" 2>/dev/null || true
fi

if [ ! -e "$PROJECT_DIR/uploads" ]; then
    ln -s "$DATA_DIR/uploads" "$PROJECT_DIR/uploads"
fi

# 4. 正在部署本地修改的代码
echo -e "${GREEN}>>> 正在拉取云端最新代码...${NC}"
git checkout .
git pull origin main

# 5. 安装依赖（服务器只跑网站，跳过 Electron 大文件下载，避免 socket hang up）
echo -e "${GREEN}>>> 正在安装/更新依赖（首次较慢，请耐心等待）...${NC}"
npm config set registry https://registry.npmmirror.com 2>/dev/null || true
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export npm_config_electron_mirror="https://npmmirror.com/mirrors/electron/"

install_deps() {
  npm install --no-audit --no-fund --loglevel=warn "$@"
}

if ! install_deps; then
  echo -e "${RED}>>> 依赖安装失败，清理 node_modules 后重试（跳过 Electron）...${NC}"
  rm -rf node_modules
  install_deps || exit 1
fi

if [ ! -x node_modules/.bin/vite ] || [ ! -x node_modules/.bin/tsx ]; then
  echo -e "${RED}错误: vite 或 tsx 未安装成功，请检查网络后重新运行 deploy.sh${NC}"
  exit 1
fi

# 6. 构建前端
echo -e "${GREEN}>>> 正在打包前端 UI...${NC}"
npm run build

# 7. 重启服务
echo -e "${GREEN}>>> 正在清理遗留进程及重启后台服务...${NC}"
pm2 delete jepow-ai 2>/dev/null || true
sudo pm2 delete jepow-ai 2>/dev/null || true

# 杀死所有占用 3000 端口的进程，防止 EADDRINUSE 和双重写入导致的数据不稳定
echo -e "${GREEN}>>> 释放 3000 端口...${NC}"
sudo fuser -k 3000/tcp 2>/dev/null || true
npx -y kill-port 3000 || true
sudo killall -9 node 2>/dev/null || true
killall -9 node 2>/dev/null || true

# 必须设置 NODE_ENV=production，使得服务端认准 ~/.jepow-data 里的数据
export NODE_ENV=production
pm2 start ./node_modules/.bin/tsx --name jepow-ai -- server.ts

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}部署完成！[数据安全分离版]${NC}"
echo -e "${GREEN}持久化数据存储于: $DATA_DIR${NC}"
echo -e "${GREEN}无论你怎么清理或重新 Clone 代码目录，数据都不会丢失了！${NC}"
echo -e "${GREEN}你可以运行 'pm2 logs jepow-ai' 查看日志${NC}"
echo -e "${GREEN}==========================================${NC}"
