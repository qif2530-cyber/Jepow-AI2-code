import React from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { SlidersHorizontal } from "lucide-react";
import { CyclesNodeShell } from "./CyclesNodeShell";

type ColorNodeKind =
  | "cyclesGammaNode"
  | "cyclesBrightContrastNode"
  | "cyclesRgbCurvesNode"
  | "cyclesRgbRampNode"
  | "cyclesMixColorNode"
  | "cyclesMapRangeNode"
  | "cyclesRgbToBwNode";

const META: Record<
  ColorNodeKind,
  { title: string; accent: string; badge?: string }
> = {
  cyclesGammaNode: { title: "Gamma", accent: "border-amber-500" },
  cyclesBrightContrastNode: { title: "亮度 / 对比度", accent: "border-amber-500" },
  cyclesRgbCurvesNode: { title: "RGB 曲线", accent: "border-orange-500" },
  cyclesRgbRampNode: { title: "色带", accent: "border-orange-500" },
  cyclesMixColorNode: { title: "混合颜色", accent: "border-rose-500" },
  cyclesMapRangeNode: { title: "映射范围", accent: "border-cyan-500" },
  cyclesRgbToBwNode: { title: "RGB 转 BW", accent: "border-neutral-500", badge: "BW" },
};

function ColorAdjustNode({
  id,
  kind,
  data,
  selected,
}: {
  id: string;
  kind: ColorNodeKind;
  data: Record<string, unknown>;
  selected?: boolean;
}) {
  const { updateNodeData } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const meta = META[kind];
  const patch = (p: Record<string, unknown>) => updateNodeData(id, { ...data, ...p });

  const panel = () => {
    switch (kind) {
      case "cyclesGammaNode":
        return (
          <label className="text-[9px] flex flex-col gap-0.5">
            Gamma
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.01}
              value={Number(data.gamma ?? 1)}
              onChange={(e) => patch({ gamma: parseFloat(e.target.value) })}
              className="h-1 accent-amber-500"
            />
          </label>
        );
      case "cyclesBrightContrastNode":
        return (
          <div className="grid grid-cols-2 gap-2 text-[9px]">
            <label className="flex flex-col gap-0.5">
              Bright
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={Number(data.bright ?? 0)}
                onChange={(e) => patch({ bright: parseFloat(e.target.value) })}
                className="h-1 accent-amber-500"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              Contrast
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={Number(data.contrast ?? 0)}
                onChange={(e) => patch({ contrast: parseFloat(e.target.value) })}
                className="h-1 accent-amber-500"
              />
            </label>
          </div>
        );
      case "cyclesRgbCurvesNode":
        return (
          <label className="text-[9px] flex flex-col gap-0.5">
            Fac
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={Number(data.fac ?? 1)}
              onChange={(e) => patch({ fac: parseFloat(e.target.value) })}
              className="h-1 accent-orange-500"
            />
          </label>
        );
      case "cyclesRgbRampNode":
        return (
          <label className="text-[9px] flex flex-col gap-0.5">
            Fac
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={Number(data.fac ?? 0)}
              onChange={(e) => patch({ fac: parseFloat(e.target.value) })}
              className="h-1 accent-orange-500"
            />
          </label>
        );
      case "cyclesMixColorNode":
        return (
          <div className="flex flex-col gap-1 text-[9px]">
            <select
              className="bg-neutral-900 border border-neutral-700 rounded h-6 px-1"
              value={String(data.blendType ?? "mix")}
              onChange={(e) => patch({ blendType: e.target.value })}
            >
              <option value="mix">Mix</option>
              <option value="multiply">Multiply</option>
              <option value="add">Add</option>
              <option value="overlay">Overlay</option>
            </select>
            <label className="flex flex-col gap-0.5">
              Factor
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={Number(data.factor ?? 0.5)}
                onChange={(e) => patch({ factor: parseFloat(e.target.value) })}
                className="h-1 accent-rose-500"
              />
            </label>
          </div>
        );
      case "cyclesMapRangeNode":
        return (
          <div className="grid grid-cols-2 gap-1 text-[8px]">
            {(["fromMin", "fromMax", "toMin", "toMax"] as const).map((k) => (
              <label key={k} className="flex flex-col">
                {k}
                <input
                  type="number"
                  step={0.01}
                  className="h-5 bg-neutral-900 border border-neutral-700 rounded px-1"
                  value={Number(data[k] ?? (k.includes("Min") ? 0 : 1))}
                  onChange={(e) => patch({ [k]: parseFloat(e.target.value) })}
                />
              </label>
            ))}
          </div>
        );
      default:
        return <span className="text-[8px] text-neutral-500">直通灰度</span>;
    }
  };

  const handles =
    kind === "cyclesMixColorNode"
      ? [
          { id: "mixA", type: "target" as const, top: "30%", borderClass: "!border-rose-400", textClass: "text-rose-300" },
          { id: "mixB", type: "target" as const, top: "55%", borderClass: "!border-rose-400", textClass: "text-rose-300" },
          { id: "colorOut", type: "source" as const, borderClass: "!border-amber-500", textClass: "text-amber-400" },
        ]
      : [
          { id: "colorIn", type: "target" as const, borderClass: "!border-amber-600", textClass: "text-amber-400" },
          { id: "colorOut", type: "source" as const, borderClass: "!border-amber-500", textClass: "text-amber-400" },
        ];

  return (
    <CyclesNodeShell
      id={id}
      title={meta.title}
      badge={meta.badge ?? "CL"}
      accentClass={meta.accent}
      selected={selected}
      width={kind === "cyclesMapRangeNode" ? 200 : 188}
      height={96}
      zoom={zoom}
      handles={handles}
      panel={panel()}
    >
      <div className="flex items-center gap-1 text-[8px] text-neutral-500">
        <SlidersHorizontal className="w-3 h-3 text-amber-500/80" />
        Cycles 原生
      </div>
    </CyclesNodeShell>
  );
}

export const CyclesGammaNode = (p: { id: string; data: Record<string, unknown>; selected?: boolean }) => (
  <ColorAdjustNode {...p} kind="cyclesGammaNode" />
);
export const CyclesBrightContrastNode = (p: { id: string; data: Record<string, unknown>; selected?: boolean }) => (
  <ColorAdjustNode {...p} kind="cyclesBrightContrastNode" />
);
export const CyclesRgbCurvesNode = (p: { id: string; data: Record<string, unknown>; selected?: boolean }) => (
  <ColorAdjustNode {...p} kind="cyclesRgbCurvesNode" />
);
export const CyclesRgbRampNode = (p: { id: string; data: Record<string, unknown>; selected?: boolean }) => (
  <ColorAdjustNode {...p} kind="cyclesRgbRampNode" />
);
export const CyclesMixColorNode = (p: { id: string; data: Record<string, unknown>; selected?: boolean }) => (
  <ColorAdjustNode {...p} kind="cyclesMixColorNode" />
);
export const CyclesMapRangeNode = (p: { id: string; data: Record<string, unknown>; selected?: boolean }) => (
  <ColorAdjustNode {...p} kind="cyclesMapRangeNode" />
);
export const CyclesRgbToBwNode = (p: { id: string; data: Record<string, unknown>; selected?: boolean }) => (
  <ColorAdjustNode {...p} kind="cyclesRgbToBwNode" />
);
