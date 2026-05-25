/**
 * Blender subprocess bridge — native CPU/GPU scene + render (Eevee/Cycles).
 * Independent from Jepow AI / LLM HTTP APIs.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SCRIPT_PATH = path.join(
  __dirname,
  '..',
  'native',
  'blender',
  'scripts',
  'jepow_bridge.py',
);

const DEFAULT_TIMEOUT_MS = 600000;
const PREVIEW_TIMEOUT_MS = 120000;

let cachedExecutable = null;
let cachedConfig = null;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'jepow-blender.json');
}

function readConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    cachedConfig = JSON.parse(raw);
  } catch {
    cachedConfig = {};
  }
  return cachedConfig;
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(next, null, 2), 'utf8');
  cachedConfig = next;
  if (patch.executable) cachedExecutable = patch.executable;
  return next;
}

function discoverBlenderExecutable() {
  if (process.env.JEPOW_BLENDER_PATH && fs.existsSync(process.env.JEPOW_BLENDER_PATH)) {
    return process.env.JEPOW_BLENDER_PATH;
  }
  const cfg = readConfig();
  if (cfg.executable && fs.existsSync(cfg.executable)) {
    return cfg.executable;
  }

  if (process.platform === 'win32') {
    const roots = [
      process.env['ProgramFiles'],
      process.env['ProgramFiles(x86)'],
    ].filter(Boolean);
    for (const root of roots) {
      const foundation = path.join(root, 'Blender Foundation');
      if (!fs.existsSync(foundation)) continue;
      let versions = [];
      try {
        versions = fs.readdirSync(foundation).filter((d) => d.toLowerCase().startsWith('blender'));
      } catch {
        continue;
      }
      versions.sort().reverse();
      for (const ver of versions) {
        const exe = path.join(foundation, ver, 'blender.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  } else if (process.platform === 'darwin') {
    const app = '/Applications/Blender.app/Contents/MacOS/Blender';
    if (fs.existsSync(app)) return app;
  } else {
    for (const name of ['blender', 'blender4', 'blender-4.2']) {
      const guess = `/usr/bin/${name}`;
      if (fs.existsSync(guess)) return guess;
    }
  }
  return null;
}

function getBlenderExecutable() {
  if (cachedExecutable && fs.existsSync(cachedExecutable)) return cachedExecutable;
  cachedExecutable = discoverBlenderExecutable();
  return cachedExecutable;
}

function getViewportCacheDir() {
  const dir = path.join(app.getPath('userData'), 'viewport-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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

function runBlenderCommand(command, payload = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const executable = getBlenderExecutable();
    if (!executable) {
      return resolve({
        ok: false,
        error:
          '未检测到 Blender。请安装 Blender 3.6+ 或设置环境变量 JEPOW_BLENDER_PATH。',
      });
    }
    if (!fs.existsSync(SCRIPT_PATH)) {
      return resolve({ ok: false, error: `缺少桥接脚本: ${SCRIPT_PATH}` });
    }

    const args = [
      '--background',
      '--python',
      SCRIPT_PATH,
      '--',
      command,
      JSON.stringify(payload),
    ];

    const child = spawn(executable, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Blender 命令超时 (${command})`));
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
        if (!parsed.ok && parsed.error) {
          resolve({ ...parsed, exitCode: code, stderr: stderr.slice(-2000) });
        } else {
          resolve({ ...parsed, exitCode: code });
        }
        return;
      }
      resolve({
        ok: false,
        error: `Blender 无有效 JSON 输出 (code=${code})`,
        stderr: stderr.slice(-2000),
        stdout: stdout.slice(-2000),
      });
    });
  });
}

async function getStatus() {
  const executable = getBlenderExecutable();
  if (!executable) {
    return {
      ok: true,
      available: false,
      executable: null,
      scriptPath: SCRIPT_PATH,
      cacheDir: getViewportCacheDir(),
    };
  }
  const ping = await runBlenderCommand('ping', {}, 30000);
  return {
    ok: true,
    available: !!ping.ok,
    executable,
    blenderVersion: ping.blender_version,
    scriptPath: SCRIPT_PATH,
    cacheDir: getViewportCacheDir(),
    ping,
  };
}

function normalizeScenePath(scenePath) {
  if (!scenePath || typeof scenePath !== 'string') return scenePath;
  let raw = scenePath.trim();
  if (raw.startsWith('jepow-local://')) {
    raw = raw.slice('jepow-local://'.length);
  }
  return path.normalize(raw);
}

async function openBlend(blendPath) {
  return runBlenderCommand('open_blend', { blendPath: normalizeScenePath(blendPath) });
}

async function openScene(scenePath) {
  const p = normalizeScenePath(scenePath);
  const ext = path.extname(p).toLowerCase();
  if (ext === '.blend') {
    return openBlend(p);
  }
  return runBlenderCommand('open_scene', { scenePath: p }, PREVIEW_TIMEOUT_MS);
}

async function sceneInfo(scenePath) {
  return openScene(scenePath);
}

async function renderPreview(opts = {}) {
  const {
    blendPath,
    scenePath,
    engine = 'eevee',
    width = 640,
    height = 480,
    frame,
    samples,
    cameraYaw,
    cameraPitch,
    cameraDistance,
    panX,
    panY,
  } = opts;

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outputPath = path.join(getViewportCacheDir(), `preview-${id}.png`);
  const resolved = normalizeScenePath(scenePath || blendPath);
  const ext = resolved ? path.extname(resolved).toLowerCase() : '';

  const payload = {
    outputPath,
    engine,
    width,
    height,
    frame,
    samples,
    useGpu: true,
    cameraYaw,
    cameraPitch,
    cameraDistance,
    panX,
    panY,
  };

  const command =
    resolved && ext !== '.blend' ? 'render_scene' : 'render_frame';

  if (command === 'render_scene') {
    payload.scenePath = resolved;
  } else {
    payload.blendPath = resolved;
  }

  const result = await runBlenderCommand(command, payload, PREVIEW_TIMEOUT_MS);
  if (!result.ok) return result;
  return {
    ...result,
    previewUrl: `viewport-cache://${path.basename(outputPath)}`,
    localPath: outputPath,
  };
}

async function exportGlb({ blendPath, outputPath }) {
  const out =
    outputPath ||
    path.join(getViewportCacheDir(), `export-${Date.now()}.glb`);
  return runBlenderCommand('export_glb', { blendPath, outputPath: out });
}

function readCachedImageByName(fileName) {
  const safe = path.basename(fileName);
  const full = path.join(getViewportCacheDir(), safe);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

module.exports = {
  SCRIPT_PATH,
  getBlenderExecutable,
  discoverBlenderExecutable,
  getViewportCacheDir,
  readConfig,
  writeConfig,
  runBlenderCommand,
  getStatus,
  openBlend,
  openScene,
  sceneInfo,
  renderPreview,
  exportGlb,
  readCachedImageByName,
};
