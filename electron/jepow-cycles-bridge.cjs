/**
 * jepow-cycles — GPL-2.0-or-later offline renderer (libcycles / route A).
 * Never used for interactive viewport; never starts blender.exe.
 * See native/COMPLIANCE.md and SOURCE_CODE_OFFER.md.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CYCLES_NAME = process.platform === 'win32' ? 'jepow-cycles.exe' : 'jepow-cycles';
const LICENSE = 'GPL-2.0-or-later';

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

async function getStatus() {
  const executable = getCyclesExecutable();
  if (!executable) {
    return {
      available: false,
      license: LICENSE,
      built: false,
      executable: null,
      engine: 'jepow-cycles',
      message:
        'Cycles 离线渲染未安装。默认仅使用 MIT 视口 (jepow-engine)。构建见 native/jepow-cycles/README.md',
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
        available: built,
        license: LICENSE,
        built,
        executable,
        engine: 'jepow-cycles',
        versionLine: out.trim() || null,
        message: built
          ? 'Blender Cycles (GPL) 离线渲染已就绪 — 不调用 blender.exe'
          : 'jepow-cycles 已找到但未链接 libcycles',
        buildHint: built ? null : 'Rebuild with -DJEPOW_CYCLES_WITH_LIBCYCLES=ON',
        sourceOffer: 'SOURCE_CODE_OFFER.md',
      });
    });
    proc.on('error', () => {
      resolve({
        available: false,
        license: LICENSE,
        built: false,
        executable,
        engine: 'jepow-cycles',
        message: '无法启动 jepow-cycles',
      });
    });
  });
}

/**
 * Offline render — JSON IPC extension point (not wired to viewport daemon).
 */
async function renderFrame(opts) {
  const executable = getCyclesExecutable();
  if (!executable) {
    return {
      ok: false,
      error: 'jepow-cycles not installed',
      license: LICENSE,
    };
  }
  return {
    ok: false,
    error: 'Cycles render IPC not implemented — stub binary only',
    license: LICENSE,
    renderer: 'jepow-cycles',
  };
}

module.exports = {
  LICENSE,
  getCyclesExecutable,
  getStatus,
  renderFrame,
};
