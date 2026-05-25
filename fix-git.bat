@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  正在删除损坏的 .git 文件夹，以便重新创建仓库...
echo.
if exist ".git" (
  rmdir /s /q ".git"
  echo  已删除。请重新打开 GitHub Desktop：
  echo    File -^> Add local repository -^> 选 D:\jepow-ai
  echo    再点 create a repository
) else (
  echo  未发现 .git，可直接在 GitHub Desktop 里 create a repository
)
echo.
pause
