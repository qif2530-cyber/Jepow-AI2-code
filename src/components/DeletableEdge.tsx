import React, { useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";
import { X } from "lucide-react";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  animated,
}: any) {
  const { deleteElements, screenToFlowPosition } = useReactFlow();
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleMouseEnter = (evt: React.MouseEvent) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    const pos = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
    setMousePos(pos);
    setIsHovered(true);
  };

  const handleMouseMove = (evt: React.MouseEvent) => {
    const pos = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
    setMousePos(pos);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 100);
  };

  const onEdgeClick = (evt: React.MouseEvent) => {
    evt.stopPropagation();
    deleteElements({ edges: [{ id }] });
  };

  const isDarkMode = true; // Assuming dark mode based on the screenshots
  const edgeColor = style.stroke || (isDarkMode ? "#3b82f6" : "#2563eb");
  const glowColor = style.stroke || "#60a5fa";

  return (
    <g
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="group"
    >
      {/* Core path */}
      <path
        d={edgePath}
        fill="none"
        stroke={edgeColor}
        strokeWidth={selected ? 3 : 2}
        markerEnd={markerEnd}
        strokeLinecap="round"
        className="react-flow__edge-path transition-all duration-300"
        style={{
          strokeDasharray: "6 6",
          animation: animated ? "dash 1s linear infinite" : "none",
          opacity: isHovered || selected ? 1 : 0.6,
        }}
      />

      {/* Invisible wider path for easier hovering */}
      <path
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={20}
        style={{ pointerEvents: "all" }}
        className="react-flow__edge-interaction cursor-pointer"
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${isHovered ? mousePos.x : labelX}px,${isHovered ? mousePos.y : labelY}px)`,
            fontSize: 12,
            pointerEvents: isHovered ? "all" : "none",
            opacity: isHovered ? 1 : 0,
            transition: "opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            zIndex: 9999,
          }}
          className="nodrag nopan"
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            setIsHovered(true);
          }}
          onMouseLeave={handleMouseLeave}
        >
          <button
            className="w-6 h-6 bg-neutral-100 border border-black/10 text-neutral-900 rounded-full flex items-center justify-center shadow-lg hover:bg-red-500 hover:border-red-500 transition-all duration-200"
            onClick={onEdgeClick}
            style={{ pointerEvents: "all" }}
            title="删除连线"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
      <style>
        {`
          @keyframes dash {
            to {
              stroke-dashoffset: -12;
            }
          }
        `}
      </style>
    </g>
  );
}
