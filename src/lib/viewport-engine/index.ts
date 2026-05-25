import { isDesktopApp } from '../runtime';
import { jepowNativeViewportEngine } from './jepow-native-engine';
import type { ViewportCapabilities, ViewportEngine } from './types';
import { webViewportEngine } from './web-engine';

export * from './types';

let cachedEngine: ViewportEngine | null = null;
let cachedCaps: ViewportCapabilities | null = null;

export function getViewportEngine(): ViewportEngine {
  if (!isDesktopApp() || !window.jepowDesktop?.viewport) {
    return webViewportEngine;
  }
  if (!cachedEngine) {
    cachedEngine = jepowNativeViewportEngine;
  }
  return cachedEngine;
}

export async function getViewportCapabilities(
  forceRefresh = false,
): Promise<ViewportCapabilities> {
  if (!forceRefresh && cachedCaps) return cachedCaps;
  const caps = await getViewportEngine().getCapabilities();
  cachedCaps = caps;
  return caps;
}

export function invalidateViewportCache() {
  cachedCaps = null;
}

export function isNativeScenePath(filePathOrName: string): boolean {
  return /\.(glb|gltf|fbx|obj)$/i.test(filePathOrName);
}
