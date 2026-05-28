const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, dialog } = require('electron');
const bundle = require('./ai-project-bundle.cjs');
const blenderBridge = require('./blender-bridge.cjs');
const { loadIndex, findEntry, entryBundlePath } = require('./projects-ipc.cjs');

function assetsRoot(userId) {
  const dir = path.join(app.getPath('userData'), 'assets', String(userId).replace(/[^a-zA-Z0-9_-]/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function activeBundlePath(userId, projectId) {
  const index = loadIndex(userId);
  const id = projectId || index.activeProjectId;
  if (!id) return null;
  const entry = findEntry(index, id);
  return entryBundlePath(entry);
}

function destDirForCategory(userId, fileName, projectId, nodeType) {
  const ext = path.extname(fileName);
  const category = bundle.classifyByExt(ext, nodeType);
  const bp = activeBundlePath(userId, projectId);
  if (bp) {
    return { dir: bundle.getAssetDir(bp, category), category, bundlePath: bp };
  }
  return { dir: assetsRoot(userId), category: null, bundlePath: null };
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

  ipcMain.handle('assets:pickBlendFile', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择 Blender 工程 (.blend)',
      properties: ['openFile'],
      filters: [{ name: 'Blender', extensions: ['blend'] }],
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { canceled: true, filePath: null };
    }
    return { canceled: false, filePath: res.filePaths[0] };
  });

  ipcMain.handle('assets:importBlendProject', async (_e, userId, sourcePath, projectId) => {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { ok: false, error: 'source .blend not found' };
    }
    const executable = blenderBridge.getBlenderExecutable();
    if (!executable) {
      return {
        ok: false,
        error:
          '未找到 Blender。请安装 Blender 或设置环境变量 JEPOW_BLENDER_PATH / userData/jepow-blender.json',
      };
    }

    const base = path.basename(sourcePath);
    const hash = crypto.createHash('sha1').update(sourcePath + Date.now()).digest('hex').slice(0, 10);
    const blendDestName = `${hash}_${base}`;
    const { dir, category, bundlePath } = destDirForCategory(userId, base, projectId, 'modelAssetNode');
    fs.mkdirSync(dir, { recursive: true });
    const blendDest = path.join(dir, blendDestName);
    fs.copyFileSync(sourcePath, blendDest);

    const glbBase = base.replace(/\.blend$/i, '.glb');
    const glbDestName = `${hash}_${glbBase}`;
    const glbDest = path.join(dir, glbDestName);

    const extracted = await blenderBridge.importBlendProject({
      blendPath: blendDest,
      outputGlbPath: glbDest,
    });
    if (!extracted.ok) {
      return extracted;
    }

    const assetRef =
      bundlePath && category ? `jepow-asset://${category}/${blendDestName}` : null;
    const glbAssetRef =
      bundlePath && category ? `jepow-asset://${category}/${glbDestName}` : null;

    return {
      ok: true,
      blueprint: {
        blendPath: blendDest,
        glbPath: glbDest,
        blendFileName: base,
        assetRef,
        glbAssetRef,
        sceneName: extracted.sceneName,
        principled: extracted.principled || {},
        cyclesLight: extracted.cyclesLight || {},
        cyclesCamera: extracted.cyclesCamera || {},
        viewportCamera: extracted.viewportCamera || {},
        cyclesRenderSettings: extracted.cyclesRenderSettings || {},
        renderEngine: extracted.renderEngine,
      },
    };
  });

  ipcMain.handle('assets:importFile', async (_e, userId, sourcePath, projectId, nodeType) => {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { ok: false, error: 'source file not found' };
    }
    const base = path.basename(sourcePath);
    const hash = crypto.createHash('sha1').update(sourcePath + Date.now()).digest('hex').slice(0, 10);
    const destName = `${hash}_${base}`;
    const { dir, category, bundlePath } = destDirForCategory(userId, base, projectId, nodeType || 'modelAssetNode');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, destName);
    fs.copyFileSync(sourcePath, dest);
    const assetRef =
      bundlePath && category
        ? `jepow-asset://${category}/${destName}`
        : null;
    return {
      ok: true,
      localPath: dest,
      fileName: base,
      assetRef,
      category,
      bundlePath,
    };
  });

  ipcMain.handle('assets:saveBuffer', async (_e, userId, fileName, base64, projectId, nodeType) => {
    if (!fileName || !base64) {
      return { ok: false, error: 'invalid payload' };
    }
    const safe = path.basename(fileName);
    const hash = crypto.createHash('sha1').update(base64.slice(0, 128) + Date.now()).digest('hex').slice(0, 10);
    const destName = `${hash}_${safe}`;
    const { dir, category, bundlePath } = destDirForCategory(userId, safe, projectId, nodeType);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, destName);
    fs.writeFileSync(dest, Buffer.from(base64, 'base64'));
    const assetRef =
      bundlePath && category ? `jepow-asset://${category}/${destName}` : null;
    return { ok: true, localPath: dest, fileName: safe, assetRef, category };
  });

  /** Large FBX/GLB — pass ArrayBuffer from renderer (no base64 string in JS heap) */
  ipcMain.handle('assets:saveBufferRaw', async (_e, userId, fileName, arrayBuffer, projectId, nodeType) => {
    if (!fileName || !arrayBuffer) {
      return { ok: false, error: 'invalid payload' };
    }
    const safe = path.basename(fileName);
    const hash = crypto.createHash('sha1').update(String(arrayBuffer.byteLength) + Date.now()).digest('hex').slice(0, 10);
    const destName = `${hash}_${safe}`;
    const { dir, category, bundlePath } = destDirForCategory(userId, safe, projectId, nodeType);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, destName);
    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
    const assetRef =
      bundlePath && category ? `jepow-asset://${category}/${destName}` : null;
    return { ok: true, localPath: dest, fileName: safe, assetRef, category };
  });

  ipcMain.handle('assets:readBuffer', async (_e, localPath) => {
    if (!localPath || !fs.existsSync(localPath)) {
      return { ok: false, error: 'file not found' };
    }
    const buf = fs.readFileSync(localPath);
    return { ok: true, base64: buf.toString('base64'), byteLength: buf.length };
  });

  /** Resolve absolute on-disk path for native wgpu renderer (fixes saved projects missing paths). */
  ipcMain.handle('assets:resolveScenePath', async (_e, userId, hints = {}) => {
    const tryFile = (p) => {
      if (!p || typeof p !== 'string') return null;
      let raw = p.trim();
      if (raw.startsWith('jepow-asset://')) {
        const bp = activeBundlePath(userId, h.projectId);
        if (bp) return tryFile(bundle.resolveAssetRef(bp, raw));
        return null;
      }
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
      const searchDirs = [assetsRoot(userId)];
      const bp = activeBundlePath(userId, h.projectId);
      if (bp) searchDirs.unshift(bundle.getAssetDir(bp, 'models'));

      for (const root of searchDirs) {
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
          /* empty */
        }
        if (found) break;
      }
    }

    if (!found && h.glbUrl) {
      const bp = activeBundlePath(userId, h.projectId);
      if (bp && h.glbUrl.startsWith('jepow-asset://')) {
        found = tryFile(bundle.resolveAssetRef(bp, h.glbUrl));
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
