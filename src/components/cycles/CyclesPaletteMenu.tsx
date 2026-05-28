import React from "react";
import {
  CYCLES_CATEGORY_LABELS,
  CYCLES_NODE_PALETTE,
  type CyclesNodeCategory,
} from "../../lib/cycles-node-registry";

interface CyclesPaletteMenuProps {
  onAdd: (nodeType: string) => void;
}

const ORDER: CyclesNodeCategory[] = ["material", "color", "light", "camera", "render"];

export function CyclesPaletteMenu({ onAdd }: CyclesPaletteMenuProps) {
  return (
    <>
      <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold tracking-wide text-[#8ea6d8] uppercase select-none">
        Cycles 原生
      </div>
      {ORDER.map((cat, idx) => {
        const items = CYCLES_NODE_PALETTE.filter((p) => p.category === cat);
        if (!items.length) return null;
        return (
          <React.Fragment key={cat}>
            {idx > 0 ? <div className="h-px w-full bg-[#34363a] my-0.5" /> : null}
            <div className="px-2 py-0.5 text-[8px] text-[#858585] select-none">
              {CYCLES_CATEGORY_LABELS[cat]}
            </div>
            {items.map((item) => (
              <button
                key={item.type}
                type="button"
                className="flex items-center min-h-7 pl-4 pr-2 py-0.5 rounded-[5px] text-[11px] transition-all bg-transparent text-[#d3d3d3] hover:bg-[#34363a] hover:text-white"
                onClick={() => onAdd(item.type)}
              >
                <span className="font-medium leading-tight">{item.label}</span>
              </button>
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
}
