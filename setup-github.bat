@echo off
chcp 65001 >nul
cd /d "%~dp0"

set REPO=https://github.com/oif2530-cyber/Jepow-AI2.git

echo.
echo  关联并推送到 GitHub: oif2530-cyber/Jepow-AI2
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 git 命令。请确认已安装 Git 并重启电脑或 Cursor 后再试。
  echo 下载: https://git-scm.com/download/win
  pause
  exit /b 1
)

git --version
echo.

if not exist ".git" (
  echo ^>^> 初始化本地 Git 仓库...
  git init
)

echo ^>^> 配置远程地址...
git remote remove origin 2>nul
git remote add origin %REPO%

echo ^>^> 添加文件并提交...
git add .
git commit -m "sync: Jepow AI 无限画布 + 官网架构" 2>nul
if errorlevel 1 (
  echo （没有新改动可提交，或已提交过，继续推送...）
)

echo ^>^> 推送到 GitHub main 分支...
git branch -M main
git push -u origin main

if errorlevel 1 (
  echo.
  echo [提示] 若推送失败，常见原因：
  echo   1. 未登录 GitHub — 浏览器按提示授权，或使用 Personal Access Token
  echo   2. 网络问题 — 可稍后再试
  echo   3. 仓库已有内容且冲突 — 在 GitHub 仓库页用空仓库，勿勾选 README
  pause
  exit /b 1
)

echo.
echo ========================================
echo  已成功推送到 GitHub！
echo  %REPO%
echo ========================================
echo.
echo 若阿里云从 Gitee 部署，请在 Gitee 导入此 GitHub 仓库后执行 deploy.sh
echo.
pause
