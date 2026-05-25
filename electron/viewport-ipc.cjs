const { dialog } = require('electron');
const nativeEngine = require('./native-engine-bridge.cjs');

/**
 * 3D 视口：仅走 jepow-engine（Rust/wgpu），不调用 blender.exe。
 * 导入规则对齐 Blender io_scene_fbx（坐标、节点矩阵、三角化），见 native/jepow-engine。
 * 可选：JEPOW_USE_BLENDER_VIEWPORT=1 时回退 Blender 子进程（仅调试，非产品路径）。
 */
const blenderBridge = process.env.JEPOW_USE_BLENDER_VIEWPORT === '1'
  ? require('./blender-bridge.cjs')
  : null;

/** GPL offline renderer (route A) — never blender.exe, never viewport daemon */
const cyclesBridge = require('./jepow-cycles-bridge.cjs');

function normalizeScenePath(scenePath) {
  if (!scenePath || typeof scenePath !== 'string') return '';
  let raw = scenePath.trim();
  if (raw.startsWith('jepow-local://')) {
    raw = raw.slice('jepow-local://'.length);
  }
  const path = require('path');
  return path.normalize(raw);
}

function pickBackend(scenePath) {
  if (blenderBridge) {
    const path = require('path');
    const ext = path.extname(normalizeScenePath(scenePath)).toLowerCase();
    if (['.fbx', '.obj', '.blend'].includes(ext) && blenderBridge.getBlenderExecutable()) {
      return 'blender';
    }
  }
  return nativeEngine.getEngineExecutable() ? 'native' : null;
}

async function getCombinedStatus() {
  const nativeSt = await nativeEngine.getStatus();
  const cyclesSt = await cyclesBridge.getStatus();
  let blenderSt = null;
  if (blenderBridge) {
    blenderSt = await blenderBridge.getStatus();
  }
  const nativeAvailable = !!nativeSt.available;
  const blenderAvailable = !!blenderSt?.available;
  const cyclesAvailable = !!cyclesSt?.available;
  const useBlender = blenderBridge && blenderAvailable;
  const renderEngines = ['jepow-viewport'];
  if (cyclesAvailable) renderEngines.push('cycles-gpl');
  return {
    ok: true,
    available: nativeAvailable || blenderAvailable,
    backend: useBlender ? 'blender' : nativeAvailable ? 'jepow-native' : 'none',
    blenderAvailable,
    nativeAvailable,
    cyclesAvailable,
    cyclesLicense: cyclesSt.license,
    executable: nativeSt.executable,
    engine: 'jepow-engine',
    version: nativeSt.version,
    cpuJobs: nativeSt.cpuJobs,
    gpu: nativeSt.gpu,
    gpuAdapter: nativeSt.gpu?.adapter_name,
    cacheDir: nativeSt.cacheDir,
    buildHint: nativeSt.buildHint || 'npm run native:build',
    renderEngines,
    message: nativeAvailable
      ? `Jepow 原生引擎 ${nativeSt.version || ''}（FBX 导入规则对齐 Blender，非调用 Blender）`
      : '请执行 npm run native:build 编译 jepow-engine',
    native: nativeSt,
    blender: blenderSt,
    cycles: cyclesSt,
  };
}

function registerViewportIpc(ipcMain) {
  ipcMain.handle('viewport:getStatus', async () => getCombinedStatus());

  ipcMain.handle('viewport:pickSceneFile', async () => {
    const res = await dialog.showOpenDialog({
      title: '选择 3D 场景文件',
      properties: ['openFile'],
      filters: [
        {
          name: '3D Scene',
          extensions: ['glb', 'gltf', 'fbx', 'obj'],
        },
      ],
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { canceled: true, filePath: null };
    }
    return { canceled: false, filePath: res.filePaths[0] };
  });

  ipcMain.handle('viewport:openScene', async (_e, scenePath) => {
    const p = normalizeScenePath(scenePath);
    if (pickBackend(p) === 'blender' && blenderBridge) {
      const res = await blenderBridge.openScene(p);
      return { ...res, backend: 'blender-debug' };
    }
    return nativeEngine.openScene(p);
  });

  ipcMain.handle('viewport:sceneInfo', async (_e, scenePath) => {
    return nativeEngine.openScene(normalizeScenePath(scenePath));
  });

  ipcMain.handle('viewport:renderPreview', async (_e, opts) => {
    const o = opts || {};
    const p = normalizeScenePath(o.scenePath);
    if (pickBackend(p) === 'blender' && blenderBridge) {
      return blenderBridge.renderPreview({ ...o, scenePath: p });
    }
    return nativeEngine.renderPreview({ ...o, scenePath: p });
  });

  ipcMain.handle('viewport:readPreview', async (_e, previewUrl) => {
    if (!previewUrl || typeof previewUrl !== 'string') return null;
    const name = previewUrl.replace('viewport-cache://', '');
    return nativeEngine.readCachedImageByName(name);
  });
}

module.exports = { registerViewportIpc };
