import React from "react";
import type { Node } from "@xyflow/react";
import { Camera, Clapperboard, Plus, Sun, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  JEP_ASPECT_RATIO_PRESETS,
  JEP_FOCAL_LENGTH_PRESETS_MM,
  applyAspectToResolution,
  createDefaultJepCamera,
  normalizeJepCameras,
  normalizeJepRenderSettings,
  type JepCamera,
  type JepConnectedLight,
  type JepRenderSettings,
} from "../lib/jep-renderer";

interface JepEditorPropertiesPanelProps {
  node: Node;
  connectedLights: JepConnectedLight[];
  onPatch: (patch: Record<string, unknown>) => void;
}

const labelClass =
  "mb-1 block text-[9px] font-bold uppercase tracking-wide text-neutral-500";
const inputClass =
  "h-8 w-full rounded-md border border-white/[0.08] bg-black/30 px-2 text-[10px] text-neutral-200 outline-none focus:border-cyan-400/50";
const selectClass =
  "h-8 w-full rounded-md border border-white/[0.08] bg-black/30 px-2 text-[10px] text-neutral-200 outline-none focus:border-cyan-400/50";

export function JepEditorPropertiesPanel({
  node,
  connectedLights,
  onPatch,
}: JepEditorPropertiesPanelProps) {
  const data = node.data as Record<string, unknown>;
  const renderActive = data.renderActive === true;
  const cameras = normalizeJepCameras(data.jepCameras);
  const renderSettings = normalizeJepRenderSettings(
    data.jepRenderSettings ?? data.renderSettings,
  );
  const activeViewKey = String(data.jepActiveViewKey || "");
  const jepViewKind = data.jepViewKind === "light" ? "light" : "camera";

  const updateCameras = (next: JepCamera[]) => {
    onPatch({ jepCameras: next });
  };

  const updateRenderSettings = (patch: Partial<JepRenderSettings>) => {
    const merged = { ...renderSettings, ...patch };
    onPatch({
      jepRenderSettings: merged,
      renderSettings: {
        samples: merged.samples,
        bounces: merged.maxBounces,
        width: merged.width,
        height: merged.height,
        device: merged.device,
        denoise: merged.denoise,
        exposure: merged.exposure,
      },
    });
  };

  const patchCamera = (cameraId: string, patch: Partial<JepCamera>) => {
    updateCameras(
      cameras.map((cam) => (cam.id === cameraId ? { ...cam, ...patch } : cam)),
    );
  };

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-bold text-cyan-200">
            <Camera className="h-3.5 w-3.5" />
            JEP 相机
          </div>
          <Button
            type="button"
            size="sm"
            className="h-7 rounded-md border border-cyan-700/60 bg-cyan-900/40 px-2 text-[10px] text-cyan-100 hover:bg-cyan-800/50"
            onClick={() => {
              const next = createDefaultJepCamera(cameras.length + 1);
              updateCameras([...cameras, next]);
              onPatch({
                jepActiveViewKey: `camera:${next.id}`,
                jepViewKind: "camera",
              });
            }}
          >
            <Plus className="mr-1 h-3 w-3" />
            新建
          </Button>
        </div>
        <div className="space-y-2">
          {cameras.map((cam) => {
            const selected = activeViewKey === `camera:${cam.id}` && jepViewKind === "camera";
            return (
              <div
                key={cam.id}
                className={`rounded-lg border p-2 ${
                  selected
                    ? "border-cyan-400/50 bg-cyan-950/40"
                    : "border-neutral-800 bg-neutral-900/40"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <input
                    value={cam.name}
                    onChange={(e) => patchCamera(cam.id, { name: e.target.value })}
                    className="h-7 flex-1 rounded border border-neutral-800 bg-black/30 px-2 text-[10px] font-bold text-neutral-100"
                  />
                  {cameras.length > 1 && (
                    <button
                      type="button"
                      className="text-neutral-500 hover:text-red-400"
                      onClick={() => {
                        const next = cameras.filter((c) => c.id !== cam.id);
                        updateCameras(next);
                        if (selected && next[0]) {
                          onPatch({
                            jepActiveViewKey: `camera:${next[0].id}`,
                            jepViewKind: "camera",
                          });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className={labelClass}>焦距 mm</span>
                    <select
                      value={cam.focalLengthMm}
                      onChange={(e) =>
                        patchCamera(cam.id, {
                          focalLengthMm: parseInt(e.target.value, 10),
                        })
                      }
                      className={selectClass}
                    >
                      {JEP_FOCAL_LENGTH_PRESETS_MM.map((mm) => (
                        <option key={mm} value={mm}>
                          {mm}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>画幅比例</span>
                    <select
                      value={cam.aspectRatio}
                      onChange={(e) => {
                        const aspect = e.target.value;
                        patchCamera(cam.id, { aspectRatio: aspect });
                        const size = applyAspectToResolution(aspect, renderSettings.width);
                        updateRenderSettings(size);
                      }}
                      className={selectClass}
                    >
                      {JEP_ASPECT_RATIO_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>光圈 f/</span>
                    <input
                      type="number"
                      min="0.8"
                      max="32"
                      step="0.1"
                      value={cam.aperture}
                      onChange={(e) =>
                        patchCamera(cam.id, { aperture: parseFloat(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className={labelClass}>对焦距离</span>
                    <input
                      type="number"
                      min="0.1"
                      max="500"
                      step="0.1"
                      value={cam.focusDistance}
                      onChange={(e) =>
                        patchCamera(cam.id, {
                          focusDistance: parseFloat(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                </div>
                <label className="mt-2 flex items-center justify-between text-[10px] text-neutral-400">
                  <span>景深</span>
                  <button
                    type="button"
                    onClick={() =>
                      patchCamera(cam.id, { dofEnabled: !cam.dofEnabled })
                    }
                    className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                      cam.dofEnabled
                        ? "bg-cyan-500/20 text-cyan-200"
                        : "bg-neutral-800 text-neutral-500"
                    }`}
                  >
                    {cam.dofEnabled ? "开启" : "关闭"}
                  </button>
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-amber-500/25 bg-amber-950/15 p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-amber-200">
          <Sun className="h-3.5 w-3.5" />
          已接入灯光 ({connectedLights.length})
        </div>
        {connectedLights.length === 0 ? (
          <p className="text-[10px] leading-relaxed text-neutral-500">
            将灯光节点连到编辑器的 cyclesLight 端口，可在视口左上角切换到灯光视角预览。
          </p>
        ) : (
          <ul className="space-y-1 text-[10px] text-neutral-300">
            {connectedLights.map((light) => (
              <li
                key={light.edgeId}
                className={`rounded border px-2 py-1 ${
                  activeViewKey === `light:${light.edgeId}` && jepViewKind === "light"
                    ? "border-amber-400/50 bg-amber-950/40 text-amber-100"
                    : "border-neutral-800 bg-black/20"
                }`}
              >
                {light.label}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-purple-500/25 bg-purple-950/15 p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-purple-200">
          <Clapperboard className="h-3.5 w-3.5" />
          JEP 渲染设置
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelClass}>宽度</span>
            <input
              type="number"
              value={renderSettings.width}
              onChange={(e) =>
                updateRenderSettings({ width: parseInt(e.target.value, 10) })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>高度</span>
            <input
              type="number"
              value={renderSettings.height}
              onChange={(e) =>
                updateRenderSettings({ height: parseInt(e.target.value, 10) })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>采样</span>
            <input
              type="number"
              value={renderSettings.samples}
              onChange={(e) =>
                updateRenderSettings({ samples: parseInt(e.target.value, 10) })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>反弹</span>
            <input
              type="number"
              value={renderSettings.maxBounces}
              onChange={(e) =>
                updateRenderSettings({ maxBounces: parseInt(e.target.value, 10) })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>曝光</span>
            <input
              type="number"
              step="0.05"
              value={renderSettings.exposure}
              onChange={(e) =>
                updateRenderSettings({ exposure: parseFloat(e.target.value) })
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>设备</span>
            <select
              value={renderSettings.device}
              onChange={(e) =>
                updateRenderSettings({
                  device: e.target.value as JepRenderSettings["device"],
                })
              }
              className={selectClass}
            >
              <option value="METAL">Metal</option>
              <option value="CPU">CPU</option>
              <option value="CUDA">CUDA</option>
            </select>
          </label>
        </div>
        <label className="mt-2 flex items-center justify-between text-[10px] text-neutral-400">
          <span>实时渲染（仅摄像机视角）</span>
          <button
            type="button"
            onClick={() => onPatch({ renderActive: !renderActive })}
            className={`rounded px-2 py-0.5 text-[9px] font-bold ${
              renderActive
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-neutral-800 text-neutral-500"
            }`}
          >
            {renderActive ? "开启" : "关闭"}
          </button>
        </label>
      </section>
    </div>
  );
}
