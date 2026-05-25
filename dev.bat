@echo off
echo.
echo  【可选】仅在你需要改 server.ts / 本地调试网站+后台时使用
echo  日常开发画布请双击 desktop.bat
echo  线上网站请直接访问 https://jepow.com
echo.
pause
cd /d "%~dp0"
cmd /c npm run dev
pause
