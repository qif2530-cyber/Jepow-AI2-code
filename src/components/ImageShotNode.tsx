import React, { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import {
  Loader2,
  Image as ImageIcon,
  Trash2,
  Download,
  Maximize2,
  Layers,
  Palette,
  Maximize,
  Type,
  Camera,
  Languages,
  Shuffle,
  ChevronUp,
  Plus,
} from "lucide-react";
import { useShotContext } from "../ShotContext";
import { Shot } from "../types";
import { IMAGE_MODELS } from "../lib/model-config";
import { createPortal } from "react-dom";
import { useCtrlPressed } from "@/src/hooks/useCtrlPressed";

interface ImageShotNodeProps {
  id: string;
  data: {
    shot: Shot;
  };
  selected?: boolean;
}

export function ImageShotNode({ id, data, selected }: ImageShotNodeProps) {
  const { shot = {} as Shot } = data || {};
  const { deleteElements } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const isCtrlPressed = useCtrlPressed();
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );

  const {
    globalImageModel,
    updateShot,
    handleGenerateImage,
    handleShotImageUpload,
    setFullscreenImage,
    isProcessing: globalIsProcessing,
  } = (useShotContext() || {}) as any;

  const currentModel =
    shot.imageModel || globalImageModel || "gemini-3.1-flash-image-preview";
  const modelConfig =
    IMAGE_MODELS[currentModel] ||
    IMAGE_MODELS["gemini-3.1-flash-image-preview"];
  const [localDescription, setLocalDescription] = useState(
    shot.description || "",
  );

  const calculateRatio = (w: number, h: number) => {
    if (w === 0 || h === 0) return `${w}:${h}`;
    if (Math.abs(w / h - 16 / 9) < 0.05) return "16:9";
    if (Math.abs(w / h - 9 / 16) < 0.05) return "9:16";
    if (Math.abs(w / h - 4 / 3) < 0.05) return "4:3";
    if (Math.abs(w / h - 3 / 4) < 0.05) return "3:4";
    if (Math.abs(w / h - 1) < 0.05) return "1:1";

    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(w, h);
    let rw = w / divisor;
    let rh = h / divisor;
    if (rw > 100 || rh > 100) return `${w}:${h}`;
    return `${rw}:${rh}`;
  };

  const [actualDimensions, setActualDimensions] = useState<{
    w: number;
    h: number;
    ratio: string;
  } | null>(() => {
    if (shot.parameters?.actualWidth && shot.parameters?.actualHeight) {
      const w = shot.parameters.actualWidth;
      const h = shot.parameters.actualHeight;
      return {
        w,
        h,
        ratio: calculateRatio(w, h),
      };
    }
    return null;
  });

  useEffect(() => {
    setLocalDescription(shot.description || "");
  }, [shot.description]);

  useEffect(() => {
    if (!shot.imageUrl && (!shot.imageUrls || shot.imageUrls.length === 0)) {
      setActualDimensions(null);
    } else if (shot.parameters?.actualWidth && shot.parameters?.actualHeight) {
      const w = shot.parameters.actualWidth;
      const h = shot.parameters.actualHeight;
      setActualDimensions({
        w,
        h,
        ratio: calculateRatio(w, h),
      });
    }
  }, [shot.imageUrl, shot.imageUrls, shot.parameters?.actualWidth, shot.parameters?.actualHeight]);

  const getTargetResParams = (customRes?: string) => {
    const ratio = shot.aspectRatio || "16:9";
    const [rw, rh] = ratio.split(":").map(Number);
    // Base resolution for '1K' is roughly 1MP (e.g. 1280x720 is ~0.9MP)
    const targetPixels = 1048576;
    let multiplier = 1.25; // Default 1K is slightly larger for better quality
    const resToUse = customRes || shot.resolution;
    if (resToUse === "2K") multiplier = 2.0; // 2K is ~2MP (1920x1080)
    if (resToUse === "4K") multiplier = 4.0; // 4K is ~8MP (3840x2160)

    let w = Math.sqrt(targetPixels * (rw / rh)) * multiplier;
    let h = (targetPixels / (w / multiplier)) * multiplier;

    w = Math.round(w / 32) * 32;
    h = Math.round(h / 32) * 32;
    const maxDim = 8192; // High limit
    if (w > maxDim) {
      h = Math.round(h * (maxDim / w));
      w = maxDim;
    }
    if (h > maxDim) {
      w = Math.round(w * (maxDim / h));
      h = maxDim;
    }
    return { w, h, str: `${w}x${h}` };
  };

  const { w: nodeW, h: nodeH, str: targetResStr } = getTargetResParams();

  // Visual display size is comfortably determined by the actual material's size if available, otherwise fallback
  const ratio = shot.aspectRatio || "16:9";
  const [rw, rh] = ratio.split(":").map(Number);
  
  let nodeWidth = 480;
  let nodeHeight = Math.round(480 * (rh / rw));

  if (actualDimensions && actualDimensions.w && actualDimensions.h) {
    // Proportional to the actual material's resolution scaled to a comfortable range (clamp width between 320px and 800px)
    const scaledWidth = actualDimensions.w * 0.25;
    nodeWidth = Math.min(Math.max(scaledWidth, 320), 800);
    nodeHeight = Math.round(nodeWidth * (actualDimensions.h / actualDimensions.w));
  }

  // More aggressive UI scaling for visibility as requested
  const uiScale = Math.max(1.2, Math.sqrt(nodeWidth / 240));

  return (
    <div
      className="flex flex-col items-center w-full"
      style={{ width: nodeWidth }}
    >
      {/* Main Content Box (Image/Placeholder) */}
      <div
        className="w-full relative transition-all duration-300 rounded-md shadow-[0_10px_40px_rgba(0,0,0,0.1)]"
        style={{ height: nodeHeight }}
      >
        {/* Handles - Moved outside overflow-hidden to prevent clipping, matching Fig 3 */}
        <Handle
          type="source"
          position={Position.Right}
          id="source"
          className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !right-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
          style={{ top: "50%" }}
        >
          <Plus className="w-5 h-5 pointer-events-none" />
        </Handle>
        <Handle
          type="target"
          position={Position.Left}
          id="target"
          className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
          style={{ top: "50%" }}
        >
          <Plus className="w-5 h-5 pointer-events-none" />
        </Handle>

        <div
          className="w-full h-full bg-[#1A1A1A] rounded-md relative overflow-hidden flex flex-col border-0 border-transparent transition-all duration-300"
        >
          <div className="w-full h-full relative group">
            {/* Metadata overlay */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-md bg-[#2A2A2A]/80 text-neutral-400 hover:text-white transition-all border border-neutral-800/40 shadow-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenImage(shot.imageUrl || shot.imageUrls?.[0]);
                }}
                title="全屏查看"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-md bg-[#2A2A2A]/80 text-neutral-400 hover:text-blue-400 hover:bg-[#333333] transition-all border border-neutral-800/40 shadow-lg"
                onClick={async (e) => {
                  e.stopPropagation();
                  const url =
                    shot.imageUrl || (shot.imageUrls && shot.imageUrls[0]);
                  if (!url) return;
                  try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const downloadUrl = window.URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = downloadUrl;
                    link.download = `generation_${Date.now()}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(downloadUrl);
                  } catch (error) {
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `generation_${Date.now()}.png`;
                    link.target = "_blank";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }
                }}
                disabled={
                  !shot.imageUrl &&
                  (!shot.imageUrls || shot.imageUrls.length === 0)
                }
                title="下载图片"
              >
                <Download className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-md bg-[#2A2A2A]/80 text-neutral-400 hover:text-red-400 hover:bg-[#333333] transition-all border border-neutral-800/40 shadow-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteElements({ nodes: [{ id }] });
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {shot.imageUrl || (shot.imageUrls && shot.imageUrls.length > 0) ? (
              <div className="w-full h-full relative group/img">
                <img
                  src={shot.imageUrl || (shot.imageUrls && shot.imageUrls[0])}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-102"
                  alt="Generated"
                  referrerPolicy="no-referrer"
                  onLoad={(e) => {
                    const target = e.target as HTMLImageElement;
                    const w = target.naturalWidth;
                    const h = target.naturalHeight;
                    setActualDimensions({
                      w,
                      h,
                      ratio: calculateRatio(w, h),
                    });
                    
                    if (shot.parameters?.actualWidth !== w || shot.parameters?.actualHeight !== h) {
                      updateShot(shot.id, {
                        parameters: {
                          ...(shot.parameters || {}),
                          actualWidth: w,
                          actualHeight: h,
                        }
                      });
                    }
                  }}
                />

                {actualDimensions && (
                  <div className="absolute top-4 left-4 z-20 px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-md text-[11px] font-mono text-neutral-300 font-medium tracking-wide shadow-lg border border-white/10 pointer-events-none">
                    {actualDimensions.w} × {actualDimensions.h}
                  </div>
                )}

                {shot.imageUrls && shot.imageUrls.length > 1 && (
                  <div className="absolute inset-x-0 bottom-0 p-4 pt-16 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2 z-30 pointer-events-none">
                    <div className="flex flex-row flex-nowrap gap-4 pointer-events-auto overflow-x-auto overflow-y-visible py-4 px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] nodrag">
                      {shot.imageUrls.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          className={`w-28 h-28 object-cover rounded-md shadow-2xl ring-2 transition-all cursor-pointer hover:scale-110 object-center shrink-0 ${shot.imageUrl === url ? "ring-blue-500 scale-110 z-10" : "ring-white/20 hover:ring-white/60 hover:z-10 opacity-70 hover:opacity-100"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateShot(shot.id, { imageUrl: url });
                          }}
                          referrerPolicy="no-referrer"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#1A1A1A]">
                <div
                  className="flex flex-col items-center gap-4 opacity-30"
                  style={{ transform: `scale(${uiScale * 2})` }}
                >
                  <ImageIcon className="w-12 h-12 text-neutral-500" />
                </div>
                {shot.status === "generating_image" && (
                  <div className="absolute inset-0 bg-[#000000]/80 flex flex-col items-center justify-center gap-6 z-10 animate-in fade-in duration-500">
                    <div className="relative">
                      <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-blue-400 opacity-50" />
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-sm font-bold text-neutral-200 tracking-[0.4em] uppercase animate-pulse">
                        正在生成 {shot.progress || 0}%
                      </span>
                      <div className="w-48 h-1 bg-black/50 rounded-full overflow-hidden shadow-inner">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${shot.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 
          Floating PROMPT Control Panel
          Follows the bottom of the node.
      */}
      {selected && isOnlySelected && (
        <div
          className="absolute z-[9999] pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300"
          style={{
            top: "100%",
            marginTop: 24 * (1 / Math.max(0.01, zoom)),
            left: "50%",
            transform: `translateX(-50%) scale(${1 / Math.max(0.01, zoom)})`,
            transformOrigin: "top center",
          }}
        >
          <div className="w-[800px] bg-[#1A1A1A] border border-neutral-800 rounded-md overflow-hidden shadow-2xl">
            {/* Header / Tabs - Fig 1 style */}
            <div className="flex items-center gap-2 p-4 pb-2 overflow-x-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // TODO: Add image from canvas
                }}
                className="flex items-center shrink-0 gap-2 h-8 px-3 rounded-lg bg-[#2A2A2A] border border-neutral-700 text-neutral-400 hover:text-white hover:bg-[#333333] transition-all font-medium text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加画布中的垫图</span>
              </button>

              {shot.referenceImages && shot.referenceImages.length > 0 && (
                <div className="flex items-center gap-2 ml-1">
                  {shot.referenceImages.map((url, idx) => (
                    <div
                      key={idx}
                      className="relative group/ref shrink-0 w-8 h-8 rounded border border-neutral-700 overflow-hidden bg-[#2A2A2A] shadow"
                    >
                      <img
                        src={url}
                        alt="Reference"
                        className="w-full h-full object-cover opacity-80 group-hover/ref:opacity-100 transition-opacity"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Prompt Area */}
            <div className="px-5 py-2">
              <Textarea
                value={localDescription}
                onChange={(e) => {
                  setLocalDescription(e.target.value);
                  updateShot(shot.id, { description: e.target.value });
                }}
                className="w-full text-base font-medium min-h-[80px] border-none bg-transparent shadow-none focus-visible:ring-0 p-0 placeholder:text-neutral-500 resize-none text-neutral-200"
                placeholder="描述你想要生成的画面内容，按/呼出指令，@引用素材"
              />
            </div>

            {/* Footer Toolbar */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-neutral-800 bg-[#242424]">
              <div className="flex items-center gap-4">
                {/* Model Selection */}
                <div className="flex items-center gap-2 group cursor-pointer">
                  <div className="w-5 h-5 bg-blue-500/20 rounded flex items-center justify-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  </div>
                  <select
                    value={currentModel}
                    onChange={(e) =>
                      updateShot(shot.id, { imageModel: e.target.value })
                    }
                    className="bg-transparent text-sm font-medium text-neutral-300 focus:outline-none appearance-none cursor-pointer"
                  >
                    {Object.values(IMAGE_MODELS).map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#2A2A2A]">
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Aspect Ratio */}
                <div className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors cursor-pointer">
                  <Maximize className="w-4 h-4" />
                  <select
                    value={shot.aspectRatio || "16:9"}
                    onChange={(e) =>
                      updateShot(shot.id, { aspectRatio: e.target.value })
                    }
                    className="bg-transparent text-sm font-medium focus:outline-none appearance-none cursor-pointer"
                  >
                    <option value="16:9" className="bg-[#2A2A2A]">
                      16:9
                    </option>
                    <option value="9:16" className="bg-[#2A2A2A]">
                      9:16
                    </option>
                    <option value="1:1" className="bg-[#2A2A2A]">
                      1:1
                    </option>
                  </select>
                  <label className="text-xs text-neutral-600 ml-1">·</label>
                  <select
                    value={shot.resolution || "2K"}
                    onChange={(e) =>
                      updateShot(shot.id, { resolution: e.target.value })
                    }
                    className="bg-transparent text-sm font-medium focus:outline-none appearance-none cursor-pointer"
                  >
                    <option value="1K" className="bg-[#2A2A2A]">
                      {getTargetResParams("1K").w} ×{" "}
                      {getTargetResParams("1K").h}
                    </option>
                    <option value="2K" className="bg-[#2A2A2A]">
                      {getTargetResParams("2K").w} ×{" "}
                      {getTargetResParams("2K").h}
                    </option>
                    <option value="4K" className="bg-[#2A2A2A]">
                      {getTargetResParams("4K").w} ×{" "}
                      {getTargetResParams("4K").h}
                    </option>
                  </select>
                </div>

                {/* Camera icon */}
                <div className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors cursor-pointer ml-2">
                  <Camera className="w-4 h-4" />
                  <span className="text-sm font-medium">摄像机</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer px-2 py-1 rounded bg-[#2A2A2A] border border-neutral-700 hover:border-neutral-600">
                  <select
                    value={shot.numberOfImages || 1}
                    onChange={(e) =>
                      updateShot(shot.id, {
                        numberOfImages: parseInt(e.target.value),
                      })
                    }
                    className="bg-transparent text-sm font-medium focus:outline-none appearance-none cursor-pointer"
                  >
                    {[1, 2, 3, 4].map((num) => (
                      <option key={num} value={num} className="bg-[#2A2A2A]">
                        {num}张
                      </option>
                    ))}
                  </select>
                  <ChevronUp className="w-3 h-3 opacity-50" />
                </div>
                <div className="flex items-center gap-1 text-sm font-medium text-neutral-500">
                  <Zap className="w-3.5 h-3.5 text-yellow-500" />
                  <span>14</span>
                </div>
                <Button
                  size="icon"
                  className="w-10 h-10 rounded-md bg-neutral-800 hover:bg-blue-600 transition-all shadow-lg text-neutral-400 hover:text-white relative"
                  onClick={() => handleGenerateImage(shot.id)}
                  disabled={shot.status === "generating_image"}
                >
                  {shot.status === "generating_image" ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="none" className="text-neutral-700" />
                        <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="none" className="text-blue-500 transition-all duration-300" strokeDasharray="88" strokeDashoffset={88 - (88 * (shot.progress || 0)) / 100} strokeLinecap="round" />
                      </svg>
                      <span className="absolute text-[9px] font-bold text-neutral-200">{shot.progress || 0}%</span>
                    </div>
                  ) : (
                    <ChevronUp className="w-6 h-6" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Minimal Zap icon reproduction
function Zap(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
