import React, { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Aperture, RefreshCw, Loader2, Link, Sparkles, Image as ImageIcon, Plus, Settings } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { toast } from "sonner";
import api from "../lib/api";

interface ThreeDRenderNodeProps {
  id: string;
  data: {
    sceneData?: any;
    prompt?: string;
    url?: string;
    status?: string;
  };
  selected?: boolean;
}

export function ThreeDRenderNode({ id, data, selected }: ThreeDRenderNodeProps) {
  const { getNodes, getEdges, updateNodeData } = useReactFlow();
  const [localPrompt, setLocalPrompt] = useState(data.prompt || "");
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);

  const zoom = useStore((s) => s.transform[2]);
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );

  const nodes = getNodes();
  const edges = getEdges();

  // 1. Resolve parent Scene data state hook
  const sceneEdge = edges.find((e) => e.target === id && e.targetHandle === "scene");
  const sceneNode = sceneEdge ? nodes.find((n) => n.id === sceneEdge.source) : null;
  const activeSceneData = sceneNode ? (sceneNode.data as any).sceneData : null;

  // 2. Resolve parent Text/Prompt nodes
  const promptEdge = edges.find((e) => e.target === id && e.targetHandle === "prompt");
  const promptNode = promptEdge ? nodes.find((n) => n.id === promptEdge.source) : null;

  let connectedPrompt = "";
  if (promptNode) {
    const promptData = promptNode.data as any;
    if (promptNode.type === "textNode") {
      connectedPrompt = promptData.text as string;
    } else if (promptNode.type === "scriptNode") {
      connectedPrompt = promptData.prompt as string;
    }
  }

  const activePrompt = connectedPrompt || localPrompt;

  const handleStartRender = async () => {
    if (!activeSceneData) {
      toast.error("未检测到 3D 场景输入数据！请先连接 [3D 场景编辑器] 节点");
      return;
    }

    setIsRendering(true);
    setProgress(10);

    try {
      // Staggered cinematic progress indicator
      const ticks = [25, 45, 65, 85, 95];
      let tickIdx = 0;
      const interval = setInterval(() => {
        if (tickIdx < ticks.length) {
          setProgress(ticks[tickIdx]);
          tickIdx++;
        }
      }, 250);

      const res = await api.post("/3d/render", {
        sceneData: activeSceneData,
        prompt: activePrompt
      });

      clearInterval(interval);
      setProgress(100);
      toast.success("AI 场景高画质渲染计算完成，扣除 50 积分");

      updateNodeData(id, {
        sceneData: activeSceneData,
        prompt: activePrompt,
        url: res.data.url,
        status: "done"
      });

      window.dispatchEvent(new Event("credits-changed"));
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || "AI 渲染队列排队超时，请重试");
    } finally {
      setIsRendering(false);
    }
  };

  const handleClear = () => {
    updateNodeData(id, {
      url: undefined,
      status: undefined
    });
    setProgress(0);
  };

  return (
    <div
      id={`node-${id}`}
      style={{ width: "290px" }}
      className={`relative rounded-lg overflow-visible font-sans text-white transition-all duration-200 ${
        selected ? "scale-[1.02] z-50" : ""
      }`}
    >
      {/* Sockets */}
      <Handle
        type="target"
        position={Position.Left}
        id="scene"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
        style={{ top: "35%" }}
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>
      <Handle
        type="target"
        position={Position.Left}
        id="prompt"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
        style={{ top: "65%" }}
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>
      <Handle
        type="source"
        position={Position.Right}
        id="renderedImage"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !right-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>

      <div className={`w-full h-[220px] bg-[#1A1A1A] rounded-md relative overflow-hidden flex flex-col border ${selected ? "border-purple-600 shadow-[0_0_20px_rgba(147,51,234,0.4)]" : "border-neutral-800"} transition-all duration-300 relative group`}>
        {/* Dynamic Image render result */}
        {data.url ? (
          <div className="w-full h-full relative group/img">
            <img
              src={data.url}
              className="w-full h-full object-cover transition-transform duration-700"
              alt="High Quality Octane-AI Render output"
              referrerPolicy="no-referrer"
            />
            {/* Resolution badges overlay */}
            <div className="absolute bottom-2.5 left-2.5 z-10 px-2.5 py-1 bg-black/80 backdrop-blur-sm rounded-md border border-white/10 text-[9px] font-mono font-black text-pink-400 tracking-wider shadow-lg">
              1024 × 1024 PNG • OCTANE HQ
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#1A1A1A]">
            <div className="flex flex-col items-center gap-2 opacity-35">
              <Aperture className="w-12 h-12 text-neutral-500" />
            </div>
            {isRendering && (
              <div className="absolute inset-0 bg-[#000000]/80 flex flex-col items-center justify-center gap-4 z-10 animate-in fade-in duration-300">
                <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-black text-neutral-200 tracking-wider">正在启动光电渲染进程...</span>
                  <span className="text-[11px] font-mono font-bold text-pink-400">{progress}%</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Control Panel */}
      {selected && isOnlySelected && (
        <div
          className="absolute z-[9999] pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300 animate-out fade-out"
          style={{
            top: "100%",
            marginTop: 20 * (1 / Math.max(0.01, zoom)),
            left: "50%",
            transform: `translateX(-50%) scale(${1 / Math.max(0.01, zoom)})`,
            transformOrigin: "top center",
          }}
        >
          <div className="w-[420px] bg-[#161616] border border-neutral-800 rounded-lg p-4 shadow-2xl flex flex-col gap-3.5">
            <div className="flex items-center gap-2 border-b border-neutral-800/80 pb-2">
              <Settings className="w-4 h-4 text-pink-400" />
              <span className="text-xs font-bold text-neutral-200">AI 光影渲染控制 (Cinematic Renderer Panel)</span>
            </div>

            {/* Verification Status Sockets */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between bg-neutral-950/40 border border-neutral-800/40 px-2.5 py-1.5 rounded text-[10px]">
                <span className="font-bold text-neutral-500">3D-场景来源数据</span>
                {activeSceneData ? (
                  <span className="bg-pink-500/10 text-pink-400 px-1.5 py-0.5 rounded font-black font-mono">已链接</span>
                ) : (
                  <span className="text-neutral-500 font-bold font-mono">未接入场景</span>
                )}
              </div>
            </div>

            {/* Prompt input */}
            {connectedPrompt ? (
              <div className="bg-blue-950/20 border border-blue-900/35 p-2.5 rounded flex items-center gap-2">
                <Link className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-[11px] text-blue-300 font-medium leading-relaxed truncate">
                  渲染风格输入: <strong className="text-white">"{connectedPrompt}"</strong>
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">手写灯带渲染风格 Prompt</label>
                <Input
                  value={localPrompt}
                  onChange={(e) => setLocalPrompt(e.target.value)}
                  placeholder="如: Neon Cyberpunk city, realistic octane render..."
                  className="h-9 text-xs bg-neutral-950 border border-neutral-800 focus:border-pink-600 focus:ring-0 text-white placeholder-neutral-700"
                />
              </div>
            )}

            {/* Triggers */}
            <div className="flex items-center gap-2 border-t border-neutral-800/70 pt-3">
              {data.url ? (
                <Button
                  className="flex-1 text-xs h-9 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-neutral-700 rounded-md font-bold transition-all"
                  onClick={handleClear}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  重置画布
                </Button>
              ) : (
                <Button
                  className="flex-1 text-xs h-9 bg-pink-600 text-white hover:bg-pink-500 rounded-md font-bold transition-all shadow-lg hover:shadow-pink-500/15 flex items-center justify-center disabled:opacity-40"
                  disabled={isRendering || !activeSceneData}
                  onClick={handleStartRender}
                >
                  {isRendering ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      高算网点流处理中 ({progress}%)
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5 text-yellow-300 animate-pulse" />
                      开始高画质 AI 渲染
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
