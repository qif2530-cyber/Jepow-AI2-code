# 一键提交并推送到 GitHub（若配置了 gitee 远程，也会一并推送）
# 用法: 双击运行，或在项目根目录: powershell -File scripts/push-github.ps1 "提交说明"

param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Require-Git {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "未检测到 Git，请先安装: https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
  }
}

Require-Git

if (-not (Test-Path ".git")) {
  Write-Host "当前目录还不是 Git 仓库。请先执行:" -ForegroundColor Yellow
  Write-Host "  git init" -ForegroundColor Cyan
  Write-Host "  git remote add origin https://github.com/你的用户名/Jepow-AI.git" -ForegroundColor Cyan
  exit 1
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = Read-Host "请输入本次更新说明（直接回车则用默认文案）"
}
if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = "chore: sync $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

Write-Host "`n>>> 检查变更..." -ForegroundColor Green
git status -s
$changes = git status --porcelain
if (-not $changes) {
  Write-Host "没有需要提交的文件，已跳过。" -ForegroundColor Yellow
  exit 0
}

Write-Host "`n>>> 提交: $Message" -ForegroundColor Green
git add .
git commit -m $Message

$remotes = git remote
if ($remotes -notcontains "origin") {
  Write-Host "`n未配置 origin。请先双击运行 setup-github.bat" -ForegroundColor Red
  exit 1
}

Write-Host "`n>>> 推送到 GitHub (origin)..." -ForegroundColor Green
git push -u origin HEAD

if ($remotes -contains "gitee") {
  Write-Host "`n>>> 推送到 Gitee..." -ForegroundColor Green
  git push gitee HEAD
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "已同步到 GitHub！" -ForegroundColor Green
if ($remotes -contains "gitee") {
  Write-Host "Gitee 也已更新。接下来可 SSH 登录阿里云执行:" -ForegroundColor Green
  Write-Host "  cd /home/admin/Jepow-AI && bash deploy.sh" -ForegroundColor Cyan
} else {
  Write-Host "若使用 Gitee 部署，请在 Gitee 导入/同步 GitHub 后，再在服务器执行 deploy.sh" -ForegroundColor Yellow
}
Write-Host "========================================`n" -ForegroundColor Green
