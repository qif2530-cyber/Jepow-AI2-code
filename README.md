<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1fc32985-fb83-42af-ae5f-20d732b5f528

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## 产品架构（简要）

- **jepow.com**：官网、充值、后台、登录；网页**不能**进入无限画布。
- **桌面客户端**：仅无限画布；工程保存在用户电脑；账号/积分/扣费走官网 API。
- 详见 [DEPLOY.md](./DEPLOY.md)（阿里云 + Gitee 发布流程）。

## 本地开发：无限画布（默认）

网站在 **https://jepow.com** 打开即可，本地**只启动画布软件**：

```bash
npm install
npm run canvas
# 或双击 desktop.bat
```

登录、积分、扣费走线上 jepow.com；工程保存在本机。

**仅改服务器代码时**才需要 `npm run dev`（本地 3000 端口）。

**生产预览（需先 build）：**

```bash
npm run build
npm run desktop:prod
```

**安装包：**

```bash
npm run desktop:build
```

官网 `server.ts` 需允许桌面客户端跨域：`http://127.0.0.1:<端口>`（已在 CORS 中配置）。
