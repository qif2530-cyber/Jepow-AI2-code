/**
 * Desktop-only local 3D assets (no cloud upload).
 * Cloud API is only for auth, profile, credits, AI generation.
 */

import { isCanvasOnlyMode } from './runtime';

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
): Promise<{ ok: boolean; localPath?: string; fileName?: string; error?: string }> {
  const api = assetsApi();
  if (!api) return { ok: false, error: 'local assets API unavailable' };
  return api.importFile(userId, sourcePath);
}

export async function saveLocalModelBuffer(
  userId: string,
  fileName: string,
  buffer: ArrayBuffer,
): Promise<{ ok: boolean; localPath?: string; fileName?: string; error?: string }> {
  const api = assetsApi();
  if (!api) return { ok: false, error: 'local assets API unavailable' };
  if (api.saveBufferRaw) {
    return api.saveBufferRaw(userId, fileName, buffer);
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
  return api.saveBuffer(userId, fileName, base64);
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
