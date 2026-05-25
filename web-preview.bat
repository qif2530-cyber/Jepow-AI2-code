@echo off
cd /d "%~dp0"
echo.
echo  本地预览网站首页（看 UI 改动用这个，不是 desktop.bat）
echo  启动后浏览器打开: http://127.0.0.1:5173
echo  改完代码若没变，按 Ctrl+Shift+R 强制刷新
echo.
cmd /c npm run dev
pause
