import React from "react";
import { Handle, Position } from "@xyflow/react";
import { GripHorizontal, Plus } from "lucide-react";

type HandleSpec = {
  id: string;
  type: "source" | "target";
  position?: Position;
  top?: string;
  borderClass?: string;
  textClass?: string;
};

interface CyclesNodeShellProps {
  id: string;
  title: string;
  badge?: string;
  accentClass: string;
  selected?: boolean;
  width?: number;
  height?: number;
  handles?: HandleSpec[];
  children: React.ReactNode;
  panel?: React.ReactNode;
  zoom?: number;
}

export function CyclesNodeShell({
  title,
  badge = "CL",
  accentClass,
  selected,
  width = 210,
  height = 128,
  handles = [],
  children,
  panel,
  zoom = 1,
}: CyclesNodeShellProps) {
  return (
    <div
      style={{ width }}
      className={`relative rounded-lg bg-[#121212] border ${
        selected
          ? `${accentClass} shadow-[0_0_16px_rgba(16,185,129,0.2)]`
          : "border-neutral-800"
      } text-white`}
    >
      <div className="absolute -top-[22px] left-1/2 -translate-x-1/2 w-28 h-5 bg-neutral-900/90 border border-neutral-800 rounded flex items-center justify-center cursor-grab">
        <GripHorizontal className="w-3.5 h-3.5 text-emerald-400 opacity-70" />
      </div>

      {handles.map((h) => (
        <Handle
          key={h.id}
          type={h.type}
          position={h.position ?? (h.type === "source" ? Position.Right : Position.Left)}
          id={h.id}
          style={h.top ? { top: h.top } : undefined}
          className={`!w-6 !h-6 !bg-[#2A2A2A] !border ${h.borderClass || "!border-neutral-600"} rounded-full flex items-center justify-center ${h.textClass || ""}`}
        >
          {h.type === "target" ? (
            <Plus className="w-3 h-3 pointer-events-none opacity-70" />
          ) : null}
        </Handle>
      ))}

      <div style={{ minHeight: height }} className="p-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-bold truncate">{title}</span>
          <span className="text-[7px] text-emerald-300/90 border border-emerald-900/50 bg-emerald-950/25 rounded px-1 py-0.5 shrink-0">
            {badge}
          </span>
        </div>
        {children}
      </div>

      {selected && panel ? (
        <div
          className="absolute top-full left-1/2 z-[9999] mt-2 nodrag nopan nowheel rounded-lg border border-neutral-800 bg-[#151515]/96 p-2 shadow-xl"
          style={{
            width,
            transform: `translateX(-50%) scale(${1 / Math.max(0.01, zoom)})`,
            transformOrigin: "top center",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          {panel}
        </div>
      ) : null}
    </div>
  );
}
