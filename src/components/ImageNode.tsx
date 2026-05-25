import React, { useRef } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Image as ImageIcon, Trash2, Upload, Video, Plus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import api from "../lib/api";

interface ImageNodeProps {
  id: string;
  data: {
    url: string;
    width?: number;
    height?: number;
    title?: string;
  };
  selected?: boolean;
}

export function ImageNode({ id, data, selected }: ImageNodeProps) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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

      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;

        updateNodeData(id, {
          url: fileUrl,
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
  };

  const nodeWidthProp = data.width || 1024;
  const nodeHeightProp = data.height || 1024;

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
            <ImageIcon className="w-3.5 h-3.5 text-neutral-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-bold text-neutral-900 uppercase tracking-wider">
              {data.title || "图像资源节点"}
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
          {/* Action Overlay */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
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
                        type: "image",
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
              title="上传图像资源"
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

          {data.url ? (
            <img
              src={data.url}
              className="w-full h-full object-cover block"
              alt="Image Resource"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#1A1A1A] text-neutral-600 gap-2">
              <ImageIcon className="w-8 h-8 opacity-20" />
              <span className="text-[10px] font-medium uppercase tracking-wider opacity-40">
                空白图像
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
