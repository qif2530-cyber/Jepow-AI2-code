import React from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { Camera, GripHorizontal } from "lucide-react";

interface CyclesCameraNodeProps {
  id: string;
  data: {
    type?: "perspective" | "orthograph" | "panorama";
    fov?: number;
    aperturesize?: number;
    focaldistance?: number;
    blades?: number;
    bladesrotation?: number;
    nearclip?: number;
    farclip?: number;
  };
  selected?: boolean;
}

export function CyclesCameraNode({ id, data, selected }: CyclesCameraNodeProps) {
  const { updateNodeData } = useReactFlow();
  const type = data.type ?? "perspective";
  const fov = data.fov ?? Math.PI / 4;
  const aperturesize = data.aperturesize ?? 0;
  const focaldistance = data.focaldistance ?? 10;

  const update = (patch: Partial<CyclesCameraNodeProps["data"]>) => {
    const next = { ...data, ...patch };
    updateNodeData(id, {
      ...patch,
      cyclesCamera: {
        type: next.type ?? "perspective",
        fov: next.fov ?? Math.PI / 4,
        aperturesize: next.aperturesize ?? 0,
        focaldistance: next.focaldistance ?? 10,
        blades: next.blades ?? 0,
        bladesrotation: next.bladesrotation ?? 0,
        nearclip: next.nearclip ?? 0.00001,
        farclip: next.farclip ?? 100000,
      },
    });
  };

  return (
    <div className={`relative w-[230px] rounded-lg bg-[#121212] border ${selected ? "border-cyan-500 shadow-[0_0_18px_rgba(6,182,212,0.25)]" : "border-neutral-800"} text-white`}>
      <div className="absolute -top-[22px] left-1/2 -translate-x-1/2 w-28 h-5 bg-neutral-900/90 border border-neutral-800 rounded flex items-center justify-center cursor-grab">
        <GripHorizontal className="w-3.5 h-3.5 text-cyan-400 opacity-70" />
      </div>
      <Handle type="source" position={Position.Right} id="cyclesCamera" className="!w-7 !h-7 !right-[-14px] !bg-[#2A2A2A] !border-cyan-500 rounded-full" />
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-cyan-400" />
            <span className="text-[11px] font-bold">Cycles Camera</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              update({ type: type === "perspective" ? "orthograph" : "perspective" });
            }}
            className="text-[8px] text-cyan-300 border border-cyan-900/60 bg-cyan-950/30 rounded px-1.5 py-0.5"
            title="官方 Camera Type: perspective / orthograph / panorama"
          >
            {type}
          </button>
        </div>
        <p className="text-[8px] text-neutral-500 leading-tight">
          光学参数（FOV / 光圈 / 焦距 / 裁剪）。轨道角度请在 3D 编辑器 Cycles 视窗拖拽控制，与 CL 相机共用。
        </p>
        <div className="grid grid-cols-2 gap-2 text-[9px]">
          <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            FOV {fov.toFixed(2)}
            <input type="range" min="0.25" max="1.5" step="0.01" value={fov} onChange={(e) => update({ fov: parseFloat(e.target.value) })} className="h-1 accent-cyan-500" />
          </label>
          <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            Aperture {aperturesize.toFixed(2)}
            <input type="range" min="0" max="1" step="0.01" value={aperturesize} onChange={(e) => update({ aperturesize: parseFloat(e.target.value) })} className="h-1 accent-purple-500" />
          </label>
          <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            Focus {focaldistance.toFixed(1)}
            <input type="range" min="0.1" max="50" step="0.1" value={focaldistance} onChange={(e) => update({ focaldistance: parseFloat(e.target.value) })} className="h-1 accent-purple-500" />
          </label>
        </div>
      </div>
    </div>
  );
}
