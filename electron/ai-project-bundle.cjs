/**
 * Jepow .AI project bundle (directory):
 *   MyProject.AI/
 *     manifest.json
 *     canvas.json
 *     assets/images/   — 生成图片
 *     assets/videos/   — 生成视频
 *     assets/textures/ — 3D 贴图
 *     assets/models/   — 3D 模型
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FORMAT_ID = 'jepow-ai';
const FORMAT_VERSION = 1;

const ASSET_DIRS = {
  images: 'assets/images',
  videos: 'assets/videos',
  textures: 'assets/textures',
  models: 'assets/models',
};

const MODEL_EXTS = new Set(['.glb', '.gltf', '.fbx', '.obj']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const TEXTURE_EXTS = new Set(['.tga', '.hdr', '.exr', '.dds']);

function isBundlePath(p) {
  if (!p || typeof p !== 'string') return false;
  const lower = p.toLowerCase();
  if (!lower.endsWith('.ai')) return false;
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function normalizeBundlePath(filePath) {
  let p = path.resolve(filePath);
  if (!p.toLowerCase().endsWith('.ai')) {
    p = `${p}.AI`;
  }
  fs.mkdirSync(p, { recursive: true });
  ensureBundleStructure(p);
  return p;
}

function ensureBundleStructure(bundlePath) {
  fs.mkdirSync(bundlePath, { recursive: true });
  for (const rel of Object.values(ASSET_DIRS)) {
    fs.mkdirSync(path.join(bundlePath, rel), { recursive: true });
  }
}

function manifestFile(bundlePath) {
  return path.join(bundlePath, 'manifest.json');
}

function canvasFile(bundlePath) {
  return path.join(bundlePath, 'canvas.json');
}

function classifyByExt(ext, nodeType) {
  const e = (ext || '').toLowerCase();
  if (MODEL_EXTS.has(e)) return 'models';
  if (VIDEO_EXTS.has(e)) return 'videos';
  if (TEXTURE_EXTS.has(e)) return 'textures';
  if (IMAGE_EXTS.has(e)) return 'images';
  if (nodeType === 'modelAssetNode' || nodeType === 'threeDEditorNode') return 'models';
  if (nodeType === 'videoShotNode' || nodeType === 'videoProjectNode') return 'videos';
  if (nodeType === 'materialReplaceNode') return 'textures';
  return 'images';
}

function isInsideBundle(bundlePath, filePath) {
  const rel = path.relative(bundlePath, path.resolve(filePath));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function decodeRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  let raw = ref.trim();
  if (raw.startsWith('jepow-asset://')) {
    return { kind: 'asset', rel: raw.slice('jepow-asset://'.length).replace(/\\/g, '/') };
  }
  if (raw.startsWith('jepow-local://')) {
    return { kind: 'absolute', abs: raw.slice('jepow-local://'.length) };
  }
  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) {
    return { kind: 'absolute', abs: raw };
  }
  return null;
}

function toAssetRef(category, fileName) {
  const rel = `${ASSET_DIRS[category].replace(/^assets\//, '')}/${fileName}`.replace(/\\/g, '/');
  return `jepow-asset://${ASSET_DIRS[category].split('/').pop()}/${fileName}`;
}

function resolveAssetRef(bundlePath, ref) {
  const decoded = decodeRef(ref);
  if (!decoded) return ref;
  if (decoded.kind === 'absolute') {
    const abs = path.normalize(decoded.abs);
    return fs.existsSync(abs) ? abs : ref;
  }
  const rel = decoded.rel;
  const candidates = [
    path.join(bundlePath, 'assets', rel),
    path.join(bundlePath, rel),
  ];
  for (const c of candidates) {
    const norm = path.normalize(c);
    if (fs.existsSync(norm)) return norm;
  }
  return ref;
}

function ingestAbsolute(bundlePath, absPath, category) {
  const normalized = path.normalize(absPath);
  if (!fs.existsSync(normalized)) return null;
  if (isInsideBundle(bundlePath, normalized)) {
    const relFromAssets = path.relative(path.join(bundlePath, 'assets'), normalized).replace(/\\/g, '/');
    const cat = relFromAssets.split('/')[0];
    const file = relFromAssets.split('/').slice(1).join('/');
    return `jepow-asset://${cat}/${file}`;
  }
  const base = path.basename(normalized);
  const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 10);
  const destName = `${hash}_${base}`;
  const destDir = path.join(bundlePath, ASSET_DIRS[category] || ASSET_DIRS.images);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, destName);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(normalized, dest);
  }
  const catKey = category || 'images';
  return `jepow-asset://${catKey}/${destName}`;
}

const STRING_KEYS = new Set([
  'glbUrl',
  'localAssetPath',
  'nativeScenePath',
  'url',
  'localPreviewUrl',
  'imageUrl',
  'videoUrl',
  'colorUrl',
  'normalUrl',
  'roughnessUrl',
  'metalnessUrl',
]);

function walkAndBundle(value, bundlePath, nodeType, refMap) {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (value.startsWith('blob:') || value.startsWith('data:')) return value;
    if (value.startsWith('http://') || value.startsWith('https://')) return value;
    const decoded = decodeRef(value);
    if (!decoded) return value;
    if (refMap.has(value)) return refMap.get(value);
    if (decoded.kind === 'asset') {
      refMap.set(value, value);
      return value;
    }
    if (decoded.kind === 'absolute' && fs.existsSync(path.normalize(decoded.abs))) {
      const ext = path.extname(decoded.abs);
      const cat = classifyByExt(ext, nodeType);
      const ref = ingestAbsolute(bundlePath, decoded.abs, cat);
      if (ref) {
        refMap.set(value, ref);
        return ref;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => walkAndBundle(v, bundlePath, nodeType, refMap));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (STRING_KEYS.has(k) || typeof v === 'string') {
        out[k] = walkAndBundle(v, bundlePath, nodeType, refMap);
      } else {
        out[k] = walkAndBundle(v, bundlePath, nodeType, refMap);
      }
    }
    return out;
  }
  return value;
}

function bundleCanvasData(bundlePath, data) {
  const refMap = new Map();
  const nodes = (data?.nodes || []).map((node) => {
    const type = node?.type || '';
    const nextData = walkAndBundle(node?.data || {}, bundlePath, type, refMap);
    return { ...node, data: nextData };
  });
  return { ...data, nodes };
}

function resolveCanvasData(bundlePath, data) {
  const resolveValue = (value) => {
    if (value == null) return value;
    if (typeof value === 'string') {
      if (value.startsWith('jepow-asset://')) return resolveAssetRef(bundlePath, value);
      if (value.startsWith('jepow-local://')) {
        return resolveAssetRef(bundlePath, value);
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(resolveValue);
    if (typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = resolveValue(v);
      }
      return out;
    }
    return value;
  };
  const nodes = (data?.nodes || []).map((node) => ({
    ...node,
    data: resolveValue(node?.data || {}),
  }));
  return { ...data, nodes };
}

function readBundle(bundlePath) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile(bundlePath), 'utf8'));
  const canvas = JSON.parse(fs.readFileSync(canvasFile(bundlePath), 'utf8'));
  const data = resolveCanvasData(bundlePath, canvas);
  return { manifest, data };
}

function writeBundle(bundlePath, record) {
  ensureBundleStructure(bundlePath);
  const bundledData = bundleCanvasData(bundlePath, record.data || { nodes: [], edges: [] });
  const now = new Date().toISOString();
  const manifest = {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    name: record.name,
    id: record.id,
    userId: record.userId,
    createdAt: record.createdAt || now,
    updatedAt: now,
    assetDirs: ASSET_DIRS,
  };
  fs.writeFileSync(canvasFile(bundlePath), JSON.stringify(bundledData, null, 2), 'utf8');
  fs.writeFileSync(manifestFile(bundlePath), JSON.stringify(manifest, null, 2), 'utf8');
  return { ...record, data: bundledData, updatedAt: now };
}

function createEmptyBundle(bundlePath, record) {
  const bp = normalizeBundlePath(bundlePath);
  return writeBundle(bp, record);
}

function getAssetDir(bundlePath, category) {
  return path.join(bundlePath, ASSET_DIRS[category] || ASSET_DIRS.images);
}

module.exports = {
  FORMAT_ID,
  FORMAT_VERSION,
  ASSET_DIRS,
  isBundlePath,
  normalizeBundlePath,
  ensureBundleStructure,
  readBundle,
  writeBundle,
  createEmptyBundle,
  resolveAssetRef,
  ingestAbsolute,
  classifyByExt,
  getAssetDir,
  decodeRef,
};
