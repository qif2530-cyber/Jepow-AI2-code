import React from "react";
import {
  Node,
  NodeProps,
  useReactFlow,
  Handle,
  Position,
  useStore,
} from "@xyflow/react";
import {
  Group,
  LayoutGrid,
  Columns,
  Rows,
  Trash2,
  Palette,
  MousePointer2,
} from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { useShotContext } from "@/src/ShotContext";
import { useCtrlPressed } from "@/src/hooks/useCtrlPressed";

const COLORS = [
  {
    id: "neutral",
    bg: "bg-white/40",
    border: "border-black/20",
    active: "border-black/30 bg-white/60 ring-white/20/10",
    text: "text-neutral-700",
    accent: "text-neutral-700",
  },
  {
    id: "indigo",
    bg: "bg-black/5",
    border: "border-black/20",
    active: "border-black/30 bg-black/10 ring-white/20/10",
    text: "text-neutral-600",
    accent: "text-neutral-700",
  },
  {
    id: "green",
    bg: "bg-green-900/40",
    border: "border-green-700",
    active: "border-green-500 bg-green-900/60 ring-green-500/10",
    text: "text-green-300",
    accent: "text-green-400",
  },
  {
    id: "amber",
    bg: "bg-amber-900/40",
    border: "border-amber-700",
    active: "border-amber-500 bg-amber-900/60 ring-amber-500/10",
    text: "text-amber-300",
    accent: "text-amber-400",
  },
  {
    id: "red",
    bg: "bg-red-900/40",
    border: "border-red-700",
    active: "border-red-500 bg-red-900/60 ring-red-500/10",
    text: "text-red-300",
    accent: "text-red-400",
  },
  {
    id: "cyan",
    bg: "bg-cyan-900/40",
    border: "border-cyan-700",
    active: "border-cyan-500 bg-cyan-900/60 ring-cyan-500/10",
    text: "text-cyan-300",
    accent: "text-cyan-400",
  },
];

export function GroupNode({ id, data, selected, style }: NodeProps | any) {
  const { deleteElements, updateNodeData } = useReactFlow();
  const isCtrlPressed = useCtrlPressed();
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );
  const showPanel = selected && isOnlySelected;
  const currentColorId = data.color || "neutral";
  const colorConfig = COLORS.find((c) => c.id === currentColorId) || COLORS[0];

  const handleColorCycle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const currentIndex = COLORS.findIndex((c) => c.id === currentColorId);
    const nextIndex = (currentIndex + 1) % COLORS.length;
    updateNodeData(id, { color: COLORS[nextIndex].id });
  };

  const { isCollapsed } = useShotContext() as any;

  const handleLayoutChange = (mode: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    updateNodeData(id, { layoutMode: mode });
  };

  return (
    <div
      className={`w-full h-full rounded-md border-2 border-dashed transition-all duration-300 ${colorConfig.bg} ${
        selected
          ? `${colorConfig.active} border-solid ring-4`
          : colorConfig.border
      }`}
      style={{
        width: style?.width || "100%",
        height: style?.height || "100%",
      }}
    >
      {!isCollapsed && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 z-20"
          style={{ marginTop: "24px" }}
        >
          <div
            className={`flex items-center p-2 gap-2 bg-[#1A1A1A] rounded-md shadow-2xl border border-neutral-800 transition-all duration-300 ${showPanel ? "opacity-100 pointer-events-auto scale-100" : "opacity-0 pointer-events-none scale-95"}`}
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-orange-500/10 border border-orange-500/20 mr-2 shadow-inner">
              <Group className="w-4 h-4 text-orange-400" />
              <input
                type="text"
                value={data.title || "NEW GROUP"}
                onChange={(e) => updateNodeData(id, { title: e.target.value })}
                placeholder="NEW GROUP"
                className="bg-transparent border-none focus:outline-none text-[12px] font-black uppercase text-orange-400 tracking-widest whitespace-nowrap w-24 focus:w-32 transition-all"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleLayoutChange("horizontal")}
                className={`p-2.5 rounded-md transition-all ${data.layoutMode === "horizontal" ? "bg-[#2A2A2A] text-white shadow-xl" : "text-neutral-500 hover:text-white hover:bg-[#333333]"}`}
                title="水平布局"
              >
                <Columns className="w-4 h-4" />
              </button>
              <button
                onClick={handleLayoutChange("vertical")}
                className={`p-2.5 rounded-md transition-all ${data.layoutMode === "vertical" ? "bg-[#2A2A2A] text-white shadow-xl" : "text-neutral-500 hover:text-white hover:bg-[#333333]"}`}
                title="垂直布局"
              >
                <Rows className="w-4 h-4" />
              </button>
              <button
                onClick={handleLayoutChange("grid")}
                className={`p-2.5 rounded-md transition-all ${data.layoutMode === "grid" || !data.layoutMode ? "bg-[#2A2A2A] text-white shadow-xl" : "text-neutral-500 hover:text-white hover:bg-[#333333]"}`}
                title="网格布局"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={handleLayoutChange("free")}
                className={`p-2.5 rounded-md transition-all ${data.layoutMode === "free" ? "bg-[#2A2A2A] text-white shadow-xl" : "text-neutral-500 hover:text-white hover:bg-[#333333]"}`}
                title="自由布局 (可叠加)"
              >
                <MousePointer2 className="w-4 h-4" />
              </button>
            </div>

            <div className="w-px h-6 bg-neutral-800 mx-2" />

            <button
              onClick={handleColorCycle}
              className="p-2.5 rounded-md transition-all text-neutral-500 hover:bg-[#333333] hover:text-white"
              title="切换颜色"
            >
              <Palette className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
