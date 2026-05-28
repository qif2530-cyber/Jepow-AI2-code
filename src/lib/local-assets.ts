/**
 * Desktop-only local 3D assets (no cloud upload).
 * Cloud API is only for auth, profile, credits, AI generation.
 */

import type { Edge, Node } from '@xyflow/react';
import { AI_ASSET_PREFIX, parseAiAssetRef } from './ai-project-format';
import type { BlendImportGraph, BlendProjectBlueprint } from './blend-project-import';
import { buildBlendProjectGraph } from './blend-project-import';
import { getCurrentProjectId } from './current-project';
import { isCanvasOnlyMode } from './runtime';

export { AI_ASSET_PREFIX, parseAiAssetRef };

function assetsApi() {
  return window.jepowDesktop?.assets;
}

export function shouldUseLocalAssets(): boolean {
  return isCanvasOnlyMode() && !!assetsApi();
}

export async function pickLocalModelFile(): Promise<{
  canceled: boolean;
  filePath: string | null;
}> {
  const api = assetsApi();
  if (!api) return { canceled: true, filePath: null };
  return api.pickModelFile();
}

export async function importLocalModelFile(
  userId: string,
  sourcePath: string,
  options?: { projectId?: string | null; nodeType?: string },
): Promise<{
  ok: boolean;
  localPath?: string;
  fileName?: string;
  assetRef?: string;
  error?: string;
}> {
  const api = assetsApi();
  if (!api) return { ok: false, error: 'local assets API unavailable' };
  const projectId = options?.projectId ?? getCurrentProjectId();
  return api.importFile(userId, sourcePath, projectId, options?.nodeType);
}

export async function saveLocalModelBuffer(
  userId: string,
  fileName: string,
  buffer: ArrayBuffer,
): Promise<{
  ok: boolean;
  localPath?: string;
  fileName?: string;
  assetRef?: string;
  error?: string;
}> {
  const api = assetsApi();
  if (!api) return { ok: false, error: 'local assets API unavailable' };
  const projectId = getCurrentProjectId();
  if (api.saveBufferRaw) {
    return api.saveBufferRaw(userId, fileName, buffer, projectId);
  }
  if (buffer.byteLength > 8 * 1024 * 1024) {
    return {
      ok: false,
      error: '文件过大：请使用「从磁盘选择大场景」或更新桌面端',
    };
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return api.saveBuffer(userId, fileName, base64, projectId);
}

export async function readLocalModelBuffer(
  localPath: string,
): Promise<ArrayBuffer> {
  const api = assetsApi();
  if (!api) throw new Error('local assets API unavailable');
  const res = await api.readBuffer(localPath);
  if (!res.ok || !res.base64) {
    throw new Error(res.error || 'read failed');
  }
  const binary = atob(res.base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out.buffer;
}

/** Prefix stored in node data to mark fully-local asset paths */
export const LOCAL_ASSET_PREFIX = 'jepow-local://';

export function toLocalAssetRef(absolutePath: string): string {
  return `${LOCAL_ASSET_PREFIX}${absolutePath}`;
}

export function parseLocalAssetRef(url: string): string | null {
  if (!url.startsWith(LOCAL_ASSET_PREFIX)) return null;
  return url.slice(LOCAL_ASSET_PREFIX.length);
}

export type IngestedModelNodeData = {
  glbUrl: string;
  nativeScenePath: string;
  localAssetPath: string;
  modelName: string;
  viewportBackend: 'jepow-native' | 'blender';
  localPreviewUrl: '';
  blendSourcePath?: string;
  blendImported?: boolean;
};

export async function pickLocalBlendFile(): Promise<{
  canceled: boolean;
  filePath: string | null;
}> {
  const api = assetsApi();
  if (!api?.pickBlendFile) return { canceled: true, filePath: null };
  return api.pickBlendFile();
}

export async function importBlendProjectFromPath(
  userId: string,
  sourcePath: string,
  options?: { projectId?: string | null },
): Promise<{
  ok: boolean;
  blueprint?: BlendProjectBlueprint;
  error?: string;
}> {
  const api = assetsApi();
  if (!api?.importBlendProject) {
    return { ok: false, error: 'importBlendProject API unavailable' };
  }
  const projectId = options?.projectId ?? getCurrentProjectId();
  const res = await api.importBlendProject(userId, sourcePath, projectId);
  if (!res.ok || !res.blueprint) {
    return { ok: false, error: res.error || 'Blender 工程解析失败' };
  }
  return { ok: true, blueprint: res.blueprint as BlendProjectBlueprint };
}

export async function ingestBlendProjectFile(
  userId: string,
  file: File,
  dropPosition: { x: number; y: number },
): Promise<{
  ok: boolean;
  graph?: BlendImportGraph;
  error?: string;
}> {
  const electronPath =
    typeof file === 'object' && file && 'path' in file
      ? String((file as File & { path?: string }).path || '')
      : '';

  let sourcePath = electronPath;
  if (!sourcePath) {
    const api = assetsApi();
    if (!api?.saveBufferRaw) {
      return { ok: false, error: '无法保存 .blend 文件到本地' };
    }
    const buf = await file.arrayBuffer();
    const saved = await api.saveBufferRaw(
      userId,
      file.name,
      buf,
      getCurrentProjectId(),
      'modelAssetNode',
    );
    if (!saved.ok || !saved.localPath) {
      return { ok: false, error: saved.error || '保存 .blend 失败' };
    }
    sourcePath = saved.localPath;
  }

  const imported = await importBlendProjectFromPath(userId, sourcePath);
  if (!imported.ok || !imported.blueprint) {
    return { ok: false, error: imported.error };
  }
  const graph = buildBlendProjectGraph(imported.blueprint, dropPosition);
  return { ok: true, graph };
}

/** 画布拖入 FBX/GLB 等（含微信临时文件）→ 写入工程 assets/models */
export async function ingestDroppedModelFile(
  userId: string,
  file: File,
): Promise<{ ok: boolean; nodeData?: IngestedModelNodeData; error?: string }> {
  const api = assetsApi();
  if (!api) {
    return { ok: false, error: 'local assets API unavailable' };
  }

  const electronPath =
    typeof file === 'object' && file && 'path' in file
      ? String((file as File & { path?: string }).path || '')
      : '';

  if (electronPath && electronPath.length > 1) {
    const copied = await importLocalModelFile(userId, electronPath, {
      projectId: getCurrentProjectId(),
      nodeType: 'modelAssetNode',
    });
    if (copied.ok && copied.localPath) {
      return {
        ok: true,
        nodeData: {
          glbUrl: copied.assetRef || toLocalAssetRef(copied.localPath),
          nativeScenePath: copied.localPath,
          localAssetPath: copied.localPath,
          modelName: copied.fileName || file.name,
          viewportBackend: 'jepow-native',
          localPreviewUrl: '',
        },
      };
    }
  }

  const buf = await file.arrayBuffer();
  const saved = await saveLocalModelBuffer(userId, file.name, buf);
  if (!saved.ok || !saved.localPath) {
    return { ok: false, error: saved.error || '保存拖入模型失败' };
  }
  return {
    ok: true,
    nodeData: {
      glbUrl: saved.assetRef || toLocalAssetRef(saved.localPath),
      nativeScenePath: saved.localPath,
      localAssetPath: saved.localPath,
      modelName: saved.fileName || file.name,
      viewportBackend: 'jepow-native',
      localPreviewUrl: '',
    },
  };
}

/** Resolve jepow-local or jepow-asset ref; absolute paths pass through. */
export function parseAssetPath(url: string): string | null {
  const local = parseLocalAssetRef(url);
  if (local) return local;
  if (url.startsWith(AI_ASSET_PREFIX)) return url;
  if (/^[a-zA-Z]:[\\/]/.test(url) || url.startsWith('\\\\')) return url;
  return null;
}
