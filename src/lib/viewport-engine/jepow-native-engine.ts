import type {
  BlenderSceneInfo,
  RenderPreviewOptions,
  RenderPreviewResult,
  ViewportCapabilities,
  ViewportEngine,
} from './types';

function vp() {
  return window.jepowDesktop?.viewport;
}

export const jepowNativeViewportEngine: ViewportEngine = {
  async getCapabilities(): Promise<ViewportCapabilities> {
    const api = vp();
    if (!api) {
      return {
        backend: 'web',
        nativeAvailable: false,
        supportsBlendImport: false,
        supportsLargeScenes: false,
        renderEngines: [],
        message: '非桌面环境',
      };
    }
    const status = (await api.getStatus()) as Record<string, unknown>;
    const available = !!status.available;
    return {
      backend: available ? 'jepow-native' : 'web',
      nativeAvailable: available,
      engineVersion: status.version as string | undefined,
      engineExecutable: status.executable as string | null | undefined,
      cpuJobs: status.cpuJobs as number | undefined,
      gpuAdapter: (status.gpu as { adapter_name?: string })?.adapter_name,
      supportsBlendImport: false,
      supportsLargeScenes: available,
      renderEngines: available ? ['jepow-realtime', 'jepow-path'] : [],
      message: available
        ? `Jepow 原生引擎 ${status.version || ''} · CPU×${status.cpuJobs || '?'} · GPU ${(status.gpu as { adapter_name?: string })?.adapter_name || 'detecting'}`
        : '请执行 npm run native:build 编译自研 3D 内核',
    };
  },

  async openScene(scenePath: string): Promise<BlenderSceneInfo> {
    const api = vp();
    if (!api?.openScene) return { ok: false, error: 'viewport API 不可用' };
    return api.openScene(scenePath) as Promise<BlenderSceneInfo>;
  },

  async renderPreview(opts: RenderPreviewOptions): Promise<RenderPreviewResult> {
    const api = vp();
    if (!api) return { ok: false, error: 'viewport API 不可用' };
    const cam = opts.camera;
    return api.renderPreview({
      scenePath: opts.scenePath,
      width: opts.width,
      height: opts.height,
      cameraYaw: cam?.yaw,
      cameraPitch: cam?.pitch,
      cameraDistance: cam?.distance,
      panX: cam?.panX,
      panY: cam?.panY,
    }) as Promise<RenderPreviewResult>;
  },

  async readPreviewDataUrl(previewUrl: string) {
    const api = vp();
    if (!api) return null;
    return api.readPreview(previewUrl);
  },

  async pickSceneFile() {
    const api = vp();
    if (!api?.pickSceneFile) return { canceled: true, filePath: null };
    return api.pickSceneFile();
  },
};
