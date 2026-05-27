import type {
  BlenderSceneInfo,
  CyclesSessionResult,
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
      engineVersion: (status.version as string) || undefined,
      engineExecutable: status.executable as string | null | undefined,
      cpuJobs: status.cpuJobs as number | undefined,
      gpuAdapter:
        (status.gpu as { adapter_name?: string })?.adapter_name ||
        (status.gpuAdapter as string | undefined),
      supportsBlendImport: false,
      supportsLargeScenes: available,
      renderEngines: Array.isArray(status.renderEngines)
        ? (status.renderEngines as string[])
        : available
          ? ['jepow-viewport']
          : [],
      message:
        (status.message as string) ||
        (available
          ? 'Jepow 原生引擎（FBX 规则对齐 Blender）'
          : '请执行 npm run native:build'),
    };
  },

  async openScene(scenePath: string): Promise<BlenderSceneInfo> {
    const api = vp();
    if (!api?.openScene) return { ok: false, error: 'viewport API 不可用' };
    return api.openScene(scenePath) as unknown as Promise<BlenderSceneInfo>;
  },

  async renderPreview(opts: RenderPreviewOptions): Promise<RenderPreviewResult> {
    const api = vp();
    if (!api) return { ok: false, error: 'viewport API 不可用' };
    const cam = opts.camera;
    const lit = opts.lighting;
    const tr = opts.transform;
    const mat = opts.material;
    return api.renderPreview({
      scenePath: opts.scenePath,
      width: opts.width,
      height: opts.height,
      cameraYaw: cam?.yaw,
      cameraPitch: cam?.pitch,
      cameraDistance: cam?.distance,
      cameraFov: cam?.fov,
      panX: cam?.panX,
      panY: cam?.panY,
      lightYaw: lit?.yaw,
      lightPitch: lit?.pitch,
      lightAmbient: lit?.ambient,
      lightDiffuse: lit?.directional,
      lightExposure: lit?.exposure,
      environmentIntensity: lit?.environment,
      x: tr?.x,
      y: tr?.y,
      z: tr?.z,
      rx: tr?.rx,
      ry: tr?.ry,
      rz: tr?.rz,
      scale: tr?.scale,
      materialTint: mat?.tint,
      materialRoughness: mat?.roughness,
      materialMetalness: mat?.metalness,
      materialSpecular: mat?.specular,
      materialClearcoat: mat?.clearcoat,
      materialTransmission: mat?.transmission,
      materialEmissionStrength: mat?.emissionStrength,
      shading: opts.shading,
      liveRender: opts.liveRender,
      previewQuality: opts.previewQuality,
    }) as unknown as Promise<RenderPreviewResult>;
  },

  async renderCyclesFrame(
    opts: RenderPreviewOptions & Record<string, unknown>,
  ): Promise<RenderPreviewResult> {
    const api = vp();
    if (!api?.renderCyclesFrame) {
      return { ok: false, error: 'Cycles renderer API 不可用' };
    }
    return api.renderCyclesFrame(opts) as unknown as Promise<RenderPreviewResult>;
  },

  async startCyclesSession(opts: RenderPreviewOptions & Record<string, unknown>) {
    const api = vp();
    if (!api?.startCyclesSession) {
      return { ok: false, error: 'Cycles session API 不可用' };
    }
    return api.startCyclesSession(opts) as unknown as Promise<CyclesSessionResult>;
  },

  async readCyclesSession(sessionId: string) {
    const api = vp();
    if (!api?.readCyclesSession) {
      return { ok: false, error: 'Cycles session API 不可用' };
    }
    return api.readCyclesSession(sessionId) as unknown as Promise<CyclesSessionResult>;
  },

  async updateCyclesSession(
    sessionId: string,
    patch: RenderPreviewOptions & Record<string, unknown>,
  ) {
    const api = vp();
    if (!api?.updateCyclesSession) {
      return { ok: false, error: 'Cycles update API 不可用', sessionId };
    }
    return api.updateCyclesSession(sessionId, patch) as unknown as Promise<CyclesSessionResult>;
  },

  async stopCyclesSession(sessionId: string) {
    const api = vp();
    if (!api?.stopCyclesSession) {
      return { ok: true, sessionId, stopped: true };
    }
    return api.stopCyclesSession(sessionId) as unknown as Promise<CyclesSessionResult>;
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
