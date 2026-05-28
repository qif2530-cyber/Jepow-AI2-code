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
      className="pane-node-context-menu fixed z-[200] flex flex-col rounded-[8px] border border-[#34363a] bg-[#252629]/98 shadow-2xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: position.left,
        top: position.top,
        minWidth: 168,
        maxWidth: 220,
        maxHeight: `min(56vh, 440px, calc(100vh - ${VIEWPORT_MARGIN * 2}px))`,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .pane-node-context-menu button {
              min-height: 28px !important;
              height: 28px !important;
              padding: 0 8px !important;
              border-radius: 5px !important;
              color: #d3d3d3 !important;
              background: transparent !important;
              font-size: 11px !important;
              font-weight: 500 !important;
              line-height: 1 !important;
            }
            .pane-node-context-menu button:hover {
              background: #34363a !important;
              color: #ffffff !important;
            }
            .pane-node-context-menu svg {
              width: 13px !important;
              height: 13px !important;
              margin-right: 7px !important;
              color: #a8a8a8 !important;
              flex-shrink: 0 !important;
            }
            .pane-node-context-menu div.h-px {
              background: #34363a !important;
              margin: 2px 0 !important;
            }
            .pane-node-context-menu [data-menu-scroll] {
              scrollbar-width: none;
              -ms-overflow-style: none;
            }
            .pane-node-context-menu [data-menu-scroll]::-webkit-scrollbar {
              width: 0;
              height: 0;
              display: none;
            }
          `,
        }}
      />
      <div data-menu-scroll className="overflow-y-auto overscroll-contain p-1 flex flex-col items-stretch gap-px">
        {children}
      </div>
    </div>
  );
}
