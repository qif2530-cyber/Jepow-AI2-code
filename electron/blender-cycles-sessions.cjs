/**
 * Blender Cycles 交互 session（内存态）— 替代 jepow-cycles-daemon 用于桌面 3D 编辑器。
 * 每帧通过 blender-bridge 后台渲染，与 Blender 内 Cycles 一致。
 */
const blenderBridge = require('./blender-bridge.cjs');

const sessions = new Map();
let sessionSeq = 0;

function normalizePath(p) {
  if (!p || typeof p !== 'string') return '';
  let raw = p.trim();
  if (raw.startsWith('jepow-local://')) {
    raw = raw.slice('jepow-local://'.length);
  }
  return require('path').normalize(raw);
}

async function enrichPreview(result) {
  if (!result?.ok) return result;
  let previewDataUrl = result.previewDataUrl;
  if (!previewDataUrl && result.previewUrl) {
    const name = String(result.previewUrl).replace('viewport-cache://', '');
    previewDataUrl = blenderBridge.readCachedImageByName(name);
  }
  return { ...result, previewDataUrl, renderer: result.renderer || 'blender-cycles' };
}

async function renderOnce(state) {
  const o = state.opts || {};
  const blendPath = normalizePath(o.blendPath || '');
  const scenePath = normalizePath(o.scenePath || '');
  const path = require('path');
  const useBlend =
    blendPath && path.extname(blendPath).toLowerCase() === '.blend';

  const cam = o.camera || {};
  const common = {
    width: o.width || 512,
    height: o.height || 384,
    samples: o.samples || 16,
    useGpu: o.device !== 'CPU',
    cameraYaw: cam.yaw,
    cameraPitch: cam.pitch,
    cameraDistance: cam.distance,
    panX: cam.panX,
    panY: cam.panY,
    frame: o.frame,
  };

  if (useBlend) {
    return enrichPreview(
      await blenderBridge.renderBlenderCycles({
        blendPath,
        ...common,
      }),
    );
  }

  const target = scenePath || blendPath;
  if (!target) {
    return { ok: false, error: 'scenePath or blendPath required' };
  }

  return enrichPreview(
    await blenderBridge.renderPreview({
      scenePath: target,
      engine: 'cycles',
      ...common,
    }),
  );
}

async function pumpSession(id) {
  const state = sessions.get(id);
  if (!state || state.busy) return;
  state.busy = true;
  state.status = 'rendering';
  try {
    const result = await renderOnce(state);
    state.frameVersion = (state.frameVersion || 0) + 1;
    state.frame = {
      ...result,
      frameVersion: state.frameVersion,
      cameraVersion: state.cameraVersion,
      status: result.ok ? 'done' : 'error',
      stage: result.ok ? 'preview' : 'error',
    };
    state.status = result.ok ? 'ready' : 'error';
    state.error = result.error;
  } catch (e) {
    state.status = 'error';
    state.error = e instanceof Error ? e.message : String(e);
    state.frame = {
      ok: false,
      error: state.error,
      status: 'error',
      stage: 'error',
    };
  } finally {
    state.busy = false;
  }
}

function startSession(opts = {}) {
  const id = `blender-cycles-${++sessionSeq}`;
  const state = {
    opts: { ...opts },
    status: 'starting',
    frameVersion: 0,
    cameraVersion: Number(opts.cameraVersion ?? 0),
    frame: null,
    busy: false,
    debounceTimer: null,
  };
  sessions.set(id, state);
  void pumpSession(id);
  return {
    ok: true,
    sessionId: id,
    status: 'starting',
    renderer: 'blender-cycles',
  };
}

function readSession(sessionId) {
  const state = sessions.get(sessionId);
  if (!state) {
    return { ok: false, error: 'session not found', status: 'error' };
  }
  return {
    ok: true,
    sessionId,
    status: state.status,
    error: state.error,
    frame: state.frame,
    frameVersion: state.frameVersion,
    debugStage: state.status,
    debugMessage: state.error || '',
  };
}

function updateSession(sessionId, patch = {}) {
  const state = sessions.get(sessionId);
  if (!state) {
    return { ok: false, error: 'session not found', status: 'error' };
  }
  state.opts = { ...state.opts, ...patch };
  if (patch.cameraVersion != null) {
    state.cameraVersion = Number(patch.cameraVersion);
  }
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    void pumpSession(sessionId);
  }, 320);
  return readSession(sessionId);
}

function stopSession(sessionId) {
  const state = sessions.get(sessionId);
  if (state?.debounceTimer) clearTimeout(state.debounceTimer);
  sessions.delete(sessionId);
  return { ok: true, sessionId, stopped: true, status: 'stopped' };
}

module.exports = {
  startSession,
  readSession,
  updateSession,
  stopSession,
};
