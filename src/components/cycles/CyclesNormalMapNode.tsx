import React from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { Workflow } from "lucide-react";
import { CyclesNodeShell } from "./CyclesNodeShell";

interface CyclesNormalMapNodeProps {
  id: string;
  data: { strength?: number };
  selected?: boolean;
}

export function CyclesNormalMapNode({ id, data, selected }: CyclesNormalMapNodeProps) {
  const { updateNodeData } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const strength = data.strength ?? 1.0;

  return (
    <CyclesNodeShell
      id={id}
      title="Normal Map"
      accentClass="border-cyan-500"
      selected={selected}
      width={190}
      height={100}
      zoom={zoom}
      handles={[
        {
          id: "imageIn",
          type: "target",
          top: "40%",
          borderClass: "!border-violet-600",
          textClass: "text-violet-400",
        },
        {
          id: "textureOut",
          type: "source",
          borderClass: "!border-cyan-500",
          textClass: "text-cyan-400",
        },
      ]}
    >
      <div className="flex items-center gap-1.5 text-[9px] text-neutral-400">
        <Workflow className="w-3.5 h-3.5 text-cyan-400" />
        <span>接入 Image Texture</span>
      </div>
      <label className="flex flex-col gap-0.5 text-[9px] bg-neutral-900/50 rounded p-1.5">
        Strength {strength.toFixed(2)}
        <input
          type="range"
          min={0}
          max={4}
          step={0.05}
          value={strength}
          onChange={(e) => updateNodeData(id, { strength: parseFloat(e.target.value) })}
          className="h-1 accent-cyan-500"
        />
      </label>
    </CyclesNodeShell>
  );
}
