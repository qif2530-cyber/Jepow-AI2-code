import React from "react";
import { Handle, Position } from "@xyflow/react";
import { AlertCircle } from "lucide-react";

export interface Port {
  id: string;
  label: string;
  type: string;
}

export interface BaseNodeProps {
  id: string;
  data: {
    title: string;
    category: "3d" | "export" | "api" | "synthesis" | "output";
    inputs?: Port[];
    outputs?: Port[];
    error?: string;
    onDoubleClick?: () => void;
    [key: string]: any;
  };
  selected?: boolean;
  children?: React.ReactNode;
}

const categoryColors = {
  "3d": "bg-black/5 border-black/10",
  export: "bg-green-950/40 border-green-900",
  api: "bg-black/5 border-black/10",
  synthesis: "bg-yellow-950/40 border-yellow-900",
  output: "bg-orange-950/40 border-orange-900",
};

const categoryHeaderColors = {
  "3d": "bg-black/5 text-neutral-700",
  export: "bg-green-900/40 text-green-400",
  api: "bg-black/5 text-neutral-700",
  synthesis: "bg-yellow-900/40 text-yellow-400",
  output: "bg-orange-900/40 text-orange-400",
};

export function BaseNode({ id, data, selected, children }: BaseNodeProps) {
  const {
    title,
    category,
    inputs = [],
    outputs = [],
    error,
    onDoubleClick,
  } = data;

  return (
    <div
      className="bg-[#1A1A1A] rounded-md shadow-2xl flex flex-col border-0 border-transparent transition-all duration-300 relative group min-w-[180px] min-h-[80px]"
      onDoubleClick={onDoubleClick}
    >
      {/* Header */}
      <div
        className={`px-3 py-2 rounded-t-2xl border-b border-black/5 flex items-center justify-between ${categoryHeaderColors[category] || "bg-neutral-100 text-neutral-700"}`}
      >
        <span className="text-xs font-bold tracking-wide">{title}</span>
        {error && (
          <div className="group/error relative">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover/error:block w-48 p-2 bg-red-950/40 border border-red-900 text-red-400 text-[10px] rounded shadow-lg z-50">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex-1 flex flex-col gap-2 text-xs text-neutral-600 relative">
        {/* Inputs */}
        <div className="absolute left-[-8px] top-0 bottom-0 flex flex-col justify-center gap-4">
          {inputs.map((input) => (
            <div
              key={input.id}
              className="relative group/handle flex items-center"
            >
              <Handle
                type="target"
                position={Position.Left}
                id={input.id}
                className="!w-3 !h-3 !bg-white !border !border-black/20 hover:!bg-white hover:!border-neutral-900 transition-all rounded-full"
                style={{
                  position: "relative",
                  left: 0,
                  top: 0,
                  transform: "none",
                }}
              />
              <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded opacity-0 group-hover/handle:opacity-100 pointer-events-none whitespace-nowrap z-50">
                {input.label} ({input.type})
              </div>
            </div>
          ))}
        </div>

        {/* Outputs */}
        <div className="absolute right-[-8px] top-0 bottom-0 flex flex-col justify-center gap-4">
          {outputs.map((output) => (
            <div
              key={output.id}
              className="relative group/handle flex items-center justify-end"
            >
              <div className="absolute right-full mr-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded opacity-0 group-hover/handle:opacity-100 pointer-events-none whitespace-nowrap z-50">
                {output.label} ({output.type})
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={output.id}
                className="!w-3 !h-3 !bg-white !border !border-black/20 hover:!bg-white hover:!border-neutral-900 transition-all rounded-full"
                style={{
                  position: "relative",
                  right: 0,
                  top: 0,
                  transform: "none",
                }}
              />
            </div>
          ))}
        </div>

        {/* Custom Content */}
        <div className="px-2">{children}</div>
      </div>
    </div>
  );
}
