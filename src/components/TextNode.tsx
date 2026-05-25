import React from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Type, Trash2, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { useShotContext } from "@/src/ShotContext";
import { useCtrlPressed } from "@/src/hooks/useCtrlPressed";

interface TextNodeProps {
  id: string;
  data: {
    text: string;
    title?: string;
  };
  selected?: boolean;
}

export function TextNode({ id, data, selected }: TextNodeProps) {
  const { updateNodeData, deleteElements } = useReactFlow();
  const [localText, setLocalText] = React.useState(data.text || "");
  const zoom = useStore((s) => s.transform[2]);
  const isCtrlPressed = useCtrlPressed();
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );

  React.useEffect(() => {
    setLocalText(data.text || "");
  }, [data.text]);

  const nodeWidth = 480;
  const nodeHeight = 270;
  const uiScale = Math.max(1.2, Math.sqrt(nodeWidth / 240));

  return (
    <div
      className="flex flex-col items-center w-full"
      style={{ width: nodeWidth }}
    >
      {/* Main Content Box */}
      <div
        className="w-full relative transition-all duration-300 rounded-xl shadow-[0_12px_44px_rgba(0,0,0,0.15)] border border-neutral-800 bg-[#1A1A1A]"
        style={{ height: nodeHeight }}
      >
        {/* Handles */}
        <Handle
          type="source"
          position={Position.Right}
          id="source"
          className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !right-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
          style={{ top: "50%" }}
        >
          <Plus className="w-5 h-5 pointer-events-none" />
        </Handle>
        <Handle
          type="target"
          position={Position.Left}
          id="target"
          className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
          style={{ top: "50%" }}
        >
          <Plus className="w-5 h-5 pointer-events-none" />
        </Handle>

        <div
          className="w-full h-full bg-[#1A1A1A] rounded-xl relative overflow-hidden flex flex-col p-6 transition-all duration-300"
        >
          {/* Metadata overlay */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 rounded-md bg-[#2A2A2A]/80 text-neutral-400 hover:text-red-400 hover:bg-[#333333] transition-all border border-neutral-800/40 shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                deleteElements({ nodes: [{ id }] });
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-hidden mt-2 h-full flex flex-col justify-between">
            {localText ? (
              <div className="flex-1 flex flex-col min-h-0">
                <p className="flex-1 text-sm font-medium text-neutral-200 leading-relaxed bg-[#2A2A2A]/40 border border-neutral-800/80 rounded-xl p-5 overflow-y-auto break-words whitespace-pre-wrap custom-scrollbar select-text">
                  {localText}
                </p>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div
                  className="flex flex-col items-center gap-4 opacity-30 animate-in fade-in duration-300"
                  style={{ transform: `scale(${uiScale * 2})` }}
                >
                  <Type className="w-12 h-12 text-neutral-500" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Control Panel */}
      {selected && isOnlySelected && (
        <div
          className="absolute z-[9999] pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300"
          style={{
            top: "100%",
            marginTop: 24 * (1 / Math.max(0.01, zoom)),
            left: "50%",
            transform: `translateX(-50%) scale(${1 / Math.max(0.01, zoom)})`,
            transformOrigin: "top center",
          }}
        >
          <div className="w-[800px] bg-[#1A1A1A] border border-neutral-800 rounded-xl overflow-hidden shadow-2xl p-5 flex flex-col space-y-4">
            <div className="space-y-4 flex-1 flex flex-col min-h-0">
              <Label className="text-xs font-bold text-neutral-400 tracking-wider px-1">
                编辑文本内容
              </Label>
              <div className="bg-[#2A2A2A] border border-neutral-800 rounded-xl p-4 flex-1 flex flex-col focus-within:bg-[#333333] focus-within:ring-2 focus-within:ring-neutral-700 transition-all">
                <Textarea
                  value={localText}
                  onChange={(e) => {
                    setLocalText(e.target.value);
                    updateNodeData(id, { text: e.target.value });
                    // Auto-resize
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="请输入文本..."
                  className="text-sm font-medium leading-relaxed flex-1 border-none min-h-[100px] shadow-none focus-visible:ring-0 p-0 placeholder:text-neutral-500 resize-none bg-transparent nodrag text-neutral-200"
                  style={{ height: "auto" }}
                  ref={(el) => {
                    if (el) {
                      el.style.height = "auto";
                      el.style.height = el.scrollHeight + "px";
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
