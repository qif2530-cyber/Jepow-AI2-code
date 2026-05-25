import React, { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Shot } from "../types";
import { useShotContext } from "../ShotContext";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Loader2,
  Video,
  Maximize2,
  Trash2,
  Bot,
  Palette,
  Clock,
  Zap,
  Plus,
  Languages,
  Shuffle,
  ChevronUp,
  Camera,
  UserSquare,
  MousePointer2,
  Link,
  Image,
} from "lucide-react";
import { KLING_MODELS } from "../lib/kling-models";
import { createPortal } from "react-dom";
import { useCtrlPressed } from "@/src/hooks/useCtrlPressed";

interface VideoShotNodeProps {
  id: string;
  data: {
    shot: Shot;
    incomingRefImages?: string[];
  };
  selected?: boolean;
}

export function VideoShotNode({ id, data, selected }: VideoShotNodeProps) {
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

  const { updateShot, handleGenerateVideo, handleShotImageUpload } =
    (useShotContext() || {}) as any;

  const [localDescription, setLocalDescription] = useState(
    shot.description || "",
  );
  const [isHovered, setIsHovered] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [videoUrlInput, setVideoUrlInput] = useState("");

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
    if (!shot.videoUrl && (!shot.videoUrls || shot.videoUrls.length === 0)) {
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
  }, [shot.videoUrl, shot.videoUrls, shot.parameters?.actualWidth, shot.parameters?.actualHeight]);

  const videoRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (isHovered) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isHovered]);

  // Model and feature logic
  let modelId = (shot.klingModel as keyof typeof KLING_MODELS) || "kling-video-o1";
  const selectedModelDef = KLING_MODELS[modelId] || KLING_MODELS["kling-video-o1"];
  const availableModes = selectedModelDef.modes;
  const availableDurations = selectedModelDef.durations;
  const availableResolutions = selectedModelDef.resolutions || ["720p"];
  const availableAspectRatios = selectedModelDef.aspectRatios || ["16:9"];

  const currentMode = (shot.klingMode as any) || "std";
  const currentDuration = (shot.klingDuration as any) || "5s";
  const features = selectedModelDef.getSupport(currentMode, currentDuration);

  // Default input mode if none set
  let inputMode = shot.videoInputMode || "t2v";

  const ratio = shot.aspectRatio || "16:9";
  const [rw, rh] = ratio.split(":").map(Number);

  // Base dimensions based on resolution settings
  const getTargetResParams = () => {
    const ratio = shot.aspectRatio || "16:9";
    const [rw, rh] = ratio.split(":").map(Number);
    // Base resolution for '1K'
    const targetPixels = 1048576;
    let multiplier = 1.25;
    if (shot.resolution === "2K") multiplier = 2.0;
    if (shot.resolution === "4K") multiplier = 4.0;

    let w = Math.sqrt(targetPixels * (rw / rh)) * multiplier;
    let h = (targetPixels / (w / multiplier)) * multiplier;

    w = Math.round(w / 32) * 32;
    h = Math.round(h / 32) * 32;
    const maxDim = 8192;
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

  const { w: nodeW, h: nodeH } = getTargetResParams();
  
  // Visual display size is comfortably fixed to 480px and only scales in heights based on aspect ratio
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
      className="flex flex-col items-center w-full relative"
      style={{ width: nodeWidth }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Content Box (Video/Placeholder) */}
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
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
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

            {shot.videoUrl || (shot.videoUrls && shot.videoUrls.length > 0) ? (
              <div className="w-full h-full relative group/vid">
                <video
                  ref={videoRef}
                  src={shot.videoUrl || (shot.videoUrls && shot.videoUrls[0])}
                  className="w-full h-full object-cover"
                  controls={selected}
                  loop
                  muted
                  playsInline
                  onLoadedMetadata={(e) => {
                    const target = e.target as HTMLVideoElement;
                    const w = target.videoWidth;
                    const h = target.videoHeight;
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

                {shot.videoUrls && shot.videoUrls.length > 1 && (
                  <div className="absolute inset-x-0 bottom-0 p-4 pt-16 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2 z-30 pointer-events-none">
                    <div className="flex flex-row flex-nowrap gap-4 pointer-events-auto overflow-x-auto overflow-y-visible py-4 px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] nodrag">
                      {shot.videoUrls.map((url, idx) => (
                        <video
                          key={idx}
                          src={url}
                          className={`w-32 h-32 object-contain bg-black/50 rounded-md shadow-2xl ring-2 transition-all cursor-pointer hover:scale-110 shrink-0 ${shot.videoUrl === url ? "ring-blue-500 scale-110 z-10" : "ring-white/20 hover:ring-white/60 hover:z-10 opacity-70 hover:opacity-100"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            updateShot(shot.id, { videoUrl: url });
                          }}
                          muted
                          playsInline
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
                  <Video className="w-12 h-12 text-neutral-500" />
                </div>
                {shot.status === "generating_video" && (
                  <div className="absolute inset-0 bg-[#000000]/80 flex flex-col items-center justify-center gap-6 z-10 animate-in fade-in duration-500">
                    <Loader2 className="w-16 h-16 text-purple-500 animate-spin" />
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-sm font-bold text-neutral-200 tracking-[0.4em] uppercase animate-pulse">
                        正在生成 {shot.progress || 0}%
                      </span>
                      <div className="w-48 h-1 bg-black/50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 transition-all duration-300"
                          style={{ width: `${shot.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                {shot.status === "error" && shot.error && (
                  <div className="absolute inset-0 bg-[#000000]/90 flex flex-col items-center justify-center gap-4 z-10 p-8 text-center" style={{ transform: `scale(${uiScale})` }}>
                    <div className="text-red-500 bg-red-500/10 p-4 rounded-full mb-2">
                       <Trash2 className="w-6 h-6" />
                    </div>
                    <p className="text-[13px] font-medium tracking-wide text-red-400 break-words max-w-full">
                      {shot.error}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 
            Consistent Bottom Control Panel - Follows Node
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
            {/* Top Selector - Fig 2 style Tabs */}
            <div className="flex items-center gap-1 p-4 pb-0 overflow-x-auto scrollbar-hide">
              {[
                features.t2v && { id: "t2v", label: "文生视频" },
                features.i2v && { id: "i2v", label: "全能参考" },
                features.firstLastFrame && { id: "firstLastFrame", label: "首尾帧" },
              ]
                .filter(Boolean)
                .map((tab: any) => (
                <button
                  key={tab.id}
                  onClick={() =>
                    updateShot(shot.id, { videoInputMode: tab.id })
                  }
                  className={`h-9 px-4 rounded-md text-[13px] font-bold transition-all ${inputMode === tab.id ? "bg-[#2A2A2A] text-white shadow-xl border border-neutral-700" : "text-neutral-500 hover:text-white hover:bg-[#333333]"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Spacing */}
            <div className="h-4"></div>

            {/* Conditional Reference Image Slots */}
            {inputMode !== "t2v" && (
              <div className="px-5 py-3 border-b border-neutral-800/60 pb-5 mb-2">
                {inputMode === "firstLastFrame" ? (
                  <div className="flex items-center gap-3">
                    {/* First Frame / Ref Image */}
                    <div className="relative group w-12 h-12 bg-[#1A1A1A] border border-neutral-700 hover:border-neutral-500 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors shadow-inner overflow-hidden">
                      {shot.videoReferenceImage ? (
                        <>
                          <img 
                            src={shot.videoReferenceImage} 
                            alt="Ref" 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover rounded-lg" 
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                             <Trash2 className="w-3.5 h-3.5 text-red-400" onClick={(e) => { e.stopPropagation(); updateShot(shot.id, { videoReferenceImage: "" }) }} />
                          </div>
                        </>
                      ) : (
                        <>
                          <Camera className="w-3.5 h-3.5 text-neutral-600 mb-0.5" />
                          <span className="text-[8px] text-neutral-500 font-medium">首帧</span>
                        </>
                      )}
                      <input 
                         type="file" 
                         accept="image/*" 
                         className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                         onChange={(e) => handleShotImageUpload(shot.id, "videoReferenceImage", e)} 
                         style={{ display: shot.videoReferenceImage ? 'none' : 'block' }}
                      />
                    </div>

                    {/* Last Frame */}
                    <div className="relative group w-12 h-12 bg-[#1A1A1A] border border-neutral-700 hover:border-neutral-500 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors shadow-inner overflow-hidden">
                      {shot.videoLastFrameImage ? (
                        <>
                          <img 
                            src={shot.videoLastFrameImage} 
                            alt="Last Ref" 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover rounded-lg" 
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                             <Trash2 className="w-3.5 h-3.5 text-red-400" onClick={(e) => { e.stopPropagation(); updateShot(shot.id, { videoLastFrameImage: "" }) }} />
                          </div>
                        </>
                      ) : (
                        <>
                          <Camera className="w-3.5 h-3.5 text-neutral-600 mb-0.5" />
                          <span className="text-[8px] text-neutral-500 font-medium">尾帧</span>
                        </>
                      )}
                      <input 
                         type="file" 
                         accept="image/*" 
                         className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                         onChange={(e) => handleShotImageUpload(shot.id, "videoLastFrameImage", e)} 
                         style={{ display: shot.videoLastFrameImage ? 'none' : 'block' }}
                      />
                    </div>
                  </div>
                ) : (
                  // i2v - 全能参考
                  <div className="flex flex-wrap items-center gap-2">
                    {/* List uploaded image references */}
                    {(() => {
                      let imageRefs = [...(shot.videoReferenceImages || [])];
                      if (imageRefs.length === 0 && shot.videoReferenceImage) {
                        imageRefs = [shot.videoReferenceImage];
                      }
                      return imageRefs.map((imgUrl, index) => (
                        <div key={index} className="relative group w-12 h-12 bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shrink-0 shadow-sm">
                          <img
                            src={imgUrl}
                            alt={`Ref ${index + 1}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                            <button
                              type="button"
                              onClick={() => {
                                const updatedRefs = imageRefs.filter((_, i) => i !== index);
                                updateShot(shot.id, {
                                  videoReferenceImages: updatedRefs,
                                  videoReferenceImage: updatedRefs[0] || ""
                                });
                              }}
                              className="text-red-400 hover:text-red-300 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ));
                    })()}

                    {/* Upload box if < 9 */}
                    {(() => {
                      let imageRefs = [...(shot.videoReferenceImages || [])];
                      if (imageRefs.length === 0 && shot.videoReferenceImage) {
                        imageRefs = [shot.videoReferenceImage];
                      }
                      if (imageRefs.length < 9) {
                        return (
                          <div className="relative w-12 h-12 bg-[#1A1A1A] border border-neutral-700 hover:border-neutral-500 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors shadow-inner overflow-hidden">
                            <Camera className="w-3.5 h-3.5 text-neutral-500 mb-0.5" />
                            <span className="text-[8px] text-neutral-500 font-medium">图片</span>
                            <input 
                               type="file" 
                               multiple
                               accept="image/*" 
                               className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                               onChange={(e) => handleShotImageUpload(shot.id, "videoReferenceImages", e)} 
                            />
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Subtle vertical separator to group images and video */}
                    <div className="w-[1px] h-6 bg-[#333] self-center mx-1"></div>

                    {/* Video Reference */}
                    {(() => {
                      const videoRefUrl = shot.videoReferenceVideo || (shot.videoReferenceVideos && shot.videoReferenceVideos[0]) || "";
                      if (videoRefUrl) {
                        return (
                          <div className="relative group w-12 h-12 bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shrink-0 flex flex-col items-center justify-center shadow-sm">
                            <Video className="w-3.5 h-3.5 text-purple-400 mb-0.5" />
                            <span className="text-[8px] text-purple-400 font-bold max-w-full px-1 truncate">视频</span>
                            <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                              <button
                                type="button"
                                onClick={() => {
                                  updateShot(shot.id, {
                                    videoReferenceVideo: "",
                                    videoReferenceVideos: []
                                  });
                                }}
                                className="text-red-400 hover:text-red-300 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div className="relative w-12 h-12 bg-[#1A1A1A] border border-neutral-700 hover:border-neutral-500 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors shadow-inner overflow-hidden">
                            <Video className="w-3.5 h-3.5 text-neutral-500 mb-0.5" />
                            <span className="text-[8px] text-neutral-500 font-medium">视频</span>
                            <input 
                               type="file" 
                               accept="video/*" 
                               className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                               onChange={(e) => handleShotImageUpload(shot.id, "videoReferenceVideo", e)} 
                            />
                          </div>
                        );
                      }
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Prompt Area */}
            <div className="px-5 py-2">
              <Textarea
                value={localDescription}
                onChange={(e) => {
                  setLocalDescription(e.target.value);
                  updateShot(shot.id, { description: e.target.value });
                }}
                className="w-full text-base font-medium min-h-[80px] border-none bg-transparent shadow-none focus-visible:ring-0 p-0 placeholder:text-neutral-500 resize-none text-neutral-200"
                placeholder="描述你想要生成的画面内容，@引用素材"
              />
            </div>

            {/* Footer Toolbar - Fig 2 */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-neutral-800 bg-[#242424]">
              <div className="flex items-center gap-4">
                {/* Model Selection */}
                <div className="flex items-center gap-2 group cursor-pointer">
                  <div className="w-5 h-5 bg-purple-500/10 rounded flex items-center justify-center border border-purple-500/20 shadow-[0_0_12px_rgba(168,85,247,0.15)]">
                    <Bot className="w-3 h-3 text-purple-400" />
                  </div>
                  <select
                    value={modelId}
                    onChange={(e) =>
                      updateShot(shot.id, { klingModel: e.target.value })
                    }
                    className="bg-transparent text-sm font-bold text-neutral-300 focus:outline-none appearance-none cursor-pointer uppercase flex items-center gap-1 tracking-tight"
                  >
                    {Object.entries(KLING_MODELS).map(([key, m]) => (
                      <option key={key} value={key} className="bg-[#2A2A2A]">
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <ChevronUp className="w-3 h-3 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
                </div>

                {/* Aspect Ratio & Res */}
                <div className="flex items-center gap-2 text-neutral-400 hover:text-white transition-all cursor-pointer bg-[#2A2A2A] px-2 py-1 rounded-lg border border-neutral-700 hover:border-neutral-600">
                  <Maximize2 className="w-4 h-4" />
                  <select
                    value={shot.aspectRatio || "16:9"}
                    onChange={(e) =>
                      updateShot(shot.id, { aspectRatio: e.target.value })
                    }
                    className="bg-transparent text-[13px] font-bold focus:outline-none appearance-none cursor-pointer"
                  >
                    {availableAspectRatios.map(ar => (
                      <option key={ar} value={ar} className="bg-[#2A2A2A]">
                        {ar}
                      </option>
                    ))}
                  </select>
                  <label className="text-neutral-600">·</label>
                  <select
                    value={shot.resolution || "720p"}
                    onChange={(e) =>
                      updateShot(shot.id, { resolution: e.target.value })
                    }
                    className="bg-transparent text-[13px] font-bold focus:outline-none appearance-none cursor-pointer uppercase"
                  >
                    {availableResolutions.map(res => (
                      <option key={res} value={res} className="bg-[#2A2A2A]">
                        {res}
                      </option>
                    ))}
                  </select>
                  <label className="text-neutral-600">·</label>
                  <select
                    value={shot.klingDuration || "5s"}
                    onChange={(e) =>
                      updateShot(shot.id, { klingDuration: e.target.value })
                    }
                    className="bg-transparent text-[13px] font-bold focus:outline-none appearance-none cursor-pointer"
                  >
                    {availableDurations.map((d) => (
                      <option key={d} value={d} className="bg-[#2A2A2A]">
                        {d}
                      </option>
                    ))}
                  </select>
                  <div className="ml-1 opacity-70">
                    <SoundIcon className="w-4 h-4 text-neutral-400" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm font-medium text-neutral-400 hover:text-white transition-colors cursor-pointer px-2 py-1 rounded bg-[#2A2A2A] border border-neutral-700 hover:border-neutral-600">
                  <select
                    value={shot.numberOfVideos || 1}
                    onChange={(e) =>
                      updateShot(shot.id, {
                        numberOfVideos: parseInt(e.target.value),
                      })
                    }
                    className="bg-transparent text-sm font-medium focus:outline-none appearance-none cursor-pointer"
                  >
                    {[1, 2, 3, 4].map((num) => (
                      <option key={num} value={num} className="bg-[#2A2A2A]">
                        {num}个
                      </option>
                    ))}
                  </select>
                  <ChevronUp className="w-3 h-3 opacity-50" />
                </div>
                <div className="flex items-center gap-1 text-sm font-medium text-neutral-500">
                  <Zap className="w-3.5 h-3.5 text-yellow-500" />
                  <span>135</span>
                </div>
                <Button
                  size="icon"
                  className="w-10 h-10 rounded-md bg-neutral-800 hover:bg-purple-600 transition-all shadow-lg text-neutral-400 hover:text-white relative"
                  onClick={() => handleGenerateVideo(shot.id)}
                  disabled={shot.status === "generating_video"}
                >
                  {shot.status === "generating_video" ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="none" className="text-neutral-700" />
                        <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="none" className="text-purple-500 transition-all duration-300" strokeDasharray="88" strokeDashoffset={88 - (88 * (shot.progress || 0)) / 100} strokeLinecap="round" />
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

function SoundIcon(props: any) {
  return (
    <svg
      {...props}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}
