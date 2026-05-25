import React, { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import {
  Loader2,
  FileText,
  Sparkles,
  Trash2,
  Copy,
  Check,
  Zap,
  Plus,
} from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";
import { useShotContext } from "@/src/ShotContext";
import api from "@/src/lib/api";
import { getAppOrigin } from "@/src/lib/runtime";
import { useCtrlPressed } from "@/src/hooks/useCtrlPressed";

interface ScriptNodeData {
  script: string;
  prompt?: string;
  characters?: string;
  scene?: string;
  camera?: string;
  isAnalyzing?: boolean;
  apiKey?: string;
  isChild?: boolean;
  shotName?: string;
}

interface ScriptNodeProps {
  id: string;
  data: ScriptNodeData;
  selected?: boolean;
}

export function ScriptNode({ id, data, selected }: ScriptNodeProps) {
  const { updateNodeData, deleteElements, setNodes, setEdges, getNodes } =
    useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const isCtrlPressed = useCtrlPressed();
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localScript, setLocalScript] = useState(data.script || "");

  const nodeWidth = 480;
  const nodeHeight = 270;
  const uiScale = Math.max(1.2, Math.sqrt(nodeWidth / 240));

  useEffect(() => {
    setLocalScript(data.script || "");
  }, [data.script]);

  const handleCutShots = () => {
    if (!localScript) return;

    const shots = localScript
      .split(/(?=【镜头)/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (shots.length === 0) return;

    const currentNode = getNodes().find((n) => n.id === id);
    if (!currentNode) return;

    const newNodes: any[] = [];
    const newEdges: any[] = [];
    let startY = currentNode.position.y - (shots.length * 400) / 2 + 200; // Center them roughly
    let startX = currentNode.position.x + 850;

    shots.forEach((shot, idx) => {
      const newNodeId = `node-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`;
      // Extract title if possible
      let matchTitle = shot.match(/^(【镜头\d*】)/);
      let title = matchTitle ? matchTitle[1] : `镜头片段 ${idx + 1}`;

      let content = shot;

      newNodes.push({
        id: newNodeId,
        type: "textNode",
        position: { x: startX, y: startY + idx * 300 },
        data: {
          title: title,
          text: content,
        },
      });

      newEdges.push({
        id: `edge-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        source: id,
        target: newNodeId,
        type: "deletable",
        animated: true,
      });
    });

    setNodes((nds) => [...nds, ...newNodes]);
    setEdges((eds) => [...eds, ...newEdges]);
  };

  const handleAnalyze = async () => {
    if (!data.script || isAnalyzing) return;
    setIsAnalyzing(true);
    setError(null);
    updateNodeData(id, { isAnalyzing: true });

    try {
      const apiKey =
        process.env.GEMINI_API_KEY ||
        data.apiKey ||
        (window as any).jepowKey ||
        "SYSTEM_KEY";
      const token = localStorage.getItem("ais-token");

      const customFetch = async (url: string, options: any) => {
        const proxyUrl = url.replace(
          "https://generativelanguage.googleapis.com",
          `${getAppOrigin()}/api/gemini-proxy`,
        );
        if (token) {
          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${token}`,
          };
        }
        return fetch(proxyUrl, options);
      };

      const systemPrompt = `You are a professional script analyzer and prompt engineer for AI video generation.
Analyze the provided master script and split it into individual shots (shots/scenes). 
For each shot, extract:
1. shotName: like "镜头1", "镜头2"
2. prompt: Professional visual prompt for AI generation. Focus on lighting, camera angle, style, and composition.
3. characters: Character descriptions (if any). Appearance, clothing, expression.
4. scene: Environment settings, location, background details.
5. camera: Professional camera parameters and camera movement (e.g., Pan, Tilt, Dolly, 35mm lens, f/1.8).

Return a JSON array of objects strictly in this format:
[
  {
    "shotName": "镜头1",
    "prompt": "...",
    "characters": "...",
    "scene": "...",
    "camera": "..."
  }
]`;

      const reqBody = {
        model: "gemini-3.1-pro-preview",
        prompt: `System: ${systemPrompt}\n\nUser: Script: ${data.script}`,
      };

      const aiResponse = await api.post("/omni-router/generate", reqBody);
      const aiData = aiResponse.data;
      if (!aiData.success) {
        throw new Error(aiData.message || "Omni-Router gateway error");
      }

      const text = aiData.text;
      if (!text) throw new Error("Empty response from AI");

      let cleanedText = text.trim();
      if (cleanedText.includes("```")) {
        const matches = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (matches && matches[1]) {
          cleanedText = matches[1].trim();
        } else {
          cleanedText = cleanedText
            .replace(/```json\n?/gi, "")
            .replace(/```\n?/g, "")
            .trim();
        }
      }

      let results: any[] = [];
      try {
        const parsed = JSON.parse(cleanedText);
        if (Array.isArray(parsed)) {
          results = parsed;
        } else if (parsed && typeof parsed === "object") {
          // If it returned a single object, wrap in array
          results = [parsed];
        } else {
          throw new Error("Parsed data is not an array");
        }
      } catch (e) {
        console.error("Failed to parse AI response:", text);
        try {
          const firstBracket = cleanedText.indexOf("[");
          const lastBracket = cleanedText.lastIndexOf("]");
          if (firstBracket !== -1 && lastBracket !== -1) {
            results = JSON.parse(
              cleanedText.substring(firstBracket, lastBracket + 1),
            );
          } else {
            throw new Error("No array found in output");
          }
        } catch (fallbackErr) {
          throw new Error("RECOVERY_PROTOCOL_FAILURE: INVALID_DATA_STRUCTURE");
        }
      }

      if (results.length > 0) {
        const currentNodes = getNodes();
        const thisNode = currentNodes.find((n) => n.id === id);
        if (thisNode) {
          const newNodes: any[] = [];
          const newEdges: any[] = [];
          const baseX = thisNode.position.x + 850;
          let currentY = thisNode.position.y;

          results.forEach((shot, index) => {
            const childId = `script-shot-${Date.now()}-${index}`;
            newNodes.push({
              id: childId,
              type: "scriptNode",
              position: { x: baseX, y: currentY + index * 450 },
              data: {
                script: shot.prompt || "",
                shotName: shot.shotName || `镜头${index + 1}`,
                prompt: shot.prompt || "",
                characters: shot.characters || "",
                scene: shot.scene || "",
                camera: shot.camera || "",
                isChild: true,
              },
            });

            newEdges.push({
              id: `edge-${id}-${childId}`,
              source: id,
              target: childId,
              type: "deletable",
              animated: true,
              style: { stroke: "#444" },
            });
          });

          setNodes((nds) => [...nds, ...newNodes]);
          setEdges((eds) => [...eds, ...newEdges]);

          // Update this master node
          updateNodeData(id, {
            isAnalyzing: false,
          });
        }
      } else {
        throw new Error("No shots generated.");
      }
    } catch (err: any) {
      setError(
        err.message || "SYNTHESIS_FAILURE: CHECK_NETWORK_OR_API_CREDENTIALS",
      );
      updateNodeData(id, { isAnalyzing: false });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

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

          <div className="flex-1 mt-2 h-full flex flex-col justify-between overflow-hidden">
            {!data.isChild ? (
              localScript ? (
                <div className="flex-1 flex flex-col min-h-0">
                  {isAnalyzing && (
                    <div className="flex items-center justify-end mb-2 select-none">
                      <span className="text-[10px] text-blue-400 font-bold tracking-wider animate-pulse flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        正在分析中...
                      </span>
                    </div>
                  )}
                  <p className="flex-1 text-sm font-medium text-neutral-200 leading-relaxed bg-[#2A2A2A]/40 border border-neutral-800/80 rounded-xl p-5 overflow-y-auto break-words whitespace-pre-wrap custom-scrollbar select-text">
                    {localScript}
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div
                    className="flex flex-col items-center gap-4 opacity-30 animate-in fade-in duration-300"
                    style={{ transform: `scale(${uiScale * 2})` }}
                  >
                    <FileText className="w-12 h-12 text-neutral-500" />
                  </div>
                </div>
              )
            ) : (
              <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1 pb-2 custom-scrollbar h-full select-text">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
                    <Label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest font-mono">
                      画面提示词 (PROMPT)
                    </Label>
                  </div>
                  <p className="text-xs font-semibold text-neutral-200 leading-relaxed bg-[#2A2A2A]/40 border border-neutral-800/80 p-3.5 rounded-xl">
                    {data.prompt || "无"}
                  </p>
                </div>
                
                {data.camera && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></span>
                      <Label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest font-mono">
                        摄像机参数与运镜 (CAMERA)
                      </Label>
                    </div>
                    <p className="text-xs font-semibold text-neutral-200 leading-relaxed bg-[#2A2A2A]/40 border border-neutral-800/80 p-3.5 rounded-xl">
                      {data.camera}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-1">
                  {data.characters && (
                    <div className="space-y-1 flex flex-col min-h-[90px]">
                      <div className="flex items-center gap-2 mb-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                        <Label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest font-mono">
                          角色属性 (CHARS)
                        </Label>
                      </div>
                      <p className="flex-1 text-xs font-semibold text-neutral-200 leading-relaxed bg-[#2A2A2A]/40 border border-neutral-800/80 p-3 rounded-xl overflow-y-auto custom-scrollbar">
                        {data.characters}
                      </p>
                    </div>
                  )}
                  {data.scene && (
                    <div className="space-y-1 flex flex-col min-h-[90px]">
                      <div className="flex items-center gap-2 mb-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></span>
                        <Label className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest font-mono">
                          物理场景 (SCENE)
                        </Label>
                      </div>
                      <p className="flex-1 text-xs font-semibold text-neutral-200 leading-relaxed bg-[#2A2A2A]/40 border border-neutral-800/80 p-3 rounded-xl overflow-y-auto custom-scrollbar">
                        {data.scene}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Control Panel */}
      {selected && !data.isChild && isOnlySelected && (
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
          <div className="w-[600px] bg-[#1A1A1A] border border-neutral-800 rounded-md overflow-hidden shadow-2xl p-4 flex flex-col space-y-3">
            {/* Script Input */}
            <div className="space-y-3 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between shrink-0 px-1">
                <Label className="text-[11px] font-bold text-neutral-400 tracking-wider">
                  原始脚本序列
                </Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    onClick={handleCutShots}
                    disabled={!localScript}
                    className="h-7 px-3 text-[11px] font-bold bg-[#2A2A2A] text-neutral-300 border-neutral-700 hover:bg-[#333333] hover:text-white transition-all rounded-lg"
                  >
                    裁切镜头
                  </Button>
                  <Button
                    variant="ghost"
                    size="default"
                    className={`h-7 px-3 text-[11px] font-bold ${isAnalyzing ? "bg-[#333333] text-neutral-400" : "bg-neutral-800 text-white hover:bg-neutral-700"} rounded-lg shadow-sm transition-all relative`}
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || !localScript}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    <span className="truncate">
                      {isAnalyzing ? "正在分析..." : "运行脚本分析 (10)"}
                    </span>
                    {!isAnalyzing && (
                      <Zap className="w-2.5 h-2.5 absolute top-0 right-0 text-amber-300 fill-amber-300 -mt-0.5 -mr-0.5" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="bg-[#2A2A2A] border border-neutral-800/80 rounded-xl p-3 flex-1 flex flex-col focus-within:bg-[#333333] focus-within:ring-1 focus-within:ring-neutral-700 transition-all">
                <Textarea
                  value={localScript}
                  onChange={(e) => {
                    setLocalScript(e.target.value);
                    updateNodeData(id, { script: e.target.value });
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="text-xs font-medium leading-relaxed flex-1 border-none min-h-[70px] shadow-none focus-visible:ring-0 p-0 placeholder:text-neutral-500 resize-none bg-transparent nodrag text-neutral-200"
                  placeholder="输入故事板内容..."
                />
              </div>
              {error && (
                <div className="text-[10px] font-bold text-red-600 bg-red-50/10 p-2.5 rounded-lg border border-red-900/20">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
