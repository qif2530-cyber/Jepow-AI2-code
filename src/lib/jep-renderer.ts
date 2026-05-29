import type { Edge, Node } from "@xyflow/react";
import type { ViewportCamera, ViewportLighting } from "./viewport-engine/types";
import { CYCLES_LIGHT_NODE_TYPES } from "./native-3d-pipeline";

export type JepViewKind = "camera" | "light";

export const JEP_FOCAL_LENGTH_PRESETS_MM = [25, 30, 45, 50, 80, 135] as const;
export const JEP_ASPECT_RATIO_PRESETS = [
  { label: "16:9", value: "16:9", w: 16, h: 9 },
  { label: "4:3", value: "4:3", w: 4, h: 3 },
  { label: "1:1", value: "1:1", w: 1, h: 1 },
  { label: "2.39:1", value: "2.39:1", w: 239, h: 100 },
] as const;

export interface JepCamera {
  id: string;
  name: string;
  focalLengthMm: number;
  sensorWidthMm: number;
  sensorHeightMm: number;
  aspectRatio: string;
  aperture: number;
  focusDistance: number;
  dofEnabled: boolean;
  nearClip: number;
  farClip: number;
}

export interface JepRenderSettings {
  width: number;
  height: number;
  samples: number;
  maxBounces: number;
  exposure: number;
  denoise: boolean;
  device: "CPU" | "METAL" | "CUDA";
  filmAspect: string;
}

export interface JepConnectedLight {
  edgeId: string;
  nodeId: string;
  nodeType: string;
  label: string;
  cyclesLight: Record<string, unknown>;
}

export function createDefaultJepCamera(index = 1): JepCamera {
  return {
    id: `jep-cam-${Date.now()}-${index}`,
    name: `相机 ${index}`,
    focalLengthMm: 50,
    sensorWidthMm: 36,
    sensorHeightMm: 20.25,
    aspectRatio: "16:9",
    aperture: 2.8,
    focusDistance: 10,
    dofEnabled: false,
    nearClip: 0.01,
    farClip: 1000,
  };
}

export function defaultJepRenderSettings(): JepRenderSettings {
  return {
    width: 2048,
    height: 1152,
    samples: 128,
    maxBounces: 8,
    exposure: 1.0,
    denoise: true,
    device: "METAL",
    filmAspect: "16:9",
  };
}

export function focalLengthToFovRad(focalLengthMm: number, sensorWidthMm = 36): number {
  const f = Math.max(8, focalLengthMm);
  const s = Math.max(1, sensorWidthMm);
  return 2 * Math.atan(s / (2 * f));
}

export function applyAspectToResolution(
  aspect: string,
  baseWidth = 2048,
): Pick<JepRenderSettings, "width" | "height" | "filmAspect"> {
  const preset = JEP_ASPECT_RATIO_PRESETS.find((p) => p.value === aspect);
  if (!preset) {
    return { width: baseWidth, height: Math.round((baseWidth * 9) / 16), filmAspect: "16:9" };
  }
  const height = Math.max(64, Math.round((baseWidth * preset.h) / preset.w));
  return { width: baseWidth, height, filmAspect: preset.value };
}

export function cameraViewKey(cameraId: string) {
  return `camera:${cameraId}`;
}

export function lightViewKey(edgeId: string) {
  return `light:${edgeId}`;
}

export function parseJepViewKey(key: string): { kind: JepViewKind; id: string } | null {
  if (key.startsWith("camera:")) {
    return { kind: "camera", id: key.slice("camera:".length) };
  }
  if (key.startsWith("light:")) {
    return { kind: "light", id: key.slice("light:".length) };
  }
  return null;
}

export function normalizeJepCameras(raw: unknown): JepCamera[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [createDefaultJepCamera(1)];
  }
  return raw
    .map((item, index) => {
      const row = item as Partial<JepCamera>;
      const focal = Number(row.focalLengthMm) || 50;
      return {
        id: String(row.id || `jep-cam-${index}`),
        name: String(row.name || `相机 ${index + 1}`),
        focalLengthMm: focal,
        sensorWidthMm: Number(row.sensorWidthMm) || 36,
        sensorHeightMm: Number(row.sensorHeightMm) || 20.25,
        aspectRatio: String(row.aspectRatio || "16:9"),
        aperture: Number(row.aperture) || 2.8,
        focusDistance: Number(row.focusDistance) || 10,
        dofEnabled: row.dofEnabled === true,
        nearClip: Number(row.nearClip) || 0.01,
        farClip: Number(row.farClip) || 1000,
      };
    })
    .filter((c) => c.id);
}

export function normalizeJepRenderSettings(raw: unknown): JepRenderSettings {
  const base = defaultJepRenderSettings();
  if (!raw || typeof raw !== "object") return base;
  const row = raw as Partial<JepRenderSettings>;
  const filmAspect = String(
    row.filmAspect ||
      (row as { aspectRatio?: string }).aspectRatio ||
      base.filmAspect,
  );
  const aspectSize = applyAspectToResolution(filmAspect, Number(row.width) || base.width);
  return {
    width: Number(row.width) || aspectSize.width,
    height: Number(row.height) || aspectSize.height,
    samples: Math.max(1, Number(row.samples) || base.samples),
    maxBounces: Math.max(1, Number(row.maxBounces) || base.maxBounces),
    exposure: Number(row.exposure) || base.exposure,
    denoise: row.denoise !== false,
    device:
      row.device === "CPU" || row.device === "CUDA" || row.device === "METAL"
        ? row.device
        : base.device,
    filmAspect: aspectSize.filmAspect,
  };
}

export function resolveEditorConnectedLights(
  editorNodeId: string,
  nodes: Node[],
  edges: Edge[],
): JepConnectedLight[] {
  const lightEdges = edges.filter(
    (e) => e.target === editorNodeId && e.targetHandle === "cyclesLight",
  );
  const out: JepConnectedLight[] = [];
  for (const edge of lightEdges) {
    const node = nodes.find((n) => n.id === edge.source);
    if (!node?.type || !CYCLES_LIGHT_NODE_TYPES.includes(node.type)) continue;
    const data = node.data as {
      cyclesLight?: Record<string, unknown>;
      lightKind?: string;
    };
    const cyclesLight = data.cyclesLight || {
      type: data.lightKind || node.type.replace("cycles", "").replace("Node", ""),
    };
    const label =
      node.type === "cyclesSunLightNode"
        ? "物理太阳光"
        : node.type === "cyclesHdrEnvironmentNode"
          ? "HDR 环境"
          : node.type === "cyclesPointLightNode"
            ? "点光源"
            : node.type === "cyclesAreaLightNode"
              ? "面光源"
              : node.type === "cyclesDirectionalLightNode"
                ? "平行光"
                : "灯光";
    out.push({
      edgeId: edge.id,
      nodeId: node.id,
      nodeType: node.type,
      label,
      cyclesLight,
    });
  }
  return out;
}

export function cyclesLightToViewportLighting(
  light: Record<string, unknown> | null | undefined,
  exposure = 1,
): ViewportLighting {
  if (!light) {
    return { yaw: 45, pitch: 35, ambient: 0.15, directional: 0, exposure, environment: 0 };
  }
  const keyStrength = Number(light.keyStrength ?? 0);
  const env = Number(light.environmentStrength ?? 0);
  return {
    type: String(light.type ?? light.lightKind ?? ""),
    yaw: Number(light.yaw ?? 45),
    pitch: Number(light.pitch ?? 35),
    ambient: Math.max(0, env * 0.12),
    directional: Math.max(0, keyStrength / 400),
    exposure: Number(light.exposure ?? exposure),
    environment: env,
    hdrUrl: (light.hdrUrl as string) || "",
  };
}

/** Camera view: combine all connected lights into one preview rig. */
export function mergeLightsForCameraView(
  lights: JepConnectedLight[],
  panelExposure = 1,
): ViewportLighting {
  if (!lights.length) {
    return { yaw: 45, pitch: 35, ambient: 0.35, directional: 1.2, exposure: panelExposure, environment: 0.5 };
  }
  let yaw = 0;
  let pitch = 0;
  let dirWeight = 0;
  let keySum = 0;
  let envSum = 0;
  for (const entry of lights) {
    const L = entry.cyclesLight;
    const key = Number(L.keyStrength ?? 0);
    const env = Number(L.environmentStrength ?? 0);
    const w = Math.max(0.001, key + env);
    yaw += Number(L.yaw ?? 45) * w;
    pitch += Number(L.pitch ?? 35) * w;
    dirWeight += w;
    keySum += key;
    envSum += env;
  }
  const inv = 1 / Math.max(dirWeight, 0.001);
  return {
    yaw: yaw * inv,
    pitch: pitch * inv,
    ambient: 0.22 + envSum * 0.08,
    directional: Math.max(0.35, keySum / 320),
    exposure: panelExposure,
    environment: Math.max(0.15, envSum * 0.35),
  };
}

export function lightNodeLabel(node: Node): string {
  const data = node.data as { cyclesLight?: Record<string, unknown> };
  const kind = String(data?.cyclesLight?.type ?? "");
  if (kind === "sun") return "物理太阳光";
  if (kind === "hdr_environment" || kind === "hdr") return "HDR 环境";
  if (kind === "point") return "点光源";
  if (kind === "area") return "面光源";
  if (kind === "directional") return "平行光";
  return "灯光";
}
