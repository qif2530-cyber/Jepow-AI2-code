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
      message: 'WebGL 回退预览。请编译 jepow-engine 启用自研原生视口。',
    };
  },

  async openScene(): Promise<SceneInfo> {
    return { ok: false, error: '需要 Jepow 原生引擎（npm run native:build）' };
  },

  async renderPreview(): Promise<RenderPreviewResult> {
    return { ok: false, error: '需要 Jepow 原生引擎' };
  },

  async readPreviewDataUrl() {
    return null;
  },

  async pickSceneFile() {
    return { canceled: true, filePath: null };
  },
};
