import React, { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Image as ImageIcon, Trash2, Box, Sparkles, RefreshCw, Loader2, Plus, Settings } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { toast } from "sonner";
import api from "../lib/api";
import { resolveImageReference } from "../lib/native-3d-pipeline";

interface ImageTo3DNodeProps {
  id: string;
  data: {
    imageUrl?: string;
    glbUrl?: string;
    modelName?: string;
    status?: string;
  };
  selected?: boolean;
}

export function ImageTo3DNode({ id, data, selected }: ImageTo3DNodeProps) {
  const { getNodes, getEdges, updateNodeData } = useReactFlow();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("等待参考图...");
  const [errorText, setErrorText] = useState("");

  const zoom = useStore((s) => s.transform[2]);
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );

  // Find incoming reference image from connected nodes
  const nodes = getNodes();
  const edges = getEdges();
  
  const incomingEdge = edges.find((e) => e.target === id && e.targetHandle === "image");
  const sourceNode = incomingEdge ? nodes.find((n) => n.id === incomingEdge.source) : null;
  const activeImageUrl =
    resolveImageReference(sourceNode) || data.imageUrl || "";

  useEffect(() => {
    if (activeImageUrl && !data.glbUrl && !isGenerating) {
      setStatusMessage("参考图就绪，可开始生成 3D");
    } else if (!activeImageUrl) {
      setStatusMessage("等待参考图...");
    }
  }, [activeImageUrl, data.glbUrl]);

  const handleGenerate3D = async () => {
    if (!activeImageUrl) {
      toast.error("未检测到有效参考图！请连接图片或上传图片");
      return;
    }

    setIsGenerating(true);
    setProgress(15);
    setStatusMessage("正在预处理参考对象...");
    setErrorText("");

    try {
      // Simulate progress animations
      const interval = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) {
            clearInterval(interval);
            return 90;
          }
          return p + Math.floor(Math.random() * 8) + 2;
        });
      }, 150);

      const res = await api.post("/3d/image-to-3d", { imageUrl: activeImageUrl });

      clearInterval(interval);
      setProgress(100);
      setStatusMessage("3D模型生成完成！");
      toast.success("3D模型（GLB）生成成功，扣除 200 积分");

      updateNodeData(id, {
        glbUrl: res.data.glbUrl,
        modelName: res.data.modelName,
        imageUrl: activeImageUrl,
        status: "done"
      });

      // Dispatch global profile update event to sync headers immediately
      window.dispatchEvent(new Event("credits-changed"));
    } catch (err: any) {
      console.error(err);
      setErrorText(err.response?.data?.error || err.message || "生成失败");
      setStatusMessage("生成出错");
      toast.error(err.response?.data?.error || "模型化流程中断，请重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClear = () => {
    updateNodeData(id, {
      glbUrl: undefined,
      modelName: undefined,
      status: undefined
    });
    setProgress(0);
    setStatusMessage("已重置模型");
  };

  return (
    <div
      id={`node-${id}`}
      style={{ width: "290px" }}
      className={`relative rounded-lg overflow-visible font-sans text-white transition-all duration-200 ${
        selected ? "scale-[1.02] z-50" : ""
      }`}
    >
      {/* Visual Anchor Sockets */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>
      <Handle
        type="source"
        position={Position.Right}
        id="model"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !right-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>

      <div className={`w-full h-[220px] bg-[#1A1A1A] rounded-md relative overflow-hidden flex flex-col border ${selected ? "border-purple-600 shadow-[0_0_20px_rgba(147,51,234,0.4)]" : "border-neutral-800"} transition-all duration-300 relative group`}>
        {/* Dynamic Image Reference Preview */}
        {activeImageUrl ? (
          <div className="w-full h-full relative group/img">
            <img
              src={activeImageUrl}
              className="w-full h-full object-cover transition-transform duration-700"
              alt="Source Reference Context"
              referrerPolicy="no-referrer"
            />
            {data.glbUrl && (
              <div className="absolute bottom-2.5 left-2.5 z-10 px-2 py-1 bg-purple-950/95 border border-purple-800 rounded-md text-[9px] font-mono font-black text-purple-300 shadow-lg flex items-center gap-1">
                <Box className="w-3 h-3 text-purple-400 animate-spin" />
                <span>{data.modelName || "已生成"}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#1A1A1A]">
            <div className="flex flex-col items-center gap-2 opacity-35">
              <Box className="w-12 h-12 text-neutral-500" />
            </div>
            {isGenerating && (
              <div className="absolute inset-0 bg-[#000000]/80 flex flex-col items-center justify-center gap-4 z-10 animate-in fade-in duration-300">
                <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-black text-neutral-200 tracking-wider">{statusMessage}</span>
                  <span className="text-[11px] font-mono font-bold text-purple-400">{progress}%</span>
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
              <Settings className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-neutral-200">3D 网格对象重建 (Object Reconstruction)</span>
            </div>

            {/* Input Reference Status */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between bg-neutral-950/40 border border-neutral-800/45 px-2.5 py-1.5 rounded text-[10px]">
                <span className="font-bold text-neutral-500">外部参考图像</span>
                {activeImageUrl ? (
                  <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-bold font-mono text-[9px] animate-pulse">图像已接入</span>
                ) : (
                  <span className="text-neutral-500 font-bold font-mono">连线引入图片</span>
                )}
              </div>
            </div>

            {/* Mesh Out Pack Details */}
            {data.glbUrl && (
              <div className="bg-[#1f1f23] p-3 rounded border border-purple-950/40 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">生成的模型实体</span>
                <span className="text-xs font-mono text-purple-400 truncate font-semibold">
                  {data.modelName?.toUpperCase()}.GLB
                </span>
                <p className="text-[10px] text-neutral-400 leading-relaxed mt-1">
                  网格资产已生成完毕。可连接至 <strong>[材质重映射]</strong> 或 <strong>[3D编辑器]</strong> 材质烘培端口预览。
                </p>
              </div>
            )}

            {/* Error Message */}
            {errorText && (
              <div className="text-[10px] text-red-400 bg-red-950/30 border border-red-900/40 p-2.5 rounded text-center font-medium leading-relaxed">
                {errorText}
              </div>
            )}

            {/* Triggers */}
            <div className="flex items-center gap-2 border-t border-neutral-800/70 pt-3">
              {data.glbUrl ? (
                <Button
                  className="flex-1 text-xs h-9 bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-neutral-700 rounded-md font-bold transition-all"
                  onClick={handleClear}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  重新进行转化
                </Button>
              ) : (
                <Button
                  className="flex-1 text-xs h-9 bg-purple-600 text-white hover:bg-purple-500 rounded-md font-bold transition-all shadow-lg hover:shadow-purple-500/20 flex items-center justify-center disabled:opacity-40"
                  disabled={isGenerating || !activeImageUrl}
                  onClick={handleGenerate3D}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      正在计算深度网格 ({progress}%)
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5 text-yellow-300 animate-pulse" />
                      生成 3D 模型 (.glb)
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
