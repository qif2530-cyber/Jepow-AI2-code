/** Jepow 自研原生 3D 视口 — 与 AI / LLM HTTP API 完全分离 */

export type ViewportBackend = 'jepow-native' | 'web';

export interface ViewportCapabilities {
  backend: ViewportBackend;
  nativeAvailable: boolean;
  engineVersion?: string;
  engineExecutable?: string | null;
  cpuJobs?: number;
  gpuAdapter?: string;
  supportsBlendImport: boolean;
  supportsLargeScenes: boolean;
  renderEngines: string[];
  message?: string;
}

export interface SceneInfo {
  ok: boolean;
  scenePath?: string;
  extension?: string;
  meshCount?: number;
  nodeCount?: number;
  materialCount?: number;
  cpuJobs?: number;
  error?: string;
}

/** @deprecated alias */
export type BlenderSceneInfo = SceneInfo;

export interface RenderPreviewOptions {
  scenePath: string;
  width?: number;
  height?: number;
}

export interface RenderPreviewResult {
  ok: boolean;
  previewUrl?: string;
  localPath?: string;
  renderer?: string;
  error?: string;
}

export interface ViewportEngine {
  getCapabilities(): Promise<ViewportCapabilities>;
  openScene(scenePath: string): Promise<SceneInfo>;
  renderPreview(opts: RenderPreviewOptions): Promise<RenderPreviewResult>;
  readPreviewDataUrl(previewUrl: string): Promise<string | null>;
  pickSceneFile(): Promise<{ canceled: boolean; filePath: string | null }>;
}
