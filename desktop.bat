@echo off
cd /d "%~dp0"
echo.
echo  Jepow AI 无限画布（本地开发）
echo  账号 / 积分 / 接口: https://jepow.com
echo  工程文件保存在本机，不占用服务器空间
echo.
cmd /c npm run canvas
pause
