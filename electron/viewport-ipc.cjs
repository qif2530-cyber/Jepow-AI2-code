const { dialog } = require('electron');
const nativeEngine = require('./native-engine-bridge.cjs');
const {
  ARCHITECTURE_CONTRACT,
  buildArchitectureStatus,
} = require('./native-architecture-contract.cjs');

/**
 * 桌面 3D 产品路径（参考 Blender 架构，自研实现，不调用 blender.exe）：
 *   - 视口预览：jepow-engine（Rust/wgpu，FBX 规则对齐 Blender io_scene_fbx）
 *   - Cycles 渲染：jepow-cycles（GPL libcycles 独立进程）
 *
 * blender-bridge 仅用于：
 *   - assets-ipc 一次性解析 .blend → GLB + 节点数据（导入工具，非实时视口）
 *   - JEPOW_USE_BLENDER_VIEWPORT=1 时的 A/B 对照调试
 */
const blenderBridge =
  process.env.JEPOW_USE_BLENDER_VIEWPORT === '1'
    ? require('./blender-bridge.cjs')
    : null;

/** GPL offline renderer — libcycles，非 blender.exe */
const cyclesBridge = require('./jepow-cycles-bridge.cjs');
/** 仅 .blend 导入后可选对照渲，非默认 */
const blenderBridgeImport = require('./blender-bridge.cjs');

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
  const useBlenderDebug = blenderBridge && blenderAvailable;
  const renderEngines = ['jepow-viewport'];
  if (cyclesAvailable) renderEngines.push('cycles-gpl');
  const nativeArchitecture = nativeSt.architecture || {};
  const architecture = buildArchitectureStatus({
    nativeAvailable,
    cyclesAvailable,
    nativeArchitecture,
  });
  return {
    ok: true,
    available: nativeAvailable || blenderAvailable,
    backend: useBlenderDebug ? 'blender-debug' : nativeAvailable ? 'jepow-native' : 'none',
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
    architectureContract: ARCHITECTURE_CONTRACT,
    architecture,
    nativeArchitecture,
    architectureReady:
      architecture.ui.status &&
      architecture.viewport.status &&
      architecture.renderer.status &&
      architecture.importers.status &&
      architecture.physics.status,
    architectureProductionReady:
      architecture.ui.productionReady &&
      architecture.viewport.productionReady &&
      architecture.renderer.productionReady &&
      architecture.importers.productionReady &&
      architecture.physics.productionReady,
    message: nativeAvailable
      ? `Jepow 自研引擎 ${nativeSt.version || ''}（架构参考 Blender，非调用 Blender）`
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
          extensions: ['blend', 'glb', 'gltf', 'fbx', 'obj'],
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

  ipcMain.handle('viewport:renderCyclesFrame', async (_e, opts) => {
    const o = opts || {};
    return cyclesBridge.renderFrame({
      ...o,
      scenePath: normalizeScenePath(o.scenePath),
    });
  });

  ipcMain.handle('viewport:startCyclesSession', async (_e, opts) => {
    const o = opts || {};
    return cyclesBridge.startSession({
      ...o,
      scenePath: normalizeScenePath(o.scenePath),
    });
  });

  ipcMain.handle('viewport:readCyclesSession', async (_e, sessionId) => {
    return cyclesBridge.readSession(sessionId);
  });

  ipcMain.handle('viewport:updateCyclesSession', async (_e, sessionId, patch) => {
    return cyclesBridge.updateSession(sessionId, patch || {});
  });

  ipcMain.handle('viewport:stopCyclesSession', async (_e, sessionId) => {
    return cyclesBridge.stopSession(sessionId);
  });

  ipcMain.handle('viewport:readPreview', async (_e, previewUrl) => {
    if (!previewUrl || typeof previewUrl !== 'string') return null;
    const name = previewUrl.replace('viewport-cache://', '');
    const fromNative = nativeEngine.readCachedImageByName(name);
    if (fromNative) return fromNative;
    return blenderBridgeImport.readCachedImageByName(name);
  });

  /** 可选：与 Blender 内 Cycles 逐帧对照（需安装 Blender，非产品默认路径） */
  ipcMain.handle('viewport:renderBlenderCycles', async (_e, opts) => {
    const o = opts || {};
    const blendPath = normalizeScenePath(o.blendPath);
    const rendered = await blenderBridgeImport.renderBlenderCycles({
      blendPath,
      scenePath: normalizeScenePath(o.scenePath),
      width: o.width,
      height: o.height,
      samples: o.samples,
      frame: o.frame,
      useGpu: o.useGpu !== false,
    });
    if (!rendered.ok) return rendered;
    let previewDataUrl = rendered.previewDataUrl;
    if (!previewDataUrl && rendered.previewUrl) {
      previewDataUrl = blenderBridgeImport.readCachedImageByName(
        rendered.previewUrl.replace('viewport-cache://', ''),
      );
    }
    return {
      ...rendered,
      previewDataUrl,
      renderer: 'blender-cycles-reference',
    };
  });

  ipcMain.handle('viewport:getBlenderStatus', async () => {
    const exe = blenderBridgeImport.getBlenderExecutable();
    if (!exe) {
      return { ok: true, available: false, error: 'Blender executable not found' };
    }
    const ping = await blenderBridgeImport.runBlenderCommand('ping', {}, 30000);
    return {
      ok: true,
      available: !!ping?.ok,
      executable: exe,
      blenderVersion: ping?.blender_version,
    };
  });

  ipcMain.handle('viewport:getImportPipelineStatus', async () => {
    return nativeEngine.getImportPipelineStatus();
  });

  ipcMain.handle('viewport:importScenePipeline', async (_e, opts) => {
    const o = opts || {};
    return nativeEngine.importScenePipeline({
      ...o,
      scenePath: normalizeScenePath(o.scenePath),
    });
  });

  ipcMain.handle('viewport:getPhysicsPipelineStatus', async () => {
    return nativeEngine.getPhysicsPipelineStatus();
  });

  ipcMain.handle('viewport:createPhysicsWorld', async (_e, opts) => {
    return nativeEngine.createPhysicsWorld(opts || {});
  });

  ipcMain.handle('viewport:stepPhysicsWorld', async (_e, opts) => {
    return nativeEngine.stepPhysicsWorld(opts || {});
  });

  ipcMain.handle('viewportHost:start', async (_e, opts) => {
    return nativeEngine.startViewportHost(opts || {});
  });

  ipcMain.handle('viewportHost:setBounds', async (_e, bounds) => {
    return nativeEngine.setViewportHostBounds(bounds || {});
  });

  ipcMain.handle('viewportHost:setVisible', async (_e, visible) => {
    return nativeEngine.setViewportHostVisible(!!visible);
  });

  ipcMain.handle('viewportHost:setScene', async (_e, payload) => {
    return nativeEngine.setViewportHostScene(payload || {});
  });

  ipcMain.handle('viewportHost:setTool', async (_e, tool) => {
    return nativeEngine.setViewportHostTool(tool || 'select');
  });

  ipcMain.handle('viewportHost:setCamera', async (_e, camera) => {
    return nativeEngine.setViewportHostCamera(camera || {});
  });

  ipcMain.handle('viewportHost:setDisplayMode', async (_e, mode) => {
    return nativeEngine.setViewportHostDisplayMode(mode || 'solid');
  });

  ipcMain.handle('viewportHost:setSnap', async (_e, snap) => {
    return nativeEngine.setViewportHostSnap(snap || {});
  });

  ipcMain.handle('viewportHost:focusSelection', async () => {
    return nativeEngine.focusViewportHostSelection();
  });

  ipcMain.handle('viewportHost:setSelection', async (_e, objectId) => {
    return nativeEngine.setViewportHostSelection(objectId || '');
  });

  ipcMain.handle('viewportHost:setObjectTransform', async (_e, objectId, transform) => {
    return nativeEngine.setViewportHostObjectTransform(objectId || '', transform || {});
  });

  ipcMain.handle('viewportHost:getState', async () => {
    return nativeEngine.getViewportHostState();
  });

  ipcMain.handle('viewportHost:stop', async () => {
    nativeEngine.killViewportHost();
    return { ok: true, stopped: true };
  });
}

module.exports = { registerViewportIpc };
