import React from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { GripHorizontal, Sun, Lightbulb, Square, CircleDot, Upload } from "lucide-react";

interface CyclesLightNodeProps {
  id: string;
  type?: string;
  data: {
    lightKind?: string;
    environmentStrength?: number;
    keyStrength?: number;
    keySize?: number;
    yaw?: number;
    pitch?: number;
    backgroundColor?: string;
    hdrUrl?: string;
    hdrName?: string;
  };
  selected?: boolean;
}

function lightKindFromType(type?: string, dataKind?: string) {
  if (dataKind) return dataKind;
  if (type === "cyclesPointLightNode") return "point";
  if (type === "cyclesAreaLightNode") return "area";
  if (type === "cyclesDirectionalLightNode") return "directional";
  if (type === "cyclesSunLightNode") return "sun";
  if (type === "cyclesHdrEnvironmentNode") return "hdr";
  return "rig";
}

function lightMeta(kind: string) {
  switch (kind) {
    case "point":
      return { title: "点光源", icon: Lightbulb, badge: "POINT" };
    case "area":
      return { title: "面光源", icon: Square, badge: "AREA" };
    case "directional":
      return { title: "平行光", icon: CircleDot, badge: "DIR" };
    case "sun":
      return { title: "物理太阳光", icon: Sun, badge: "SUN" };
    case "hdr":
      return { title: "HDR 环境", icon: Upload, badge: "HDR" };
    default:
      return { title: "灯光", icon: Sun, badge: "LIGHT" };
  }
}

export function CyclesLightNode({ id, type, data, selected }: CyclesLightNodeProps) {
  const { updateNodeData } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const lightKind = lightKindFromType(type, data.lightKind);
  const meta = lightMeta(lightKind);
  const Icon = meta.icon;
  const environmentStrength = data.environmentStrength ?? 0.75;
  const keyStrength = data.keyStrength ?? 650;
  const keySize = data.keySize ?? 3.0;
  const yaw = data.yaw ?? 45;
  const pitch = data.pitch ?? 35;
  const backgroundColor = data.backgroundColor ?? "#08090a";
  const hdrUrl = data.hdrUrl ?? "";
  const hdrName = data.hdrName ?? "";

  const update = (patch: Partial<CyclesLightNodeProps["data"]>) => {
    const next = { ...data, ...patch };
    updateNodeData(id, {
      lightKind,
      ...patch,
      cyclesLight: {
        type: lightKind === "hdr" ? "hdr_environment" : lightKind === "rig" ? "cycles_light_rig" : lightKind,
        environmentStrength: next.environmentStrength ?? 0.75,
        keyStrength: next.keyStrength ?? 650,
        keySize: next.keySize ?? 3.0,
        yaw: next.yaw ?? 45,
        pitch: next.pitch ?? 35,
        backgroundColor: next.backgroundColor ?? "#08090a",
        hdrUrl: next.hdrUrl ?? "",
        hdrName: next.hdrName ?? "",
      },
    });
  };

  const handleHdrFile = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    update({ hdrUrl: url, hdrName: file.name });
  };

  return (
    <div className={`relative w-[220px] rounded-lg bg-[#121212] border ${selected ? "border-amber-500 shadow-[0_0_18px_rgba(245,158,11,0.28)]" : "border-neutral-800"} text-white`}>
      <div className="absolute -top-[22px] left-1/2 -translate-x-1/2 w-28 h-5 bg-neutral-900/90 border border-neutral-800 rounded flex items-center justify-center cursor-grab">
        <GripHorizontal className="w-3.5 h-3.5 text-amber-400 opacity-70" />
      </div>
      <Handle type="source" position={Position.Right} id="cyclesLight" className="!w-7 !h-7 !right-[-14px] !bg-[#2A2A2A] !border-amber-500 rounded-full" />
      <div className="h-[132px] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] font-bold">{meta.title}</span>
          </div>
          <span className="text-[8px] text-amber-300 border border-amber-900/60 bg-amber-950/30 rounded px-1.5 py-0.5">{meta.badge}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[9px]">
          <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            {lightKind === "hdr" ? "HDR" : "Env"} {environmentStrength.toFixed(2)}
            <input type="range" min="0" max="4" step="0.05" value={environmentStrength} onChange={(e) => update({ environmentStrength: parseFloat(e.target.value) })} className="h-1 accent-amber-500" />
          </label>
          {lightKind !== "hdr" && <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            Key {keyStrength.toFixed(0)}
            <input type="range" min="0" max="2000" step="25" value={keyStrength} onChange={(e) => update({ keyStrength: parseFloat(e.target.value) })} className="h-1 accent-amber-500" />
          </label>}
          {lightKind === "hdr" && <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            HDR 文件
            <input type="file" accept=".hdr,.exr,image/*" onChange={(e) => handleHdrFile(e.target.files?.[0])} className="text-[8px] text-neutral-400 file:hidden" />
          </label>}
          <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            Yaw {yaw}°
            <input type="range" min="0" max="360" step="1" value={yaw} onChange={(e) => update({ yaw: parseInt(e.target.value) })} className="h-1 accent-blue-500" />
          </label>
          <label className="flex flex-col gap-1 bg-neutral-900/60 rounded p-2">
            {lightKind === "hdr" ? "Rotate" : "Pitch"} {pitch}°
            <input type="range" min="-60" max="85" step="1" value={pitch} onChange={(e) => update({ pitch: parseInt(e.target.value) })} className="h-1 accent-emerald-500" />
          </label>
        </div>
        {lightKind === "hdr" && hdrName ? (
          <div className="truncate rounded bg-amber-950/20 px-2 py-1 text-[8px] text-amber-200">
            {hdrName}
          </div>
        ) : null}
      </div>
      {selected && (
        <div
          className="absolute top-full left-1/2 z-[9999] mt-2 w-[220px] -translate-x-1/2 rounded-lg border border-neutral-800 bg-[#151515]/96 p-2 shadow-xl nodrag nopan nowheel"
          style={{ transform: `translateX(-50%) scale(${1 / Math.max(0.01, zoom)})`, transformOrigin: "top center" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <label className="flex items-center justify-between gap-2 text-[10px] text-neutral-300">
            Background
            <input type="color" value={backgroundColor} onChange={(e) => update({ backgroundColor: e.target.value })} className="w-7 h-6 bg-transparent" />
          </label>
        </div>
      )}
    </div>
  );
}
