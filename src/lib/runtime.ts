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
      };
    };
  }
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
