/**
 * Jepow native 3D engine bridge (jepow-engine binary).
 * Own CPU job pool (Rayon) + GPU (wgpu). Not Blender. Not WebGL.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ENGINE_NAME = process.platform === 'win32' ? 'jepow-engine.exe' : 'jepow-engine';

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

function runEngineCommand(command, payload = {}, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
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
  const ping = await runEngineCommand('ping', {}, 60000);
  return {
    ok: true,
    available: !!ping.ok,
    executable,
    engine: ping.engine || 'jepow-engine',
    version: ping.version,
    cpuJobs: ping.cpuJobs,
    gpu: ping.gpu,
    cacheDir: getViewportCacheDir(),
    ping,
  };
}

async function openScene(scenePath) {
  return runEngineCommand('open_scene', { scenePath });
}

async function renderPreview({ scenePath, width = 640, height = 480 }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outputPath = path.join(getViewportCacheDir(), `jepow-${id}.png`);
  const result = await runEngineCommand('render_frame', {
    scenePath,
    outputPath,
    width,
    height,
  });
  if (!result.ok) return result;
  return {
    ...result,
    previewUrl: `viewport-cache://${path.basename(outputPath)}`,
    localPath: outputPath,
  };
}

function readCachedImageByName(fileName) {
  const safe = path.basename(fileName);
  const full = path.join(getViewportCacheDir(), safe);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

module.exports = {
  getEngineExecutable,
  getViewportCacheDir,
  runEngineCommand,
  getStatus,
  openScene,
  renderPreview,
  readCachedImageByName,
};
