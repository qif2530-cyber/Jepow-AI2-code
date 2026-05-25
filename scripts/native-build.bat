@echo off
cd /d "%~dp0\.."
setlocal EnableDelayedExpansion

where cargo >nul 2>&1
if errorlevel 1 (
  echo.
  echo [错误] 未安装 Rust。请先安装: https://rustup.rs
  echo.
  exit /b 1
)

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VCVARS="
if exist "%VSWHERE%" (
  for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -property installationPath 2^>nul`) do set "VSROOT=%%i"
  if defined VSROOT if exist "!VSROOT!\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=!VSROOT!\VC\Auxiliary\Build\vcvars64.bat"
)
if not defined VCVARS if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
  set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
)
if not defined VCVARS if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
  set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
)

if not defined VCVARS (
  echo.
  echo ============================================================
  echo  [错误] 未检测到 C++ 编译器 ^(link.exe^)
  echo ============================================================
  echo.
  echo  您已安装「Visual Studio 生成工具」，但还缺少 C++ 工作负载。
  echo.
  echo  请打开 Visual Studio Installer -^> 点「修改」-^> 勾选：
  echo    [x] 使用 C++ 的桌面开发
  echo    [x] MSVC C++ x64/x86 生成工具
  echo    [x] Windows SDK
  echo.
  echo  安装完成后关闭窗口，重新运行 desktop.bat
  echo ============================================================
  echo.
  exit /b 1
)

echo.
echo [Jepow] 已找到 C++ 工具: %VCVARS%
echo [Jepow] 正在编译自研 3D 渲染器 jepow-engine ...
call "%VCVARS%" >nul
cargo build --release --manifest-path native\jepow-engine\Cargo.toml
if errorlevel 1 (
  echo.
  echo [错误] 编译失败，请把上方报错发给我们。
  exit /b 1
)
if not exist "native\jepow-engine\target\release\jepow-engine.exe" (
  echo [错误] 编译结束但未找到 jepow-engine.exe
  exit /b 1
)
echo.
echo [完成] native\jepow-engine\target\release\jepow-engine.exe
exit /b 0
