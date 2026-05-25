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
let daemonStarting = null;

function killDaemon() {
  if (daemonProc && !daemonProc.killed) {
    try {
      daemonProc.stdin.write(`${JSON.stringify({ cmd: 'shutdown', id: 0 })}\n`);
    } catch {
      /* ignore */
    }
    daemonProc.kill('SIGTERM');
  }
  daemonProc = null;
  daemonBuf = '';
  daemonSessionPath = null;
  for (const [, p] of daemonPending) {
    clearTimeout(p.timer);
    p.reject(new Error('daemon stopped'));
  }
  daemonPending.clear();
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

    daemonProc.stdout.on('data', (d) => {
      daemonBuf += d.toString();
      flushDaemonBuffer();
    });

    daemonProc.stderr.on('data', (d) => {
      const panic = extractEnginePanic(d.toString());
      if (panic) console.warn('[jepow-engine daemon]', panic);
    });

    daemonProc.on('error', (err) => {
      daemonStarting = null;
      reject(err);
    });

    daemonProc.on('close', () => {
      daemonProc = null;
      daemonSessionPath = null;
      for (const [, p] of daemonPending) {
        clearTimeout(p.timer);
        p.reject(new Error('daemon exited'));
      }
      daemonPending.clear();
    });

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

function daemonRequest(payload, timeoutMs = 120000) {
  return ensureDaemon().then(
    () =>
      new Promise((resolve, reject) => {
        const id = ++daemonReqId;
        const timer = setTimeout(() => {
          daemonPending.delete(id);
          reject(new Error(`daemon 超时 (${payload.cmd})`));
        }, timeoutMs);

        daemonPending.set(id, { resolve, reject, timer });
        try {
          daemonProc.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
        } catch (e) {
          clearTimeout(timer);
          daemonPending.delete(id);
          reject(e);
        }
      }),
  );
}

let engineQueue = Promise.resolve();

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

async function openScene(scenePath) {
  const p = normalizeScenePath(scenePath);
  try {
    if (daemonSessionPath !== p) {
      const loaded = await daemonRequest({ cmd: 'load_scene', scenePath: p }, 300000);
      if (loaded.ok) daemonSessionPath = p;
      return loaded;
    }
    return daemonRequest({ cmd: 'load_scene', scenePath: p }, 120000);
  } catch {
    return runEngineCommand('open_scene', { scenePath: p });
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
    panX,
    panY,
    lightYaw,
    lightPitch,
    lightAmbient,
    lightDiffuse,
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
    shading,
    liveRender,
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
    panX,
    panY,
    lightYaw,
    lightPitch,
    lightAmbient,
    lightDiffuse,
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
    shading: shading || (liveRender ? 'clay' : 'clay'),
  };

  try {
    const result = await daemonRequest(payload, liveRender ? 60000 : 300000);
    if (!result.ok) return result;
    return {
      ...result,
      previewUrl: `viewport-cache://${LIVE_FRAME_NAME}`,
      localPath: outputPath,
      daemon: true,
    };
  } catch (e) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fallbackPath = path.join(getViewportCacheDir(), `jepow-${id}.png`);
    const result = await runEngineCommand('render_frame', {
      scenePath: p,
      outputPath: fallbackPath,
      width,
      height,
      cameraYaw,
      cameraPitch,
      cameraDistance,
      panX,
      panY,
      lightYaw,
      lightPitch,
      lightAmbient,
      lightDiffuse,
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
      shading: shading || 'clay',
    });
    if (!result.ok) return { ...result, error: e.message || result.error };
    return {
      ...result,
      previewUrl: `viewport-cache://${path.basename(fallbackPath)}`,
      localPath: fallbackPath,
      daemon: false,
    };
  }
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
  renderPreview,
  readCachedImageByName,
  ensureDaemon,
  killDaemon,
};
