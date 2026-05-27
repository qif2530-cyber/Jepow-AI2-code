import React from "react";
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
  const width = data.width ?? 768;
  const height = data.height ?? 512;
  const device = data.device ?? "CPU";
  const denoise = data.denoise ?? true;

  const update = (patch: Partial<CyclesRenderSettingsNodeProps["data"]>) => {
    const next = { ...data, ...patch };
    updateNodeData(id, {
      ...patch,
      cyclesRenderSettings: {
        type: "cycles_render_settings",
        samples: next.samples ?? 128,
        bounces: next.bounces ?? 8,
        width: next.width ?? 768,
        height: next.height ?? 512,
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
            className="text-[8px] text-blue-300 border border-blue-900/60 bg-blue-950/30 rounded px-1.5 py-0.5"
            title={
              device === "METAL"
                ? "GPU 需 standalone 打包 Metal 内核；未打包时请用 CPU"
                : "推荐：当前 jepow-cycles standalone 默认可用 CPU"
            }
          >
            {device}
          </button>
        </div>
        {device === "METAL" ? (
          <p className="text-[8px] text-amber-400/90 leading-tight">
            Metal 需 kernel.framework；未打包时会报错，请先用 CPU。
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
