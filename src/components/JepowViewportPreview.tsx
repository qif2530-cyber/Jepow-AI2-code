import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Cpu, Move, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import {
  getViewportCapabilities,
  getViewportEngine,
  invalidateViewportCache,
} from "../lib/viewport-engine";
import type { ViewportCamera } from "../lib/viewport-engine/types";

export type ViewportPreviewMode = "turntable" | "orbit";

interface JepowViewportPreviewProps {
  scenePath: string;
  height?: number;
  mode?: ViewportPreviewMode;
  onSceneInfo?: (info: {
    meshCount?: number;
    nodeCount?: number;
    extension?: string;
  }) => void;
}

const DEFAULT_CAM: ViewportCamera = {
  yaw: 0.55,
  pitch: 0.38,
  distance: 2.45,
  panX: 0,
  panY: 0,
};

export function JepowViewportPreview({
  scenePath,
  height = 220,
  mode = "turntable",
  onSceneInfo,
}: JepowViewportPreviewProps) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sceneLabel, setSceneLabel] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [capsLine, setCapsLine] = useState<string | null>(null);
  const [camera, setCamera] = useState<ViewportCamera>({ ...DEFAULT_CAM });

  const turntableYaw = useRef(0);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const renderGen = useRef(0);
  const renderInFlight = useRef(false);
  const dragging = useRef<{
    kind: "orbit" | "pan";
    x: number;
    y: number;
    cam: ViewportCamera;
  } | null>(null);
  const sceneOpened = useRef(false);

  const renderWithCamera = useCallback(
    async (cam: ViewportCamera, silent = false) => {
      if (!scenePath) return;
      if (renderInFlight.current) {
        if (silent) return;
      }
      renderInFlight.current = true;
      const gen = renderGen.current;
      if (!silent) setLoading(true);
      try {
        const eng = getViewportEngine();
        if (!sceneOpened.current) {
          const info = await eng.openScene(scenePath);
          if (info.ok) {
            setSceneLabel(
              `${info.extension?.toUpperCase() || "3D"} · ${info.meshCount ?? 0} 网格 · ${info.nodeCount ?? 0} 节点`,
            );
            onSceneInfo?.(info);
          } else if (!silent) {
            setEngineError(info.error || "无法打开场景");
          }
          sceneOpened.current = true;
        }
        const result = await eng.renderPreview({
          scenePath,
          width: 720,
          height: Math.max(360, Math.round((720 * height) / 290)),
          camera: cam,
        });
        if (gen !== renderGen.current) return;
        if (!result.ok || !result.previewUrl) {
          const msg = result.error || "原生视口渲染失败";
          setEngineError(msg);
          setPreviewSrc(null);
          return;
        }
        const dataUrl = await eng.readPreviewDataUrl(result.previewUrl);
        if (gen !== renderGen.current) return;
        if (dataUrl) {
          setPreviewSrc(dataUrl);
          setEngineError(null);
        } else {
          setEngineError("无法读取渲染缓存图");
        }
      } catch (e: unknown) {
        if (gen !== renderGen.current) return;
        setEngineError(e instanceof Error ? e.message : "原生视口错误");
      } finally {
        renderInFlight.current = false;
        if (gen === renderGen.current && !silent) setLoading(false);
      }
    },
    [scenePath, height, onSceneInfo],
  );

  useEffect(() => {
    sceneOpened.current = false;
    renderGen.current += 1;
    renderInFlight.current = false;
    invalidateViewportCache();
    setEngineReady(null);
    setEngineError(null);
    setCamera({ ...DEFAULT_CAM });
    turntableYaw.current = 0;

    getViewportCapabilities(true)
      .then((caps) => {
        setEngineReady(caps.nativeAvailable);
        setCapsLine(caps.message || null);
        if (!caps.nativeAvailable) {
          setEngineError(
            caps.message ||
              "jepow-engine.exe 未找到。请用 desktop.bat 启动。",
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
  }, [scenePath]);

  useEffect(() => {
    if (engineReady !== true) return;

    if (mode === "turntable") {
      const tick = async () => {
        if (renderInFlight.current) return;
        turntableYaw.current += 0.045;
        const cam: ViewportCamera = {
          ...DEFAULT_CAM,
          yaw: turntableYaw.current,
        };
        await renderWithCamera(cam, true);
      };
      void renderWithCamera({ ...DEFAULT_CAM }, false);
      animRef.current = setInterval(() => void tick(), 450);
      return () => {
        if (animRef.current) clearInterval(animRef.current);
      };
    }

    void renderWithCamera({ ...DEFAULT_CAM }, false);
    return undefined;
  }, [engineReady, mode, scenePath, renderWithCamera]);

  const orbitCamKey = useRef("");
  useEffect(() => {
    if (engineReady !== true || mode !== "orbit") return;
    const key = JSON.stringify(camera);
    if (key === orbitCamKey.current) return;
    orbitCamKey.current = key;
    const t = setTimeout(() => void renderWithCamera(camera, dragging.current ? true : false), 60);
    return () => clearTimeout(t);
  }, [camera, engineReady, mode, renderWithCamera]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode !== "orbit") return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = {
      kind: e.button === 2 || e.shiftKey ? "pan" : "orbit",
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
    if (dragging.current.kind === "orbit") {
      setCamera({
        ...base,
        yaw: (base.yaw ?? 0) + dx * 0.008,
        pitch: Math.max(-1.1, Math.min(1.1, (base.pitch ?? 0) - dy * 0.006)),
      });
    } else {
      setCamera({
        ...base,
        panX: (base.panX ?? 0) + dx * 0.004,
        panY: (base.panY ?? 0) - dy * 0.004,
      });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    e.stopPropagation();
    dragging.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (mode !== "orbit") return;
    e.stopPropagation();
    e.preventDefault();
    setCamera((c) => ({
      ...c,
      distance: Math.max(
        0.4,
        Math.min(10, (c.distance ?? 2.45) + e.deltaY * 0.004),
      ),
    }));
  };

  const modeHint =
    mode === "turntable"
      ? "白膜 · 居中自动旋转"
      : "白膜 · 左拖旋转 / 滚轮缩放 / 右键平移";

  if (engineReady !== true) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 bg-amber-950/40 border-2 border-amber-500/60 rounded-md text-center p-4"
        style={{ height }}
      >
        <Cpu className="w-9 h-9 text-amber-400" />
        <span className="text-[11px] font-bold text-amber-300">
          {engineReady === null ? "正在检测自研渲染器…" : "自研渲染器未编译"}
        </span>
        <p className="text-[10px] text-amber-100/90 leading-relaxed max-w-[270px]">
          {engineError || "需要 jepow-engine.exe"}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`relative bg-neutral-950 rounded-md overflow-hidden border ${
        mode === "orbit" ? "border-purple-500/50" : "border-emerald-500/40"
      } ${mode === "orbit" ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {previewSrc ? (
        <img
          src={previewSrc}
          alt="Jepow native viewport"
          className="w-full h-full object-contain bg-[#1a1b1e] pointer-events-none select-none"
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

      {mode === "orbit" && (
        <div className="absolute bottom-2 left-2 flex gap-1 pointer-events-none text-[7px] text-neutral-500">
          <RotateCw className="w-3 h-3" />
          <span>旋转</span>
          <Move className="w-3 h-3 ml-1" />
          <span>平移</span>
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
            setCamera({ ...DEFAULT_CAM });
            if (mode === "turntable") turntableYaw.current = 0;
            void renderWithCamera({ ...DEFAULT_CAM }, false);
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}
