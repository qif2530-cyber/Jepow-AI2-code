import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Cpu, Move, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import {
  getViewportCapabilities,
  getViewportEngine,
  invalidateViewportCache,
} from "../lib/viewport-engine";
import { invalidateViewportPerformance } from "../lib/viewport-performance";
import type {
  ViewportCamera,
  ViewportLighting,
  ViewportMaterialPreview,
  ViewportObjectTransform,
} from "../lib/viewport-engine/types";

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
  /** Orbit 相机变化时同步给父组件，供 Cycles 使用同一视角。 */
  onCameraChange?: (camera: ViewportCamera) => void;
  onInteractingChange?: (interacting: boolean) => void;
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

function computeRenderSize(
  viewportW: number,
  viewportH: number,
  quality: "draft" | "final",
  liveRender: boolean,
) {
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  const aspect = vh / vw;
  const maxW = quality === "draft" ? 960 : 2048;
  const maxH = quality === "draft" ? 720 : 1536;
  let w =
    quality === "draft"
      ? Math.min(Math.max(vw, 480), maxW)
      : liveRender
        ? maxW
        : Math.min(Math.max(vw, 640), maxW);
  let h = Math.round(w * aspect);
  if (h > maxH) {
    h = maxH;
    w = Math.round(h / aspect);
  }
  return { w, h };
}

function mapEditorLighting(lighting?: ViewportLighting) {
  const amb = lighting?.ambient ?? 1.0;
  const dir = lighting?.directional ?? 2.0;
  return {
    yaw: lighting?.yaw ?? 45,
    pitch: lighting?.pitch ?? 35,
    ambient: 0.38 + amb * 0.22,
    directional: 0.45 + dir * 0.28,
    exposure: lighting?.exposure ?? 1.0,
    environment: lighting?.environment ?? 1.0,
  };
}

/** 屏幕空间平移（与当前 orbit yaw 对齐） */
function panCameraScreen(
  base: ViewportCamera,
  dx: number,
  dy: number,
  sens = 0.004,
): ViewportCamera {
  const yaw = base.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    ...base,
    panX: (base.panX ?? 0) + (-dx * cos + dy * sin * 0.25) * sens,
    panY: (base.panY ?? 0) + dy * sens,
  };
}

export function JepowViewportPreview({
  scenePath,
  height = 220,
  fill = false,
  mode = "turntable",
  lighting,
  liveRender = false,
  shading = "clay",
  transform,
  material,
  resetViewToken = 0,
  highPerformanceMode = false,
  orbitOnly = false,
  defaultCamera,
  viewCamera,
  lockRenderSize = false,
  onCameraChange,
  onInteractingChange,
  onSceneInfo,
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
    ],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const staticPreviewSize = useRef({ w: 480, h: Math.max(200, height) });
  const [viewportSize, setViewportSize] = useState(() =>
    liveRender
      ? { w: 640, h: fill ? 360 : height }
      : staticPreviewSize.current,
  );
  const staticRendered = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sceneLabel, setSceneLabel] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [capsLine, setCapsLine] = useState<string | null>(null);
  const [camera, setCamera] = useState<ViewportCamera>({ ...initialCam });
  const cameraRef = useRef(camera);
  const viewCameraRef = useRef<ViewportCamera | undefined>(viewCamera);
  const parentCameraRaf = useRef(0);
  const pendingParentCamera = useRef<ViewportCamera | null>(null);
  const transformRef = useRef(transform);
  const lightingRef = useRef(lighting);
  const materialRef = useRef(material);
  cameraRef.current = camera;
  const syncCamera = useCallback(
    (next: ViewportCamera) => {
      cameraRef.current = next;
      setCamera(next);
      if (!onCameraChange) return;
      pendingParentCamera.current = next;
      if (parentCameraRaf.current) return;
      parentCameraRaf.current = requestAnimationFrame(() => {
        parentCameraRaf.current = 0;
        const pending = pendingParentCamera.current;
        if (pending) onCameraChange(pending);
      });
    },
    [onCameraChange],
  );

  useEffect(() => {
    if (!viewCamera || dragging.current) return;
    const current = cameraRef.current;
    const same =
      Math.abs((current.yaw ?? 0) - (viewCamera.yaw ?? 0)) < 0.0001 &&
      Math.abs((current.pitch ?? 0) - (viewCamera.pitch ?? 0)) < 0.0001 &&
      Math.abs((current.distance ?? 0) - (viewCamera.distance ?? 0)) < 0.0001 &&
      Math.abs((current.panX ?? 0) - (viewCamera.panX ?? 0)) < 0.0001 &&
      Math.abs((current.panY ?? 0) - (viewCamera.panY ?? 0)) < 0.0001 &&
      Math.abs((current.fov ?? Math.PI / 4) - (viewCamera.fov ?? Math.PI / 4)) < 0.0001;
    if (same) return;
    cameraRef.current = { ...viewCamera };
    setCamera({ ...viewCamera });
  }, [viewCamera]);

  useEffect(
    () => () => {
      if (parentCameraRaf.current) cancelAnimationFrame(parentCameraRaf.current);
    },
    [],
  );

  transformRef.current = transform;
  lightingRef.current = lighting;
  materialRef.current = material;
  viewCameraRef.current = viewCamera;

  const turntableYaw = useRef(0);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const renderGen = useRef(0);
  const renderInFlight = useRef(false);
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

  useEffect(() => {
    if (!liveRender) {
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
  }, [fill, height, liveRender, lockRenderSize]);

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
            onSceneInfo?.(info);
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
        );
        const lit = mapEditorLighting(lightingRef.current);
        const tr = transformRef.current;
        const mat = materialRef.current;
        const result = await eng.renderPreview({
          scenePath,
          width: previewW,
          height: previewH,
          camera: cam,
          lighting: lit,
          transform: tr,
          material: mat,
          shading,
          liveRender,
          previewQuality: quality,
        });
        if (gen !== renderGen.current) return;
        if (!result.ok || !result.previewUrl) {
          const msg = result.error || "原生视口渲染失败";
          setEngineError(msg);
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
      onSceneInfo,
      viewportSize,
      lighting,
      shading,
      liveRender,
    ],
  );
  const renderWithCameraRef = useRef(renderWithCamera);
  renderWithCameraRef.current = renderWithCamera;

  const lightingKey = JSON.stringify(lighting ?? {});
  const transformKey = JSON.stringify(transform ?? {});
  const materialKey = JSON.stringify(material ?? {});

  useEffect(() => {
    if (engineReady !== true || !sceneMetaReady) return;
    const delay = liveRender ? 120 : 0;
    const t = setTimeout(() => {
      staticRendered.current = false;
      void renderWithCamera(cameraRef.current, liveRender, "final");
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightingKey, transformKey, materialKey, shading, engineReady, sceneMetaReady, liveRender]);

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
    invalidateViewportCache();
    invalidateViewportPerformance();
    setEngineReady(null);
    setEngineError(null);
    lockedRenderSize.current = null;
    syncCamera({ ...(viewCameraRef.current ?? initialCam) });
    turntableYaw.current = 0;

    getViewportCapabilities(true)
      .then((caps) => {
        setEngineReady(caps.nativeAvailable);
        setCapsLine(caps.message || null);
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
          onSceneInfo?.(info);
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
  }, [engineReady, scenePath, onSceneInfo]);

  useEffect(() => {
    if (engineReady !== true || !sceneMetaReady) return;

    if (!liveRender) {
      if (staticRendered.current) return;
      staticRendered.current = true;
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

  useEffect(() => {
    if (
      !liveRender ||
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
      const interval = heavyScene ? 52 : 36;
      if (now - last >= interval && !renderInFlight.current) {
        last = now;
        void renderWithCamera(cameraRef.current, true, "draft");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [
    liveRender,
    engineReady,
    sceneMetaReady,
    mode,
    heavyScene,
    isDragging,
    renderWithCamera,
  ]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode !== "orbit") return;
    if (!liveRender) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    onInteractingChange?.(true);
    dragging.current = {
      kind:
        orbitOnly || !(e.button === 2 || e.shiftKey) ? "orbit" : "pan",
      x: e.clientX,
      y: e.clientY,
      cam: { ...camera },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || mode !== "orbit") return;
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
          }
        : panCameraScreen(base, dx, dy);
    syncCamera(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.stopPropagation();
    dragging.current = null;
    setIsDragging(false);
    onInteractingChange?.(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (liveRender && mode === "orbit") {
      void renderWithCamera(cameraRef.current, true, "final");
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (orbitOnly || !liveRender || mode !== "orbit") return;
    e.stopPropagation();
    e.preventDefault();
    const next = {
      ...cameraRef.current,
      distance: Math.max(
        0.4,
        Math.min(48, (cameraRef.current.distance ?? 2.45) + e.deltaY * 0.004),
      ),
    };
    onInteractingChange?.(true);
    syncCamera(next);
    window.setTimeout(() => onInteractingChange?.(false), 160);
    void renderWithCamera(next, true, "draft");
  };

  const modeHint = orbitOnly
    ? "白膜 · 45° · 拖拽旋转"
    : !liveRender
      ? "预览缩略图"
      : mode === "turntable"
        ? "白膜 · 居中慢速旋转"
        : shading === "render"
          ? "渲染视口 · 常驻 GPU"
          : "白膜视口 · 左拖旋转 / 滚轮缩放 / 右键平移";

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
          {engineReady === null ? "正在检测自研渲染器…" : "自研渲染器未编译"}
        </span>
        <p className="text-[10px] text-amber-100/90 leading-relaxed max-w-[270px]">
          {engineError || "需要 jepow-engine"}
        </p>
      </div>
    );
  }

  const shellClass = fill
    ? "absolute inset-0 w-full h-full"
    : "relative w-full rounded-md overflow-hidden";
  const shellStyle = fill ? undefined : { height };

  return (
    <div
      ref={containerRef}
      className={`${shellClass} nodrag nopan nowheel bg-neutral-950 border ${
        fill ? "border-0" : mode === "orbit" ? "border-purple-500/50" : "border-emerald-500/40"
      } ${(liveRender || orbitOnly) && mode === "orbit" ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={shellStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {previewSrc ? (
        <img
          src={previewSrc}
          alt="Jepow native viewport"
          className="w-full h-full bg-[#1a1b1e] pointer-events-none select-none object-contain"
          style={{ imageRendering: "auto" }}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 gap-2 p-3 text-center pointer-events-none">
          {loading ? (
            <RefreshCw className="w-6 h-6 animate-spin text-violet-400" />
          ) : (
            <Cpu className="w-6 h-6 text-neutral-500" />
          )}
          <span className="text-[10px]">{loading ? "渲染白膜…" : engineError || "…"}</span>
        </div>
      )}

      <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none max-w-[85%]">
        <span
          className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border ${
            mode === "turntable"
              ? "bg-black/80 text-emerald-300 border-emerald-900/50"
              : "bg-black/80 text-purple-300 border-purple-900/50"
          }`}
        >
          JEPOW 白膜
        </span>
        <span className="bg-black/70 text-neutral-400 text-[7px] px-1.5 py-0.5 rounded">
          {modeHint}
        </span>
        {sceneLabel && (
          <span className="bg-black/60 text-neutral-500 text-[7px] px-1.5 py-0.5 rounded truncate">
            {sceneLabel}
          </span>
        )}
      </div>

      {loading && mode === "orbit" && !liveRender && (
        <div className="absolute top-14 right-2 pointer-events-none">
          <span className="text-[8px] bg-black/70 text-violet-300 px-1.5 py-0.5 rounded border border-violet-900/40">
            渲染中…
          </span>
        </div>
      )}

      {mode === "orbit" && !orbitOnly && (
        <div className="absolute bottom-2 left-2 flex gap-1 pointer-events-none text-[7px] text-neutral-500">
          <RotateCw className="w-3 h-3" />
          <span>旋转</span>
          <Move className="w-3 h-3 ml-1" />
          <span>平移</span>
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
    </div>
  );
}
