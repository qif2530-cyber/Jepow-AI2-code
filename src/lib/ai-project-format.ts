/** Jepow 主工程格式：.AI 目录包（见 electron/ai-project-bundle.cjs） */

export const AI_PROJECT_EXT = '.AI';
export const AI_PROJECT_FILTER = '.AI';

export const AI_ASSET_CATEGORIES = {
  images: 'assets/images',
  videos: 'assets/videos',
  textures: 'assets/textures',
  models: 'assets/models',
} as const;

export type AiAssetCategory = keyof typeof AI_ASSET_CATEGORIES;

export const AI_ASSET_PREFIX = 'jepow-asset://';

export const AI_CATEGORY_LABELS: Record<AiAssetCategory, string> = {
  images: '生成图片',
  videos: '生成视频',
  textures: '3D 贴图',
  models: '3D 模型',
};

const MODEL_EXTS = new Set(['.glb', '.gltf', '.fbx', '.obj']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v']);
const TEXTURE_EXTS = new Set(['.tga', '.hdr', '.exr', '.dds']);

export function classifyAssetCategory(
  fileName: string,
  nodeType?: string,
): AiAssetCategory {
  const ext = fileName.includes('.')
    ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
    : '';
  if (MODEL_EXTS.has(ext)) return 'models';
  if (VIDEO_EXTS.has(ext)) return 'videos';
  if (TEXTURE_EXTS.has(ext)) return 'textures';
  if (nodeType === 'modelAssetNode' || nodeType === 'threeDEditorNode') return 'models';
  if (nodeType === 'videoShotNode' || nodeType === 'videoProjectNode') return 'videos';
  if (nodeType === 'materialReplaceNode') return 'textures';
  return 'images';
}

export function toAiAssetRef(category: AiAssetCategory, fileName: string): string {
  return `${AI_ASSET_PREFIX}${category}/${fileName}`;
}

export function parseAiAssetRef(url: string): { category: AiAssetCategory; fileName: string } | null {
  if (!url.startsWith(AI_ASSET_PREFIX)) return null;
  const rest = url.slice(AI_ASSET_PREFIX.length).replace(/\\/g, '/');
  const slash = rest.indexOf('/');
  if (slash < 0) return null;
  const category = rest.slice(0, slash) as AiAssetCategory;
  if (!(category in AI_ASSET_CATEGORIES)) return null;
  return { category, fileName: rest.slice(slash + 1) };
}

export function isAiBundlePath(filePath: string): boolean {
  return /\.ai$/i.test(filePath);
}
