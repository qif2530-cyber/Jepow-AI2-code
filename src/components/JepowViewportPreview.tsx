import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Cpu, Move, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import {
  getViewportCapabilities,
  getViewportEngine,
  invalidateViewportCache,
} from "../lib/viewport-engine";
import { invalidateViewportPerformance } from "../lib/viewport-performance";
import { pickSceneObjectAtCursor } from "../lib/scene-object-pick";
import { panCameraByScreenDelta } from "../lib/viewport-camera";
import type {
  ViewportCamera,
  JepRenderMode,
  ViewportLighting,
  ViewportMaterialPreview,
  ViewportObjectTransform,
} from "../lib/viewport-engine/types";
import { fitFilmFrameInContainer } from "../lib/jep-renderer";

function materialToHighlightPayload(mat: ViewportMaterialPreview | null | undefined) {
  if (!mat) return {};
  return {
    highlightSubmeshMaterialTint: mat.tint,
    highlightSubmeshMaterialRoughness: mat.roughness,
    highlightSubmeshMaterialMetalness: mat.metalness,
    highlightSubmeshMaterialSpecular: mat.specular,
    highlightSubmeshMaterialClearcoat: mat.clearcoat,
    highlightSubmeshMaterialTransmission: mat.transmission,
    highlightSubmeshMaterialEmissionStrength: mat.emissionStrength,
  };
}

export type AssignedSubmeshMaterialPreview = ViewportMaterialPreview & {
  objectId: string;
};

function materialToAssignedPayload(mat: ViewportMaterialPreview) {
  return {
    materialTint: mat.tint,
    materialRoughness: mat.roughness,
    materialMetalness: mat.metalness,
    materialSpecular: mat.specular,
    materialClearcoat: mat.clearcoat,
    materialTransmission: mat.transmission,
    materialEmissionStrength: mat.emissionStrength,
  };
}

export type ViewportPreviewMode = "turntable" | "orbit";

interface JepowViewportPreviewProps {
  scenePath: string;
  /** 固定高度；与 fill 二选一 */
  height?: number;
  /** 铺满父容器（3D 编辑器节点） */
  fill?: boolean;
  mode?: ViewportPreviewMode;
  lighting?: ViewportLighting;
  liveRender?: boolean;
  shading?: "clay" | "render";
  jepRenderMode?: JepRenderMode;
  transform?: ViewportObjectTransform;
  material?: ViewportMaterialPreview | null;
  /** 父组件递增以复位相机视角 */
  resetViewToken?: number;
  /** 高性能：大场景也开转台/动态 2K */
  highPerformanceMode?: boolean;
  /** 仅拖拽旋转，禁用平移/滚轮缩放（素材节点） */
  orbitOnly?: boolean;
  /** 初始相机；未指定时用 DEFAULT_CAM */
  defaultCamera?: ViewportCamera;
  /** 由父组件持有的当前视口相机；用于跨预览/Cycles 模式保持同一视窗。 */
  viewCamera?: ViewportCamera;
  /** 锁定首次测量分辨率，避免无限画布缩放触发反复重渲 */
  lockRenderSize?: boolean;
  /** 静态预览最大宽度（3D 编辑器默认 2048） */
  previewMaxWidth?: number;
  /** JEP 渲染设置成片宽度（视口内按此比例 letterbox，离屏渲染对齐画幅） */
  filmFrameWidth?: number;
  /** JEP 渲染设置成片高度 */
  filmFrameHeight?: number;
  /** final 质量时按 previewMaxWidth 离屏渲染（显示更清晰，与容器 CSS 尺寸无关） */
  native2KFinal?: boolean;
  /** Orbit 相机变化时同步给父组件，供 Cycles 使用同一视角。 */
  onCameraChange?: (camera: ViewportCamera) => void;
  onInteractingChange?: (interacting: boolean) => void;
  /**
   * Cycles 模式下叠在路径追踪图之上：容器可交互，白膜图透明，便于旋转/平移/缩放时看到实时反馈。
   */
  ghostOverlay?: boolean;
  /** `fbx-{id}` from scene outliner — highlights sub-mesh in native viewport */
  highlightSceneObjectId?: string | null;
  /** 选中子对象已指定材质时，在视口子网格上预览该 PBR */
  highlightSubmeshMaterial?: ViewportMaterialPreview | null;
  /** 场景集合里按对象指定的材质（可多个，仅作用于对应子网格） */
  assignedSubmeshMaterials?: AssignedSubmeshMaterialPreview[];
  /** 视口单击拾取子对象（小位移视为点击，非拖拽轨道） */
  onSceneObjectPick?: (objectId: string | null) => void;
  sceneObjectNameById?: Record<string, string>;
  onSceneInfo?: (info: {
    meshCount?: number;
    nodeCount?: number;
    triangleCount?: number;
    extension?: string;
  }) => void;
}

const DEFAULT_CAM: ViewportCamera = {
  yaw: 0.55,
  pitch: 0.38,
  distance: 2.45,
  panX: 0,
  panY: 0,
  fov: Math.PI / 4,
};

/** 素材节点默认 45° 展示（弧度） */
export const PREVIEW_CAM_45: ViewportCamera = {
  yaw: Math.PI / 4,
  pitch: 0.38,
  distance: 2.45,
  panX: 0,
  panY: 0,
};

function displayPixelRatio() {
  if (typeof window === "undefined") return 1;
  return Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
}

function computeRenderSize(
  viewportW: number,
  viewportH: number,
  quality: "draft" | "final",
  liveRender: boolean,
  previewMaxWidth = 2048,
  native2KFinal = false,
  filmFrame?: { width: number; height: number },
) {
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  const dpr = displayPixelRatio();
  const hasFilm =
    !!filmFrame && filmFrame.width > 0 && filmFrame.height > 0;
  const aspect = hasFilm
    ? filmFrame.height / filmFrame.width
    : vh / vw;
  const filmW = hasFilm ? filmFrame.width : previewMaxWidth;
  const filmH = hasFilm ? filmFrame.height : Math.round(filmW * aspect);
  const finalCapW = hasFilm
    ? Math.max(640, Math.min(previewMaxWidth, filmW))
    : Math.max(640, Math.min(2048, previewMaxWidth));
  const finalCapH = hasFilm
    ? Math.max(360, Math.round(finalCapW * (filmH / filmW)))
    : Math.round((1536 * finalCapW) / 2048);

  if (quality === "final" && native2KFinal && hasFilm) {
    let w = finalCapW;
    let h = finalCapH;
    return { w, h };
  }

  if (quality === "final" && hasFilm) {
    const displayW = Math.min(filmW, Math.round(vw * dpr));
    let w = Math.max(displayW, finalCapW);
    w = Math.min(w, filmW, previewMaxWidth);
    let h = Math.round(w * aspect);
    if (h > filmH) {
      h = filmH;
      w = Math.max(640, Math.round(h / aspect));
    }
    return { w, h };
  }

  const maxH = quality === "draft" ? 900 : finalCapH;
  if (quality === "final" && native2KFinal) {
    let w = finalCapW;
    let h = Math.round(w * aspect);
    if (h > maxH) {
      h = maxH;
      w = Math.max(640, Math.round(h / aspect));
    }
    return { w, h };
  }

  const draftCapW = hasFilm
    ? Math.min(1280, Math.max(720, Math.round(vw * dpr)))
    : 960;
  const maxW = quality === "draft" ? draftCapW : finalCapW;
  let w =
    quality === "draft"
      ? Math.min(Math.max(Math.round(vw * dpr), 480), maxW)
      : liveRender
        ? maxW
        : Math.min(Math.max(Math.round(vw * dpr), 640), maxW);
  let h = Math.round(w * aspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h / aspect);
  }
  return { w, h };
}

function mapEditorLighting(lighting?: ViewportLighting) {
  const type = lighting?.type;
  const amb = lighting?.ambient ?? 1.0;
  const dir = lighting?.directional ?? 2.0;
  const isEnvironmentOnly = type === "hdr_environment" || type === "hdr";
  return {
    yaw: lighting?.yaw ?? 45,
    pitch: lighting?.pitch ?? 35,
    ambient: 0.38 + amb * 0.22,
    directional: isEnvironmentOnly ? 0 : 0.45 + dir * 0.28,
    exposure: lighting?.exposure ?? 1.0,
    environment: lighting?.environment ?? 1.0,
  };
}

function isPanPointerButton(button: number, shiftKey: boolean, altKey: boolean) {
  return button === 1 || button === 2 || shiftKey || altKey;
}

function cameraChangedForInteractiveFrame(a: ViewportCamera, b: ViewportCamera) {
  return (
    Math.abs((a.yaw ?? 0) - (b.yaw ?? 0)) > 0.002 ||
    Math.abs((a.pitch ?? 0) - (b.pitch ?? 0)) > 0.002 ||
    Math.abs((a.distance ?? 0) - (b.distance ?? 0)) > 0.01 ||
    Math.abs((a.panX ?? 0) - (b.panX ?? 0)) > 0.01 ||
    Math.abs((a.panY ?? 0) - (b.panY ?? 0)) > 0.01 ||
    Math.abs((a.panZ ?? 0) - (b.panZ ?? 0)) > 0.01
  );
}

export function JepowViewportPreview({
  scenePath,
  height = 220,
  fill = false,
  mode = "turntable",
  lighting,
  liveRender = false,
  shading = "clay",
  jepRenderMode,
  transform,
  material,
  resetViewToken = 0,
  highPerformanceMode = false,
  orbitOnly = false,
  defaultCamera,
  viewCamera,
  lockRenderSize = false,
  previewMaxWidth = 2048,
  filmFrameWidth,
  filmFrameHeight,
  native2KFinal = false,
  onCameraChange,
  onInteractingChange,
  onSceneInfo,
  ghostOverlay = false,
  highlightSceneObjectId = null,
  highlightSubmeshMaterial = null,
  assignedSubmeshMaterials = [],
  onSceneObjectPick,
  sceneObjectNameById,
}: JepowViewportPreviewProps) {
  const initialCameraRef = useRef<ViewportCamera>({
    ...(viewCamera ?? defaultCamera ?? DEFAULT_CAM),
  });
  const initialCam = useMemo(
    () => ({ ...(defaultCamera ?? initialCameraRef.current) }),
    [
      defaultCamera?.yaw,
      defaultCamera?.pitch,
      defaultCamera?.distance,
      defaultCamera?.panX,
      defaultCamera?.panY,
      defaultCamera?.panZ,
    ],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const filmFrameRef = useRef<HTMLDivElement>(null);
  const filmActive =
    fill &&
    (filmFrameWidth ?? 0) > 0 &&
    (filmFrameHeight ?? 0) > 0;
  const filmFrameSpec = useMemo(
    () =>
      filmActive
        ? { width: filmFrameWidth!, height: filmFrameHeight! }
        : undefined,
    [filmActive, filmFrameWidth, filmFrameHeight],
  );
  const [filmFrameLayout, setFilmFrameLayout] = useState({
    w: 0,
    h: 0,
    marginX: 0,
    marginY: 0,
    containerW: 0,
    containerH: 0,
  });
  const staticPreviewSize = useRef({ w: 480, h: Math.max(200, height) });
  const [viewportSize, setViewportSize] = useState(() =>
    liveRender
      ? { w: 640, h: fill ? 360 : height }
      : staticPreviewSize.current,
  );
  const staticRendered = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const previewSrcRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setSceneLabel] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [camera, setCamera] = useState<ViewportCamera>({ ...initialCam });
  const cameraRef = useRef(camera);
  const viewCameraRef = useRef<ViewportCamera | undefined>(viewCamera);
  const transformRef = useRef(transform);
  const lightingRef = useRef(lighting);
  const materialRef = useRef(material);
  const onCameraChangeRef = useRef(onCameraChange);
  const highlightRef = useRef(highlightSceneObjectId);
  const highlightSubmeshMaterialRef = useRef(highlightSubmeshMaterial);
  const assignedSubmeshMaterialsRef = useRef(assignedSubmeshMaterials);
  const onSceneInfoRef = useRef(onSceneInfo);
  const pendingParentCameraRef = useRef<ViewportCamera | null>(null);
  const parentCameraNotifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelFinalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastParentCameraNotifyAtRef = useRef(0);
  const ignoreExternalCameraUntilRef = useRef(0);
  const flushParentCameraChange = useCallback((next: ViewportCamera) => {
    pendingParentCameraRef.current = null;
    if (parentCameraNotifyTimerRef.current != null) {
      clearTimeout(parentCameraNotifyTimerRef.current);
      parentCameraNotifyTimerRef.current = null;
    }
    lastParentCameraNotifyAtRef.current = Date.now();
    onCameraChangeRef.current?.(next);
  }, []);
  const scheduleParentCameraChange = useCallback(
    (next: ViewportCamera, defer: boolean) => {
      if (!defer) {
        flushParentCameraChange(next);
        return;
      }
      pendingParentCameraRef.current = next;
      const elapsed = Date.now() - lastParentCameraNotifyAtRef.current;
      if (elapsed >= 90) {
        flushParentCameraChange(next);
        return;
      }
      if (parentCameraNotifyTimerRef.current != null) return;
      parentCameraNotifyTimerRef.current = setTimeout(() => {
        const pending = pendingParentCameraRef.current;
        if (pending) flushParentCameraChange(pending);
      }, Math.max(16, 90 - elapsed));
    },
    [flushParentCameraChange],
  );
  const syncCamera = useCallback(
    (
      next: ViewportCamera,
      opts: { deferParent?: boolean; deferState?: boolean } = {},
    ) => {
      cameraRef.current = next;
      if (!opts.deferState) setCamera(next);
      scheduleParentCameraChange(next, opts.deferParent === true);
    },
    [scheduleParentCameraChange],
  );

  useEffect(() => {
    if (!viewCamera || dragging.current) return;
    if (Date.now() < ignoreExternalCameraUntilRef.current) return;
    const current = cameraRef.current;
    const same =
      Math.abs((current.yaw ?? 0) - (viewCamera.yaw ?? 0)) < 0.0001 &&
      Math.abs((current.pitch ?? 0) - (viewCamera.pitch ?? 0)) < 0.0001 &&
      Math.abs((current.distance ?? 0) - (viewCamera.distance ?? 0)) < 0.0001 &&
      Math.abs((current.panX ?? 0) - (viewCamera.panX ?? 0)) < 0.0001 &&
      Math.abs((current.panY ?? 0) - (viewCamera.panY ?? 0)) < 0.0001 &&
      Math.abs((current.panZ ?? 0) - (viewCamera.panZ ?? 0)) < 0.0001 &&
      Math.abs((current.fov ?? Math.PI / 4) - (viewCamera.fov ?? Math.PI / 4)) < 0.0001;
    if (same) return;
    cameraRef.current = { ...viewCamera };
    setCamera({ ...viewCamera });
  }, [viewCamera]);

  transformRef.current = transform;
  lightingRef.current = lighting;
  materialRef.current = material;
  onCameraChangeRef.current = onCameraChange;
  highlightRef.current = highlightSceneObjectId;
  highlightSubmeshMaterialRef.current = highlightSubmeshMaterial;
  assignedSubmeshMaterialsRef.current = assignedSubmeshMaterials;
  onSceneInfoRef.current = onSceneInfo;
  viewCameraRef.current = viewCamera;

  const turntableYaw = useRef(0);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const renderGen = useRef(0);
  const renderInFlight = useRef(false);
  const lastRenderRequestKey = useRef("");
  const queuedRender = useRef<{
    cam: ViewportCamera;
    silent: boolean;
    quality: "draft" | "final";
  } | null>(null);
  const dragging = useRef<{
    kind: "orbit" | "pan";
    x: number;
    y: number;
    cam: ViewportCamera;
  } | null>(null);
  const sceneOpened = useRef(false);
  const [heavyScene, setHeavyScene] = useState(false);
  const [sceneMetaReady, setSceneMetaReady] = useState(false);
  const lockedRenderSize = useRef<{ w: number; h: number } | null>(null);
  const lastPickRenderSize = useRef({ w: 640, h: 480 });
  const clickStartRef = useRef<{ x: number; y: number } | null>(null);
  const orbitDragActiveRef = useRef(false);
  const pickInFlight = useRef(false);
  const [picking, setPicking] = useState(false);
  const [pickStatus, setPickStatus] = useState<string | null>(null);
  const spacePanRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") spacePanRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spacePanRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!liveRender && !fill) {
      staticPreviewSize.current = { w: 480, h: Math.max(200, height) };
      setViewportSize(staticPreviewSize.current);
      return;
    }
    if (!fill) {
      const w = 640;
      const h = height;
      if (lockRenderSize) {
        if (!lockedRenderSize.current) lockedRenderSize.current = { w, h };
        setViewportSize(lockedRenderSize.current);
      } else {
        setViewportSize({ w, h });
      }
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const applySize = (w: number, h: number) => {
      if (filmActive) {
        lockedRenderSize.current = null;
        setFilmFrameLayout((prev) => ({ ...prev, w, h }));
        setViewportSize({ w, h });
        return;
      }
      if (lockRenderSize) {
        if (!lockedRenderSize.current) {
          lockedRenderSize.current = { w, h };
          setViewportSize({ w, h });
        }
        return;
      }
      setViewportSize({ w, h });
    };
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (filmActive && filmFrameSpec) {
        const fit = fitFilmFrameInContainer(
          r.width,
          r.height,
          filmFrameSpec.width,
          filmFrameSpec.height,
        );
        const w = Math.max(64, Math.round(fit.w));
        const h = Math.max(64, Math.round(fit.h));
        const marginX = Math.max(0, Math.round(fit.marginX));
        const marginY = Math.max(0, Math.round(fit.marginY));
        lockedRenderSize.current = null;
        setFilmFrameLayout({
          w,
          h,
          marginX,
          marginY,
          containerW: Math.max(1, Math.round(r.width)),
          containerH: Math.max(1, Math.round(r.height)),
        });
        setViewportSize({ w, h });
        return;
      }
      const w = Math.max(280, Math.round(r.width));
      const h = Math.max(200, Math.round(r.height));
      if (lockRenderSize) {
        applySize(w, h);
        return;
      }
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => applySize(w, h), 320);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (debounce) clearTimeout(debounce);
    };
  }, [
    fill,
    height,
    liveRender,
    lockRenderSize,
    filmActive,
    filmFrameSpec,
    filmFrameWidth,
    filmFrameHeight,
  ]);

  useEffect(() => {
    if (!fill) return;
    if (filmActive) {
      lockedRenderSize.current = null;
      return;
    }
    if (!lockRenderSize) return;
    lockedRenderSize.current = null;
  }, [scenePath, fill, lockRenderSize, filmActive, filmFrameWidth, filmFrameHeight]);

  const renderWithCamera = useCallback(
    async (
      cam: ViewportCamera,
      silent = false,
      quality: "draft" | "final" = "final",
    ) => {
      if (!scenePath) return;
      if (renderInFlight.current) {
        queuedRender.current = { cam: { ...cam }, silent: true, quality };
        if (!silent) setLoading(true);
        return;
      }
      renderInFlight.current = true;
      queuedRender.current = null;
      const gen = renderGen.current;
      if (!silent) setLoading(true);
      try {
        const eng = getViewportEngine();
        if (!sceneOpened.current) {
          const info = await eng.openScene(scenePath);
          if (info.ok) {
            const tris = info.triangleCount ?? 0;
            const heavy = tris > 80_000;
            setHeavyScene(heavy);
            setSceneLabel(
              `${info.extension?.toUpperCase() || "3D"} · ${info.meshCount ?? 0} 网格 · ${info.nodeCount ?? 0} 节点${heavy && !liveRender ? " · 静态预览" : liveRender ? " · 2K 实时" : ""}`,
            );
            onSceneInfoRef.current?.(info);
          } else if (!silent) {
            setEngineError(info.error || "无法打开场景");
          }
          sceneOpened.current = true;
        }
        const { w: previewW, h: previewH } = computeRenderSize(
          viewportSize.w,
          viewportSize.h,
          quality,
          liveRender,
          previewMaxWidth,
          native2KFinal,
          filmFrameSpec,
        );
        lastPickRenderSize.current = { w: previewW, h: previewH };
        const lit = mapEditorLighting(lightingRef.current);
        const tr = transformRef.current;
        const mat = materialRef.current;
        const assigned = assignedSubmeshMaterialsRef.current;
        const assignedPayload = assigned.map((entry) => ({
          objectId: entry.objectId,
          ...materialToAssignedPayload(entry),
          ...materialToHighlightPayload(entry),
        }));
        const pickHighlightId = highlightRef.current || undefined;
        const singleHighlightPayload = pickHighlightId
          ? materialToHighlightPayload(highlightSubmeshMaterialRef.current)
          : {};
        const requestKey = JSON.stringify({
          scenePath,
          previewW,
          previewH,
          cam,
          lighting: lit,
          transform: tr,
          material: mat,
          shading,
          jepRenderMode,
          liveRender,
          quality,
          highlightSceneObjectId: pickHighlightId,
          highlight: singleHighlightPayload,
          assigned: assignedPayload,
        });
        if (requestKey === lastRenderRequestKey.current && previewSrcRef.current) {
          return;
        }
        lastRenderRequestKey.current = requestKey;
        const result = await eng.renderPreview({
          scenePath,
          width: previewW,
          height: previewH,
          camera: cam,
          lighting: lit,
          transform: tr,
          material: mat,
          jepRenderMode:
            jepRenderMode ||
            (shading === "render" ? "physical-preview" : "interactive"),
          shading,
          liveRender,
          previewQuality: quality,
          highlightSceneObjectId: pickHighlightId,
          ...singleHighlightPayload,
          assignedSubmeshMaterials: assignedPayload,
        });
        if (gen !== renderGen.current) return;
        if (quality === "draft" && cameraChangedForInteractiveFrame(cam, cameraRef.current)) {
          return;
        }
        if (!result.ok || !result.previewUrl) {
          const msg = result.error || "原生视口渲染失败";
          setEngineError(msg);
          previewSrcRef.current = null;
          setPreviewSrc(null);
          return;
        }
        const dataUrl = await eng.readPreviewDataUrl(
          `${result.previewUrl}?t=${Date.now()}`,
        );
        if (gen !== renderGen.current) return;
        if (dataUrl) {
          const img = new Image();
          img.onload = () => {
            if (gen !== renderGen.current) return;
            previewSrcRef.current = dataUrl;
            setPreviewSrc(dataUrl);
            setEngineError(null);
          };
          img.onerror = () => {
            if (gen !== renderGen.current) return;
            setEngineError("无法解码预览图");
          };
          img.src = dataUrl;
        } else {
          setEngineError("无法读取渲染缓存图");
        }
      } catch (e: unknown) {
        if (gen !== renderGen.current) return;
        setEngineError(e instanceof Error ? e.message : "原生视口错误");
      } finally {
        renderInFlight.current = false;
        if (gen === renderGen.current && !silent) setLoading(false);
        const queued = queuedRender.current;
        if (queued && gen === renderGen.current) {
          queuedRender.current = null;
          void renderWithCamera(queued.cam, queued.silent, queued.quality);
        }
      }
    },
    [
      scenePath,
      height,
      heavyScene,
      viewportSize,
      lighting,
      shading,
      jepRenderMode,
      liveRender,
      previewMaxWidth,
      native2KFinal,
      filmFrameSpec,
    ],
  );
  const renderWithCameraRef = useRef(renderWithCamera);
  renderWithCameraRef.current = renderWithCamera;

  const lightingKey = JSON.stringify(lighting ?? {});
  const transformKey = JSON.stringify(transform ?? {});
  const materialKey = JSON.stringify(material ?? {});
  const highlightKey = `${highlightSceneObjectId || ""}:${JSON.stringify(highlightSubmeshMaterial || null)}:${JSON.stringify(assignedSubmeshMaterials || [])}`;

  useEffect(() => {
    if (engineReady !== true || !sceneMetaReady) return;
    const delay = liveRender ? 120 : 0;
    const t = setTimeout(() => {
      staticRendered.current = false;
      void renderWithCamera(cameraRef.current, liveRender, "final");
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lightingKey,
    transformKey,
    materialKey,
    highlightKey,
    shading,
    engineReady,
    sceneMetaReady,
    liveRender,
    viewportSize.w,
    viewportSize.h,
    filmFrameWidth,
    filmFrameHeight,
  ]);

  const lastResetToken = useRef(0);
  useEffect(() => {
    if (
      resetViewToken <= 0 ||
      resetViewToken === lastResetToken.current ||
      engineReady !== true
    ) {
      return;
    }
    lastResetToken.current = resetViewToken;
    const cam = { ...initialCam };
    syncCamera(cam);
    staticRendered.current = false;
    void renderWithCamera(cam, liveRender, "final");
  }, [resetViewToken, engineReady, renderWithCamera, initialCam, liveRender]);

  useEffect(() => {
    sceneOpened.current = false;
    staticRendered.current = false;
    setHeavyScene(false);
    setSceneMetaReady(false);
    renderGen.current += 1;
    renderInFlight.current = false;
    lastRenderRequestKey.current = "";
    invalidateViewportCache();
    invalidateViewportPerformance();
    setEngineReady(null);
    setEngineError(null);
    previewSrcRef.current = null;
    lockedRenderSize.current = null;
    syncCamera({ ...(viewCameraRef.current ?? initialCam) });
    turntableYaw.current = 0;

    getViewportCapabilities(true)
      .then((caps) => {
        setEngineReady(caps.nativeAvailable);
        if (!caps.nativeAvailable) {
          setEngineError(
            caps.message ||
              "请执行 npm run native:build 编译 jepow-engine。",
          );
        }
      })
      .catch((e: unknown) => {
        setEngineReady(false);
        setEngineError(e instanceof Error ? e.message : "引擎检测失败");
      });

    return () => {
      if (animRef.current) clearInterval(animRef.current);
      if (parentCameraNotifyTimerRef.current != null) {
        clearTimeout(parentCameraNotifyTimerRef.current);
        parentCameraNotifyTimerRef.current = null;
      }
      if (wheelFinalTimerRef.current != null) {
        clearTimeout(wheelFinalTimerRef.current);
        wheelFinalTimerRef.current = null;
      }
    };
  }, [scenePath, initialCam]);

  useEffect(() => {
    if (engineReady !== true || !scenePath) return;
    let cancelled = false;
    setSceneMetaReady(false);
    getViewportEngine()
      .openScene(scenePath)
      .then((info) => {
        if (cancelled) return;
        const tris = Number(info.triangleCount ?? 0);
        if (info.ok && tris > 0) {
          setHeavyScene(tris > 80_000);
          setSceneLabel(
            `${info.extension?.toUpperCase() || "3D"} · ${info.meshCount ?? 0} 网格 · ${info.nodeCount ?? 0} 节点${
              orbitOnly
                ? " · 45° 预览"
                : mode === "turntable" && liveRender
                  ? " · 居中慢转"
                  : liveRender
                    ? " · 2K 实时"
                    : " · 静态预览"
            }`,
          );
          onSceneInfoRef.current?.(info);
          setEngineError(null);
          setSceneMetaReady(true);
          return;
        }
        setEngineError(
          info.error ||
            (tris <= 0
              ? "场景中没有可渲染的三角网格（GLB/FBX 可能为空）"
              : "无法打开场景"),
        );
        setSceneMetaReady(false);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setEngineError(e instanceof Error ? e.message : "打开场景失败");
          setSceneMetaReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [engineReady, scenePath]);

  useEffect(() => {
    if (engineReady !== true || !sceneMetaReady) return;

    if (!liveRender) {
      void renderWithCamera({ ...cameraRef.current }, false, "final");
      return undefined;
    }

    if (orbitOnly) {
      syncCamera({ ...initialCam });
      void renderWithCamera({ ...initialCam }, true, "final");
      return undefined;
    }

    if (mode === "turntable") {
      void renderWithCamera({ ...initialCam }, false, "final");
      const allowSpin =
        liveRender && (!heavyScene || highPerformanceMode);
      if (!allowSpin) {
        return undefined;
      }
      const tick = async () => {
        if (renderInFlight.current) return;
        turntableYaw.current += 0.014;
        await renderWithCamera(
          { ...initialCam, yaw: turntableYaw.current },
          true,
          "final",
        );
      };
      const spinMs = highPerformanceMode ? 2600 : 1800;
      animRef.current = setInterval(() => void tick(), spinMs);
      return () => {
        if (animRef.current) clearInterval(animRef.current);
      };
    }

    void renderWithCameraRef.current({ ...cameraRef.current }, liveRender, "final");
    return undefined;
    // Keep this as an initial scene/mode draw only. Lighting and transform changes
    // render through their own effect without resetting the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    engineReady,
    sceneMetaReady,
    heavyScene,
    mode,
    scenePath,
    liveRender,
    highPerformanceMode,
    orbitOnly,
    initialCam,
  ]);

  const wasDraggingRef = useRef(false);
  useEffect(() => {
    if (wasDraggingRef.current && !isDragging && engineReady === true && sceneMetaReady) {
      void renderWithCamera(cameraRef.current, true, "final");
    }
    wasDraggingRef.current = isDragging;
  }, [isDragging, engineReady, sceneMetaReady, renderWithCamera]);

  useEffect(() => {
    const canRenderInteractiveDrag = liveRender || !!onSceneObjectPick;
    if (
      !canRenderInteractiveDrag ||
      engineReady !== true ||
      !sceneMetaReady ||
      mode !== "orbit" ||
      !isDragging
    ) {
      return undefined;
    }
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const interval = heavyScene ? 90 : 50;
      if (now - last >= interval) {
        last = now;
        void renderWithCamera(cameraRef.current, true, "draft");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [
    liveRender,
    onSceneObjectPick,
    engineReady,
    sceneMetaReady,
    mode,
    heavyScene,
    isDragging,
    renderWithCamera,
  ]);

  const tryPickSceneObject = useCallback(
    async (clientX: number, clientY: number) => {
      if (!scenePath || !onSceneObjectPick) return;
      const pickEl =
        filmActive && filmFrameRef.current
          ? filmFrameRef.current
          : containerRef.current;
      if (!pickEl) return;
      if (pickInFlight.current) return;
      const rect = pickEl.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      pickInFlight.current = true;
      setPicking(true);
      try {
        const { w, h } = lastPickRenderSize.current;
        const objectId = await pickSceneObjectAtCursor({
          scenePath,
          clientX,
          clientY,
          containerRect: rect,
          width: w,
          height: h,
          filmFrameFill: filmActive,
          camera: cameraRef.current,
          transform: transformRef.current,
        });
        highlightRef.current = objectId;
        onSceneObjectPick(objectId);
        const label = objectId ? sceneObjectNameById?.[objectId] || objectId : "";
        setPickStatus(objectId ? `选中 ${label}` : "未命中子对象");
        if (objectId) {
          void renderWithCamera(cameraRef.current, true, "final");
        }
      } finally {
        pickInFlight.current = false;
        setPicking(false);
      }
    },
    [scenePath, onSceneObjectPick, renderWithCamera, sceneObjectNameById, filmActive],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode !== "orbit") return;
    if (orbitOnly) return;
    if (!liveRender && !onSceneObjectPick) return;
    e.stopPropagation();
    clickStartRef.current = { x: e.clientX, y: e.clientY };
    orbitDragActiveRef.current = false;
    const panMode =
      !orbitOnly &&
      (spacePanRef.current ||
        isPanPointerButton(e.button, e.shiftKey, e.altKey));
    dragging.current = {
      kind: panMode ? "pan" : "orbit",
      x: e.clientX,
      y: e.clientY,
      cam: {
        ...cameraRef.current,
        distance: cameraRef.current.distance ?? 2.45,
        fov: cameraRef.current.fov ?? Math.PI / 4,
      },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || mode !== "orbit") return;
    const start = clickStartRef.current;
    if (start && !orbitDragActiveRef.current) {
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved > 6) {
        orbitDragActiveRef.current = true;
        setIsDragging(true);
        onInteractingChange?.(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    }
    if (!orbitDragActiveRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - dragging.current.x;
    const dy = e.clientY - dragging.current.y;
    const base = dragging.current.cam;
    const next =
      dragging.current.kind === "orbit"
        ? {
            ...base,
            yaw: (base.yaw ?? 0) - dx * 0.008,
            pitch: Math.max(
              -1.1,
              Math.min(1.1, (base.pitch ?? 0) + dy * 0.006),
            ),
            distance: base.distance ?? 2.45,
            panX: base.panX ?? 0,
            panY: base.panY ?? 0,
            panZ: base.panZ ?? 0,
          }
        : panCameraByScreenDelta(base, dx, dy);
    ignoreExternalCameraUntilRef.current = Date.now() + 700;
    cameraRef.current = next;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.stopPropagation();
    const start = clickStartRef.current;
    clickStartRef.current = null;
    const dx = start ? e.clientX - start.x : 0;
    const dy = start ? e.clientY - start.y : 0;
    const isClick =
      start != null && Math.hypot(dx, dy) < 20 && e.button === 0;
    dragging.current = null;
    const wasDrag = orbitDragActiveRef.current;
    orbitDragActiveRef.current = false;
    setIsDragging(false);
    onInteractingChange?.(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (isClick && !wasDrag && onSceneObjectPick) {
      void tryPickSceneObject(e.clientX, e.clientY);
      return;
    }
    if (mode === "orbit") {
      const finalCamera = cameraRef.current;
      ignoreExternalCameraUntilRef.current = Date.now() + 900;
      setCamera(finalCamera);
      flushParentCameraChange(finalCamera);
      void renderWithCamera(finalCamera, true, "final");
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (orbitOnly || mode !== "orbit" || dragging.current?.kind === "pan") return;
    e.stopPropagation();
    e.preventDefault();
    const next = {
      ...cameraRef.current,
      distance: Math.max(
        0.4,
        Math.min(48, (cameraRef.current.distance ?? 2.45) + e.deltaY * 0.004),
      ),
    };
    ignoreExternalCameraUntilRef.current = Date.now() + 500;
    onInteractingChange?.(true);
    syncCamera(next, { deferParent: true });
    window.setTimeout(() => onInteractingChange?.(false), 160);
    void renderWithCamera(next, true, "draft");
    if (wheelFinalTimerRef.current != null) {
      clearTimeout(wheelFinalTimerRef.current);
    }
    wheelFinalTimerRef.current = setTimeout(() => {
      wheelFinalTimerRef.current = null;
      void renderWithCamera(cameraRef.current, true, "final");
    }, 280);
  };

  if (engineReady !== true) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-amber-950/40 border-2 border-amber-500/60 text-center p-4 ${
          fill ? "absolute inset-0" : "rounded-md"
        }`}
        style={fill ? undefined : { height }}
      >
        <Cpu className="w-9 h-9 text-amber-400" />
        <span className="text-[11px] font-bold text-amber-300">
          {engineReady === null ? "正在检测 JEP 渲染器…" : "JEP 渲染器未编译"}
        </span>
        <p className="text-[10px] text-amber-100/90 leading-relaxed max-w-[270px]">
          {engineError || "需要 jepow-engine"}
        </p>
      </div>
    );
  }

  const shellClass = fill
    ? "absolute inset-0 w-full h-full overflow-hidden bg-black"
    : "relative w-full rounded-md overflow-hidden";
  const shellStyle = fill ? undefined : { height };
  const filmGateReady = filmFrameLayout.w > 0 && filmFrameLayout.h > 0;
  const filmLetterbox =
    filmActive && filmGateReady
      ? {
          top: filmFrameLayout.marginY,
          left: filmFrameLayout.marginX,
          width: filmFrameLayout.w,
          height: filmFrameLayout.h,
          bottom:
            filmFrameLayout.containerH -
            filmFrameLayout.marginY -
            filmFrameLayout.h,
          right:
            filmFrameLayout.containerW -
            filmFrameLayout.marginX -
            filmFrameLayout.w,
        }
      : null;
  const interactionClass =
    (liveRender || onSceneObjectPick || orbitOnly) && mode === "orbit"
      ? "cursor-grab active:cursor-grabbing"
      : "";
  const interactionHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onPointerLeave: onPointerUp,
    onLostPointerCapture: onPointerUp,
    onWheel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  };

  const viewportBody = (
    <>
      {previewSrc ? (
        <img
          src={previewSrc}
          alt="Jepow native viewport"
          className={`block h-full w-full pointer-events-none select-none object-contain transition-opacity duration-75 [user-drag:none] [-webkit-user-drag:none] [image-rendering:auto] ${
            ghostOverlay ? "opacity-100 bg-[#1a1b1e]" : "opacity-100 bg-[#1a1b1e]"
          }`}
          style={{ imageRendering: "auto", WebkitUserDrag: "none" } as React.CSSProperties}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 gap-2 p-3 text-center pointer-events-none">
          {loading ? (
            <RefreshCw className="w-6 h-6 animate-spin text-violet-400" />
          ) : (
            <Cpu className="w-6 h-6 text-neutral-500" />
          )}
          <span className="text-[10px]">{loading ? "JEP 渲染中…" : engineError || "…"}</span>
        </div>
      )}

      {(loading || picking) && mode === "orbit" && (
        <div className="absolute top-14 right-2 pointer-events-none">
          <span className="text-[8px] bg-black/70 text-violet-300 px-1.5 py-0.5 rounded border border-violet-900/40">
            {picking ? "拾取中…" : "渲染中…"}
          </span>
        </div>
      )}

      {assignedSubmeshMaterials.length > 0 && mode === "orbit" && !picking && (
        <div className="absolute top-14 right-2 pointer-events-none">
          <span className="text-[8px] px-1.5 py-0.5 rounded border bg-black/70 text-emerald-200 border-emerald-500/40">
            已赋材质 {assignedSubmeshMaterials.length} 个
          </span>
        </div>
      )}
      {pickStatus && mode === "orbit" && !picking && (
        <div
          className={`absolute pointer-events-none ${
            assignedSubmeshMaterials.length > 0 ? "top-[4.5rem]" : "top-14"
          } right-2`}
        >
          <span
            className={`text-[8px] px-1.5 py-0.5 rounded border bg-black/70 ${
              pickStatus.startsWith("选中") || pickStatus.startsWith("命中")
                ? "text-cyan-200 border-cyan-500/40"
                : "text-amber-200 border-amber-500/40"
            }`}
          >
            {pickStatus}
          </span>
        </div>
      )}

      {mode === "orbit" && !orbitOnly && (
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-x-2 gap-y-0.5 pointer-events-none text-[7px] text-neutral-500 max-w-[220px]">
          <span className="inline-flex items-center gap-1">
            <RotateCw className="w-3 h-3" />
            左键旋转
          </span>
          <span className="inline-flex items-center gap-1">
            <Move className="w-3 h-3" />
            中/右键·Shift 相机平面平移
          </span>
          <span className="opacity-70">滚轮缩放</span>
        </div>
      )}
      {mode === "orbit" && orbitOnly && (
        <div className="absolute bottom-2 left-2 flex gap-1 pointer-events-none text-[7px] text-neutral-500">
          <RotateCw className="w-3 h-3" />
          <span>拖拽旋转</span>
        </div>
      )}

      <div className="absolute bottom-2 right-2 flex gap-1 pointer-events-auto">
        <Button
          type="button"
          size="icon"
          className="h-7 w-7 bg-black/75 border border-neutral-800"
          title="重置视角"
          disabled={loading && mode !== "turntable"}
          onClick={(e) => {
            e.stopPropagation();
            renderGen.current += 1;
            const cam = { ...initialCam };
            syncCamera(cam);
            if (mode === "turntable") turntableYaw.current = 0;
            void renderWithCamera(cam, liveRender || orbitOnly);
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </>
  );

  return (
    <div
      ref={containerRef}
      className={`${shellClass} nodrag nopan nowheel select-none ${
        ghostOverlay
          ? "bg-transparent border-0"
          : filmActive
            ? "bg-black border-0"
            : "bg-neutral-950 border"
      } ${
        !ghostOverlay && !fill
          ? mode === "orbit"
            ? "border-purple-500/50"
            : "border-emerald-500/40"
          : ""
      } ${filmActive ? "" : interactionClass}`}
      style={shellStyle}
      {...(filmActive ? {} : interactionHandlers)}
    >
      {filmActive ? (
        <>
          {filmLetterbox && filmLetterbox.top > 0 ? (
            <div
              className="absolute left-0 right-0 top-0 z-[18] bg-black pointer-events-auto"
              style={{ height: filmLetterbox.top }}
              aria-hidden
            />
          ) : null}
          {filmLetterbox && filmLetterbox.bottom > 0 ? (
            <div
              className="absolute left-0 right-0 z-[18] bg-black pointer-events-auto"
              style={{
                top: filmLetterbox.top + filmLetterbox.height,
                height: filmLetterbox.bottom,
              }}
              aria-hidden
            />
          ) : null}
          {filmLetterbox && filmLetterbox.left > 0 ? (
            <div
              className="absolute z-[18] bg-black pointer-events-auto"
              style={{
                left: 0,
                top: filmLetterbox.top,
                width: filmLetterbox.left,
                height: filmLetterbox.height,
              }}
              aria-hidden
            />
          ) : null}
          {filmLetterbox && filmLetterbox.right > 0 ? (
            <div
              className="absolute z-[18] bg-black pointer-events-auto"
              style={{
                left: filmLetterbox.left + filmLetterbox.width,
                top: filmLetterbox.top,
                width: filmLetterbox.right,
                height: filmLetterbox.height,
              }}
              aria-hidden
            />
          ) : null}
          {filmGateReady && filmLetterbox ? (
            <div
              ref={filmFrameRef}
              className={`absolute z-20 overflow-hidden bg-[#0a0a0a] ring-1 ring-inset ring-cyan-400/45 shadow-[0_0_0_1px_rgba(0,0,0,1)] nodrag nopan nowheel select-none ${interactionClass}`}
              style={{
                left: filmLetterbox.left,
                top: filmLetterbox.top,
                width: filmLetterbox.width,
                height: filmLetterbox.height,
              }}
              {...interactionHandlers}
            >
              {viewportBody}
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 pointer-events-none rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-mono text-cyan-200/95 border border-cyan-800/60">
                {filmFrameWidth}×{filmFrameHeight}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        viewportBody
      )}
    </div>
  );
}
