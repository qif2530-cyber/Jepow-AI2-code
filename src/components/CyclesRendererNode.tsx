import React, { useMemo, useState } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Aperture, Loader2, Plus, RefreshCw, Settings, Sparkles } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { toast } from "sonner";
import { getViewportEngine } from "../lib/viewport-engine";

interface CyclesRendererNodeProps {
  id: string;
  data: {
    url?: string;
    status?: string;
    error?: string;
    renderSeconds?: number;
  };
  selected?: boolean;
}

function numberValue(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function CyclesRendererNode({ id, data, selected }: CyclesRendererNodeProps) {
  const { getNodes, getEdges, updateNodeData } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);

  const nodes = getNodes();
  const edges = getEdges();
  const sceneEdge = edges.find((e) => e.target === id && e.targetHandle === "scene");
  const lightEdge = edges.find((e) => e.target === id && e.targetHandle === "cyclesLight");
  const cameraEdge = edges.find((e) => e.target === id && e.targetHandle === "cyclesCamera");
  const settingsEdge = edges.find((e) => e.target === id && e.targetHandle === "cyclesSettings");
  const sceneNode = sceneEdge ? nodes.find((n) => n.id === sceneEdge.source) : null;
  const lightNode = lightEdge ? nodes.find((n) => n.id === lightEdge.source) : null;
  const cameraNode = cameraEdge ? nodes.find((n) => n.id === cameraEdge.source) : null;
  const settingsNode = settingsEdge ? nodes.find((n) => n.id === settingsEdge.source) : null;

  const sceneData = (sceneNode?.data as { sceneData?: Record<string, unknown> } | undefined)
    ?.sceneData;
  const connectedLight = (lightNode?.data as { cyclesLight?: Record<string, unknown> } | undefined)
    ?.cyclesLight;
  const connectedCamera = (cameraNode?.data as { cyclesCamera?: Record<string, unknown> } | undefined)
    ?.cyclesCamera;
  const connectedSettings = (
    settingsNode?.data as { cyclesRenderSettings?: Record<string, unknown> } | undefined
  )?.cyclesRenderSettings;

  const renderPlan = useMemo(() => {
    const settings = {
      ...((sceneData?.renderSettings as Record<string, unknown> | undefined) || {}),
      ...(connectedSettings || {}),
    };
    return {
      width: Math.round(numberValue(settings.width, 2048)),
      height: Math.round(numberValue(settings.height, 1536)),
      samples: Math.max(1, Math.round(numberValue(settings.samples, 128))),
      device: String(settings.device || "CPU"),
    };
  }, [sceneData, connectedSettings]);

  const handleRender = async () => {
    if (!sceneData) {
      toast.error("请先把 3D 场景编辑器的 sceneData 输出连接到 CL 渲染器节点");
      return;
    }
    const scenePath = String(
      sceneData.scenePath || sceneData.nativeScenePath || sceneData.glbUrl || "",
    );
    if (!scenePath) {
      toast.error("场景缺少可给 CL 渲染器使用的模型路径");
      return;
    }

    setIsRendering(true);
    setProgress(12);
    updateNodeData(id, { status: "rendering", error: undefined });
    const ticks = [28, 48, 68, 84, 94];
    let tickIdx = 0;
    const timer = window.setInterval(() => {
      setProgress(ticks[Math.min(tickIdx, ticks.length - 1)]);
      tickIdx += 1;
    }, 450);

    try {
      const engine = getViewportEngine();
      if (!engine.renderCyclesFrame) {
        throw new Error("Cycles/CL 渲染入口不可用，请先构建 native:cycles");
      }
      const res = await engine.renderCyclesFrame({
        scenePath,
        blendPath: String(sceneData.blendSourcePath || ""),
        blendSourcePath: String(sceneData.blendSourcePath || ""),
        width: renderPlan.width,
        height: renderPlan.height,
        samples: renderPlan.samples,
        device: renderPlan.device,
        transform: (sceneData.transform as Record<string, unknown> | undefined) || {},
        material: sceneData.cyclesMaterial || sceneData.material,
        cyclesMaterial: sceneData.cyclesMaterial || sceneData.material,
        renderSettings: {
          ...((sceneData.renderSettings as Record<string, unknown> | undefined) || {}),
          ...(connectedSettings || {}),
        },
        cyclesLight:
          connectedLight ||
          (sceneData.cyclesLight as Record<string, unknown> | undefined) ||
          {},
        camera:
          connectedCamera ||
          (sceneData.cyclesCamera as Record<string, unknown> | undefined) ||
          (sceneData.cyclesViewportCamera as Record<string, unknown> | undefined) ||
          {},
      } as any);
      if (!res.ok || !res.previewDataUrl) {
        throw new Error(res.error || "CL 渲染失败，未返回有效图像");
      }
      setProgress(100);
      updateNodeData(id, {
        url: res.previewDataUrl,
        status: "done",
        error: undefined,
        renderSeconds: res.renderSeconds,
      });
      toast.success("CL 独立渲染完成");
    } catch (err) {
      const message = err instanceof Error ? err.message : "CL 渲染失败";
      updateNodeData(id, { status: "error", error: message });
      toast.error(message);
    } finally {
      window.clearInterval(timer);
      setIsRendering(false);
    }
  };

  const handleClear = () => {
    updateNodeData(id, {
      url: undefined,
      status: undefined,
      error: undefined,
      renderSeconds: undefined,
    });
    setProgress(0);
  };

  return (
    <div
      id={`node-${id}`}
      style={{ width: "300px" }}
      className={`relative overflow-visible rounded-lg font-sans text-white transition-all duration-200 ${
        selected ? "z-50 scale-[1.02]" : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="scene"
        className="!left-[-16px] !h-8 !w-8 rounded-full !border-[1.5px] !border-pink-500 !bg-[#2A2A2A] text-pink-300"
        style={{ top: "32%" }}
        title="接入 3D 场景编辑器 sceneData"
      >
        <Plus className="h-5 w-5 pointer-events-none" />
      </Handle>
      <Handle
        type="target"
        position={Position.Left}
        id="cyclesLight"
        className="!left-[-14px] !h-7 !w-7 rounded-full !border-[1.5px] !border-amber-500 !bg-[#2A2A2A] text-amber-300"
        style={{ top: "52%" }}
        title="可选：覆盖场景灯光"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="cyclesCamera"
        className="!left-[-14px] !h-7 !w-7 rounded-full !border-[1.5px] !border-cyan-500 !bg-[#2A2A2A] text-cyan-300"
        style={{ top: "66%" }}
        title="可选：覆盖 CL 相机"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="cyclesSettings"
        className="!left-[-14px] !h-7 !w-7 rounded-full !border-[1.5px] !border-blue-500 !bg-[#2A2A2A] text-blue-300"
        style={{ top: "80%" }}
        title="可选：覆盖渲染设置"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="renderedImage"
        className="!right-[-16px] !h-8 !w-8 rounded-full !border-[1.5px] !border-neutral-700 !bg-[#2A2A2A] text-neutral-400"
      >
        <Plus className="h-5 w-5 pointer-events-none" />
      </Handle>

      <div className={`relative flex h-[230px] w-full flex-col overflow-hidden rounded-md border bg-[#171717] ${
        selected ? "border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.35)]" : "border-neutral-800"
      }`}>
        {data.url ? (
          <img
            src={data.url}
            className="h-full w-full object-cover"
            alt="CL Render"
            draggable={false}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-[#171717]">
            <Aperture className="h-12 w-12 text-pink-500/35" />
            <span className="mt-2 text-[10px] font-bold text-neutral-500">
              独立 CL 渲染器
            </span>
            {isRendering && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80">
                <Loader2 className="h-10 w-10 animate-spin text-pink-500" />
                <span className="font-mono text-[11px] font-bold text-pink-300">
                  {progress}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {selected && isOnlySelected && (
        <div
          className="absolute z-[9999] mt-4 w-[420px] rounded-lg border border-neutral-800 bg-[#151515]/96 p-4 shadow-2xl nodrag nopan nowheel"
          style={{
            top: "100%",
            left: "50%",
            transform: `translateX(-50%) scale(${1 / Math.max(0.01, zoom)})`,
            transformOrigin: "top center",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center gap-2 border-b border-neutral-800 pb-2">
            <Settings className="h-4 w-4 text-pink-400" />
            <span className="text-xs font-bold text-neutral-200">
              CL 独立渲染器
            </span>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded border border-neutral-800 bg-neutral-950/40 px-2 py-1.5">
              场景: {sceneData ? "已接入" : "未接入"}
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-950/40 px-2 py-1.5">
              {renderPlan.width}x{renderPlan.height} / {renderPlan.samples}spp
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-950/40 px-2 py-1.5">
              灯光: {connectedLight || sceneData?.cyclesLight ? "已接入" : "使用默认"}
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-950/40 px-2 py-1.5">
              设备: {renderPlan.device}
            </div>
          </div>
          {data.error && (
            <div className="mb-3 rounded border border-red-900/50 bg-red-950/30 p-2 text-[10px] leading-snug text-red-200">
              {data.error}
            </div>
          )}
          <div className="flex gap-2">
            {data.url && (
              <Button
                className="h-9 flex-1 rounded-md border border-neutral-700 bg-neutral-800 text-xs font-bold text-neutral-300 hover:bg-neutral-700"
                onClick={handleClear}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                清空
              </Button>
            )}
            <Button
              className="h-9 flex-1 rounded-md bg-pink-600 text-xs font-bold text-white hover:bg-pink-500 disabled:opacity-40"
              disabled={isRendering || !sceneData}
              onClick={handleRender}
            >
              {isRendering ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  CL 渲染中
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-yellow-300" />
                  开始 CL 渲染
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
