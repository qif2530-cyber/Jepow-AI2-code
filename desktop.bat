@echo off
if /i not "%~1"=="_run" (
  start "Jepow AI Desktop" cmd /k "%~f0" _run
  exit /b 0
)

cd /d "%~dp0"
title Jepow AI Desktop
chcp 65001 >nul 2>&1

echo.
echo  Jepow AI 无限画布（本地开发）
echo  账号 / 积分 / AI: https://jepow.com
echo  工程与 3D 模型 / 渲染: 本机 Jepow 原生引擎
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js。请先安装: https://nodejs.org
  goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 npm，请重装 Node.js 并勾选加入 PATH。
  goto :fail
)

call scripts\native-build.bat
if errorlevel 1 (
  echo.
  echo  自研渲染器编译失败。请查看上方报错。
  goto :fail
)

echo.
echo [Jepow] 正在启动桌面端...
echo.
call npm run canvas
if errorlevel 1 (
  echo.
  echo [错误] 桌面端启动失败。
  goto :fail
)

echo.
echo 桌面已退出。
goto :end

:fail
echo.
pause
exit /b 1

:end
pause
exit /b 0
