/**
 * jepow-cycles — GPL-2.0-or-later offline renderer (libcycles / route A).
 * Never used for interactive viewport; never starts blender.exe.
 * See native/COMPLIANCE.md and SOURCE_CODE_OFFER.md.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const blenderBridge = require('./blender-bridge.cjs');
const { buildCyclesSceneXml, clampNumber } = require('./cycles-xml-export.cjs');

const CYCLES_NAME = process.platform === 'win32' ? 'jepow-cycles.exe' : 'jepow-cycles';
const LICENSE = 'GPL-2.0-or-later';
const STANDALONE_RELATIVE = process.platform === 'darwin'
  ? path.join('intern', 'cycles', 'app', 'Blender.app', 'Contents', 'MacOS', 'cycles')
  : path.join('intern', 'cycles', 'app', 'cycles');

function getCyclesCandidates() {
  const root = path.join(__dirname, '..');
  return [
    process.env.JEPOW_CYCLES_PATH,
    path.join(root, 'native', 'jepow-cycles', 'build', CYCLES_NAME),
    app.isPackaged
      ? path.join(process.resourcesPath, 'native', CYCLES_NAME)
      : null,
  ].filter(Boolean);
}

function getCyclesExecutable() {
  for (const p of getCyclesCandidates()) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getCyclesStandaloneExecutable() {
  const root = path.join(__dirname, '..');
  const candidates = [
    process.env.JEPOW_CYCLES_STANDALONE_PATH,
    path.join(root, 'native', 'jepow-cycles', 'build-cycles-standalone', STANDALONE_RELATIVE),
    app.isPackaged
      ? path.join(process.resourcesPath, 'native', 'jepow-cycles', 'cycles')
      : null,
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getCyclesSourceStatus() {
  const root = path.join(__dirname, '..');
  const blenderDir = path.join(root, 'native', 'jepow-cycles', 'third_party', 'blender');
  const versionFile = path.join(root, 'native', 'jepow-cycles', 'third_party', 'VERSION');
  const sourcePresent =
    fs.existsSync(path.join(blenderDir, 'intern', 'cycles')) ||
    fs.existsSync(path.join(blenderDir, 'source', 'blender'));
  let sourceVersion = null;
  if (fs.existsSync(versionFile)) {
    try {
      sourceVersion = fs.readFileSync(versionFile, 'utf8').trim() || null;
    } catch {
      sourceVersion = null;
    }
  }
  return { sourcePresent, blenderDir, sourceVersion };
}

async function getStatus() {
  const executable = getCyclesExecutable();
  const standaloneExecutable = getCyclesStandaloneExecutable();
  const source = getCyclesSourceStatus();
  if (!executable) {
    return {
      available: !!standaloneExecutable,
      license: LICENSE,
      built: false,
      executable: null,
      standaloneAvailable: !!standaloneExecutable,
      standaloneExecutable,
      sourcePresent: source.sourcePresent,
      sourceVersion: source.sourceVersion,
      sourcePath: source.blenderDir,
      engine: 'jepow-cycles',
      message:
        standaloneExecutable
          ? 'Cycles standalone 已可用，jepow-cycles 桥接二进制尚未构建/链接。'
          : source.sourcePresent
          ? 'Cycles 源码已下载，但 jepow-cycles 二进制尚未构建。默认仅使用 MIT 视口 (jepow-engine)。'
          : 'Cycles 离线渲染未安装。默认仅使用 MIT 视口 (jepow-engine)。构建见 native/jepow-cycles/README.md',
      buildHint: 'npm run native:cycles:build',
      sourceOffer: 'SOURCE_CODE_OFFER.md',
    };
  }

  return new Promise((resolve) => {
    const proc = spawn(executable, ['--version'], { windowsHide: true });
    let out = '';
    proc.stdout.on('data', (d) => {
      out += d.toString();
    });
    proc.on('close', (code) => {
      const built = code === 0;
      resolve({
        available: built || !!standaloneExecutable,
        license: LICENSE,
        built,
        executable,
        standaloneAvailable: !!standaloneExecutable,
        standaloneExecutable,
        sourcePresent: source.sourcePresent,
        sourceVersion: source.sourceVersion,
        sourcePath: source.blenderDir,
        engine: 'jepow-cycles',
        versionLine: out.trim() || null,
        message: built
          ? 'Blender Cycles (GPL) 离线渲染已就绪 — 不调用 blender.exe'
          : standaloneExecutable
          ? 'Cycles standalone 已就绪，jepow-cycles 桥接层待链接到 Cycles Session API'
          : 'jepow-cycles 已找到但未链接 libcycles',
        buildHint: built ? null : 'Rebuild with -DJEPOW_CYCLES_WITH_LIBCYCLES=ON',
        sourceOffer: 'SOURCE_CODE_OFFER.md',
      });
    });
    proc.on('error', () => {
      resolve({
        available: !!standaloneExecutable,
        license: LICENSE,
        built: false,
        executable,
        standaloneAvailable: !!standaloneExecutable,
        standaloneExecutable,
        engine: 'jepow-cycles',
        message: '无法启动 jepow-cycles',
      });
    });
  });
}

/**
 * Offline render — JSON IPC extension point (not wired to viewport daemon).
 */
function getCyclesCacheDir() {
  const dir = path.join(app.getPath('userData'), 'cycles-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function normalizeSceneRef(scenePath) {
  if (!scenePath || typeof scenePath !== 'string') return '';
  let raw = scenePath.trim();
  if (raw.startsWith('jepow-local://')) {
    raw = raw.slice('jepow-local://'.length);
  }
  return path.normalize(raw);
}

async function prepareCyclesSceneXml(opts, cacheDir, id) {
  const requested = normalizeSceneRef(opts.scenePath);
  if (requested && path.extname(requested).toLowerCase() === '.xml' && fs.existsSync(requested)) {
    return { ok: true, scenePath: requested, converted: false };
  }

  const ext = requested ? path.extname(requested).toLowerCase() : '';
  const canConvert =
    requested &&
    fs.existsSync(requested) &&
    ['.glb', '.gltf', '.fbx', '.obj', '.blend'].includes(ext);
  if (!canConvert) {
    const scenePath = path.join(cacheDir, `cycles-${id}.xml`);
    fs.writeFileSync(scenePath, buildCyclesSceneXml({ ...opts, cacheDir }), 'utf8');
    return { ok: true, scenePath, converted: false, procedural: true };
  }

  const scenePath = path.join(cacheDir, `cycles-model-${id}.xml`);
  const cyclesMaterial = opts.cyclesMaterial || opts.material;
  if (cyclesMaterial?.shaderGraph) {
    const { stageShaderGraphTextures } = require('./cycles-texture-stage.cjs');
    cyclesMaterial.shaderGraph = stageShaderGraphTextures(cyclesMaterial.shaderGraph, cacheDir);
  }
  const exported = await blenderBridge.runBlenderCommand(
    'export_cycles_xml',
    {
      scenePath: requested,
      outputPath: scenePath,
      cyclesMaterial,
      material: opts.material,
      cyclesLight: opts.cyclesLight,
      renderSettings: opts.renderSettings,
      width: opts.width,
      height: opts.height,
    },
    120000,
  );
  if (!exported.ok || !fs.existsSync(scenePath)) {
    return {
      ok: false,
      error: exported.error || 'Cycles XML export failed',
      stderr: exported.stderr,
    };
  }
  return {
    ok: true,
    scenePath,
    converted: true,
    meshCount: exported.meshCount,
    triangleCount: exported.triangleCount,
  };
}

async function renderFrame(opts = {}) {
  const executable = getCyclesStandaloneExecutable();
  if (!executable) {
    return {
      ok: false,
      error: 'Cycles standalone not built. Run npm run native:cycles:build:libcycles',
      license: LICENSE,
    };
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cacheDir = getCyclesCacheDir();
  const outputPath = opts.outputPath || path.join(cacheDir, `cycles-${id}.png`);
  const prepared = await prepareCyclesSceneXml(opts, cacheDir, id);
  if (!prepared.ok) {
    return {
      ok: false,
      error: `模型转 Cycles XML 失败: ${prepared.error}`,
      stderr: prepared.stderr,
      license: LICENSE,
    };
  }
  const scenePath = prepared.scenePath;

  const samples = String(clampNumber(opts.samples || opts.renderSettings?.samples, 1, 4096, 64));
  const width = String(clampNumber(opts.width, 64, 8192, 768));
  const height = String(clampNumber(opts.height, 64, 8192, 512));
  const args = [
    '--background',
    '--quiet',
    '--device',
    opts.device === 'METAL' ? 'METAL' : 'CPU',
    '--samples',
    samples,
    '--width',
    width,
    '--height',
    height,
    '--output',
    outputPath,
    scenePath,
  ];

  const started = Date.now();
  return new Promise((resolve) => {
    const proc = spawn(executable, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      const ok = code === 0 && fs.existsSync(outputPath);
      let previewDataUrl = null;
      if (ok) {
        try {
          previewDataUrl = `data:image/png;base64,${fs.readFileSync(outputPath).toString('base64')}`;
        } catch {
          previewDataUrl = null;
        }
      }
      resolve({
        ok,
        error: code === 0 ? null : `cycles standalone exited with code ${code}`,
        license: LICENSE,
        renderer: 'cycles-standalone',
        executable,
        scenePath,
        outputPath,
        previewDataUrl,
        renderSeconds: (Date.now() - started) / 1000,
        convertedScene: !!prepared.converted,
        meshCount: prepared.meshCount,
        triangleCount: prepared.triangleCount,
        stdout: stdout.slice(-2000),
        stderr: stderr.slice(-2000),
      });
    });
    proc.on('error', (err) => {
      resolve({
        ok: false,
        error: err.message,
        license: LICENSE,
        renderer: 'cycles-standalone',
      });
    });
  });
}

module.exports = {
  LICENSE,
  getCyclesExecutable,
  getCyclesStandaloneExecutable,
  getStatus,
  renderFrame,
};
