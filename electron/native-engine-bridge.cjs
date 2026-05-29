/**
 * Jepow native 3D engine — Blender-style persistent viewport daemon.
 * GPU + mesh stay loaded; viewport_frame only updates uniforms + draw.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ENGINE_NAME = process.platform === 'win32' ? 'jepow-engine.exe' : 'jepow-engine';
const LIVE_FRAME_NAME = 'daemon-live.png';
const viewportFrameStats = {
  windowStartedAt: Date.now(),
  calls: 0,
  daemonCalls: 0,
  fallbackCalls: 0,
  lastFrameMs: 0,
  lastTotalMs: 0,
  lastWidth: 0,
  lastHeight: 0,
};

function noteViewportFrame(kind, width, height, result, startedAt) {
  const now = Date.now();
  if (now - viewportFrameStats.windowStartedAt > 1000) {
    viewportFrameStats.windowStartedAt = now;
    viewportFrameStats.calls = 0;
    viewportFrameStats.daemonCalls = 0;
    viewportFrameStats.fallbackCalls = 0;
  }
  viewportFrameStats.calls += 1;
  if (kind === 'daemon') viewportFrameStats.daemonCalls += 1;
  else viewportFrameStats.fallbackCalls += 1;
  viewportFrameStats.lastFrameMs = Number(result?.frameMs ?? 0);
  viewportFrameStats.lastTotalMs = Math.max(0, now - startedAt);
  viewportFrameStats.lastWidth = Number(width) || 0;
  viewportFrameStats.lastHeight = Number(height) || 0;
  return {
    fpsWindowCalls: viewportFrameStats.calls,
    daemonWindowCalls: viewportFrameStats.daemonCalls,
    fallbackWindowCalls: viewportFrameStats.fallbackCalls,
    lastFrameMs: viewportFrameStats.lastFrameMs,
    lastTotalMs: viewportFrameStats.lastTotalMs,
    lastWidth: viewportFrameStats.lastWidth,
    lastHeight: viewportFrameStats.lastHeight,
  };
}

function getEngineCandidates() {
  const root = path.join(__dirname, '..');
  return [
    process.env.JEPOW_ENGINE_PATH,
    path.join(root, 'native', 'jepow-engine', 'target', 'release', ENGINE_NAME),
    path.join(root, 'native', 'jepow-engine', 'target', 'debug', ENGINE_NAME),
    app.isPackaged
      ? path.join(process.resourcesPath, 'native', ENGINE_NAME)
      : null,
  ].filter(Boolean);
}

function getEngineExecutable() {
  for (const p of getEngineCandidates()) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getViewportCacheDir() {
  const dir = path.join(app.getPath('userData'), 'viewport-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLiveFramePath() {
  return path.join(getViewportCacheDir(), LIVE_FRAME_NAME);
}

function extractEnginePanic(stderr) {
  if (!stderr) return null;
  const m = stderr.match(/wgpu error:[\s\S]{0,800}/);
  if (m) return m[0].replace(/\s+/g, ' ').trim().slice(0, 400);
  const p = stderr.match(/panicked at[\s\S]{0,400}/);
  if (p) return p[0].replace(/\s+/g, ' ').trim().slice(0, 400);
  return null;
}

function parseLastJsonLine(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      continue;
    }
  }
  return null;
}

/** @type {import('child_process').ChildProcessWithoutNullStreams | null} */
let daemonProc = null;
let daemonBuf = '';
let daemonReqId = 0;
/** @type {Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
const daemonPending = new Map();
let daemonSessionPath = null;
let daemonSessionInfo = null;
let daemonStarting = null;

function failDaemonPending(reason) {
  const err =
    reason instanceof Error ? reason : new Error(String(reason || 'daemon stopped'));
  for (const [, p] of daemonPending) {
    clearTimeout(p.timer);
    p.reject(err);
  }
  daemonPending.clear();
}

function resetDaemonState() {
  daemonProc = null;
  daemonBuf = '';
  daemonSessionPath = null;
  daemonSessionInfo = null;
  daemonStarting = null;
}

function killDaemon() {
  const proc = daemonProc;
  resetDaemonState();
  failDaemonPending(new Error('daemon stopped'));
  if (proc && !proc.killed) {
    try {
      if (proc.stdin?.writable && !proc.stdin.destroyed) {
        proc.stdin.write(`${JSON.stringify({ cmd: 'shutdown', id: 0 })}\n`, () => {});
      }
    } catch {
      /* ignore */
    }
    try {
      proc.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
}

function attachDaemonProcHandlers(proc) {
  if (!proc?.stdin) return;
  proc.stdin.on('error', (err) => {
    console.warn('[jepow-engine daemon] stdin error:', err?.message || err);
    failDaemonPending(err);
    resetDaemonState();
  });
  proc.stdout?.on('error', (err) => {
    console.warn('[jepow-engine daemon] stdout error:', err?.message || err);
  });
  proc.stderr?.on('data', (d) => {
    const panic = extractEnginePanic(d.toString());
    if (panic) console.warn('[jepow-engine daemon]', panic);
  });
  proc.on('error', (err) => {
    console.warn('[jepow-engine daemon] process error:', err?.message || err);
    failDaemonPending(err);
    resetDaemonState();
  });
  proc.on('close', (code, signal) => {
    if (code !== 0 && code != null) {
      console.warn(`[jepow-engine daemon] exited code=${code} signal=${signal || ''}`);
    }
    failDaemonPending(new Error('daemon exited'));
    resetDaemonState();
  });
  proc.stdout.on('data', (d) => {
    daemonBuf += d.toString();
    flushDaemonBuffer();
  });
}

function writeDaemonLine(line) {
  return new Promise((resolve, reject) => {
    const proc = daemonProc;
    if (!proc || proc.killed || !proc.stdin || proc.stdin.destroyed || proc.stdin.writableEnded) {
      reject(new Error('daemon not running'));
      return;
    }
    const payload = line.endsWith('\n') ? line : `${line}\n`;
    try {
      const ok = proc.stdin.write(payload, (err) => {
        if (err) {
          failDaemonPending(err);
          resetDaemonState();
          reject(err);
          return;
        }
        resolve();
      });
      if (!ok) {
        proc.stdin.once('drain', () => {
          writeDaemonLine(line).then(resolve, reject);
        });
      }
    } catch (err) {
      failDaemonPending(err);
      resetDaemonState();
      reject(err);
    }
  });
}

function flushDaemonBuffer() {
  const lines = daemonBuf.split('\n');
  daemonBuf = lines.pop() || '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const reqId = msg.id;
    if (reqId == null) continue;
    const pending = daemonPending.get(reqId);
    if (!pending) continue;
    clearTimeout(pending.timer);
    daemonPending.delete(reqId);
    pending.resolve(msg);
  }
}

function ensureDaemon() {
  if (daemonProc && !daemonProc.killed) {
    return Promise.resolve(true);
  }
  if (daemonStarting) return daemonStarting;

  daemonStarting = new Promise((resolve, reject) => {
    const executable = getEngineExecutable();
    if (!executable) {
      daemonStarting = null;
      return reject(new Error('未找到 jepow-engine'));
    }

    daemonProc = spawn(executable, ['daemon'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    attachDaemonProcHandlers(daemonProc);

    daemonRequest({ cmd: 'ping' }, 30000)
      .then((r) => {
        daemonStarting = null;
        if (!r.ok) reject(new Error(r.error || 'daemon ping failed'));
        else resolve(true);
      })
      .catch((e) => {
        daemonStarting = null;
        reject(e);
      });
  });

  return daemonStarting;
}

function daemonRequest(payload, timeoutMs = 120000, retried = false) {
  return ensureDaemon()
    .then(
      () =>
        new Promise((resolve, reject) => {
          const id = ++daemonReqId;
          const timer = setTimeout(() => {
            daemonPending.delete(id);
            reject(new Error(`daemon 超时 (${payload.cmd})`));
          }, timeoutMs);

          daemonPending.set(id, { resolve, reject, timer });
          writeDaemonLine(JSON.stringify({ ...payload, id })).catch((e) => {
            clearTimeout(timer);
            daemonPending.delete(id);
            reject(e);
          });
        }),
    )
    .catch(async (err) => {
      const msg = String(err?.message || err || '');
      if (
        !retried &&
        /EPIPE|daemon exited|daemon not running|ECONNRESET|broken pipe/i.test(msg)
      ) {
        killDaemon();
        await ensureDaemon();
        return daemonRequest(payload, timeoutMs, true);
      }
      throw err;
    });
}

let engineQueue = Promise.resolve();

/** @type {import('child_process').ChildProcessWithoutNullStreams | null} */
let viewportHostProc = null;
let viewportHostBuf = '';
let viewportHostReqId = 0;
/** @type {Map<number, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>} */
const viewportHostPending = new Map();
let viewportHostStarting = null;

function flushViewportHostBuffer() {
  const lines = viewportHostBuf.split('\n');
  viewportHostBuf = lines.pop() || '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const reqId = msg.id;
    if (reqId == null) continue;
    const pending = viewportHostPending.get(reqId);
    if (!pending) continue;
    clearTimeout(pending.timer);
    viewportHostPending.delete(reqId);
    pending.resolve(msg);
  }
}

function killViewportHost() {
  if (viewportHostProc && !viewportHostProc.killed) {
    try {
      viewportHostProc.stdin.write(`${JSON.stringify({ cmd: 'shutdown', id: 0 })}\n`);
    } catch {
      /* ignore */
    }
    viewportHostProc.kill('SIGTERM');
  }
  viewportHostProc = null;
  viewportHostBuf = '';
  viewportHostStarting = null;
  for (const [, p] of viewportHostPending) {
    clearTimeout(p.timer);
    p.reject(new Error('viewport host stopped'));
  }
  viewportHostPending.clear();
}

function ensureViewportHost() {
  if (viewportHostProc && !viewportHostProc.killed) {
    return Promise.resolve(true);
  }
  if (viewportHostStarting) return viewportHostStarting;

  viewportHostStarting = new Promise((resolve, reject) => {
    const executable = getEngineExecutable();
    if (!executable) {
      viewportHostStarting = null;
      return reject(new Error('未找到 jepow-engine'));
    }

    viewportHostProc = spawn(executable, ['viewport-host'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    viewportHostProc.stdout.on('data', (d) => {
      viewportHostBuf += d.toString();
      flushViewportHostBuffer();
    });

    viewportHostProc.stderr.on('data', (d) => {
      const text = d.toString();
      if (text.trim()) console.warn('[jepow viewport-host]', text.trim().slice(-600));
    });

    viewportHostProc.on('error', (err) => {
      viewportHostStarting = null;
      reject(err);
    });

    viewportHostProc.on('close', () => {
      viewportHostProc = null;
      viewportHostStarting = null;
      for (const [, p] of viewportHostPending) {
        clearTimeout(p.timer);
        p.reject(new Error('viewport host exited'));
      }
      viewportHostPending.clear();
    });

    viewportHostRequest({ cmd: 'ping' }, 30000)
      .then((r) => {
        viewportHostStarting = null;
        if (!r.ok) reject(new Error(r.error || 'viewport host ping failed'));
        else resolve(true);
      })
      .catch((e) => {
        viewportHostStarting = null;
        reject(e);
      });
  });

  return viewportHostStarting;
}

function viewportHostRequest(payload, timeoutMs = 60000) {
  return ensureViewportHost().then(
    () =>
      new Promise((resolve, reject) => {
        const id = ++viewportHostReqId;
        const timer = setTimeout(() => {
          viewportHostPending.delete(id);
          reject(new Error(`viewport host 超时 (${payload.cmd})`));
        }, timeoutMs);
        viewportHostPending.set(id, { resolve, reject, timer });
        try {
          viewportHostProc.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
        } catch (e) {
          clearTimeout(timer);
          viewportHostPending.delete(id);
          reject(e);
        }
      }),
  );
}

async function startViewportHost(opts = {}) {
  try {
    await ensureViewportHost();
    if (opts.bounds) {
      await viewportHostRequest({ cmd: 'set_bounds', ...opts.bounds }, 30000);
    }
    await viewportHostRequest({ cmd: 'set_visible', visible: opts.visible !== false }, 30000);
    return { ok: true, mode: 'viewport-host', nativeSurface: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function setViewportHostBounds(bounds = {}) {
  try {
    await ensureViewportHost();
    return await viewportHostRequest({ cmd: 'set_bounds', ...bounds }, 30000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function setViewportHostVisible(visible) {
  try {
    await ensureViewportHost();
    return await viewportHostRequest({ cmd: 'set_visible', visible: !!visible }, 30000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function setViewportHostScene(payload = {}) {
  try {
    await ensureViewportHost();
    return await viewportHostRequest({ cmd: 'set_scene', ...payload }, 30000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function setViewportHostTool(tool) {
  try {
    await ensureViewportHost();
    return await viewportHostRequest({ cmd: 'set_tool', tool }, 30000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function setViewportHostCamera(camera = {}) {
  try {
    await ensureViewportHost();
    return await viewportHostRequest({ cmd: 'set_camera', ...camera }, 30000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function setViewportHostDisplayMode(mode) {
  try {
    await ensureViewportHost();
    return await viewportHostRequest({ cmd: 'set_display_mode', mode }, 30000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function setViewportHostSnap(snap = {}) {
  try {
    await ensureViewportHost();
    return await viewportHostRequest({ cmd: 'set_snap', ...snap }, 30000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function focusViewportHostSelection() {
  try {
    await ensureViewportHost();
    return await viewportHostRequest({ cmd: 'focus_selection' }, 30000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function setViewportHostSelection(objectId) {
  try {
    await ensureViewportHost();
    return await viewportHostRequest({ cmd: 'set_selection', objectId }, 30000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function setViewportHostObjectTransform(objectId, transform) {
  try {
    await ensureViewportHost();
    return await viewportHostRequest(
      { cmd: 'set_object_transform', objectId, transform },
      30000,
    );
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function getViewportHostState() {
  try {
    await ensureViewportHost();
    return await viewportHostRequest({ cmd: 'get_state' }, 30000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function runEngineCommand(command, payload = {}, timeoutMs = 300000) {
  const run = () =>
    new Promise((resolve, reject) => {
      const executable = getEngineExecutable();
      if (!executable) {
        return resolve({
          ok: false,
          error:
            '未找到 jepow-engine。请在项目根目录执行: npm run native:build',
        });
      }

      const args = [command, JSON.stringify(payload)];
      const child = spawn(executable, args, { windowsHide: true });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`jepow-engine 超时 (${command})`));
      }, timeoutMs);

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const parsed = parseLastJsonLine(stdout);
        if (parsed) {
          if (code !== 0 && !parsed.error) {
            parsed.ok = false;
            parsed.error =
              extractEnginePanic(stderr) ||
              `jepow-engine 异常退出 (code=${code})`;
          }
          resolve({ ...parsed, exitCode: code, stderr: stderr.slice(-1500) });
          return;
        }
        const panic = extractEnginePanic(stderr);
        resolve({
          ok: false,
          error:
            panic ||
            `jepow-engine 无 JSON 输出 (code=${code})`,
          stderr: stderr.slice(-1500),
        });
      });
    });

  engineQueue = engineQueue.then(run, run);
  return engineQueue;
}

async function getStatus() {
  const executable = getEngineExecutable();
  if (!executable) {
    return {
      ok: true,
      available: false,
      executable: null,
      engine: 'jepow-engine',
      buildHint: 'npm run native:build',
    };
  }
  try {
    await ensureDaemon();
    const ping = await daemonRequest({ cmd: 'ping' }, 60000);
    return {
      ok: true,
      available: !!ping.ok,
      executable,
      engine: ping.engine || 'jepow-engine',
      version: ping.version,
      mode: ping.mode || 'daemon',
      cpuJobs: ping.cpuJobs,
      architecture: ping.architecture,
      cacheDir: getViewportCacheDir(),
      ping,
    };
  } catch (e) {
    const ping = await runEngineCommand('ping', {}, 60000);
    return {
      ok: true,
      available: !!ping.ok,
      executable,
      engine: ping.engine || 'jepow-engine',
      version: ping.version,
      mode: 'oneshot',
      cpuJobs: ping.cpuJobs,
      architecture: ping.architecture,
      cacheDir: getViewportCacheDir(),
      ping,
      daemonError: e.message,
    };
  }
}

function normalizeScenePath(scenePath) {
  if (!scenePath || typeof scenePath !== 'string') return scenePath;
  let raw = scenePath.trim();
  if (raw.startsWith('jepow-local://')) {
    raw = raw.slice('jepow-local://'.length);
  }
  return path.normalize(raw);
}

function warmPickCache(scenePath) {
  const p = normalizeScenePath(scenePath);
  if (!p) return Promise.resolve();
  // GPU ID picking uses the already loaded viewport session; no CPU pre-warm is needed.
  return Promise.resolve();
}

async function openScene(scenePath) {
  const p = normalizeScenePath(scenePath);
  try {
    if (daemonSessionPath !== p) {
      const loaded = await daemonRequest({ cmd: 'load_scene', scenePath: p }, 300000);
      if (loaded.ok) {
        daemonSessionPath = p;
        daemonSessionInfo = loaded;
        void warmPickCache(p);
      }
      return loaded;
    }
    void warmPickCache(p);
    return daemonSessionInfo || { ok: true, scenePath: p, cached: true };
  } catch {
    const loaded = await runEngineCommand('open_scene', { scenePath: p });
    if (loaded?.ok) void warmPickCache(p);
    return loaded;
  }
}

async function listSceneObjects(scenePath) {
  const p = normalizeScenePath(scenePath);
  if (!p) return { ok: false, error: 'scenePath required' };
  return runEngineCommand('list_scene_objects', { scenePath: p }, 120000);
}

async function pickSceneObject(opts = {}) {
  const p = normalizeScenePath(opts.scenePath);
  if (!p) return { ok: false, error: 'scenePath required' };
  const payload = {
    scenePath: p,
    cursorX: opts.cursorX,
    cursorY: opts.cursorY,
    width: opts.width,
    height: opts.height,
    cameraYaw: opts.cameraYaw,
    cameraPitch: opts.cameraPitch,
    cameraDistance: opts.cameraDistance,
    cameraFov: opts.cameraFov,
    panX: opts.panX,
    panY: opts.panY,
    panZ: opts.panZ,
    x: opts.x,
    y: opts.y,
    z: opts.z,
    rx: opts.rx,
    ry: opts.ry,
    rz: opts.rz,
    scale: opts.scale,
  };
  try {
    await ensureDaemon();
    if (daemonSessionPath === p) {
      return await daemonRequest({ cmd: 'pick_scene_object', ...payload }, 45000);
    }
  } catch {
    /* fallback */
  }
  try {
    return await runEngineCommand('pick_scene_object', payload, 45000);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function renderPreview(opts = {}) {
  const {
    scenePath,
    width = 640,
    height = 480,
    cameraYaw,
    cameraPitch,
    cameraDistance,
    cameraFov,
    panX,
    panY,
    panZ,
    lightYaw,
    lightPitch,
    lightAmbient,
    lightDiffuse,
    lightExposure,
    environmentIntensity,
    x,
    y,
    z,
    rx,
    ry,
    rz,
    scale,
    materialTint,
    materialRoughness,
    materialMetalness,
    materialSpecular,
    materialClearcoat,
    materialTransmission,
    materialEmissionStrength,
    shading,
    liveRender,
    highlightSceneObjectId,
    highlightSubmeshMaterialTint,
    highlightSubmeshMaterialRoughness,
    highlightSubmeshMaterialMetalness,
    highlightSubmeshMaterialSpecular,
    highlightSubmeshMaterialClearcoat,
    highlightSubmeshMaterialTransmission,
    highlightSubmeshMaterialEmissionStrength,
    assignedSubmeshMaterials,
  } = opts;

  const p = normalizeScenePath(scenePath);
  const outputPath = getLiveFramePath();

  const payload = {
    cmd: 'viewport_frame',
    scenePath: p,
    outputPath,
    width,
    height,
    cameraYaw,
    cameraPitch,
    cameraDistance,
    cameraFov,
    panX,
    panY,
    panZ,
    lightYaw,
    lightPitch,
    lightAmbient,
    lightDiffuse,
    lightExposure,
    environmentIntensity,
    x,
    y,
    z,
    rx,
    ry,
    rz,
    scale,
    materialTint,
    materialRoughness,
    materialMetalness,
    materialSpecular,
    materialClearcoat,
    materialTransmission,
    materialEmissionStrength,
    shading: shading || (liveRender ? 'clay' : 'clay'),
    highlightSceneObjectId:
      typeof highlightSceneObjectId === 'string' && highlightSceneObjectId.trim()
        ? highlightSceneObjectId.trim()
        : undefined,
    highlightSubmeshMaterialTint,
    highlightSubmeshMaterialRoughness,
    highlightSubmeshMaterialMetalness,
    highlightSubmeshMaterialSpecular,
    highlightSubmeshMaterialClearcoat,
    highlightSubmeshMaterialTransmission,
    highlightSubmeshMaterialEmissionStrength,
    assignedSubmeshMaterials: Array.isArray(assignedSubmeshMaterials)
      ? assignedSubmeshMaterials
      : undefined,
  };

  try {
    const startedAt = Date.now();
    const result = await daemonRequest(payload, liveRender ? 60000 : 300000);
    if (!result.ok) return result;
    const stats = noteViewportFrame('daemon', width, height, result, startedAt);
    return {
      ...result,
      previewUrl: `viewport-cache://${LIVE_FRAME_NAME}`,
      localPath: outputPath,
      daemon: true,
      viewportStats: stats,
    };
  } catch (e) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fallbackPath = path.join(getViewportCacheDir(), `jepow-${id}.png`);
    const startedAt = Date.now();
    const result = await runEngineCommand('render_frame', {
      scenePath: p,
      outputPath: fallbackPath,
      width,
      height,
      cameraYaw,
      cameraPitch,
      cameraDistance,
      cameraFov,
      panX,
      panY,
      panZ,
      lightYaw,
      lightPitch,
      lightAmbient,
      lightDiffuse,
      lightExposure,
      environmentIntensity,
      x,
      y,
      z,
      rx,
      ry,
      rz,
      scale,
      materialTint,
      materialRoughness,
      materialMetalness,
      materialSpecular,
      materialClearcoat,
      materialTransmission,
      materialEmissionStrength,
      shading: shading || 'clay',
      highlightSceneObjectId:
        typeof highlightSceneObjectId === 'string' && highlightSceneObjectId.trim()
          ? highlightSceneObjectId.trim()
          : undefined,
      highlightSubmeshMaterialTint,
      highlightSubmeshMaterialRoughness,
      highlightSubmeshMaterialMetalness,
      highlightSubmeshMaterialSpecular,
      highlightSubmeshMaterialClearcoat,
      highlightSubmeshMaterialTransmission,
      highlightSubmeshMaterialEmissionStrength,
      assignedSubmeshMaterials: Array.isArray(assignedSubmeshMaterials)
        ? assignedSubmeshMaterials
        : undefined,
    });
    if (!result.ok) return { ...result, error: e.message || result.error };
    const stats = noteViewportFrame('fallback', width, height, result, startedAt);
    return {
      ...result,
      previewUrl: `viewport-cache://${path.basename(fallbackPath)}`,
      localPath: fallbackPath,
      daemon: false,
      viewportStats: stats,
    };
  }
}

async function meshForCycles(scenePath) {
  const p = normalizeScenePath(scenePath);
  try {
    return await daemonRequest({ cmd: 'mesh_for_cycles', scenePath: p }, 120000);
  } catch {
    return runEngineCommand('mesh_for_cycles', { scenePath: p }, 120000);
  }
}

function getImportPipelineStatus() {
  return runEngineCommand('import_pipeline_status', {}, 60000);
}

function runArchitectureSelfTest() {
  return runEngineCommand('architecture_self_test', {}, 60000);
}

function importScenePipeline(opts = {}) {
  return runEngineCommand(
    'import_scene_pipeline',
    {
      ...opts,
      scenePath: normalizeScenePath(opts.scenePath),
    },
    120000,
  );
}

function getPhysicsPipelineStatus() {
  return runEngineCommand('physics_pipeline_status', {}, 60000);
}

function createPhysicsWorld(opts = {}) {
  return runEngineCommand('physics_create_world', opts, 60000);
}

function stepPhysicsWorld(opts = {}) {
  return runEngineCommand('physics_step_world', opts, 60000);
}

function readCachedImageByName(fileName) {
  const safe = path.basename(fileName.split('?')[0]);
  const full = path.join(getViewportCacheDir(), safe);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

module.exports = {
  getEngineExecutable,
  getViewportCacheDir,
  getLiveFramePath,
  runEngineCommand,
  getStatus,
  openScene,
  listSceneObjects,
  pickSceneObject,
  renderPreview,
  meshForCycles,
  runArchitectureSelfTest,
  getImportPipelineStatus,
  importScenePipeline,
  getPhysicsPipelineStatus,
  createPhysicsWorld,
  stepPhysicsWorld,
  readCachedImageByName,
  ensureDaemon,
  killDaemon,
  startViewportHost,
  setViewportHostBounds,
  setViewportHostVisible,
  setViewportHostScene,
  setViewportHostTool,
  setViewportHostCamera,
  setViewportHostDisplayMode,
  setViewportHostSnap,
  focusViewportHostSelection,
  setViewportHostSelection,
  setViewportHostObjectTransform,
  getViewportHostState,
  killViewportHost,
};
