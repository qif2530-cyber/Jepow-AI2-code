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
    id: "blue",
    bg: "bg-[#4f8cff]/10",
    border: "border-[#78a7ff]/55",
    active: "border-[#9bbdff]",
    text: "text-[#c8dcff]",
    accent: "text-[#9bbdff]",
  },
  {
    id: "purple",
    bg: "bg-[#9b7cff]/10",
    border: "border-[#aa96ff]/55",
    active: "border-[#c3b4ff]",
    text: "text-[#ded8ff]",
    accent: "text-[#c3b4ff]",
  },
  {
    id: "pink",
    bg: "bg-[#ff7fbe]/10",
    border: "border-[#ff9acb]/55",
    active: "border-[#ffb6d9]",
    text: "text-[#ffd9e9]",
    accent: "text-[#ffb6d9]",
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
  const currentColorId = data.color || "blue";
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
      className={`w-full h-full rounded-[10px] border transition-all duration-200 ${colorConfig.bg} ${
        selected
          ? `${colorConfig.active} border-solid`
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
          style={{ marginTop: "8px" }}
        >
          <div
            className={`flex items-center gap-1 rounded-[6px] border border-[#34363a] bg-[#252629]/95 p-1 shadow-xl transition-all duration-200 ${showPanel ? "opacity-100 pointer-events-auto scale-100" : "opacity-0 pointer-events-none scale-95"}`}
          >
            <div className="flex items-center gap-1 rounded-[4px] border border-[#3f4145] bg-white/[0.04] px-1.5 py-1">
              <Group className="w-3 h-3 text-orange-300/80" />
              <input
                type="text"
                value={data.title || "组"}
                onChange={(e) =>
                  updateNodeData(id, {
                    title: e.target.value,
                    label: e.target.value,
                  })
                }
                placeholder="组"
                className="w-14 bg-transparent text-[10px] font-bold text-neutral-200 outline-none transition-all focus:w-20"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={handleLayoutChange("horizontal")}
                className={`p-1.5 rounded-[4px] transition-all ${data.layoutMode === "horizontal" ? "bg-[#4772b3] text-white" : "text-neutral-500 hover:text-white hover:bg-[#34363a]"}`}
                title="水平布局"
              >
                <Columns className="w-3 h-3" />
              </button>
              <button
                onClick={handleLayoutChange("vertical")}
                className={`p-1.5 rounded-[4px] transition-all ${data.layoutMode === "vertical" ? "bg-[#4772b3] text-white" : "text-neutral-500 hover:text-white hover:bg-[#34363a]"}`}
                title="垂直布局"
              >
                <Rows className="w-3 h-3" />
              </button>
              <button
                onClick={handleLayoutChange("grid")}
                className={`p-1.5 rounded-[4px] transition-all ${data.layoutMode === "grid" || !data.layoutMode ? "bg-[#4772b3] text-white" : "text-neutral-500 hover:text-white hover:bg-[#34363a]"}`}
                title="网格布局"
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
              <button
                onClick={handleLayoutChange("free")}
                className={`p-1.5 rounded-[4px] transition-all ${data.layoutMode === "free" ? "bg-[#4772b3] text-white" : "text-neutral-500 hover:text-white hover:bg-[#34363a]"}`}
                title="自由布局 (可叠加)"
              >
                <MousePointer2 className="w-3 h-3" />
              </button>
            </div>

            <div className="w-px h-4 bg-[#34363a] mx-0.5" />

            <button
              onClick={handleColorCycle}
              className="p-1.5 rounded-[4px] transition-all text-neutral-500 hover:bg-[#34363a] hover:text-white"
              title="切换颜色"
            >
              <Palette className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
