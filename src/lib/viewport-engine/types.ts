/** Jepow 自研原生 3D 视口 — 与 AI / LLM HTTP API 完全分离 */

export type ViewportBackend = 'jepow-native' | 'blender' | 'web';

/** Offline GPL renderer id when jepow-cycles is bundled */
export type OfflineRenderEngine = 'cycles-gpl';

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
  triangleCount?: number;
  cpuJobs?: number;
  error?: string;
}

/** @deprecated alias */
export type BlenderSceneInfo = SceneInfo;

export interface ViewportCamera {
  yaw?: number;
  pitch?: number;
  distance?: number;
  panX?: number;
  panY?: number;
}

/** 原生 wgpu 白膜光照（与 3D 编辑器光源面板联动） */
export interface ViewportLighting {
  yaw?: number;
  pitch?: number;
  ambient?: number;
  directional?: number;
}

export interface ViewportObjectTransform {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  scale?: number;
}

export interface ViewportMaterialPreview {
  /** CSS hex tint used by the native clay/PBR-lite preview */
  tint?: string;
  roughness?: number;
  metalness?: number;
}

export interface RenderPreviewOptions {
  scenePath: string;
  width?: number;
  height?: number;
  camera?: ViewportCamera;
  lighting?: ViewportLighting;
  transform?: ViewportObjectTransform;
  material?: ViewportMaterialPreview | null;
  /** clay = Blender 白模视口；render = 更重光照（开渲染器） */
  shading?: 'clay' | 'render';
  liveRender?: boolean;
  previewQuality?: 'draft' | 'final';
}

export interface RenderPreviewResult {
  ok: boolean;
  previewUrl?: string;
  localPath?: string;
  renderer?: string;
  frameMs?: number;
  daemon?: boolean;
  error?: string;
}

export interface ViewportEngine {
  getCapabilities(): Promise<ViewportCapabilities>;
  openScene(scenePath: string): Promise<SceneInfo>;
  renderPreview(opts: RenderPreviewOptions): Promise<RenderPreviewResult>;
  readPreviewDataUrl(previewUrl: string): Promise<string | null>;
  pickSceneFile(): Promise<{ canceled: boolean; filePath: string | null }>;
}
