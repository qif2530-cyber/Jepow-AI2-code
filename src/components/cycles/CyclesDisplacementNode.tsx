import React from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { Mountain } from "lucide-react";
import { CyclesNodeShell } from "./CyclesNodeShell";

interface CyclesDisplacementNodeProps {
  id: string;
  data: { scale?: number; midlevel?: number };
  selected?: boolean;
}

export function CyclesDisplacementNode({ id, data, selected }: CyclesDisplacementNodeProps) {
  const { updateNodeData } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const scale = data.scale ?? 0;
  const midlevel = data.midlevel ?? 0.5;

  return (
    <CyclesNodeShell
      id={id}
      title="Displacement"
      accentClass="border-orange-500"
      selected={selected}
      width={190}
      height={108}
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
          borderClass: "!border-orange-500",
          textClass: "text-orange-400",
        },
      ]}
    >
      <div className="flex items-center gap-1.5 text-[9px] text-neutral-400">
        <Mountain className="w-3.5 h-3.5 text-orange-400" />
        <span>Height → Principled</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[9px]">
        <label className="flex flex-col gap-0.5 bg-neutral-900/50 rounded p-1.5">
          Scale {scale.toFixed(2)}
          <input
            type="range"
            min={0}
            max={2}
            step={0.02}
            value={scale}
            onChange={(e) =>
              updateNodeData(id, { scale: parseFloat(e.target.value), midlevel })
            }
            className="h-1 accent-orange-500"
          />
        </label>
        <label className="flex flex-col gap-0.5 bg-neutral-900/50 rounded p-1.5">
          Mid {midlevel.toFixed(2)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={midlevel}
            onChange={(e) =>
              updateNodeData(id, { midlevel: parseFloat(e.target.value), scale })
            }
            className="h-1 accent-orange-500"
          />
        </label>
      </div>
    </CyclesNodeShell>
  );
}
