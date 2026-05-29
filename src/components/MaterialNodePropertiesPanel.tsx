import type { Node } from "@xyflow/react";
import { Layers } from "lucide-react";
import { createCyclesMaterial } from "../lib/cycles-material";

type MaterialNodeType =
  | "materialGenNode"
  | "materialReplaceNode"
  | "cyclesPrincipledNode";

type ScalarField = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
};

const PBR_CORE_FIELDS: ScalarField[] = [
  { key: "tiling", label: "贴图平铺", min: 0.25, max: 16, step: 0.25 },
  { key: "roughness", label: "粗糙度", min: 0, max: 1, step: 0.01 },
  { key: "metalness", label: "金属度", min: 0, max: 1, step: 0.01 },
  { key: "normalScale", label: "法线强度", min: 0, max: 4, step: 0.05 },
  { key: "displacementScale", label: "置换强度", min: 0, max: 2, step: 0.01 },
  { key: "transmission", label: "透射", min: 0, max: 1, step: 0.01 },
  { key: "ior", label: "折射率 IOR", min: 1, max: 3, step: 0.01, format: (v) => v.toFixed(2) },
  { key: "alpha", label: "透明度", min: 0, max: 1, step: 0.01 },
];

const PBR_ADVANCED_FIELDS: ScalarField[] = [
  { key: "specular", label: "高光", min: 0, max: 1, step: 0.01 },
  { key: "specularTint", label: "高光着色", min: 0, max: 1, step: 0.01 },
  { key: "anisotropic", label: "各向异性", min: 0, max: 1, step: 0.01 },
  { key: "anisotropicRotation", label: "各向异性旋转", min: 0, max: 1, step: 0.01 },
  { key: "clearcoat", label: "清漆", min: 0, max: 1, step: 0.01 },
  { key: "coatRoughness", label: "清漆粗糙度", min: 0, max: 1, step: 0.01 },
  { key: "coatIor", label: "清漆 IOR", min: 1, max: 3, step: 0.01, format: (v) => v.toFixed(2) },
  { key: "sheenWeight", label: "光泽", min: 0, max: 1, step: 0.01 },
  { key: "sheenRoughness", label: "光泽粗糙度", min: 0, max: 1, step: 0.01 },
  { key: "emissionStrength", label: "自发光强度", min: 0, max: 20, step: 0.05, format: (v) => v.toFixed(2) },
  { key: "displacementMidlevel", label: "置换中值", min: 0, max: 1, step: 0.01 },
  { key: "thinFilmThickness", label: "薄膜厚度", min: 0, max: 2000, step: 1, format: (v) => String(Math.round(v)) },
  { key: "thinFilmIor", label: "薄膜 IOR", min: 1, max: 3, step: 0.01, format: (v) => v.toFixed(2) },
];

const TEXTURE_SLOT_LABELS: Record<string, string> = {
  baseColor: "漫反射",
  normal: "法线",
  roughness: "粗糙度贴图",
  metallic: "金属度贴图",
  displacement: "置换",
  emission: "自发光",
  alpha: "透明",
};

function readScalar(data: Record<string, unknown>, key: string, fallback: number) {
  const raw = data[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const mat = createCyclesMaterial(data);
  const p = mat.principled as unknown as Record<string, unknown>;
  const map: Record<string, string> = {
    metalness: "metallic",
    normalScale: "normalStrength",
    specular: "specularIorLevel",
    clearcoat: "coatWeight",
    transmission: "transmissionWeight",
    tiling: "tiling",
  };
  if (key === "tiling") {
    const tiling = data.tiling;
    return typeof tiling === "number" && Number.isFinite(tiling) ? tiling : 1;
  }
  const cyclesKey = map[key] ?? key;
  const fromCycles = p[cyclesKey];
  if (typeof fromCycles === "number" && Number.isFinite(fromCycles)) return fromCycles;
  return fallback;
}

function readTint(data: Record<string, unknown>) {
  const mat = createCyclesMaterial(data);
  return mat.principled.baseColor;
}

interface MaterialNodePropertiesPanelProps {
  node: Node;
  onPatch: (key: string, value: string | number) => void;
}

function ScalarSlider({
  field,
  value,
  onChange,
}: {
  field: ScalarField;
  value: number;
  onChange: (value: number) => void;
}) {
  const display = field.format ? field.format(value) : value.toFixed(2);
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wide text-neutral-500">
          {field.label}
        </span>
        <span className="font-mono text-[9px] text-emerald-300/90">{display}</span>
      </div>
      <input
        type="range"
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full accent-emerald-500"
      />
    </label>
  );
}

export function MaterialNodePropertiesPanel({
  node,
  onPatch,
}: MaterialNodePropertiesPanelProps) {
  const data = (node.data || {}) as Record<string, unknown>;
  const mat = createCyclesMaterial(data);
  const inputClass =
    "h-8 w-full rounded-md border border-white/[0.08] bg-black/30 px-2 text-[10px] text-neutral-200 outline-none focus:border-emerald-400/50";

  const renderScalarGroup = (title: string, fields: ScalarField[]) => (
    <section className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3 space-y-2.5">
      <div className="flex items-center gap-2 text-[11px] font-bold text-neutral-100">
        <Layers className="h-3.5 w-3.5 text-emerald-300" />
        {title}
      </div>
      {fields.map((field) => (
        <ScalarSlider
          key={field.key}
          field={field}
          value={readScalar(data, field.key, field.min)}
          onChange={(value) => onPatch(field.key, value)}
        />
      ))}
    </section>
  );

  const textureEntries = Object.entries(mat.textures).filter(
    ([, url]) => typeof url === "string" && url.length > 0,
  );

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
        <label className="block">
          <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-neutral-500">
            基础色
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={readTint(data)}
              onChange={(e) => onPatch("tint", e.target.value)}
              className="h-8 w-10 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
            />
            <input
              type="text"
              value={readTint(data)}
              onChange={(e) => onPatch("tint", e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </label>
        <label className="mt-2 block">
          <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-neutral-500">
            自发光色
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={mat.principled.emissionColor}
              onChange={(e) => onPatch("emissionColor", e.target.value)}
              className="h-8 w-10 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
            />
            <input
              type="text"
              value={mat.principled.emissionColor}
              onChange={(e) => onPatch("emissionColor", e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>
        </label>
      </section>

      {renderScalarGroup("PBR 核心", PBR_CORE_FIELDS)}
      {renderScalarGroup("PBR 高级", PBR_ADVANCED_FIELDS)}

      {textureEntries.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[11px] font-bold text-neutral-200">已关联贴图</div>
          <div className="space-y-1.5">
            {textureEntries.map(([slot, url]) => (
              <div
                key={slot}
                className="rounded-md border border-white/[0.06] bg-black/25 px-2 py-1.5"
              >
                <div className="text-[9px] font-bold text-neutral-400">
                  {TEXTURE_SLOT_LABELS[slot] ?? slot}
                </div>
                <div className="truncate font-mono text-[8px] text-neutral-500" title={url}>
                  {url}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-neutral-500">
            贴图请在节点预览区底部通道按钮上传或替换。
          </p>
        </section>
      )}
    </div>
  );
}

export const MATERIAL_PROPERTY_NODE_TYPES = new Set<MaterialNodeType>([
  "materialGenNode",
  "materialReplaceNode",
  "cyclesPrincipledNode",
]);

export function isMaterialPropertyNode(type: string | undefined) {
  return MATERIAL_PROPERTY_NODE_TYPES.has(type as MaterialNodeType);
}
