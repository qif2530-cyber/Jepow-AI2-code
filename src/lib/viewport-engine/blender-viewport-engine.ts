/**
 * 桌面 3D 视口 — 仅 Blender 后台（预览 + Cycles），不使用 WebGL / jepow-engine / jepow-cycles。
 */
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

export const blenderViewportEngine: ViewportEngine = {
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
    const blenderAvailable = !!status.blenderAvailable;
    return {
      backend: blenderAvailable ? 'blender' : 'web',
      nativeAvailable: blenderAvailable,
      supportsBlendImport: blenderAvailable,
      supportsLargeScenes: blenderAvailable,
      renderEngines: Array.isArray(status.renderEngines)
        ? (status.renderEngines as string[])
        : blenderAvailable
          ? ['blender-viewport', 'blender-cycles']
          : [],
      message:
        (status.message as string) ||
        (blenderAvailable
          ? 'Blender 原生视口 + Cycles（与 Blender 内一致）'
          : '请安装 Blender 或设置 JEPOW_BLENDER_PATH'),
      engineExecutable: (status.blender as { executable?: string })?.executable,
    };
  },

  async openScene(scenePath: string): Promise<BlenderSceneInfo> {
    const api = vp();
    if (!api?.openScene) return { ok: false, error: 'viewport API 不可用' };
    return api.openScene(scenePath) as unknown as Promise<BlenderSceneInfo>;
  },

  async renderPreview(opts: RenderPreviewOptions): Promise<RenderPreviewResult> {
    const api = vp();
    if (!api?.renderPreview) return { ok: false, error: 'viewport API 不可用' };
    const cam = opts.camera;
    const lit = opts.lighting;
    const tr = opts.transform;
    const engine =
      opts.shading === 'render' ? 'cycles' : opts.shading === 'clay' ? 'eevee' : 'eevee';
    const result = (await api.renderPreview({
      scenePath: opts.scenePath,
      width: opts.width,
      height: opts.height,
      engine,
      cameraYaw: cam?.yaw,
      cameraPitch: cam?.pitch,
      cameraDistance: cam?.distance,
      panX: cam?.panX,
      panY: cam?.panY,
      lightYaw: lit?.yaw,
      lightPitch: lit?.pitch,
      lightAmbient: lit?.ambient,
      lightDiffuse: lit?.directional,
      x: tr?.x,
      y: tr?.y,
      z: tr?.z,
      rx: tr?.rx,
      ry: tr?.ry,
      rz: tr?.rz,
      scale: tr?.scale,
      liveRender: opts.liveRender,
      previewQuality: opts.previewQuality,
    })) as unknown as RenderPreviewResult;
    if (result.ok && result.previewUrl && !result.previewDataUrl) {
      const dataUrl = await api.readPreview(result.previewUrl);
      if (dataUrl) return { ...result, previewDataUrl: dataUrl };
    }
    return result;
  },

  async renderCyclesFrame(
    opts: RenderPreviewOptions & Record<string, unknown>,
  ): Promise<RenderPreviewResult> {
    const api = vp();
    if (!api) return { ok: false, error: 'viewport API 不可用' };

    const blendPath = String(opts.blendPath || opts.blendSourcePath || '');
    const scenePath = String(opts.scenePath || '');
    const useBlend = /\.blend$/i.test(blendPath);

    const cam = opts.camera as Record<string, unknown> | undefined;
    const settings = (opts.renderSettings || opts.cyclesRenderSettings || {}) as Record<
      string,
      unknown
    >;

    if (useBlend && api.renderBlenderCycles) {
      let res = (await api.renderBlenderCycles({
        blendPath,
        width: opts.width ?? settings.width,
        height: opts.height ?? settings.height,
        samples: opts.samples ?? settings.samples,
        useGpu: opts.device !== 'CPU',
      })) as unknown as RenderPreviewResult;
      if (res.ok && res.previewUrl && !res.previewDataUrl) {
        const dataUrl = await api.readPreview(res.previewUrl);
        if (dataUrl) res = { ...res, previewDataUrl: dataUrl };
      }
      return res;
    }

    if (!api.renderPreview) {
      return { ok: false, error: 'Blender renderPreview 不可用' };
    }
    let res = (await api.renderPreview({
      scenePath: scenePath || blendPath,
      width: opts.width,
      height: opts.height,
      engine: 'cycles',
      samples: opts.samples ?? settings.samples ?? 32,
      cameraYaw: cam?.yaw,
      cameraPitch: cam?.pitch,
      cameraDistance: cam?.distance,
      panX: cam?.panX,
      panY: cam?.panY,
      useGpu: opts.device !== 'CPU',
    })) as unknown as RenderPreviewResult;
    if (res.ok && res.previewUrl && !res.previewDataUrl) {
      const dataUrl = await api.readPreview(res.previewUrl);
      if (dataUrl) res = { ...res, previewDataUrl: dataUrl };
    }
    return { ...res, renderer: 'blender-cycles' };
  },

  async startCyclesSession(
    opts: RenderPreviewOptions & Record<string, unknown>,
  ): Promise<CyclesSessionResult> {
    const api = vp();
    if (!api?.startCyclesSession) {
      return { ok: false, error: 'Blender Cycles session API 不可用' };
    }
    return api.startCyclesSession(opts) as unknown as Promise<CyclesSessionResult>;
  },

  async readCyclesSession(sessionId: string) {
    const api = vp();
    if (!api?.readCyclesSession) {
      return { ok: false, error: 'session API 不可用' };
    }
    return api.readCyclesSession(sessionId) as unknown as Promise<CyclesSessionResult>;
  },

  async updateCyclesSession(sessionId: string, patch: Record<string, unknown>) {
    const api = vp();
    if (!api?.updateCyclesSession) {
      return { ok: false, error: 'session API 不可用', sessionId };
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
    if (!api?.readPreview) return null;
    return api.readPreview(previewUrl);
  },

  async pickSceneFile() {
    const api = vp();
    if (!api?.pickSceneFile) return { canceled: true, filePath: null };
    return api.pickSceneFile();
  },
};
