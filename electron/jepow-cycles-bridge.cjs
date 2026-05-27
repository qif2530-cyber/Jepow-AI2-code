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
const LICENSE = 'GPL-2.0-or-later';
const STANDALONE_RELATIVE = process.platform === 'darwin'
  ? path.join('intern', 'cycles', 'app', 'Blender.app', 'Contents', 'MacOS', 'cycles')
  : path.join('intern', 'cycles', 'app', 'cycles');

const MESH_EXPORT_EXT = new Set(['.glb', '.gltf', '.fbx', '.obj']);

function isMetalKernelBundled(standaloneExecutable) {
  if (process.platform !== 'darwin' || !standaloneExecutable) return false;
  const appRoot = path.join(path.dirname(standaloneExecutable), '..', '..');
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
  return nativeEngine.runEngineCommand('mesh_for_cycles', { scenePath }, 120000);
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
    xmlBytes,
    meshExporter: 'jepow-engine',
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
  const width = String(clampNumber(opts.width, 64, 8192, 768));
  const height = String(clampNumber(opts.height, 64, 8192, 512));
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

module.exports = {
  LICENSE,
  getCyclesExecutable,
  getCyclesStandaloneExecutable,
  getStatus,
  renderFrame,
};
