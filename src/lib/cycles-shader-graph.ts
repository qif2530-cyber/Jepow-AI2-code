import type { Edge, Node } from "@xyflow/react";
import { createCyclesMaterial, type CyclesMaterial } from "./cycles-material";
import { buildCyclesShaderGraphIR } from "./cycles-shader-graph-ir";

type TextureChannel =
  | "baseColor"
  | "normal"
  | "roughness"
  | "metallic"
  | "displacement"
  | "emission"
  | "alpha";

const CHANNEL_TO_RAW: Record<TextureChannel, string> = {
  baseColor: "colorUrl",
  normal: "normalUrl",
  roughness: "roughnessUrl",
  metallic: "metalnessUrl",
  displacement: "bumpUrl",
  emission: "emissionUrl",
  alpha: "alphaUrl",
};

const HANDLE_TO_CHANNEL: Record<string, TextureChannel> = {
  texBaseColor: "baseColor",
  texNormal: "normal",
  texRoughness: "roughness",
  texMetallic: "metallic",
  texDisplacement: "displacement",
  texEmission: "emission",
  texAlpha: "alpha",
};

function applyTexture(raw: Record<string, unknown>, channel: string, url?: string) {
  if (!url) return;
  const key = CHANNEL_TO_RAW[channel as TextureChannel];
  if (key) raw[key] = url;
}

function upstreamImageUrl(
  nodeId: string,
  nodes: Node[],
  edges: Edge[],
): string | undefined {
  const edge = edges.find((e) => e.target === nodeId);
  if (!edge) return undefined;
  const src = nodes.find((n) => n.id === edge.source);
  if (!src) return undefined;
  if (src.type === "cyclesImageTextureNode") {
    const d = src.data as { imageUrl?: string; url?: string };
    return d.imageUrl || d.url;
  }
  if (src.type === "imageNode" || src.type === "mediaNode") {
    return (src.data as { url?: string }).url;
  }
  return undefined;
}

/** 从材质节点 + 入边解析完整 Cycles 材质（供 3D 编辑器 / 离线渲染） */
export function resolveCyclesMaterialForEditor(
  materialNode: Node | null | undefined,
  nodes: Node[],
  edges: Edge[],
): CyclesMaterial | null {
  if (!materialNode) return null;

  const type = materialNode.type;
  const data = materialNode.data as Record<string, unknown>;

  if (type === "materialGenNode" || type === "materialReplaceNode") {
    const mat = createCyclesMaterial(data);
    return {
      ...mat,
      shaderGraph: buildCyclesShaderGraphIR(materialNode, nodes, edges, mat),
    };
  }

  if (type === "cyclesPrincipledNode") {
    const raw: Record<string, unknown> = { ...data };
    const incoming = edges.filter((e) => e.target === materialNode.id);
    for (const edge of incoming) {
      const src = nodes.find((n) => n.id === edge.source);
      if (!src) continue;
      if (src.type === "cyclesImageTextureNode") {
        const sd = src.data as { imageUrl?: string; url?: string; channel?: string };
        const url = sd.imageUrl || sd.url;
        const channel =
          HANDLE_TO_CHANNEL[edge.targetHandle || ""] ||
          (sd.channel as TextureChannel) ||
          "baseColor";
        applyTexture(raw, channel, url);
      } else if (src.type === "cyclesNormalMapNode") {
        const url = upstreamImageUrl(src.id, nodes, edges);
        if (url) raw.normalUrl = url;
        const strength = (src.data as { strength?: number }).strength;
        if (strength != null) raw.normalScale = strength;
      } else if (src.type === "cyclesDisplacementNode") {
        const url = upstreamImageUrl(src.id, nodes, edges);
        if (url) raw.bumpUrl = url;
        const sd = src.data as { scale?: number; midlevel?: number };
        if (sd.scale != null) raw.displacementScale = sd.scale;
        if (sd.midlevel != null) raw.displacementMidlevel = sd.midlevel;
      }
    }
    const mat = createCyclesMaterial(raw);
    return { ...mat, shaderGraph: buildCyclesShaderGraphIR(materialNode, nodes, edges, mat) };
  }

  if (type === "cyclesImageTextureNode") {
    const raw: Record<string, unknown> = {};
    const sd = data as { imageUrl?: string; url?: string; channel?: string };
    applyTexture(raw, (sd.channel as string) || "baseColor", sd.imageUrl || sd.url);
    return createCyclesMaterial(raw);
  }

  if (type === "cyclesNormalMapNode") {
    const raw: Record<string, unknown> = {};
    const url = upstreamImageUrl(materialNode.id, nodes, edges);
    if (url) raw.normalUrl = url;
    raw.normalScale = (data as { strength?: number }).strength ?? 1;
    return createCyclesMaterial(raw);
  }

  if (type === "cyclesDisplacementNode") {
    const raw: Record<string, unknown> = {};
    const url = upstreamImageUrl(materialNode.id, nodes, edges);
    if (url) raw.bumpUrl = url;
    raw.displacementScale = (data as { scale?: number }).scale ?? 0;
    raw.displacementMidlevel = (data as { midlevel?: number }).midlevel ?? 0.5;
    return createCyclesMaterial(raw);
  }

  return createCyclesMaterial(data);
}

/** 供 Three.js 预览的扁平材质字段 */
export function materialNodeDataForPreview(
  materialNode: Node | null | undefined,
  nodes: Node[],
  edges: Edge[],
): Record<string, unknown> | null {
  if (!materialNode) return null;
  if (
    materialNode.type === "materialGenNode" ||
    materialNode.type === "materialReplaceNode"
  ) {
    return materialNode.data as Record<string, unknown>;
  }
  const mat = resolveCyclesMaterialForEditor(materialNode, nodes, edges);
  if (!mat) return null;
  const p = mat.principled;
  const t = mat.textures;
  return {
    cyclesMaterial: mat,
    tint: p.baseColor,
    roughness: p.roughness,
    metalness: p.metallic,
    normalScale: p.normalStrength,
    displacementScale: p.displacementScale,
    transmission: p.transmissionWeight,
    ior: p.ior,
    specular: p.specularIorLevel,
    clearcoat: p.coatWeight,
    emissionStrength: p.emissionStrength,
    alpha: p.alpha,
    colorUrl: t.baseColor,
    normalUrl: t.normal,
    roughnessUrl: t.roughness,
    metalnessUrl: t.metallic,
    bumpUrl: t.displacement,
    emissionUrl: t.emission,
    alphaUrl: t.alpha,
  };
}
