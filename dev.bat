@echo off
cd /d "%~dp0"
echo.
echo  本地网站: http://127.0.0.1:3000
echo  关闭本窗口即停止服务
echo.
cmd /c npm run dev
pause
