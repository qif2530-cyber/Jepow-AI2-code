import React, { useRef } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Image as ImageIcon, Video, Trash2, Upload } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useShotContext } from "@/src/ShotContext";
import api from "../lib/api";

interface MediaNodeProps {
  id: string;
  data: {
    url: string;
    type: "image" | "video";
  };
  selected?: boolean;
}

export function MediaNode({ id, data, selected }: MediaNodeProps) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isVideo = file.type.startsWith("video/");
      let fileUrl = "";
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await api.post("/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          showToast: false,
        } as any);
        fileUrl = res.data.url;
      } catch (err) {
        console.warn("Upload to server failed, falling back to Base64", err);
        const reader = new FileReader();
        await new Promise((resolve) => {
          reader.onloadend = resolve;
          reader.readAsDataURL(file);
        });
        fileUrl = reader.result as string;
      }

      if (isVideo) {
        updateNodeData(id, {
          url: fileUrl,
          type: "video",
        });
        window.dispatchEvent(
          new CustomEvent("add-to-history", {
            detail: {
              type: "video",
              url: fileUrl,
              prompt: "已上传视频",
              source: "uploaded",
            },
          }),
        );
      } else {
        const img = new Image();
        img.onload = () => {
          let w = img.width;
          let h = img.height;

          updateNodeData(id, {
            url: fileUrl,
            type: "image",
            width: w,
            height: h,
          });
          window.dispatchEvent(
            new CustomEvent("add-to-history", {
              detail: {
                type: "image",
                url: fileUrl,
                prompt: "已上传图片",
                source: "uploaded",
              },
            }),
          );
        };
        img.src = fileUrl;
      }
    }
  };

  const nodeWidthProp = (data as any).width || 1024;
  const nodeHeightProp = (data as any).height || 1024;

  let nodeWidth = nodeWidthProp;
  let nodeHeight = nodeHeightProp;

  if (nodeWidth > 1024 || nodeHeight > 1024) {
    if (nodeWidth > nodeHeight) {
      nodeHeight = Math.round((nodeHeight / nodeWidth) * 1024);
      nodeWidth = 1024;
    } else {
      nodeWidth = Math.round((nodeWidth / nodeHeight) * 1024);
      nodeHeight = 1024;
    }
  }

  const uiScale = Math.max(
    1.2,
    Math.sqrt(Math.max(nodeWidth, nodeHeight) / 240),
  );

  return (
    <div
      className="flex flex-col items-center w-full"
      style={{ width: nodeWidth }}
    >
      {/* Node Header */}
      <div
        className="flex items-center justify-between mb-4 px-2"
        style={{
          width: `${100 / uiScale}%`,
          transform: `scale(${uiScale})`,
          transformOrigin: "left bottom",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="bg-[#1A1A1A] p-1.5 rounded-md shadow-lg border border-neutral-800">
            {data.type === "video" ? (
              <Video className="w-3.5 h-3.5 text-neutral-400" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5 text-neutral-400" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-bold text-neutral-900 uppercase tracking-wider">
              {(data as any).title ||
                (data.type === "video" ? "视频素材节点" : "图像资源节点")}
            </span>
            <div className="flex items-center gap-2 mt-0.5 opacity-60">
              <span className="text-[10px] font-medium font-mono text-neutral-800">
                {nodeWidthProp} × {nodeHeightProp}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Box */}
      <div
        className="w-full relative transition-all duration-300 rounded-md shadow-[0_10px_40px_rgba(0,0,0,0.1)]"
        style={{ height: nodeHeight, minHeight: 160 }}
      >
        <Handle
          type="source"
          position={Position.Right}
          id="source"
          className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !right-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
          style={{ top: "50%" }}
        >
          <span className="text-xl leading-none font-light mb-1 pointer-events-none">
            +
          </span>
        </Handle>
        <Handle
          type="target"
          position={Position.Left}
          id="target"
          className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
          style={{ top: "50%" }}
        >
          <span className="text-xl leading-none font-light mb-1 pointer-events-none">
            +
          </span>
        </Handle>

        <div
          className="w-full h-full bg-[#1A1A1A] rounded-md relative overflow-hidden flex flex-col border-0 border-transparent transition-all duration-300"
          onMouseEnter={(e) => {
            const video = e.currentTarget.querySelector("video");
            if (video) video.play().catch(console.error);
          }}
          onMouseLeave={(e) => {
            const video = e.currentTarget.querySelector("video");
            if (video) video.pause();
          }}
        >
          {/* Action Overlay */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*,video/*"
              onChange={handleFileChange}
            />
            {data.url && (
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-md bg-[#2A2A2A]/80 text-neutral-400 hover:text-white hover:bg-[#333333] transition-all border border-neutral-800/40 shadow-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent("send-to-video", {
                      detail: {
                        url: data.url,
                        type: data.type,
                      },
                    }),
                  );
                }}
                title="发送到视频编辑"
              >
                <Video className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 rounded-md bg-[#2A2A2A]/80 text-neutral-400 hover:text-white hover:bg-[#333333] transition-all border border-neutral-800/40 shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              title="上传媒体素材"
            >
              <Upload className="w-4 h-4" />
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

          {data.type === "video" ? (
            <video
              src={data.url}
              controls
              controlsList="nodownload"
              className="w-full h-full object-cover block nodrag"
              loop
              muted
              playsInline
              onLoadedMetadata={(e) => {
                const w = e.currentTarget.videoWidth;
                const h = e.currentTarget.videoHeight;
                if (
                  w &&
                  h &&
                  (!(data as any).width || (data as any).width !== w)
                ) {
                  updateNodeData(id, { width: w, height: h });
                }
              }}
            />
          ) : (
            <img
              src={data.url}
              className="w-full h-full object-cover block"
              alt="Media"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </div>
    </div>
  );
}
