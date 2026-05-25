const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function extFromUrl(url) {
  if (typeof url !== 'string') return '.png';
  const m = url.match(/\.(png|jpe?g|webp|exr|hdr|tiff?)(\?|$)/i);
  return m ? `.${m[1].toLowerCase().replace('jpeg', 'jpg')}` : '.png';
}

function normalizeLocalPath(url) {
  if (!url || typeof url !== 'string') return '';
  let raw = url.trim();
  if (raw.startsWith('jepow-local://')) raw = raw.slice('jepow-local://'.length);
  if (raw.startsWith('file://')) {
    try {
      return decodeURIComponent(new URL(raw).pathname);
    } catch {
      return raw.replace('file://', '');
    }
  }
  return raw;
}

/**
 * 将 blob/http/本地路径转为相对 scene XML 的 filename（复制到 cacheDir/textures）。
 */
function stageTextureFilename(url, cacheDir, id) {
  if (!url || typeof url !== 'string') return '';
  const texDir = path.join(cacheDir, 'textures');
  fs.mkdirSync(texDir, { recursive: true });
  const ext = extFromUrl(url);
  const dest = path.join(texDir, `${id}${ext}`);

  const local = normalizeLocalPath(url);
  if (local && fs.existsSync(local)) {
    fs.copyFileSync(local, dest);
    return path.join('textures', path.basename(dest));
  }

  if (url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) {
    return '';
  }

  if (fs.existsSync(url)) {
    fs.copyFileSync(url, dest);
    return path.join('textures', path.basename(dest));
  }

  return '';
}

function stageShaderGraphTextures(shaderGraph, cacheDir) {
  if (!shaderGraph?.nodes?.length) return shaderGraph;
  let i = 0;
  const nodes = shaderGraph.nodes.map((node) => {
    if (node.type !== 'image_texture') return node;
    const url = node.params?.filename;
    if (!url || typeof url !== 'string') return node;
    const rel = stageTextureFilename(url, cacheDir, `tex_${i++}`);
    if (!rel) return node;
    return { ...node, params: { ...node.params, filename: rel } };
  });
  return { ...shaderGraph, nodes };
}

module.exports = { stageTextureFilename, stageShaderGraphTextures, normalizeLocalPath };
