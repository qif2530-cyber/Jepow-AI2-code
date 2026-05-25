import React, { useRef } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { ImageIcon, Upload } from "lucide-react";
import { CyclesNodeShell } from "./CyclesNodeShell";

const CHANNELS = [
  { id: "baseColor", label: "Base Color" },
  { id: "normal", label: "Normal" },
  { id: "roughness", label: "Roughness" },
  { id: "metallic", label: "Metallic" },
  { id: "displacement", label: "Displacement" },
  { id: "emission", label: "Emission" },
  { id: "alpha", label: "Alpha" },
] as const;

interface CyclesImageTextureNodeProps {
  id: string;
  data: {
    imageUrl?: string;
    url?: string;
    channel?: string;
  };
  selected?: boolean;
}

export function CyclesImageTextureNode({ id, data, selected }: CyclesImageTextureNodeProps) {
  const { updateNodeData } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageUrl = data.imageUrl || data.url || "";
  const channel = data.channel || "baseColor";

  const update = (patch: Partial<CyclesImageTextureNodeProps["data"]>) => {
    updateNodeData(id, { ...data, ...patch });
  };

  const onFile = (file?: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    update({ imageUrl: url, url });
  };

  return (
    <CyclesNodeShell
      id={id}
      title="Image Texture"
      accentClass="border-violet-500"
      selected={selected}
      width={200}
      height={118}
      zoom={zoom}
      handles={[
        {
          id: "textureOut",
          type: "source",
          borderClass: "!border-violet-500",
          textClass: "text-violet-400",
        },
      ]}
      panel={
        <div className="flex flex-col gap-2">
          <input
            className="w-full h-7 text-[10px] bg-neutral-900 border border-neutral-700 rounded px-2"
            placeholder="图片 URL"
            value={imageUrl.startsWith("blob:") ? "" : imageUrl}
            onChange={(e) => update({ imageUrl: e.target.value, url: e.target.value })}
          />
          <button
            type="button"
            className="h-7 text-[10px] rounded border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 flex items-center justify-center gap-1"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-3 h-3" /> 上传本地图
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      }
    >
      <div className="flex items-center gap-1.5 text-[9px] text-neutral-400">
        <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
        <select
          className="flex-1 bg-neutral-900 border border-neutral-700 rounded text-[9px] h-6 px-1"
          value={channel}
          onChange={(e) => update({ channel: e.target.value })}
        >
          {CHANNELS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="h-14 rounded bg-neutral-950 border border-neutral-800 overflow-hidden flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[8px] text-neutral-600">未指定纹理</span>
        )}
      </div>
    </CyclesNodeShell>
  );
}
