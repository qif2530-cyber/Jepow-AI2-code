import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Cpu, Monitor } from "lucide-react";
import { Button } from "./ui/button";
import {
  getViewportCapabilities,
  getViewportEngine,
  invalidateViewportCache,
} from "../lib/viewport-engine";
import { toast } from "sonner";

interface JepowViewportPreviewProps {
  scenePath: string;
  height?: number;
  onSceneInfo?: (info: {
    meshCount?: number;
    nodeCount?: number;
    extension?: string;
  }) => void;
}

export function JepowViewportPreview({
  scenePath,
  height = 220,
  onSceneInfo,
}: JepowViewportPreviewProps) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sceneLabel, setSceneLabel] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [capsLine, setCapsLine] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveRef = useRef(false);

  const renderOnce = useCallback(async () => {
    if (!scenePath) return;
    const eng = getViewportEngine();
    setLoading(true);
    try {
      const info = await eng.openScene(scenePath);
      if (info.ok) {
        setSceneLabel(
          `${info.extension?.toUpperCase() || "3D"} · ${info.meshCount ?? 0} 网格 · ${info.nodeCount ?? 0} 节点`,
        );
        onSceneInfo?.(info);
      }
      const result = await eng.renderPreview({
        scenePath,
        width: 720,
        height: Math.max(360, Math.round((720 * height) / 290)),
      });
      if (!result.ok || !result.previewUrl) {
        const msg = result.error || "原生视口渲染失败";
        setEngineError(msg);
        setPreviewSrc(null);
        toast.error(msg);
        return;
      }
      const dataUrl = await eng.readPreviewDataUrl(result.previewUrl);
      if (dataUrl) {
        setPreviewSrc(dataUrl);
        setEngineError(null);
      } else {
        setEngineError("无法读取渲染缓存图");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "原生视口错误";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [scenePath, height, onSceneInfo]);

  useEffect(() => {
    invalidateViewportCache();
    setEngineReady(null);
    setEngineError(null);
    getViewportCapabilities(true)
      .then((caps) => {
        setEngineReady(caps.nativeAvailable);
        setCapsLine(caps.message || null);
        if (!caps.nativeAvailable) {
          setEngineError(
            caps.message ||
              "jepow-engine.exe 未找到。请用 desktop.bat 启动（会自动编译自研渲染器）。",
          );
          return;
        }
        renderOnce();
      })
      .catch((e: unknown) => {
        setEngineReady(false);
        setEngineError(e instanceof Error ? e.message : "引擎检测失败");
      });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [scenePath, renderOnce]);

  const toggleLive = async () => {
    if (liveRef.current) {
      liveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    liveRef.current = true;
    await renderOnce();
    timerRef.current = setInterval(() => {
      if (liveRef.current) renderOnce();
    }, 2000);
  };

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
          {engineError ||
            "模型文件已在本地，但需要 jepow-engine.exe 才能把 FBX 画到屏幕上。"}
        </p>
        <p className="text-[9px] text-amber-200/80 leading-relaxed max-w-[270px]">
          1. 打开 Visual Studio Installer → 修改 → 勾选「使用 C++ 的桌面开发」
          <br />
          2. 关闭 Jepow，双击运行 <code className="text-white">desktop.bat</code>
          <br />
          3. 看到「编译完成 jepow-engine.exe」后再导入模型
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative bg-neutral-950 rounded-md overflow-hidden border border-violet-500/40"
      style={{ height }}
    >
      {previewSrc ? (
        <img
          src={previewSrc}
          alt="Jepow native viewport"
          className="w-full h-full object-contain bg-black"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 gap-2 p-3 text-center">
          {loading ? (
            <RefreshCw className="w-6 h-6 animate-spin text-violet-400" />
          ) : engineError ? (
            <Cpu className="w-6 h-6 text-red-400/80" />
          ) : (
            <Monitor className="w-6 h-6 text-violet-400/60" />
          )}
          <span className="text-[10px] max-w-[240px] leading-relaxed">
            {loading
              ? "Jepow 原生 GPU 渲染中…"
              : engineError || "等待渲染…"}
          </span>
        </div>
      )}

      <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
        <span className="bg-black/80 text-violet-300 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border border-violet-900/50">
          JEPOW 原生引擎
        </span>
        {sceneLabel && (
          <span className="bg-black/70 text-neutral-400 text-[8px] px-1.5 py-0.5 rounded max-w-[220px] truncate">
            {sceneLabel}
          </span>
        )}
        {capsLine && (
          <span className="bg-black/60 text-neutral-500 text-[7px] px-1.5 py-0.5 rounded max-w-[220px] truncate">
            {capsLine}
          </span>
        )}
      </div>

      <div className="absolute bottom-2 right-2 flex gap-1 pointer-events-auto">
        <Button
          type="button"
          size="icon"
          className="h-7 w-7 bg-black/75 border border-neutral-800"
          title="GPU 视口刷新"
          disabled={loading}
          onClick={(e) => {
            e.stopPropagation();
            renderOnce();
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-[9px] px-2 bg-black/75 border border-neutral-800"
          onClick={(e) => {
            e.stopPropagation();
            toggleLive();
          }}
        >
          {liveRef.current ? "停止" : "实时"}
        </Button>
      </div>
    </div>
  );
}
