/** JEP Renderer — Jepow 自研 Rust/wgpu 3D 渲染器，与 AI / LLM HTTP API 完全分离 */

export type ViewportBackend = 'jepow-native' | 'blender' | 'web';
export type JepRenderMode = 'interactive' | 'physical-preview' | 'path-tracing';

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
  /** 与 panX/panY 组成世界空间目标点偏移（相机平面平移） */
  panZ?: number;
  /** Vertical field of view in radians; matches Cycles camera fov. */
  fov?: number;
}

/** JEP 物理灯光描述（与 3D 编辑器光源节点/面板联动） */
export interface ViewportLighting {
  type?: string;
  yaw?: number;
  pitch?: number;
  ambient?: number;
  directional?: number;
  /** Render exposure stop multiplier, CL/OC/RS style camera exposure approximation */
  exposure?: number;
  /** Environment/HDRI contribution for physical render preview */
  environment?: number;
  hdrUrl?: string;
  hdrRotation?: number;
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
  /** CSS hex tint used by the JEP physical preview */
  tint?: string;
  roughness?: number;
  metalness?: number;
  specular?: number;
  clearcoat?: number;
  transmission?: number;
  emissionStrength?: number;
  ior?: number;
  alpha?: number;
}

export interface RenderPreviewOptions {
  scenePath: string;
  /** JEP rendering mode. path-tracing is the target architecture; current runtime may fall back to physical-preview. */
  jepRenderMode?: JepRenderMode;
  width?: number;
  height?: number;
  camera?: ViewportCamera;
  lighting?: ViewportLighting;
  transform?: ViewportObjectTransform;
  material?: ViewportMaterialPreview | null;
  /** Scene outliner object id, e.g. fbx-167 — native viewport draws blue highlight */
  highlightSceneObjectId?: string | null;
  /** Assigned material preview on the highlighted sub-mesh */
  highlightSubmeshMaterialTint?: string;
  highlightSubmeshMaterialRoughness?: number;
  highlightSubmeshMaterialMetalness?: number;
  highlightSubmeshMaterialSpecular?: number;
  highlightSubmeshMaterialClearcoat?: number;
  highlightSubmeshMaterialTransmission?: number;
  highlightSubmeshMaterialEmissionStrength?: number;
  /** Per-object material assignments from scene outliner */
  assignedSubmeshMaterials?: Array<
    ViewportMaterialPreview & { objectId: string }
  >;
  /** clay = JEP interactive clay; render = JEP physical preview/path-tracing target */
  shading?: 'clay' | 'render';
  liveRender?: boolean;
  previewQuality?: 'draft' | 'final';
}

export interface RenderPreviewResult {
  ok: boolean;
  previewUrl?: string;
  previewDataUrl?: string;
  localPath?: string;
  outputPath?: string;
  renderer?: string;
  frameMs?: number;
  renderSeconds?: number;
  daemon?: boolean;
  viewportStats?: {
    fpsWindowCalls?: number;
    daemonWindowCalls?: number;
    fallbackWindowCalls?: number;
    lastFrameMs?: number;
    lastTotalMs?: number;
    lastWidth?: number;
    lastHeight?: number;
  };
  error?: string;
}

export interface CyclesSessionResult extends RenderPreviewResult {
  sessionId?: string;
  status?: 'starting' | 'ready' | 'navigating' | 'converging' | 'rendering' | 'done' | 'error' | 'stopped';
  stage?: 'preview' | 'final' | 'error';
  frameVersion?: number;
  cameraVersion?: number;
  daemonFrameVersion?: number;
  loaded?: boolean;
  frame?: CyclesSessionResult | null;
  mode?: string;
}

export interface ViewportEngine {
  getCapabilities(): Promise<ViewportCapabilities>;
  openScene(scenePath: string): Promise<SceneInfo>;
  renderPreview(opts: RenderPreviewOptions): Promise<RenderPreviewResult>;
  renderCyclesFrame?(opts: RenderPreviewOptions & Record<string, unknown>): Promise<RenderPreviewResult>;
  startCyclesSession?(opts: RenderPreviewOptions & Record<string, unknown>): Promise<CyclesSessionResult>;
  readCyclesSession?(sessionId: string): Promise<CyclesSessionResult>;
  updateCyclesSession?(
    sessionId: string,
    patch: RenderPreviewOptions & Record<string, unknown>,
  ): Promise<CyclesSessionResult>;
  stopCyclesSession?(sessionId: string): Promise<CyclesSessionResult>;
  readPreviewDataUrl(previewUrl: string): Promise<string | null>;
  pickSceneFile(): Promise<{ canceled: boolean; filePath: string | null }>;
}
