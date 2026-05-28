/** Shared client runtime: web (jepow.com) vs Electron canvas-only desktop */

import type { CloudProject } from '../types';
import type { LocalProjectRecord } from './local-projects';

declare global {
  interface Window {
    jepowDesktop?: {
      version: string;
      platform: NodeJS.Platform;
      webUrl: string;
      openWeb?: (url: string) => void;
      onAuth?: (
        cb: (data: { token: string; user: Record<string, unknown> }) => void,
      ) => void;
      projects?: {
        list: (userId: string) => Promise<CloudProject[]>;
        read: (userId: string, id: string) => Promise<LocalProjectRecord | null>;
        write: (userId: string, record: LocalProjectRecord) => Promise<CloudProject>;
        remove: (userId: string, id: string) => Promise<void>;
        rename: (userId: string, id: string, name: string) => Promise<void>;
        pickSavePath: (
          userId: string,
          defaultName?: string,
        ) => Promise<{ canceled: boolean; filePath: string | null }>;
        pickDirectory: () => Promise<string | null>;
        createAtPath: (
          userId: string,
          name: string,
          filePath: string,
        ) => Promise<{
          meta: CloudProject;
          record: LocalProjectRecord;
          error?: string;
        }>;
      };
      viewport?: {
        getStatus: () => Promise<Record<string, unknown>>;
        pickSceneFile: () => Promise<{ canceled: boolean; filePath: string | null }>;
        openScene: (scenePath: string) => Promise<Record<string, unknown>>;
        sceneInfo: (scenePath: string) => Promise<Record<string, unknown>>;
        renderPreview: (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
        renderCyclesFrame?: (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
        startCyclesSession?: (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
        readCyclesSession?: (sessionId: string) => Promise<Record<string, unknown>>;
        updateCyclesSession?: (
          sessionId: string,
          patch: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
        stopCyclesSession?: (sessionId: string) => Promise<Record<string, unknown>>;
        readPreview: (previewUrl: string) => Promise<string | null>;
        renderBlenderCycles?: (opts: Record<string, unknown>) => Promise<Record<string, unknown>>;
        getBlenderStatus?: () => Promise<Record<string, unknown>>;
      };
      assets?: {
        pickModelFile: () => Promise<{ canceled: boolean; filePath: string | null }>;
        pickBlendFile?: () => Promise<{ canceled: boolean; filePath: string | null }>;
        importBlendProject?: (
          userId: string,
          sourcePath: string,
          projectId?: string | null,
        ) => Promise<{
          ok: boolean;
          blueprint?: Record<string, unknown>;
          error?: string;
        }>;
        importFile: (
          userId: string,
          sourcePath: string,
          projectId?: string | null,
          nodeType?: string,
        ) => Promise<{
          ok: boolean;
          localPath?: string;
          fileName?: string;
          assetRef?: string;
          category?: string;
          error?: string;
        }>;
        saveBuffer: (
          userId: string,
          fileName: string,
          base64: string,
          projectId?: string | null,
          nodeType?: string,
        ) => Promise<{
          ok: boolean;
          localPath?: string;
          fileName?: string;
          assetRef?: string;
          error?: string;
        }>;
        saveBufferRaw: (
          userId: string,
          fileName: string,
          arrayBuffer: ArrayBuffer,
          projectId?: string | null,
          nodeType?: string,
        ) => Promise<{
          ok: boolean;
          localPath?: string;
          fileName?: string;
          assetRef?: string;
          error?: string;
        }>;
        readBuffer: (localPath: string) => Promise<{
          ok: boolean;
          base64?: string;
          byteLength?: number;
          error?: string;
        }>;
        resolveScenePath: (
          userId: string,
          hints: {
            nativeScenePath?: string;
            localAssetPath?: string;
            glbUrl?: string;
            modelName?: string;
            projectId?: string | null;
          },
        ) => Promise<{ ok: boolean; scenePath?: string; error?: string }>;
      };
    };
  }
}

/** Desktop: 3D 工程、模型、视口数据均在本地；仅下列能力走云端 API */
export function isRemoteCloudApiPath(apiPath: string): boolean {
  const p = apiPath.replace(/^\/api\/?/, '/');
  const remotePrefixes = [
    '/user/',
    '/auth/',
    '/site-config',
    '/admin/config',
    '/ai/',
    '/gemini/',
    '/kling/',
    '/recharge',
    '/credits',
    '/messages',
    '/community',
  ];
  if (remotePrefixes.some((prefix) => p.startsWith(prefix))) return true;
  if (p.startsWith('/upload') && !shouldUseLocalCanvasAssets()) return true;
  return false;
}

/** 桌面画布：模型/场景文件存 userData，不上传服务器 */
export function shouldUseLocalCanvasAssets(): boolean {
  return isCanvasOnlyMode();
}

export const JEPOW_WEB_ORIGIN =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_JEPOW_WEB_ORIGIN) ||
  'https://jepow.com';

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && !!window.jepowDesktop;
}

/** Desktop build: infinite canvas only; account/recharge/admin live on the website */
export function isCanvasOnlyMode(): boolean {
  return isDesktopApp();
}

/** Infinite canvas is only available in the installed desktop app */
export function canUseInfiniteCanvas(): boolean {
  return isCanvasOnlyMode();
}

/** Canvas projects are stored on the user's machine, not on jepow.com servers */
export function shouldStoreProjectsLocally(): boolean {
  return isCanvasOnlyMode();
}

export function isDesktopLoginOnWeb(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('desktop') === '1';
}

export function getDesktopLoginUrl(): string {
  return `${getJepowWebOrigin()}/?desktop=1`;
}

export async function startDesktopBrowserLogin(): Promise<void> {
  const url = getDesktopLoginUrl();
  if (window.jepowDesktop?.openWeb) {
    await window.jepowDesktop.openWeb(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** After web login, pass session back to the desktop app */
export function redirectDesktopAuthCallback(token: string, user: unknown): void {
  const payload = btoa(
    encodeURIComponent(JSON.stringify({ token, user })),
  );
  window.location.href = `jepow://auth?payload=${payload}`;
}

export function getJepowWebOrigin(): string {
  if (isDesktopApp() && window.jepowDesktop?.webUrl) {
    return window.jepowDesktop.webUrl.replace(/\/$/, '');
  }
  if (isDesktopApp()) return JEPOW_WEB_ORIGIN.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return JEPOW_WEB_ORIGIN.replace(/\/$/, '');
}

/** Local shell origin (Electron static/dev server) */
export function getShellOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

/** API + Socket.IO + AI proxies — website in desktop mode, same-origin on web */
export function getAppOrigin(): string {
  return isCanvasOnlyMode() ? getJepowWebOrigin() : getShellOrigin() || getJepowWebOrigin();
}

export function getApiBaseUrl(): string {
  return `${getAppOrigin()}/api`;
}

/** Turn site-relative media paths (/api/media/…) into absolute URLs (required in Electron shell) */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url || !String(url).trim()) return null;
  const u = String(url).trim();
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  const base = getAppOrigin().replace(/\/$/, '');
  if (u.startsWith('/')) return `${base}${u}`;
  return `${base}/${u}`;
}

export function dicebearAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
}

export async function openJepowWeb(path = '/'): Promise<void> {
  const base = getJepowWebOrigin();
  const url = path.startsWith('http')
    ? path
    : `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (window.jepowDesktop?.openWeb) {
    window.jepowDesktop.openWeb(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Views that belong on jepow.com, not in the desktop canvas app */
export const DESKTOP_WEB_PATHS: Record<string, string> = {
  admin: '/',
  credits: '/',
  messages: '/',
  profile: '/',
  post: '/',
  activity: '/',
};
