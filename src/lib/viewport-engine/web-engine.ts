import type {
  RenderPreviewOptions,
  RenderPreviewResult,
  SceneInfo,
  ViewportCapabilities,
  ViewportEngine,
} from './types';

/** WebGL (Three.js) — 仅作兼容回退，非专业视口内核 */
export const webViewportEngine: ViewportEngine = {
  async getCapabilities(): Promise<ViewportCapabilities> {
    return {
      backend: 'web',
      nativeAvailable: false,
      supportsBlendImport: false,
      supportsLargeScenes: false,
      renderEngines: [],
      message: '浏览器环境请使用 Jepow 桌面端（jepow-engine + jepow-cycles）。',
    };
  },

  async openScene(): Promise<SceneInfo> {
    return { ok: false, error: '需要 Jepow 桌面端（npm run native:build）' };
  },

  async renderPreview(): Promise<RenderPreviewResult> {
    return { ok: false, error: '需要 Jepow 桌面端（npm run native:build）' };
  },

  async readPreviewDataUrl() {
    return null;
  },

  async pickSceneFile() {
    return { canceled: true, filePath: null };
  },
};
