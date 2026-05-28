/**
 * jepow-cycles — GPL-2.0-or-later offline renderer (libcycles / route A).
 * Never used for interactive viewport; never starts blender.exe.
 * See native/COMPLIANCE.md and SOURCE_CODE_OFFER.md.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { app } = require('electron');
const nativeEngine = require('./native-engine-bridge.cjs');
const { buildCyclesSceneXml, clampNumber } = require('./cycles-xml-export.cjs');
const { buildMeshStateBlock } = require('./cycles-mesh-xml.cjs');

const CYCLES_NAME = process.platform === 'win32' ? 'jepow-cycles.exe' : 'jepow-cycles';
const CYCLES_DAEMON_NAME = process.platform === 'win32' ? 'jepow-cycles-daemon.exe' : 'jepow-cycles-daemon';
const LICENSE = 'GPL-2.0-or-later';
const STANDALONE_RELATIVE = process.platform === 'darwin'
  ? path.join('intern', 'cycles', 'app', 'Blender.app', 'Contents', 'MacOS', 'cycles')
  : path.join('intern', 'cycles', 'app', 'cycles');
const DAEMON_RELATIVE = process.platform === 'darwin'
  ? path.join('intern', 'cycles', 'app', 'Blender.app', 'Contents', 'MacOS', CYCLES_DAEMON_NAME)
  : path.join('intern', 'cycles', 'app', CYCLES_DAEMON_NAME);

const MESH_EXPORT_EXT = new Set(['.glb', '.gltf', '.fbx', '.obj']);
const meshExportCache = new Map();
const cyclesSessions = new Map();
const navigationSettleTimers = new Map();
const CYCLES_MESH_EXPORT_VERSION = 'cycles-mesh-v10-viewport-camera-sync';
let cyclesSessionSeq = 0;
let daemonProc = null;
let daemonBuf = '';
let daemonReqId = 0;
const daemonPending = new Map();

function getSceneCacheKey(scenePath) {
  try {
    const st = fs.statSync(scenePath);
    return `${CYCLES_MESH_EXPORT_VERSION}:${scenePath}:${st.mtimeMs}:${st.size}`;
  } catch {
    return `${CYCLES_MESH_EXPORT_VERSION}:${scenePath}`;
  }
}

function normalizeRenderWidth(value) {
  const n = Number(value);
  return !Number.isFinite(n) || n === 768 ? 2048 : n;
}

function normalizeRenderHeight(value) {
  const n = Number(value);
  return !Number.isFinite(n) || n === 512 ? 1536 : n;
}

function hexToRgb01(raw, fallback = [1, 1, 1]) {
  if (typeof raw !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw)) return fallback;
  return [
    parseInt(raw.slice(1, 3), 16) / 255,
    parseInt(raw.slice(3, 5), 16) / 255,
    parseInt(raw.slice(5, 7), 16) / 255,
  ];
}

function cyclesMaterialParams(opts = {}) {
  const p = opts.cyclesMaterial?.principled || opts.material?.principled || opts.material || {};
  const [r, g, b] = hexToRgb01(p.baseColor || p.tint, [1, 1, 1]);
  return {
    materialR: r,
    materialG: g,
    materialB: b,
    materialRoughness: clampNumber(p.roughness, 0, 1, 0.5),
    materialMetallic: clampNumber(p.metallic ?? p.metalness, 0, 1, 0),
    materialEmissionStrength: clampNumber(p.emissionStrength, 0, 20, 0),
  };
}

function cyclesTransformParams(opts = {}) {
  const t = opts.transform || {};
  return {
    transformX: clampNumber(t.x, -100000, 100000, 0),
    transformY: clampNumber(t.y, -100000, 100000, 0),
    transformZ: clampNumber(t.z, -100000, 100000, 0),
    transformRx: clampNumber(t.rx, -360000, 360000, 0),
    transformRy: clampNumber(t.ry, -360000, 360000, 0),
    transformRz: clampNumber(t.rz, -360000, 360000, 0),
    transformScale: clampNumber(t.scale, 0.01, 100000, 1),
  };
}

/** Same Y-up orbit camera as jepow-engine preview / Cycles XML export. */
function cyclesCameraParams(opts = {}) {
  const cam = opts.camera || {};
  return {
    yaw: clampNumber(cam.yaw, -Math.PI * 4, Math.PI * 4, 0.55),
    pitch: clampNumber(cam.pitch, -1.2, 1.2, 0.38),
    distance: clampNumber(cam.distance ?? opts.cameraDistance, 0.35, 48, 2.45),
    panX: clampNumber(cam.panX, -24, 24, 0),
    panY: clampNumber(cam.panY, -24, 24, 0),
    fov: clampNumber(cam.fov, 0.05, 3.13, Math.PI / 4),
  };
}

function isMetalKernelBundled(standaloneExecutable) {
  if (process.platform !== 'darwin' || !standaloneExecutable) return false;
  const appRoot = path.join(path.dirname(standaloneExecutable), '..');
  const candidates = [
    path.join(appRoot, 'Frameworks', 'kernel.framework', 'Resources', 'kernel', 'device', 'metal', 'kernel.metal'),
    path.join(appRoot, 'Resources', 'kernel', 'device', 'metal', 'kernel.metal'),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterPngRow(filter, row, prev, bpp) {
  if (filter === 0) return;
  const stride = row.length;
  if (filter === 1) {
    for (let x = bpp; x < stride; x += 1) row[x] = (row[x] + row[x - bpp]) & 0xff;
  } else if (filter === 2) {
    for (let x = 0; x < stride; x += 1) row[x] = (row[x] + prev[x]) & 0xff;
  } else if (filter === 3) {
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      row[x] = (row[x] + Math.floor((a + b) / 2)) & 0xff;
    }
  } else if (filter === 4) {
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      row[x] = (row[x] + paethPredictor(a, b, c)) & 0xff;
    }
  }
}

/** Decode PNG and return brightness stats for empty-frame detection. */
function analyzePngBrightness(filePath) {
  try {
    const d = fs.readFileSync(filePath);
    if (d.length < 24 || d.readUInt32BE(0) !== 0x89504e47) return null;
    let o = 8;
    let w = 0;
    let h = 0;
    let bpp = 3;
    const idatChunks = [];
    while (o + 8 <= d.length) {
      const len = d.readUInt32BE(o);
      const typ = d.toString('ascii', o + 4, o + 8);
      const chunk = d.subarray(o + 8, o + 8 + len);
      o += 12 + len;
      if (typ === 'IHDR') {
        w = chunk.readUInt32BE(0);
        h = chunk.readUInt32BE(4);
        const colorType = chunk[9];
        bpp = colorType === 6 || colorType === 4 ? 4 : 3;
      } else if (typ === 'IDAT') {
        idatChunks.push(chunk);
      } else if (typ === 'IEND') {
        break;
      }
    }
    if (!w || !h || !idatChunks.length) return null;
    const raw = zlib.inflateSync(Buffer.concat(idatChunks));
    const stride = w * bpp;
    let prev = Buffer.alloc(stride);
    let sum = 0;
    let pixels = 0;
    let max = 0;
    let min = 255;
    let i = 0;
    for (let y = 0; y < h; y += 1) {
      const filter = raw[i];
      i += 1;
      const row = Buffer.from(raw.subarray(i, i + stride));
      i += stride;
      unfilterPngRow(filter, row, prev, bpp);
      for (let x = 0; x < stride; x += bpp) {
        const v = Math.max(row[x], row[x + 1], row[x + 2]);
        sum += v;
        pixels += 1;
        if (v > max) max = v;
        if (v < min) min = v;
      }
      prev = row;
    }
    return {
      width: w,
      height: h,
      max,
      min,
      span: max - min,
      mean: pixels ? sum / pixels : 0,
      nonzeroRatio: pixels ? sum / (pixels * 255) : 0,
    };
  } catch {
    return null;
  }
}

function parseCyclesRenderFailure({ code, stderr, stdout, device, outputPath }) {
  const log = `${stderr}\n${stdout}`;
  if (/kernel\.metal.*not found|Failed to compile library/i.test(log)) {
    return 'Cycles GPU (Metal) 不可用：standalone 未打包 Metal 着色器内核（Blender.app 内缺少 kernel.framework）。请先用 CPU，或重新构建并打包 Metal 内核。';
  }
  if (device === 'METAL' && /GPU rendering|metal/i.test(log) && code !== 0) {
    return 'Cycles GPU (Metal) 启动失败，请改用 CPU 渲染。';
  }
  if (code !== 0) {
    return `cycles standalone 退出码 ${code}`;
  }
  if (!outputPath || !fs.existsSync(outputPath)) {
    return 'Cycles 未生成输出 PNG（渲染可能在中途失败）';
  }
  const stats = analyzePngBrightness(outputPath);
  if (!stats) {
    return 'Cycles 输出 PNG 无法解析';
  }
  if (stats.max < 8) {
    return (
      'Cycles 渲染结果全黑。请确认 npm run native:build 后已重启应用，且 Cycles Render 节点为 CPU。' +
      ` [max=${stats.max}]`
    );
  }
  return null;
}

function getCyclesCandidates() {
  const root = path.join(__dirname, '..');
  return [
    process.env.JEPOW_CYCLES_PATH,
    path.join(root, 'native', 'jepow-cycles', 'build-cycles-standalone', DAEMON_RELATIVE),
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

function getCyclesKernelPath() {
  const root = path.join(__dirname, '..');
  const standaloneExecutable = getCyclesStandaloneExecutable();
  const appRoot = standaloneExecutable
    ? path.join(path.dirname(standaloneExecutable), '..')
    : null;
  const candidates = [
    path.join(root, 'native', 'jepow-cycles', 'third_party', 'blender', 'intern', 'cycles'),
    appRoot ? path.join(appRoot, 'Resources') : null,
    app.isPackaged ? path.join(process.resourcesPath, 'native', 'jepow-cycles', 'Resources') : null,
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'kernel', 'device', 'metal', 'kernel.metal'))) return p;
  }
  return null;
}

function getCyclesSpawnEnv() {
  const kernelPath = process.env.CYCLES_KERNEL_PATH || getCyclesKernelPath();
  return kernelPath
    ? { ...process.env, CYCLES_KERNEL_PATH: kernelPath }
    : process.env;
}

function parseDaemonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function stopCyclesDaemon() {
  if (!daemonProc) return;
  try {
    daemonProc.stdin.write(`${JSON.stringify({ cmd: 'shutdown', id: 0 })}\n`);
  } catch {
    /* ignore */
  }
  try {
    daemonProc.kill();
  } catch {
    /* ignore */
  }
  daemonProc = null;
  daemonBuf = '';
  for (const pending of daemonPending.values()) {
    clearTimeout(pending.timer);
    pending.resolve({ ok: false, error: 'jepow-cycles daemon stopped' });
  }
  daemonPending.clear();
  for (const timer of navigationSettleTimers.values()) clearTimeout(timer);
  navigationSettleTimers.clear();
}

function scheduleNavigationSettle(sessionId) {
  const existing = navigationSettleTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    navigationSettleTimers.delete(sessionId);
    runDaemonCommand('settle_navigation', { sessionId }, 1500).catch(() => {});
  }, 700);
  navigationSettleTimers.set(sessionId, timer);
}

async function ensureCyclesDaemon() {
  if (daemonProc && !daemonProc.killed) return daemonProc;
  const executable = getCyclesExecutable();
  if (!executable) return null;
  daemonProc = spawn(executable, ['--stdio'], { env: getCyclesSpawnEnv(), windowsHide: true });
  daemonBuf = '';
  daemonProc.stdout.on('data', (d) => {
    daemonBuf += d.toString();
    let idx;
    while ((idx = daemonBuf.indexOf('\n')) >= 0) {
      const line = daemonBuf.slice(0, idx).trim();
      daemonBuf = daemonBuf.slice(idx + 1);
      if (!line) continue;
      const msg = parseDaemonLine(line);
      if (!msg) continue;
      const pending = daemonPending.get(msg.id);
      if (pending) {
        daemonPending.delete(msg.id);
        clearTimeout(pending.timer);
        pending.resolve(msg);
      }
    }
  });
  daemonProc.on('close', () => {
    daemonProc = null;
    for (const pending of daemonPending.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ ok: false, error: 'jepow-cycles daemon exited' });
    }
    daemonPending.clear();
  });
  daemonProc.on('error', () => {
    daemonProc = null;
  });
  return daemonProc;
}

async function runDaemonCommand(cmd, payload = {}, timeoutMs = 5000) {
  const proc = await ensureCyclesDaemon();
  if (!proc || !proc.stdin || proc.killed) {
    return { ok: false, error: 'jepow-cycles daemon unavailable' };
  }
  const id = ++daemonReqId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      daemonPending.delete(id);
      resolve({ ok: false, error: `jepow-cycles daemon timeout (${cmd})` });
    }, timeoutMs);
    daemonPending.set(id, { resolve, timer });
    proc.stdin.write(`${JSON.stringify({ id, cmd, ...payload })}\n`);
  });
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
  const metalKernelBundled = isMetalKernelBundled(standaloneExecutable);
  const source = getCyclesSourceStatus();
  if (!executable) {
    return {
      available: !!standaloneExecutable,
      license: LICENSE,
      built: false,
      executable: null,
      standaloneAvailable: !!standaloneExecutable,
      standaloneExecutable,
      metalKernelBundled,
      sourcePresent: source.sourcePresent,
      sourceVersion: source.sourceVersion,
      sourcePath: source.blenderDir,
      engine: 'jepow-cycles',
      message:
        standaloneExecutable
          ? metalKernelBundled
            ? 'Cycles standalone 已可用（CPU + Metal），jepow-cycles 桥接二进制尚未构建/链接。'
            : 'Cycles standalone 已可用（仅 CPU；Metal 内核未打包到 app bundle）。'
          : source.sourcePresent
          ? 'Cycles 源码已下载，但 jepow-cycles 二进制尚未构建。默认仅使用 MIT 视口 (jepow-engine)。'
          : 'Cycles 离线渲染未安装。默认仅使用 MIT 视口 (jepow-engine)。构建见 native/jepow-cycles/README.md',
      buildHint: 'npm run native:cycles:build',
      sourceOffer: 'SOURCE_CODE_OFFER.md',
    };
  }

  return new Promise((resolve) => {
    const proc = spawn(executable, ['--version'], { env: getCyclesSpawnEnv(), windowsHide: true });
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
        metalKernelBundled,
        sourcePresent: source.sourcePresent,
        sourceVersion: source.sourceVersion,
        sourcePath: source.blenderDir,
        engine: 'jepow-cycles',
        versionLine: out.trim() || null,
        message: built
          ? 'jepow-cycles (GPL libcycles) 离线渲染已就绪 — 不调用 blender.exe'
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

function humanizeMeshExportError(message) {
  if (!message || typeof message !== 'string') return message;
  if (/too many triangles/i.test(message)) {
    return '模型三角面过多，自动减面后仍超限。请在 C4D/Blender 中减面到约 50 万三角以下后重试。';
  }
  if (/no renderable triangles/i.test(message)) {
    return '模型中没有可渲染的三角面，请检查 FBX/GLB 是否为空或损坏。';
  }
  return message;
}

function normalizeSceneRef(scenePath) {
  if (!scenePath || typeof scenePath !== 'string') return '';
  let raw = scenePath.trim();
  if (raw.startsWith('jepow-local://')) {
    raw = raw.slice('jepow-local://'.length);
  }
  return path.normalize(raw);
}

async function exportMeshViaNativeEngine(scenePath) {
  if (!nativeEngine.getEngineExecutable()) {
    return { ok: false, error: 'jepow-engine 未构建，无法导出 Cycles 网格' };
  }
  const key = getSceneCacheKey(scenePath);
  const cached = meshExportCache.get(key);
  if (cached) {
    return { ...cached, cached: true };
  }
  // Do not use the long-lived viewport daemon here. It is busy serving clay viewport
  // frames, so Cycles XML preparation can sit behind an endless interactive queue.
  const result = await nativeEngine.runEngineCommand('mesh_for_cycles', { scenePath }, 45000);
  if (result?.ok !== false) {
    if (meshExportCache.size > 8) {
      const oldest = meshExportCache.keys().next().value;
      if (oldest) meshExportCache.delete(oldest);
    }
    meshExportCache.set(key, result);
  }
  return result;
}

async function exportMeshCacheViaNativeEngine(scenePath, cacheDir, id) {
  if (!nativeEngine.getEngineExecutable()) {
    return { ok: false, error: 'jepow-engine 未构建，无法导出 Cycles 网格缓存' };
  }
  const key = `${getSceneCacheKey(scenePath)}:binary`;
  const cached = meshExportCache.get(key);
  if (cached && cached.meshCachePath && fs.existsSync(cached.meshCachePath)) {
    return { ...cached, cached: true };
  }
  const meshCachePath = path.join(cacheDir, `cycles-mesh-${id}.jpcmesh`);
  const result = await nativeEngine.runEngineCommand(
    'mesh_cache_for_cycles',
    { scenePath, outputPath: meshCachePath },
    45000,
  );
  if (result?.ok !== false) {
    const payload = { ...result, meshCachePath };
    if (meshExportCache.size > 8) {
      const oldest = meshExportCache.keys().next().value;
      if (oldest) meshExportCache.delete(oldest);
    }
    meshExportCache.set(key, payload);
    return payload;
  }
  return result;
}

async function prepareCyclesSceneXml(opts, cacheDir, id) {
  const requested = normalizeSceneRef(opts.scenePath);
  if (requested && path.extname(requested).toLowerCase() === '.xml' && fs.existsSync(requested)) {
    return { ok: true, scenePath: requested, converted: false };
  }

  const ext = requested ? path.extname(requested).toLowerCase() : '';
  const canExportMesh =
    requested && fs.existsSync(requested) && MESH_EXPORT_EXT.has(ext);

  if (!canExportMesh) {
    const scenePath = path.join(cacheDir, `cycles-${id}.xml`);
    fs.writeFileSync(scenePath, buildCyclesSceneXml({ ...opts, cacheDir }), 'utf8');
    return {
      ok: true,
      scenePath,
      converted: false,
      procedural: true,
      meshCount: 1,
      triangleCount: 12,
    };
  }

  const meshRes = await exportMeshViaNativeEngine(requested);
  if (!meshRes.ok) {
    return {
      ok: false,
      error: humanizeMeshExportError(meshRes.error) || 'jepow-engine 网格导出失败',
    };
  }

  const meshBlock = buildMeshStateBlock(meshRes);
  const scenePath = path.join(cacheDir, `cycles-model-${id}.xml`);
  fs.writeFileSync(
    scenePath,
    buildCyclesSceneXml({
      ...opts,
      cacheDir,
      cameraDistance: Number(meshRes.cameraDistance) || undefined,
      meshBlocks: meshBlock ? [meshBlock] : undefined,
    }),
    'utf8',
  );

  const xmlBytes = fs.statSync(scenePath).size;

  return {
    ok: true,
    scenePath,
    converted: true,
    meshCount: 1,
    triangleCount: Number(meshRes.triangleCount) || 0,
    rawTriangleCount: Number(meshRes.rawTriangleCount) || 0,
    vertexCount: Number(meshRes.vertexCount) || 0,
    decimated: !!meshRes.decimated,
    cachedMesh: !!meshRes.cached,
    xmlBytes,
    meshExporter: 'jepow-engine',
  };
}

async function prepareCyclesMeshCache(opts, cacheDir, id) {
  const requested = normalizeSceneRef(opts.scenePath);
  const ext = requested ? path.extname(requested).toLowerCase() : '';
  const canExportMesh =
    requested && fs.existsSync(requested) && MESH_EXPORT_EXT.has(ext);
  if (!canExportMesh) {
    return { ok: false, fallback: true, error: 'no mesh file for binary cache' };
  }
  const meshRes = await exportMeshCacheViaNativeEngine(requested, cacheDir, id);
  if (!meshRes.ok) {
    return {
      ok: false,
      error: humanizeMeshExportError(meshRes.error) || 'jepow-engine 网格缓存导出失败',
    };
  }
  return {
    ok: true,
    converted: true,
    meshCachePath: meshRes.meshCachePath,
    meshCount: 1,
    triangleCount: Number(meshRes.triangleCount) || 0,
    rawTriangleCount: Number(meshRes.rawTriangleCount) || 0,
    vertexCount: Number(meshRes.vertexCount) || 0,
    faceCount: Number(meshRes.faceCount) || 0,
    cachedMesh: !!meshRes.cached,
    cameraDistance: Number(meshRes.cameraDistance) || undefined,
    meshExporter: 'jepow-engine-binary-cache',
  };
}

async function renderFrame(opts = {}) {
  const executable = getCyclesStandaloneExecutable();
  if (!executable) {
    return {
      ok: false,
      error: 'Cycles standalone 未构建。请运行 npm run native:cycles:build:libcycles',
      license: LICENSE,
    };
  }

  const device = opts.device === 'METAL' ? 'METAL' : 'CPU';
  if (device === 'METAL' && !isMetalKernelBundled(executable)) {
    return {
      ok: false,
      error:
        'Cycles GPU (Metal) 未就绪：当前 standalone 的 Blender.app 未包含 kernel.framework，无法编译 Metal 内核。请切换为 CPU，或完成 Metal 资源打包后重建。',
      license: LICENSE,
      renderer: 'cycles-standalone',
      device,
      metalKernelBundled: false,
    };
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cacheDir = getCyclesCacheDir();
  const outputPath = opts.outputPath || path.join(cacheDir, `cycles-${id}.png`);
  const prepared = await prepareCyclesSceneXml(opts, cacheDir, id);
  if (!prepared.ok) {
    return {
      ok: false,
      error: `Cycles 场景准备失败: ${prepared.error}`,
      stderr: prepared.stderr,
      license: LICENSE,
    };
  }
  const scenePath = prepared.scenePath;
  if (prepared.xmlBytes && prepared.xmlBytes > 6 * 1024 * 1024) {
    return {
      ok: false,
      error: `Cycles 场景 XML 过大 (${(prepared.xmlBytes / 1024 / 1024).toFixed(1)} MB)。请执行 npm run native:build 更新网格焊接，或简化 FBX 后重试。`,
      license: LICENSE,
      triangleCount: prepared.triangleCount,
      rawTriangleCount: prepared.rawTriangleCount,
    };
  }

  const samples = String(
    clampNumber(opts.samples || opts.renderSettings?.samples, 1, 4096, 64),
  );
  const width = String(clampNumber(normalizeRenderWidth(opts.width), 64, 8192, 2048));
  const height = String(clampNumber(normalizeRenderHeight(opts.height), 64, 8192, 1536));
  const args = [
    '--background',
    '--device',
    device,
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
    const proc = spawn(executable, args, { env: getCyclesSpawnEnv(), windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      const brightness = fs.existsSync(outputPath) ? analyzePngBrightness(outputPath) : null;
      const failure = parseCyclesRenderFailure({
        code,
        stderr,
        stdout,
        device,
        outputPath,
      });
      const ok = !failure;
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
        error: failure,
        license: LICENSE,
        renderer: 'cycles-standalone',
        executable,
        scenePath,
        outputPath,
        previewDataUrl,
        device,
        metalKernelBundled: device === 'METAL' ? isMetalKernelBundled(executable) : undefined,
        luminanceMax: brightness?.max ?? null,
        luminanceMin: brightness?.min ?? null,
        luminanceMean: brightness?.mean ?? null,
        luminanceSpan: brightness?.span ?? null,
        renderSeconds: (Date.now() - started) / 1000,
        convertedScene: !!prepared.converted,
        meshCount: prepared.meshCount,
        triangleCount: prepared.triangleCount,
        rawTriangleCount: prepared.rawTriangleCount,
        vertexCount: prepared.vertexCount,
        xmlBytes: prepared.xmlBytes,
        cachedMesh: prepared.cachedMesh,
        meshExporter: prepared.meshExporter,
        procedural: !!prepared.procedural,
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

async function renderFrameViaDaemon(opts = {}, prepared, outputPath) {
  const device = opts.device === 'METAL' ? 'METAL' : 'CPU';
  const samples = clampNumber(opts.samples || opts.renderSettings?.samples, 1, 4096, 64);
  const width = clampNumber(normalizeRenderWidth(opts.width), 64, 8192, 2048);
  const height = clampNumber(normalizeRenderHeight(opts.height), 64, 8192, 1536);
  const started = Date.now();
  const res = await runDaemonCommand(
    'render_frame',
    {
      sessionId: opts.sessionId || 'cycles-session',
      scenePath: prepared.scenePath,
      outputPath,
      device,
      samples,
      width,
      height,
    },
    180000,
  );
  if (!res.ok) {
    return { ok: false, error: res.error || 'jepow-cycles daemon render failed' };
  }
  const brightness =
    !session.frame && fs.existsSync(outputPath) ? analyzePngBrightness(outputPath) : null;
  const failure = parseCyclesRenderFailure({
    code: fs.existsSync(outputPath) ? 0 : 1,
    stderr: '',
    stdout: '',
    device,
    outputPath,
  });
  let previewDataUrl = null;
  if (!failure) {
    previewDataUrl = `data:image/png;base64,${fs.readFileSync(outputPath).toString('base64')}`;
    try {
      fs.unlinkSync(outputPath);
    } catch {
      /* cache cleanup best effort */
    }
  }
  return {
    ok: !failure,
    error: failure,
    license: LICENSE,
    renderer: 'jepow-cycles-daemon',
    scenePath: prepared.scenePath,
    outputPath,
    previewDataUrl,
    device,
    luminanceMax: brightness?.max ?? null,
    luminanceMin: brightness?.min ?? null,
    luminanceMean: brightness?.mean ?? null,
    luminanceSpan: brightness?.span ?? null,
    renderSeconds: Number(res.renderSeconds) || (Date.now() - started) / 1000,
    convertedScene: !!prepared.converted,
    meshCount: prepared.meshCount,
    triangleCount: prepared.triangleCount,
    rawTriangleCount: prepared.rawTriangleCount,
    vertexCount: prepared.vertexCount,
    xmlBytes: prepared.xmlBytes,
    cachedMesh: prepared.cachedMesh,
    meshExporter: prepared.meshExporter,
    procedural: !!prepared.procedural,
  };
}

async function readResidentFrameViaDaemon(session, outputPath) {
  const started = Date.now();
  let res = null;
  const attempts = session.frame ? 1 : 10;
  for (let i = 0; i < attempts; i += 1) {
    res = await runDaemonCommand(
      'read_frame',
      {
        sessionId: session.id,
        outputPath,
      },
      5000,
    );
    if (res.ok || session.stopped) break;
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  if (!res.ok) {
    return { ok: false, error: res.error || 'resident Cycles frame unavailable' };
  }
  const fileExists = fs.existsSync(outputPath);
  const brightness = !session.frame && fileExists ? analyzePngBrightness(outputPath) : null;
  const failure = fileExists
    ? null
    : parseCyclesRenderFailure({
        code: 1,
        stderr: '',
        stdout: '',
        device: session.device,
        outputPath,
      });
  let previewDataUrl = null;
  if (!failure) {
    previewDataUrl = `data:image/png;base64,${fs.readFileSync(outputPath).toString('base64')}`;
    try {
      fs.unlinkSync(outputPath);
    } catch {
      /* cache cleanup best effort */
    }
  }
  return {
    ok: !failure,
    error: failure,
    license: LICENSE,
    renderer: res.renderer || 'libcycles-resident',
    outputPath,
    previewDataUrl,
    device: session.device,
    frameVersion: Number(res.frameVersion) || 0,
    luminanceMax: brightness?.max ?? null,
    luminanceMin: brightness?.min ?? null,
    luminanceMean: brightness?.mean ?? null,
    luminanceSpan: brightness?.span ?? null,
    renderSeconds: (Date.now() - started) / 1000,
  };
}

function buildFramePayload(session, res, status, stage) {
  return {
    ok: !!res?.ok,
    sessionId: session.id,
    status,
    stage,
    frameVersion: session.frameVersion,
    daemonFrameVersion: Number(res?.frameVersion) || 0,
    cameraVersion: Number(session.opts?.cameraVersion) || 0,
    previewDataUrl: res?.previewDataUrl || null,
    renderSeconds: res?.renderSeconds || 0,
    renderer: res?.renderer || 'cycles-standalone',
    device: res?.device || session.device,
    error: res?.error || null,
    luminanceMax: res?.luminanceMax ?? null,
    luminanceMin: res?.luminanceMin ?? null,
    luminanceMean: res?.luminanceMean ?? null,
    luminanceSpan: res?.luminanceSpan ?? null,
    triangleCount: res?.triangleCount,
    rawTriangleCount: res?.rawTriangleCount,
    vertexCount: res?.vertexCount,
    cachedMesh: res?.cachedMesh,
    meshTransport: session.meshTransport,
  };
}

async function runProgressiveSession(session) {
  const opts = session.opts;
  const id = session.id;
  const cacheDir = getCyclesCacheDir();
  session.debugStage = 'prepare_mesh_cache';
  session.debugMessage = '导出 Cycles 二进制 mesh cache';
  session.updatedAt = Date.now();
  let prepared = await prepareCyclesMeshCache(opts, cacheDir, id);
  let useMeshCache = !!prepared.ok;
  if (!prepared.ok && prepared.fallback) {
    session.debugStage = 'prepare_xml';
    session.debugMessage = '无原生模型文件，回退生成 Cycles XML';
    session.updatedAt = Date.now();
    prepared = await prepareCyclesSceneXml(opts, cacheDir, id);
    useMeshCache = false;
  }
  if (!prepared.ok) {
    session.status = 'error';
    session.frameVersion += 1;
    session.frame = {
      ok: false,
      sessionId: session.id,
      status: 'error',
      stage: 'error',
      frameVersion: session.frameVersion,
      error: `Cycles 场景准备失败: ${prepared.error}`,
    };
    return;
  }
  if (!useMeshCache && prepared.xmlBytes && prepared.xmlBytes > 6 * 1024 * 1024) {
    session.status = 'error';
    session.frameVersion += 1;
    session.frame = {
      ok: false,
      sessionId: session.id,
      status: 'error',
      stage: 'error',
      frameVersion: session.frameVersion,
      error: `Cycles 场景 XML 过大 (${(prepared.xmlBytes / 1024 / 1024).toFixed(1)} MB)。请简化 FBX 后重试。`,
    };
    return;
  }
  session.meshTransport = useMeshCache ? 'binary-cache' : 'xml';

  const finalWidth = clampNumber(
    normalizeRenderWidth(opts.width || opts.renderSettings?.width),
    64,
    8192,
    2048,
  );
  const finalHeight = clampNumber(
    normalizeRenderHeight(opts.height || opts.renderSettings?.height),
    64,
    8192,
    1536,
  );
  const finalSamples = clampNumber(opts.samples || opts.renderSettings?.samples, 1, 4096, 64);

  session.status = 'starting';
  session.debugStage = useMeshCache ? 'load_mesh_cache' : 'load_scene';
  session.debugMessage = useMeshCache
    ? `加载 Cycles mesh cache，三角面 ${prepared.triangleCount || 0}`
    : `加载 Cycles 场景 ${(Number(prepared.xmlBytes || 0) / 1024 / 1024).toFixed(2)}MB，面数 ${prepared.triangleCount || 0}`;
  session.updatedAt = Date.now();

  await runDaemonCommand('init_session', { sessionId: session.id }, 1500);

  if (session.stopped) return;
  const loaded = useMeshCache
    ? await runDaemonCommand(
        'load_mesh_cache',
        {
          sessionId: session.id,
          meshCachePath: prepared.meshCachePath,
          device: session.device,
          width: finalWidth,
          height: finalHeight,
          samples: finalSamples,
          ...cyclesMaterialParams(session.opts),
          ...cyclesTransformParams(session.opts),
          ...cyclesCameraParams(session.opts),
        },
        60000,
      )
    : await runDaemonCommand(
        'load_scene',
        {
          sessionId: session.id,
          scenePath: prepared.scenePath,
          device: session.device,
          width: finalWidth,
          height: finalHeight,
          samples: finalSamples,
        },
        60000,
      );
  if (!loaded.ok) {
    session.status = 'error';
    session.frameVersion += 1;
    session.frame = {
      ok: false,
      sessionId: session.id,
      status: 'error',
      stage: 'error',
      frameVersion: session.frameVersion,
      error: loaded.error || 'Cycles resident load_scene failed',
    };
    return;
  }

  session.loaded = true;
  session.status = 'ready';
  session.debugStage = 'wait_first_frame';
  session.debugMessage = `等待首帧 ${finalWidth}x${finalHeight} / ${finalSamples} sample`;
  session.updatedAt = Date.now();
  const pendingPatch = session.pendingPatch;
  if (session.pendingPatch) {
    session.opts = { ...session.opts, ...session.pendingPatch };
    session.pendingPatch = null;
  }
  if (useMeshCache || pendingPatch) {
    const initialCameraUpdate = await updateResidentCamera(
      session.id,
      session.opts,
      finalWidth,
      finalHeight,
      finalSamples,
    );
    if (initialCameraUpdate.ok) scheduleNavigationSettle(session.id);
  }

  let lastDaemonFrameVersion = -1;
  let lastFrameReadAttemptAt = 0;
  const started = Date.now();
  let cameraRecoveryApplied = false;
  while (!session.stopped) {
    const status = await runDaemonCommand('status', { sessionId: session.id }, 1500);
    if (status.ok && status.resident === false) {
      session.status = 'error';
      session.frameVersion += 1;
      session.frame = buildFramePayload(session, { error: 'Cycles daemon restarted or session lost' }, 'error', 'error');
      return;
    }
    const currentDaemonFrameVersion = Number(status.frameVersion) || 0;
    session.debugStage = 'trace';
    session.debugMessage = `daemon frame=${currentDaemonFrameVersion}, display=${status.displayTransport || 'unknown'}, ${status.width || finalWidth}x${status.height || finalHeight}`;
    session.updatedAt = Date.now();
    const noNewDaemonFrame = status.ok && currentDaemonFrameVersion === lastDaemonFrameVersion;
    const waitingForFirstDaemonFrame = status.ok && currentDaemonFrameVersion === 0 && !session.frame;
    const forceFrameRead = !!session.forceFrameRead;
    if ((noNewDaemonFrame && !forceFrameRead) || waitingForFirstDaemonFrame) {
      const now = Date.now();
      const shouldProbeFrame =
        (waitingForFirstDaemonFrame && now - lastFrameReadAttemptAt > 1400) ||
        (forceFrameRead && now - lastFrameReadAttemptAt > 120);
      if (currentDaemonFrameVersion === 0 && Date.now() - started > 45000 && !session.frame) {
        session.status = 'error';
        session.frameVersion += 1;
        session.frame = buildFramePayload(session, { error: 'Cycles render timeout (no frames produced)' }, 'error', 'error');
        return;
      }
      if (!shouldProbeFrame) {
        await new Promise((resolve) => setTimeout(resolve, session.device === 'METAL' ? 160 : 220));
        continue;
      }
      lastFrameReadAttemptAt = now;
    }
    if (forceFrameRead) {
      session.forceFrameRead = false;
    }
    const framePath = path.join(cacheDir, `cycles-resident-${id}-${Date.now()}.png`);
    const frame = await readResidentFrameViaDaemon(session, framePath);
    if (session.stopped) return;
    if (
      frame.ok &&
      (frame.frameVersion !== lastDaemonFrameVersion || forceFrameRead)
    ) {
      const lumMax = Number(frame.luminanceMax ?? 0);
      const veryDarkFirstFrame =
        !session.frame &&
        lumMax < 2 &&
        Number(status.meshTriangles || 0) > 0;
      if (veryDarkFirstFrame && !cameraRecoveryApplied) {
        cameraRecoveryApplied = true;
        const currentCam = session.opts?.camera || {};
        const recoveredDistance = Math.max(
          2.45,
          Number(currentCam.distance) || 2.45,
        );
        session.opts = {
          ...session.opts,
          camera: {
            ...currentCam,
            distance: recoveredDistance,
          },
        };
        session.debugStage = 'recover_camera';
        session.debugMessage = `首帧过暗，同步视口相机 distance=${recoveredDistance.toFixed(3)}`;
        session.updatedAt = Date.now();
        const recover = await updateResidentCamera(
          session.id,
          session.opts,
          finalWidth,
          finalHeight,
          finalSamples,
        );
        if (recover.ok) {
          scheduleNavigationSettle(session.id);
          await new Promise((resolve) => setTimeout(resolve, session.device === 'METAL' ? 140 : 220));
          continue;
        }
      }
      lastDaemonFrameVersion = frame.frameVersion;
      session.frameVersion += 1;
      session.frame = buildFramePayload(session, frame, 'converging', 'preview');
      session.status = 'converging';
      session.updatedAt = Date.now();
    }
    if (!frame.ok && Date.now() - started > 45000 && !session.frame) {
      session.status = 'error';
      session.frameVersion += 1;
      session.frame = buildFramePayload(session, frame, 'error', 'error');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, session.device === 'METAL' ? 360 : 600));
  }
}

async function updateResidentCamera(sessionId, opts = {}, width, height, samples) {
  return runDaemonCommand(
    'update_camera',
    {
      sessionId,
      width,
      height,
      samples,
      ...cyclesCameraParams(opts),
    },
    5000,
  );
}

function startSession(opts = {}) {
  const sessionId = `cycles-${Date.now()}-${++cyclesSessionSeq}`;
  const session = {
    id: sessionId,
    opts: { ...opts, device: opts.device === 'METAL' ? 'METAL' : 'CPU' },
    device: opts.device === 'METAL' ? 'METAL' : 'CPU',
    status: 'starting',
    frame: null,
    frameVersion: 0,
    stopped: false,
    loaded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  cyclesSessions.set(sessionId, session);
  runProgressiveSession(session).catch((err) => {
    if (session.stopped) return;
    session.status = 'error';
    session.frameVersion += 1;
    session.frame = {
      ok: false,
      sessionId,
      status: 'error',
      stage: 'error',
      frameVersion: session.frameVersion,
      error: err instanceof Error ? err.message : String(err),
    };
  });
  return {
    ok: true,
    sessionId,
    status: 'starting',
    renderer: 'jepow-cycles-progressive',
    mode: 'standalone-backed-daemon',
  };
}

function readSession(sessionId) {
  const session = cyclesSessions.get(sessionId);
  if (!session) {
    return { ok: false, error: 'Cycles session not found', sessionId };
  }
  return {
    ok: true,
    sessionId,
    status: session.status,
    frameVersion: session.frameVersion,
    cameraVersion: Number(session.opts?.cameraVersion) || 0,
    loaded: !!session.loaded,
    debugStage: session.debugStage || session.status,
    debugMessage: session.debugMessage || '',
    frame: session.frame,
    updatedAt: session.updatedAt,
  };
}

async function updateSession(sessionId, patch = {}) {
  const session = cyclesSessions.get(sessionId);
  if (!session) {
    return { ok: false, error: 'Cycles session not found', sessionId };
  }
  session.opts = { ...session.opts, ...patch };
  session.updatedAt = Date.now();
  if (!session.loaded) {
    session.pendingPatch = { ...(session.pendingPatch || {}), ...patch };
    return {
      ok: true,
      queued: true,
      sessionId,
      status: session.status,
      cameraVersion: Number(session.opts.cameraVersion) || 0,
    };
  }
  const width = clampNumber(
    normalizeRenderWidth(session.opts.width || session.opts.renderSettings?.width),
    64,
    8192,
    2048,
  );
  const height = clampNumber(
    normalizeRenderHeight(session.opts.height || session.opts.renderSettings?.height),
    64,
    8192,
    1536,
  );
  const samples = clampNumber(session.opts.samples || session.opts.renderSettings?.samples, 1, 4096, 64);
  const res = await updateResidentCamera(session.id, session.opts, width, height, samples);
  if (res.ok) {
    session.status = 'navigating';
    session.forceFrameRead = true;
    session.updatedAt = Date.now();
    scheduleNavigationSettle(session.id);
    if (patch.camera || patch.cameraVersion != null) {
      void captureResidentFrameAfterCamera(session).catch(() => {});
    }
  }
  return {
    ...res,
    sessionId,
    status: session.status,
    cameraVersion: Number(session.opts.cameraVersion) || 0,
  };
}

async function captureResidentFrameAfterCamera(session) {
  if (!session.loaded || session.stopped) return null;
  await new Promise((resolve) =>
    setTimeout(resolve, session.device === 'METAL' ? 240 : 420),
  );
  if (session.stopped) return null;
  const framePath = path.join(
    getCyclesCacheDir(),
    `cycles-capture-${session.id}-${Date.now()}.png`,
  );
  const frame = await readResidentFrameViaDaemon(session, framePath);
  if (!frame.ok || session.stopped) return frame;
  session.frameVersion += 1;
  session.frame = buildFramePayload(session, frame, 'converging', 'preview');
  session.status = 'converging';
  session.updatedAt = Date.now();
  return frame;
}

async function stopSession(sessionId) {
  const session = cyclesSessions.get(sessionId);
  if (!session) return { ok: true, sessionId, stopped: true };
  session.stopped = true;
  session.status = 'stopped';
  const timer = navigationSettleTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    navigationSettleTimers.delete(sessionId);
  }
  try {
    await runDaemonCommand('stop_render', { sessionId }, 1500);
  } catch {
    /* best effort */
  }
  cyclesSessions.delete(sessionId);
  return { ok: true, sessionId, stopped: true };
}

module.exports = {
  LICENSE,
  getCyclesExecutable,
  getCyclesStandaloneExecutable,
  getStatus,
  renderFrame,
  startSession,
  readSession,
  updateSession,
  stopSession,
  stopCyclesDaemon,
};
