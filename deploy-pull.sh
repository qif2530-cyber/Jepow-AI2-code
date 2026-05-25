#!/bin/bash
# ==========================================
# 从 Gitee 强制拉取最新代码并部署（适配 Jepow-AI2-code）
# 用法: bash deploy-pull.sh
# ==========================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 新代码库地址（与 Gitee 克隆页一致）
GIT_REPO="${GIT_REPO:-https://gitee.com/jepow/Jepow-AI2-code.git}"
PROJECT_DIR="${PROJECT_DIR:-/home/admin/Jepow-AI2-code}"

echo -e "${GREEN}>>> Jepow 一键拉取部署${NC}"
echo -e "    仓库: ${GIT_REPO}"
echo -e "    目录: ${PROJECT_DIR}"

if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "${YELLOW}>>> 目录不存在，正在 clone...${NC}"
  git clone "$GIT_REPO" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
else
  cd "$PROJECT_DIR"
  if [ ! -d ".git" ]; then
    echo -e "${RED}错误: $PROJECT_DIR 不是 Git 仓库，请删除后重新 clone 或换目录${NC}"
    exit 1
  fi
  git remote set-url origin "$GIT_REPO" 2>/dev/null || git remote add origin "$GIT_REPO"
  echo -e "${GREEN}>>> 拉取最新代码 (origin/main)...${NC}"
  git fetch --all
  git clean -fd
  git reset --hard origin/main
fi

if [ ! -f "deploy.sh" ]; then
  echo -e "${RED}错误: 未找到 deploy.sh，请确认仓库是否为 Jepow-AI2-code${NC}"
  exit 1
fi

chmod +x deploy.sh
bash deploy.sh

echo -e "${GREEN}>>> deploy-pull 完成${NC}"
