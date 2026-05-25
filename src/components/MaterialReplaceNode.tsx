import React, { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Brush, RefreshCw, Loader2, Sparkles, AlertCircle, Plus, Settings, GripHorizontal } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { toast } from "sonner";
import api from "../lib/api";
import {
  materialNodeDataForPreview,
  resolveModelFromSourceNode,
} from "../lib/native-3d-pipeline";

interface MaterialReplaceNodeProps {
  id: string;
  data: {
    glbUrl?: string;
    colorUrl?: string;
    normalUrl?: string;
    roughnessUrl?: string;
    metalnessUrl?: string;
    tiling?: number;
    texturedModel?: any;
    status?: string;
  };
  selected?: boolean;
}

export function MaterialReplaceNode({ id, data, selected }: MaterialReplaceNodeProps) {
  const { getNodes, getEdges, updateNodeData } = useReactFlow();
  const [isApplying, setIsApplying] = useState(false);
  const [tilingScale, setTilingScale] = useState(data.tiling || 1);
  const [colorTint, setColorTint] = useState("#ffffff");

  const zoom = useStore((s) => s.transform[2]);
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );

  const nodes = getNodes();
  const edges = getEdges();

  // 1. Resolve parent GLB Model link
  const modelEdge = edges.find((e) => e.target === id && e.targetHandle === "model");
  const modelNode = modelEdge ? nodes.find((n) => n.id === modelEdge.source) : null;
  const resolvedModel = resolveModelFromSourceNode(modelNode, nodes, edges);
  const incomingGlbUrl = resolvedModel?.glbUrl || (data.glbUrl as string) || "";

  const materialEdge = edges.find((e) => e.target === id && e.targetHandle === "material");
  const materialNode = materialEdge ? nodes.find((n) => n.id === materialEdge.source) : null;
  const materialPreview = materialNode
    ? materialNodeDataForPreview(materialNode, nodes, edges)
    : null;
  const incomingColorUrl = (materialPreview?.colorUrl as string) || "";
  const incomingNormalUrl = (materialPreview?.normalUrl as string) || "";
  const incomingRoughnessUrl = (materialPreview?.roughnessUrl as string) || "";
  const incomingMetalnessUrl = (materialPreview?.metalnessUrl as string) || "";
  const incomingTiling = (materialPreview?.tiling as number) || 1;
  const incomingTint = (materialPreview?.tint as string) || "";
  const incomingRoughness = materialPreview?.roughness as number | undefined;
  const incomingMetalness = materialPreview?.metalness as number | undefined;
  const incomingNormalScale = materialPreview?.normalScale as number | undefined;
  const incomingDisplacementScale = materialPreview?.displacementScale as number | undefined;
  const incomingTransmission = materialPreview?.transmission as number | undefined;
  const incomingIor = materialPreview?.ior as number | undefined;

  const activeGlb = incomingGlbUrl || data.glbUrl;
  const activeColor = incomingColorUrl || data.colorUrl;

  useEffect(() => {
    if (incomingTiling && incomingTiling !== tilingScale) {
      setTilingScale(incomingTiling);
    }
  }, [incomingTiling]);

  // Sync color tint from material node if present and customized by default
  useEffect(() => {
    if (incomingTint && incomingTint !== "#ffffff") {
      setColorTint(incomingTint);
    }
  }, [incomingTint]);

  const handleApplyMaterial = async () => {
    if (!activeGlb) {
      toast.error("未检测到 3D 模型输入！请先连接并生成 3D 模型");
      return;
    }
    if (!activeColor) {
      toast.error("未检测到材质贴图输入！请先连接并生成 PBR 材质组");
      return;
    }

    setIsApplying(true);

    try {
      const materialProps = {
        colorUrl: activeColor,
        normalUrl: incomingNormalUrl || data.normalUrl,
        roughnessUrl: incomingRoughnessUrl || data.roughnessUrl,
        metalnessUrl: incomingMetalnessUrl || data.metalnessUrl,
        tiling: tilingScale,
        tint: colorTint,
        roughness: incomingRoughness !== undefined ? incomingRoughness : undefined,
        metalness: incomingMetalness !== undefined ? incomingMetalness : undefined,
        normalScale: incomingNormalScale !== undefined ? incomingNormalScale : undefined,
        displacementScale: incomingDisplacementScale !== undefined ? incomingDisplacementScale : undefined,
        transmission: incomingTransmission !== undefined ? incomingTransmission : undefined,
        ior: incomingIor !== undefined ? incomingIor : undefined,
      };

      const res = await api.post("/3d/replace-material", {
        glbUrl: activeGlb,
        materialProps
      });

      toast.success("基础模型与纹理贴图烘焙合并成功，扣除 20 积分");

      updateNodeData(id, {
        glbUrl: activeGlb,
        colorUrl: activeColor,
        normalUrl: materialProps.normalUrl,
        roughnessUrl: materialProps.roughnessUrl,
        metalnessUrl: materialProps.metalnessUrl,
        tiling: tilingScale,
        texturedModel: res.data.texturedModel,
        status: "done"
      });

      window.dispatchEvent(new Event("credits-changed"));
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || "贴图合并异常，请检查传入贴图");
    } finally {
      setIsApplying(false);
    }
  };

  const handleReset = () => {
    updateNodeData(id, {
      texturedModel: undefined,
      status: undefined
    });
  };

  return (
    <div
      id={`node-${id}`}
      style={{ width: "290px" }}
      className={`relative rounded-lg overflow-visible font-sans text-white transition-all duration-200 ${
        selected ? "scale-[1.02] z-50" : ""
      }`}
    >
      {/* Outer Floating Drag Grip Handle (Grab to Move Node) */}
      <div className="absolute -top-[26px] left-1/2 -translate-x-1/2 w-36 h-6 bg-neutral-900/90 border border-neutral-800/80 rounded flex items-center justify-center select-none shadow-xl backdrop-blur-md cursor-grab active:cursor-grabbing hover:bg-neutral-850 hover:border-neutral-700 transition-all z-[999] group">
        <GripHorizontal className="w-4 h-4 text-amber-500 opacity-60 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Sockets */}
      <Handle
        type="target"
        position={Position.Left}
        id="model"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
        style={{ top: "35%" }}
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>
      <Handle
        type="target"
        position={Position.Left}
        id="material"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
        style={{ top: "65%" }}
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>
      <Handle
        type="source"
        position={Position.Right}
        id="texturedModel"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !right-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>

      <div className={`w-full h-[220px] bg-[#1A1A1A] rounded-md relative overflow-hidden flex flex-col border ${selected ? "border-purple-600 shadow-[0_0_20px_rgba(147,51,234,0.4)]" : "border-neutral-800"} transition-all duration-300 relative group`}>
        {/* Dynamic Map Image view or placeholder */}
        {activeColor ? (
          <div className="w-full h-full relative group/img">
            <img
              src={activeColor}
              className="w-full h-full object-cover transition-transform duration-700"
              alt="Active PBR Color Context"
              referrerPolicy="no-referrer"
            />
            {/* Overlay badge with tint color state */}
            {colorTint !== "#ffffff" && (
              <div className="absolute bottom-2.5 left-2.5 bg-black/85 border border-neutral-800 px-2 py-0.5 rounded text-[8px] font-mono tracking-widest text-[#f59e0b] font-bold z-10 flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorTint }} />
                <span>FILTER TINT ACTIVE</span>
              </div>
            )}
            {data.texturedModel && (
              <div className="absolute bottom-2.5 right-2.5 bg-purple-950/90 border border-purple-800 px-2 py-0.5 rounded text-[8px] font-mono tracking-widest text-purple-300 font-extrabold z-10 animate-pulse">
                BAKED GLB OUT
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#1A1A1A]">
            <div className="flex flex-col items-center gap-2 opacity-35">
              <Brush className="w-12 h-12 text-neutral-500" />
            </div>
            {isApplying && (
              <div className="absolute inset-0 bg-[#000000]/80 flex flex-col items-center justify-center gap-4 z-10 animate-in fade-in duration-300">
                <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                <span className="text-[10px] font-bold text-neutral-200 tracking-wider">正在合卷烘焙贴图标准模型...</span>
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
          <div className="nodrag w-[330px] bg-[#161616]/95 border border-neutral-800 rounded-lg p-3 shadow-2xl flex flex-col gap-2.5 backdrop-blur-md">
            <div className="flex items-center gap-1.5 border-b border-neutral-800/80 pb-1.5">
              <Settings className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px] font-bold text-neutral-200">贴图混合与重定位 (Texture Mapping Editor)</span>
            </div>

            {/* Verification Status Sockets */}
            <div className="grid grid-cols-2 gap-2 border-b border-neutral-800/50 pb-2">
              <div className="flex items-center justify-between bg-neutral-950/40 border border-neutral-800/40 px-2 py-1 rounded text-[9px]">
                <span className="font-bold text-neutral-500">3D 模型接入</span>
                {activeGlb ? (
                  <span className="text-[8px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded font-black">已就绪</span>
                ) : (
                  <span className="text-[8px] bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded font-black">等待中</span>
                )}
              </div>
              <div className="flex items-center justify-between bg-neutral-950/40 border border-neutral-800/40 px-2 py-1 rounded text-[9px]">
                <span className="font-bold text-neutral-500">材质贴图接入</span>
                {activeColor ? (
                  <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-black">已就绪</span>
                ) : (
                  <span className="text-[8px] bg-neutral-800 text-neutral-500 px-1.5 py-0.5 rounded font-black">等待中</span>
                )}
              </div>
            </div>

            {/* Adjustments: color tint */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[9px] font-bold">
                <label className="uppercase tracking-wide text-neutral-500 font-extrabold text-[9px]">颜色偏置 (Tint Filter)</label>
                <span className="text-neutral-400 font-mono text-[9px] font-bold">{colorTint}</span>
              </div>
              <div className="flex items-center gap-1.5 h-6">
                <input
                  type="color"
                  value={colorTint}
                  onChange={(e) => setColorTint(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-4.5 h-4.5 rounded border border-neutral-800 bg-transparent cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={colorTint}
                  onChange={(e) => {
                    if (e.target.value.startsWith("#") && e.target.value.length <= 7) {
                      setColorTint(e.target.value);
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-5.5 text-[9px] font-mono bg-neutral-950 border border-neutral-800 text-white rounded px-1.5 w-full focus:outline-none focus:border-amber-600"
                />
              </div>
            </div>

            {/* Adjustments: Tiling overrides */}
            <div className="flex flex-col gap-1 justify-center">
              <div className="flex justify-between items-center text-[9px] font-bold">
                <label className="uppercase tracking-wide text-neutral-500 font-extrabold text-[9px]">纹理密度 (Tiling Override)</label>
                <span className="text-neutral-400 text-[9px] font-mono">{tilingScale}x</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={tilingScale}
                onChange={(e) => setTilingScale(parseFloat(e.target.value))}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-500 focus:outline-none nodrag"
              />
            </div>

            {/* Overwrite Notification Info */}
            {data.texturedModel && (
              <div className="flex items-start gap-1.5 bg-emerald-950/20 border border-emerald-900/30 p-2 rounded">
                <AlertCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-[9px] text-emerald-300 font-medium leading-relaxed">
                  贴图混合并就绪！模型物理纹理已合卷打包，请将 source 端口向后连入 <strong>[3D 场景编辑器]</strong> 以完成 3D 实例化预览。
                </span>
              </div>
            )}

            {/* Triggers */}
            <div className="flex items-center gap-2 border-t border-neutral-800/70 pt-2 text-center">
              {data.texturedModel ? (
                <Button
                  size="sm"
                  className="flex-1 text-[10px] h-7 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-800 rounded font-bold transition-all"
                  onClick={handleReset}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  重新重置贴装
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="flex-1 text-[10px] h-7 bg-amber-600 text-white hover:bg-amber-500 rounded font-bold transition-all shadow-lg hover:shadow-amber-500/10 flex items-center justify-center disabled:opacity-40"
                  disabled={isApplying || !activeGlb || !activeColor}
                  onClick={handleApplyMaterial}
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      纹理曲面贴装中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 mr-1 text-yellow-300 animate-pulse" />
                      烘焙贴装材质图
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
