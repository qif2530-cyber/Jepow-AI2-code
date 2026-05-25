const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, dialog } = require('electron');

function assetsRoot(userId) {
  const dir = path.join(app.getPath('userData'), 'assets', String(userId).replace(/[^a-zA-Z0-9_-]/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function registerAssetsIpc(ipcMain) {
  ipcMain.handle('assets:pickModelFile', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择本地 3D 模型',
      properties: ['openFile'],
      filters: [
        {
          name: '3D Models',
          extensions: ['glb', 'gltf', 'fbx', 'obj'],
        },
      ],
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { canceled: true, filePath: null };
    }
    return { canceled: false, filePath: res.filePaths[0] };
  });

  ipcMain.handle('assets:importFile', async (_e, userId, sourcePath) => {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { ok: false, error: 'source file not found' };
    }
    const base = path.basename(sourcePath);
    const hash = crypto.createHash('sha1').update(sourcePath + Date.now()).digest('hex').slice(0, 10);
    const destName = `${hash}_${base}`;
    const dest = path.join(assetsRoot(userId), destName);
    fs.copyFileSync(sourcePath, dest);
    return { ok: true, localPath: dest, fileName: base };
  });

  ipcMain.handle('assets:saveBuffer', async (_e, userId, fileName, base64) => {
    if (!fileName || !base64) {
      return { ok: false, error: 'invalid payload' };
    }
    const safe = path.basename(fileName);
    const hash = crypto.createHash('sha1').update(base64.slice(0, 128) + Date.now()).digest('hex').slice(0, 10);
    const dest = path.join(assetsRoot(userId), `${hash}_${safe}`);
    fs.writeFileSync(dest, Buffer.from(base64, 'base64'));
    return { ok: true, localPath: dest, fileName: safe };
  });

  /** Large FBX/GLB — pass ArrayBuffer from renderer (no base64 string in JS heap) */
  ipcMain.handle('assets:saveBufferRaw', async (_e, userId, fileName, arrayBuffer) => {
    if (!fileName || !arrayBuffer) {
      return { ok: false, error: 'invalid payload' };
    }
    const safe = path.basename(fileName);
    const hash = crypto.createHash('sha1').update(String(arrayBuffer.byteLength) + Date.now()).digest('hex').slice(0, 10);
    const dest = path.join(assetsRoot(userId), `${hash}_${safe}`);
    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
    return { ok: true, localPath: dest, fileName: safe };
  });

  ipcMain.handle('assets:readBuffer', async (_e, localPath) => {
    if (!localPath || !fs.existsSync(localPath)) {
      return { ok: false, error: 'file not found' };
    }
    const buf = fs.readFileSync(localPath);
    return { ok: true, base64: buf.toString('base64'), byteLength: buf.length };
  });

  /** Resolve absolute on-disk path for native wgpu renderer (fixes saved projects missing paths). */
  ipcMain.handle('assets:resolveScenePath', async (_e, userId, hints) => {
    const tryFile = (p) => {
      if (!p || typeof p !== 'string') return null;
      let raw = p.trim();
      if (raw.startsWith('jepow-local://')) {
        raw = raw.slice('jepow-local://'.length);
      }
      const norm = path.normalize(raw);
      return fs.existsSync(norm) ? norm : null;
    };

    const h = hints || {};
    let found =
      tryFile(h.nativeScenePath) ||
      tryFile(h.localAssetPath) ||
      tryFile(h.glbUrl);

    if (!found && h.modelName) {
      const safe = path.basename(String(h.modelName));
      const root = assetsRoot(userId);
      try {
        for (const f of fs.readdirSync(root)) {
          if (f === safe || f.endsWith(`_${safe}`)) {
            const full = path.join(root, f);
            const hit = tryFile(full);
            if (hit) {
              found = hit;
              break;
            }
          }
        }
      } catch {
        /* empty assets dir */
      }
    }

    if (!found) {
      return {
        ok: false,
        error: `找不到本地模型文件「${h.modelName || 'scene'}」。请用「从磁盘选择大场景」重新导入。`,
      };
    }
    return { ok: true, scenePath: found };
  });
}

module.exports = { registerAssetsIpc, assetsRoot };
