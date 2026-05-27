const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { registerProjectIpc } = require('./projects-ipc.cjs');
const { registerViewportIpc } = require('./viewport-ipc.cjs');
const { registerAssetsIpc } = require('./assets-ipc.cjs');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

const API_PORT = Number(process.env.API_PORT) || 3000;
const DEFAULT_PORT = Number(process.env.PORT) || 38472;

/** Packaged app → jepow.com; local dev → local API unless JEPOW_WEB_URL is set */
function resolveWebUrl() {
  if (process.env.JEPOW_WEB_URL) {
    return process.env.JEPOW_WEB_URL.replace(/\/$/, '');
  }
  if (app.isPackaged) return 'https://jepow.com';
  return `http://127.0.0.1:${API_PORT}`;
}

const WEB_URL = resolveWebUrl();
const useLocalApi = WEB_URL === `http://127.0.0.1:${API_PORT}`;

process.env.JEPOW_WEB_URL = WEB_URL;

let mainWindow = null;
let frontendProcess = null;
let apiProcess = null;
let activePort = DEFAULT_PORT;
let pendingAuthPayload = null;

function parseAuthDeepLink(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'jepow:') return null;
    const action = url.host || url.pathname.replace(/^\/+/, '').split('/')[0];
    if (action !== 'auth') return null;
    const payload = url.searchParams.get('payload');
    if (!payload) return null;
    return JSON.parse(decodeURIComponent(Buffer.from(payload, 'base64').toString('utf8')));
  } catch (e) {
    console.error('[Desktop] Failed to parse auth link:', e);
    return null;
  }
}

function deliverAuthToRenderer(data) {
  if (!data?.token) return;
  if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('desktop-auth', data);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingAuthPayload = data;
  }
}

function handleDeepLink(rawUrl) {
  const data = parseAuthDeepLink(rawUrl);
  if (data) deliverAuthToRenderer(data);
}

const startupDeepLink = process.argv.find(
  (a) => typeof a === 'string' && a.startsWith('jepow://'),
);
if (startupDeepLink) {
  pendingAuthPayload = parseAuthDeepLink(startupDeepLink);
}

function getAppRoot() {
  return path.join(__dirname, '..');
}

function waitForUrl(url, attempts = 80) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (++n >= attempts) reject(new Error(`Timeout waiting for ${url}`));
      else setTimeout(tick, 400);
    };
    tick();
  });
}

function startApiServer() {
  if (!useLocalApi) {
    console.log(`[Desktop] API → ${WEB_URL} (no local server)`);
    return;
  }

  const appRoot = getAppRoot();
  const tsxBin = path.join(
    appRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
  );
  const serverEntry = path.join(appRoot, 'server.ts');
  const cmd = fs.existsSync(tsxBin) ? tsxBin : 'npx';
  const args = fs.existsSync(tsxBin) ? [serverEntry] : ['tsx', serverEntry];

  console.log(`[Desktop] Starting local API on http://127.0.0.1:${API_PORT}`);

  apiProcess = spawn(cmd, args, {
    cwd: appRoot,
    env: {
      ...process.env,
      PORT: String(API_PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  apiProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error('[Desktop] API server exited:', code);
    }
  });
}

function startFrontendServer() {
  const appRoot = getAppRoot();
  const distIndex = path.join(appRoot, 'dist', 'index.html');
  const useProduction =
    app.isPackaged || process.env.JEPOW_DESKTOP_PROD === '1';

  if (useProduction && fs.existsSync(distIndex)) {
    const script = path.join(__dirname, 'static-server.cjs');
    frontendProcess = spawn(process.execPath, [script], {
      cwd: __dirname,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(activePort),
        HOST: '127.0.0.1',
        JEPOW_APP_ROOT: appRoot,
      },
      stdio: 'inherit',
    });
    return;
  }

  const viteBin = path.join(
    appRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vite.cmd' : 'vite',
  );
  const cmd = fs.existsSync(viteBin) ? viteBin : 'npx';
  const args = fs.existsSync(viteBin)
    ? ['--host', '127.0.0.1', '--port', String(activePort), '--strictPort']
    : ['vite', '--host', '127.0.0.1', '--port', String(activePort), '--strictPort'];

  console.log(`[Desktop] UI dev server → http://127.0.0.1:${activePort}`);

  frontendProcess = spawn(cmd, args, {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Jepow AI 画布',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (pendingAuthPayload) {
      deliverAuthToRenderer(pendingAuthPayload);
      pendingAuthPayload = null;
    }
  });
  mainWindow.loadURL(`http://127.0.0.1:${activePort}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  if (process.defaultApp) {
    app.setAsDefaultProtocolClient('jepow', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient('jepow');
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  registerProjectIpc(ipcMain);
  registerViewportIpc(ipcMain);
  registerAssetsIpc(ipcMain);

  ipcMain.handle('open-web', (_event, url) => {
    const target =
      typeof url === 'string' && url.startsWith('http') ? url : WEB_URL;
    return shell.openExternal(target);
  });

  app.on('second-instance', (_event, argv) => {
    const link = argv.find(
      (a) => typeof a === 'string' && a.startsWith('jepow://'),
    );
    if (link) handleDeepLink(link);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

    await app.whenReady();

  try {
    const nativeBridge = require('./native-engine-bridge.cjs');
    const st = nativeBridge.getEngineExecutable();
    if (!st) {
      console.warn('[Desktop] jepow-engine.exe missing — run scripts\\native-build.bat after installing VS C++ workload');
      dialog.showMessageBox({
        type: 'warning',
        title: 'Jepow 自研 3D 渲染器未就绪',
        message: 'jepow-engine.exe 尚未编译成功',
        detail:
          '您已安装 Visual Studio 生成工具，但通常还需要勾选「使用 C++ 的桌面开发」才能编译。\n\n请：\n1. Visual Studio Installer → 修改 → 勾选 C++ 桌面开发\n2. 关闭本程序，运行 desktop.bat\n3. 看到编译完成后再导入 FBX 模型\n\n注意：不是「模型编译失败」，是「渲染器程序」还没生成。',
      });
    } else {
      console.log('[Desktop] jepow-engine:', st);
    }
  } catch (e) {
    console.warn('[Desktop] native engine check failed', e);
  }

  startApiServer();

  try {
    if (useLocalApi) {
      await waitForUrl(`http://127.0.0.1:${API_PORT}/api/health`);
    }
    startFrontendServer();
    await waitForUrl(`http://127.0.0.1:${activePort}/`);
    createWindow();
  } catch (err) {
    console.error(err);
    const hint = useLocalApi
      ? `端口 ${API_PORT} 或 ${activePort} 可能被占用。\n请先关闭其它 npm run dev / desktop 窗口，或在任务管理器中结束 node.exe 后重试。`
      : `无法连接 ${WEB_URL}，请检查网络与官网 CORS 配置。`;
    dialog.showErrorBox('Jepow AI 画布启动失败', `${err.message}\n\n${hint}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function shutdownChildren() {
  try {
    const nativeBridge = require('./native-engine-bridge.cjs');
    if (nativeBridge.killDaemon) nativeBridge.killDaemon();
  } catch {
    /* ignore */
  }
  try {
    const cyclesBridge = require('./jepow-cycles-bridge.cjs');
    if (cyclesBridge.stopCyclesDaemon) cyclesBridge.stopCyclesDaemon();
  } catch {
    /* ignore */
  }
  if (frontendProcess && !frontendProcess.killed) {
    frontendProcess.kill();
    frontendProcess = null;
  }
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill();
    apiProcess = null;
  }
}

app.on('window-all-closed', () => {
  shutdownChildren();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', shutdownChildren);

bootstrap().catch((err) => {
  console.error('[Desktop Fatal]', err);
  app.quit();
});
