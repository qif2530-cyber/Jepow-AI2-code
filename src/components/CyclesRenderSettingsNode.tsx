import React, { useEffect, useState } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { GripHorizontal, Sliders } from "lucide-react";

interface CyclesRenderSettingsNodeProps {
  id: string;
  data: {
    samples?: number;
    bounces?: number;
    width?: number;
    height?: number;
    device?: "CPU" | "METAL";
    denoise?: boolean;
  };
  selected?: boolean;
}

export function CyclesRenderSettingsNode({ id, data, selected }: CyclesRenderSettingsNodeProps) {
  const { updateNodeData } = useReactFlow();
  const samples = data.samples ?? 128;
  const bounces = data.bounces ?? 8;
  const width = data.width == null || data.width === 768 ? 2048 : data.width;
  const height = data.height == null || data.height === 512 ? 1536 : data.height;
  const device = data.device ?? "CPU";
  const denoise = data.denoise ?? true;
  const [metalAvailable, setMetalAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    window.jepowDesktop?.viewport?.getStatus?.()
      .then((status) => {
        const cycles = status.cycles as { metalKernelBundled?: boolean; available?: boolean } | undefined;
        if (active) setMetalAvailable(!!cycles?.available && !!cycles?.metalKernelBundled);
      })
      .catch(() => {
        if (active) setMetalAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = (patch: Partial<CyclesRenderSettingsNodeProps["data"]>) => {
    const next = { ...data, ...patch };
    updateNodeData(id, {
      ...patch,
      cyclesRenderSettings: {
        type: "cycles_render_settings",
        samples: next.samples ?? 128,
        bounces: next.bounces ?? 8,
        width: next.width ?? 2048,
        height: next.height ?? 1536,
        device: next.device ?? "CPU",
        denoise: next.denoise ?? true,
      },
    });
  };

  return (
    <div className={`relative w-[220px] rounded-lg bg-[#121212] border ${selected ? "border-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.28)]" : "border-neutral-800"} text-white`}>
      <div className="absolute -top-[22px] left-1/2 -translate-x-1/2 w-28 h-5 bg-neutral-900/90 border border-neutral-800 rounded flex items-center justify-center cursor-grab">
        <GripHorizontal className="w-3.5 h-3.5 text-blue-400 opacity-70" />
      </div>
      <Handle type="source" position={Position.Right} id="cyclesRenderSettings" className="!w-7 !h-7 !right-[-14px] !bg-[#2A2A2A] !border-blue-500 rounded-full" />
      <div className="h-[132px] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span className="text-[11px] font-bold">Cycles Render</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              update({ device: device === "CPU" ? "METAL" : "CPU" });
            }}
            className={`text-[8px] border rounded px-1.5 py-0.5 ${
              device === "METAL"
                ? "text-emerald-300 border-emerald-900/60 bg-emerald-950/30"
                : "text-blue-300 border-blue-900/60 bg-blue-950/30"
            }`}
            title={
              device === "METAL"
                ? "Metal GPU 渲染；第一次会编译 kernel，可能等待 1-2 分钟"
                : metalAvailable
                  ? "切换到 Metal GPU"
                  : "未检测到已打包 Metal kernel，仍可切换但渲染时会给出错误提示"
            }
          >
            {device}
          </button>
        </div>
        {device === "METAL" && !metalAvailable ? (
          <p className="text-[8px] text-amber-400/90 leading-tight">
            未检测到 Metal kernel；请重新构建或确认 CYCLES_KERNEL_PATH。
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 text-[9px]">
          <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            Samples {samples}
            <input type="range" min="16" max="512" step="16" value={samples} onChange={(e) => update({ samples: parseInt(e.target.value) })} className="h-1 accent-blue-500" />
          </label>
          <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            Bounces {bounces}
            <input type="range" min="1" max="24" step="1" value={bounces} onChange={(e) => update({ bounces: parseInt(e.target.value) })} className="h-1 accent-blue-500" />
          </label>
          <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            Width {width}
            <input type="range" min="256" max="2048" step="128" value={width} onChange={(e) => update({ width: parseInt(e.target.value) })} className="h-1 accent-purple-500" />
          </label>
          <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            Height {height}
            <input type="range" min="256" max="1536" step="128" value={height} onChange={(e) => update({ height: parseInt(e.target.value) })} className="h-1 accent-purple-500" />
          </label>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            update({ denoise: !denoise });
          }}
          className={`h-6 rounded text-[9px] font-bold border ${denoise ? "border-emerald-800 bg-emerald-950/35 text-emerald-300" : "border-neutral-800 bg-neutral-950 text-neutral-500"}`}
        >
          Denoise {denoise ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}
