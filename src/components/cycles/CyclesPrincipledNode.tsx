import React from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { Layers } from "lucide-react";
import { createCyclesMaterial } from "../../lib/cycles-material";
import { CyclesNodeShell } from "./CyclesNodeShell";

interface CyclesPrincipledNodeProps {
  id: string;
  data: Record<string, unknown>;
  selected?: boolean;
}

const TEXTURE_HANDLES = [
  { id: "texBaseColor", top: "22%", label: "Base" },
  { id: "texNormal", top: "34%", label: "Nrm" },
  { id: "texRoughness", top: "46%", label: "Rgh" },
  { id: "texMetallic", top: "58%", label: "Met" },
  { id: "texDisplacement", top: "70%", label: "Disp" },
  { id: "texEmission", top: "82%", label: "Emit" },
];

export function CyclesPrincipledNode({ id, data, selected }: CyclesPrincipledNodeProps) {
  const { updateNodeData } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const mat = createCyclesMaterial(data);
  const p = mat.principled;

  const patch = (key: string, val: number | string) => {
    const next = { ...data, [key]: val };
    updateNodeData(id, {
      [key]: val,
      cyclesMaterial: createCyclesMaterial(next),
    });
  };

  return (
    <CyclesNodeShell
      id={id}
      title="Principled BSDF"
      accentClass="border-emerald-500"
      selected={selected}
      width={210}
      height={120}
      zoom={zoom}
      handles={[
        ...TEXTURE_HANDLES.map((h) => ({
          id: h.id,
          type: "target" as const,
          top: h.top,
          borderClass: "!border-violet-600",
          textClass: "text-violet-400",
        })),
        {
          id: "material",
          type: "source",
          borderClass: "!border-emerald-500",
          textClass: "text-emerald-400",
        },
      ]}
      panel={
        <div className="grid grid-cols-2 gap-2 text-[9px]">
          <label className="flex flex-col gap-0.5">
            Coat
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={p.coatWeight}
              onChange={(e) => patch("clearcoat", parseFloat(e.target.value))}
              className="h-1 accent-emerald-500"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            Transmission
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={p.transmissionWeight}
              onChange={(e) => patch("transmission", parseFloat(e.target.value))}
              className="h-1 accent-emerald-500"
            />
          </label>
          <label className="flex flex-col gap-0.5 col-span-2">
            Emission {p.emissionStrength.toFixed(2)}
            <input
              type="range"
              min={0}
              max={10}
              step={0.05}
              value={p.emissionStrength}
              onChange={(e) => patch("emissionStrength", parseFloat(e.target.value))}
              className="h-1 accent-amber-500"
            />
          </label>
        </div>
      }
    >
      <div className="flex items-center gap-1.5 text-[9px] text-neutral-400">
        <Layers className="w-3 h-3 text-emerald-400" />
        <span>左侧接入纹理节点</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[9px]">
        <label className="flex flex-col gap-0.5 bg-neutral-900/50 rounded p-1.5">
          <span className="flex justify-between">
            Base
            <input
              type="color"
              value={p.baseColor}
              onChange={(e) => patch("tint", e.target.value)}
              className="w-5 h-4 border-0 bg-transparent p-0"
            />
          </span>
        </label>
        <label className="flex flex-col gap-0.5 bg-neutral-900/50 rounded p-1.5">
          Rough {p.roughness.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={p.roughness}
            onChange={(e) => patch("roughness", parseFloat(e.target.value))}
            className="h-1 accent-emerald-500"
          />
        </label>
        <label className="flex flex-col gap-0.5 bg-neutral-900/50 rounded p-1.5">
          Metal {p.metallic.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={p.metallic}
            onChange={(e) => patch("metalness", parseFloat(e.target.value))}
            className="h-1 accent-blue-500"
          />
        </label>
        <label className="flex flex-col gap-0.5 bg-neutral-900/50 rounded p-1.5">
          Spec {p.specularIorLevel.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={p.specularIorLevel}
            onChange={(e) => patch("specular", parseFloat(e.target.value))}
            className="h-1 accent-blue-500"
          />
        </label>
      </div>
    </CyclesNodeShell>
  );
}
