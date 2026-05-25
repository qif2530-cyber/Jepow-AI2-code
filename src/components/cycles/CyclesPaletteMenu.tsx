import React from "react";
import {
  CYCLES_CATEGORY_LABELS,
  CYCLES_NODE_PALETTE,
  type CyclesNodeCategory,
} from "../../lib/cycles-node-registry";

interface CyclesPaletteMenuProps {
  onAdd: (nodeType: string) => void;
}

const ORDER: CyclesNodeCategory[] = ["material", "color", "light", "render"];

export function CyclesPaletteMenu({ onAdd }: CyclesPaletteMenuProps) {
  return (
    <>
      <div className="px-2 pt-1 pb-0.5 text-[9px] font-semibold tracking-wide text-violet-600/90 uppercase select-none">
        Cycles 原生
      </div>
      {ORDER.map((cat, idx) => {
        const items = CYCLES_NODE_PALETTE.filter((p) => p.category === cat);
        if (!items.length) return null;
        return (
          <React.Fragment key={cat}>
            {idx > 0 ? <div className="h-px w-full bg-neutral-100 my-0.5" /> : null}
            <div className="px-2 py-0.5 text-[8px] text-neutral-400 select-none">
              {CYCLES_CATEGORY_LABELS[cat]}
            </div>
            {items.map((item) => (
              <button
                key={item.type}
                type="button"
                className="flex flex-col items-start min-h-8 pl-4 pr-3 py-1.5 rounded-md text-xs transition-all bg-transparent text-neutral-600 hover:bg-violet-500/8 hover:text-neutral-900"
                onClick={() => onAdd(item.type)}
              >
                <span className="font-medium leading-tight">{item.label}</span>
                {item.hint ? (
                  <span className="text-[9px] text-neutral-400 leading-tight">{item.hint}</span>
                ) : null}
              </button>
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
}
