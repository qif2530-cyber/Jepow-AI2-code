import { AI_ASSET_PREFIX } from './ai-project-format';
import { parseLocalAssetRef, toLocalAssetRef } from './local-assets';
import { isDesktopApp } from './runtime';

export type ScenePathHints = {
  nativeScenePath?: string;
  localAssetPath?: string;
  glbUrl?: string;
  modelName?: string;
  projectId?: string | null;
};

/** Best-effort path from node fields (sync). */
export function resolveNativeScenePathSync(hints: ScenePathHints): string {
  const direct = (hints.nativeScenePath || hints.localAssetPath || '').trim();
  if (direct) return direct;

  const glb = hints.glbUrl || '';
  if (glb.startsWith(AI_ASSET_PREFIX)) return glb;
  const fromRef = parseLocalAssetRef(glb);
  if (fromRef) return fromRef;

  const url = (hints.glbUrl || '').trim();
  if (/^[a-zA-Z]:[\\/]/.test(url) || url.startsWith('\\\\')) return url;

  return '';
}

export type ResolveSceneResult = {
  ok: boolean;
  scenePath?: string;
  error?: string;
};

/** Ask Electron main to verify file exists and locate by model file name in userData/assets. */
export async function resolveNativeScenePath(
  userId: string,
  hints: ScenePathHints,
): Promise<ResolveSceneResult> {
  if (!isDesktopApp()) {
    const p = resolveNativeScenePathSync(hints);
    return p ? { ok: true, scenePath: p } : { ok: false, error: '非桌面环境' };
  }
  const api = window.jepowDesktop?.assets;
  if (!api?.resolveScenePath) {
    const p = resolveNativeScenePathSync(hints);
    return p ? { ok: true, scenePath: p } : { ok: false, error: '桌面资产 API 不可用' };
  }
  return api.resolveScenePath(userId, hints) as Promise<ResolveSceneResult>;
}

export function scenePathToNodePatch(scenePath: string) {
  return {
    nativeScenePath: scenePath,
    localAssetPath: scenePath,
    glbUrl: toLocalAssetRef(scenePath),
    localPreviewUrl: '',
    viewportBackend: 'jepow-native' as const,
  };
}
