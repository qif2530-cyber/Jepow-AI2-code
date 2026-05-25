import React, { useLayoutEffect, useRef, useState } from "react";

interface PaneNodeContextMenuProps {
  x: number;
  y: number;
  children: React.ReactNode;
}

const VIEWPORT_MARGIN = 12;

export function PaneNodeContextMenu({ x, y, children }: PaneNodeContextMenuProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    const reposition = () => {
      const rect = el.getBoundingClientRect();
      const maxH = Math.min(window.innerHeight * 0.72, window.innerHeight - VIEWPORT_MARGIN * 2);
      let top = y;
      let left = x;
      if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
        top = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN);
      }
      if (left + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
        left = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN);
      }
      if (rect.height > maxH) {
        top = VIEWPORT_MARGIN;
      }
      setPosition({ left, top });
    };

    reposition();
    const ro = new ResizeObserver(reposition);
    ro.observe(el);
    return () => ro.disconnect();
  }, [x, y, children]);

  return (
    <div
      ref={shellRef}
      className="fixed z-[200] flex flex-col rounded-md border border-black/20 bg-white/95 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: position.left,
        top: position.top,
        minWidth: 168,
        maxWidth: 240,
        maxHeight: `min(72vh, calc(100vh - ${VIEWPORT_MARGIN * 2}px))`,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="overflow-y-auto overscroll-contain p-1.5 flex flex-col items-stretch gap-0.5 scrollbar-thin">
        {children}
      </div>
    </div>
  );
}
