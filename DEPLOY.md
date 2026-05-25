# Jepow AI 部署指南（GitHub → Gitee → 阿里云）

> 说明：本项目是**一个仓库**同时包含：官网前端、管理后台、`server.ts` 接口。  
> 部署到阿里云后，访问 `jepow.com` 即可同时使用网站和管理后台，**不需要分开部署两套代码**。

---

## 一、整体流程（一张图）

```
你的电脑 (d:\jepow-ai)
    │  git push
    ▼
GitHub（备份 / 协作）
    │  Gitee 仓库同步（镜像或手动拉取）
    ▼
Gitee: https://gitee.com/jepow/Jepow-AI
    │  阿里云服务器 git pull
    ▼
/home/admin/Jepow-AI  →  npm run build  →  Nginx + PM2
    │
    ▼
https://jepow.com  （用户看到的网站 + 后台）
```

**用户数据**在服务器目录 `/home/admin/.jepow-data/`（数据库、上传图），**不会**随 `git pull` 被覆盖。

---

## 二、本地电脑：第一次推到 GitHub

### 1. 安装 Git

Windows 下载：https://git-scm.com/download/win  
安装后重新打开终端，执行 `git --version` 能看到版本号即可。

### 2. 在项目目录初始化（若还没有远程仓库）

在 PowerShell 中：

```powershell
cd d:\jepow-ai

# 查看是否已有 git
git status
```

若提示不是 git 仓库：

```powershell
git init
git add .
git commit -m "初始提交：官网+后台+桌面画布架构"
```

### 3. 在 GitHub 新建空仓库

1. 打开 https://github.com/new  
2. 仓库名例如：`Jepow-AI`  
3. **不要**勾选 “Add a README”（避免和本地冲突）  
4. 创建后记下地址，例如：`https://github.com/你的用户名/Jepow-AI.git`

### 4. 关联 GitHub 并推送

```powershell
cd d:\jepow-ai

git remote add origin https://github.com/你的用户名/Jepow-AI.git
# 若已存在 origin，用：git remote set-url origin https://github.com/...

git branch -M main
git push -u origin main
```

按提示登录 GitHub（网页授权或 Personal Access Token）。

### 5. 千万不要提交的文件

以下已在 `.gitignore` 中，推送前可用 `git status` 确认**没有**它们：

- `.env` / `.env.local`（密钥）
- `db.json`（用户数据库）
- `uploads/`（用户上传）
- `node_modules/`、`dist/`、`release/`

---

## 三、GitHub 同步到 Gitee

你服务器脚本里用的是：**https://gitee.com/jepow/Jepow-AI.git**

任选一种方式：

### 方式 A：Gitee 导入（最简单）

1. 登录 https://gitee.com  
2. 「从 GitHub / GitLab 导入仓库」  
3. 选择你的 `Jepow-AI`，导入到 `jepow/Jepow-AI`  
4. 以后可在 Gitee 设置里开启「自动同步 GitHub」

### 方式 B：本地同时推两个远程

```powershell
cd d:\jepow-ai

git remote add gitee https://gitee.com/jepow/Jepow-AI.git
git push -u gitee main
```

日常更新：

```powershell
git add .
git commit -m "描述本次改了什么"
git push origin main    # GitHub
git push gitee main     # Gitee（若用方式 B）
```

---

## 四、阿里云服务器：日常更新部署（最常用）

用 SSH 登录服务器（阿里云控制台有 IP，用户一般是 `admin`）：

```bash
ssh admin@你的服务器IP
```

进入项目并执行**已有的一键脚本**：

```bash
cd /home/admin/Jepow-AI
bash deploy.sh
```

脚本会自动完成：

1. `git pull origin main`（从 Gitee 拉代码）  
2. `npm install`  
3. `npm run build`（打包前端 + 管理后台界面到 `dist/`）  
4. 用 PM2 重启 `server.ts`（接口 + 后台 API）  
5. 保护 `/home/admin/.jepow-data` 里的数据库和上传文件  

部署完成后查看日志：

```bash
pm2 logs jepow-ai
pm2 status
```

浏览器访问：https://jepow.com

---

## 五、服务器环境变量（只需配置一次）

在服务器项目目录创建 `.env`（**不要提交到 Git**）：

```bash
cd /home/admin/Jepow-AI
nano .env
```

写入（按你实际情况修改）：

```env
DB_PATH=/home/admin/jepow_data/db.json
UPLOADS_PATH=/home/admin/jepow_data/uploads
JWT_SECRET=请改成一长串随机密钥
NODE_ENV=production
GEMINI_API_KEY=你的密钥
```

保存后重启：

```bash
pm2 restart jepow-ai
```

---

## 六、全新机器 / 重装系统（慎用）

仅当服务器是**全新系统**、还没有项目目录时，才用：

```bash
bash deploy_aliyun.sh
```

⚠️ 该脚本会 **删除并重新 clone** `/home/admin/Jepow-AI`，但有数据恢复逻辑。  
**日常更新请只用 `deploy.sh`，不要用 `deploy_aliyun.sh`。**

---

## 七、部署后后台检查项

用管理员账号登录 https://jepow.com ，进入管理后台：

| 配置项 | 建议 |
|--------|------|
| 网页无限画布 | **关闭**（引导下载桌面版） |
| 云端工程存储 | **关闭**（工程在用户电脑） |
| 桌面客户端下载地址 | 填安装包下载链接（可选） |

---

## 八、桌面客户端（不在阿里云部署）

桌面无限画布在**你自己电脑**打包，不上传到网站服务器：

```powershell
cd d:\jepow-ai
npm run build
npm run desktop:build
```

安装包在 `release/` 目录，上传到阿里云 OSS 或网盘，把下载链接填到后台。

---

## 九、常见问题

### 1. `git pull` 冲突

```bash
cd /home/admin/Jepow-AI
git stash
git pull origin main
bash deploy.sh
```

### 2. 端口 3000 被占用

`deploy.sh` 已尝试释放端口；仍失败则：

```bash
pm2 delete jepow-ai
sudo fuser -k 3000/tcp
bash deploy.sh
```

### 3. 网站打开是旧页面

```bash
cd /home/admin/Jepow-AI
npm run build
pm2 restart jepow-ai
```

并强制刷新浏览器（Ctrl+F5）。

### 4. 本地没有装 Git

先安装 Git（见第二节），再推送 GitHub。

---

## 十、本地只做无限画布（开发机）

- **网站 / 后台 / 充值**：浏览器打开 https://jepow.com（已部署在阿里云）
- **画布软件**：本机双击 `desktop.bat` 或 `npm run canvas`

```
本机画布 UI (127.0.0.1:38472)  ──API──►  jepow.com
工程文件保存在用户电脑，不上传服务器
```

一般**不要**在本地跑 `npm run dev`，除非你要改 `server.ts` 再部署。

---

## 十一、一键同步到 GitHub（本地）

项目已提供脚本（需先安装 Git 并配置好 `origin` 远程地址）：

**方式 1：双击** 项目根目录的 `push-github.bat`，按提示输入提交说明。

**方式 2：命令行**

```powershell
cd d:\jepow-ai
npm run push:github
# 或带说明：
npm run push:github -- "修复登录与本地工程保存"
```

若还配置了 Gitee 远程，脚本会同时 `git push gitee`。

---

## 十二、阿里云一键拉取部署（新仓库 Jepow-AI2-code）

**不要用以前的 `~/WAGAN` + `update-docker.sh`**（那是旧项目 Docker 方案）。

新仓库地址：`https://gitee.com/jepow/Jepow-AI2-code.git`

### 第一次在新目录部署

```bash
git clone https://gitee.com/jepow/Jepow-AI2-code.git /home/admin/Jepow-AI2-code
cd /home/admin/Jepow-AI2-code
bash deploy.sh
```

### 以后每次更新（等价于你以前的 fetch + reset + 脚本）

```bash
cd /home/admin/Jepow-AI2-code
bash deploy-pull.sh
```

或手动：

```bash
cd /home/admin/Jepow-AI2-code
git fetch --all && git clean -fd && git reset --hard origin/main
bash deploy.sh
```

用户数据仍在 `~/.jepow-data`，不会被覆盖。

### 若仍用旧目录 `/home/admin/Jepow-AI`

先改远程地址再拉取：

```bash
cd /home/admin/Jepow-AI
git remote set-url origin https://gitee.com/jepow/Jepow-AI2-code.git
git fetch --all && git clean -fd && git reset --hard origin/main
bash deploy.sh
```

---

## 十三、你每次发版的极简清单

**在你电脑上：**

1. 改好代码  
2. GitHub Desktop **Push**（Gitee 已同步则自动更新）  

**在阿里云上：**

3. `ssh` 登录  
4. `cd /home/admin/Jepow-AI2-code && bash deploy-pull.sh`  
5. 打开 https://jepow.com 验证  

完成。
