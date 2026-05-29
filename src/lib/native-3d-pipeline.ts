/**
 * 3D / Cycles 原生节点连接规范与数据解析（仅画布手动链路，不接入 AI functionDeclarations）。
 */
import type { Connection, Edge, Node } from "@xyflow/react";
import { toLocalAssetRef } from "./local-assets";
import {
  materialNodeDataForPreview,
  resolveCyclesMaterialForEditor,
} from "./cycles-shader-graph";
import { CYCLES_COLOR_NODE_TYPES } from "./cycles-shader-graph-types";

export { materialNodeDataForPreview } from "./cycles-shader-graph";
import type { CyclesMaterial } from "./cycles-material";

export const NATIVE_3D_NODE_TYPES = new Set([
  "modelAssetNode",
  "imageTo3DNode",
  "materialGenNode",
  "materialReplaceNode",
  "threeDEditorNode",
  "threeDRenderNode",
  "cyclesRendererNode",
  "cyclesPrincipledNode",
  "cyclesImageTextureNode",
  "cyclesNormalMapNode",
  "cyclesDisplacementNode",
  "cyclesGammaNode",
  "cyclesBrightContrastNode",
  "cyclesRgbCurvesNode",
  "cyclesRgbRampNode",
  "cyclesMixColorNode",
  "cyclesMapRangeNode",
  "cyclesRgbToBwNode",
  "cyclesLightNode",
  "cyclesPointLightNode",
  "cyclesAreaLightNode",
  "cyclesDirectionalLightNode",
  "cyclesSunLightNode",
  "cyclesHdrEnvironmentNode",
  "cyclesCameraNode",
  "cyclesRenderSettingsNode",
]);

const CYCLES_COLOR_SOURCE_TYPES = [...CYCLES_COLOR_NODE_TYPES];
export const CYCLES_LIGHT_NODE_TYPES: string[] = [
  "cyclesLightNode",
  "cyclesPointLightNode",
  "cyclesAreaLightNode",
  "cyclesDirectionalLightNode",
  "cyclesSunLightNode",
  "cyclesHdrEnvironmentNode",
];

export type Native3dSocket =
  | "model"
  | "texturedModel"
  | "modelInput"
  | "material"
  | "image"
  | "scene"
  | "sceneData"
  | "prompt"
  | "renderedImage"
  | "cyclesLight"
  | "cyclesCamera"
  | "cyclesSettings"
  | "cyclesRenderSettings"
  | "textureOut"
  | "imageIn"
  | "texBaseColor"
  | "texNormal"
  | "texRoughness"
  | "texMetallic"
  | "texDisplacement"
  | "texEmission"
  | "texAlpha"
  | "colorIn"
  | "colorOut"
  | "mixA"
  | "mixB";

export interface Resolved3DModel {
  glbUrl: string;
  nativeScenePath?: string;
  modelName?: string;
  blendSourcePath?: string;
  blendImported?: boolean;
  previewCamera?: Record<string, unknown>;
  sourceNodeId: string;
  sourceType: string;
}

export interface Resolved3DSceneExport {
  glbUrl: string;
  material: CyclesMaterial | null;
  transform: Record<string, unknown>;
  lights: Record<string, unknown>;
  renderSettings: Record<string, unknown>;
  cyclesLight: Record<string, unknown> | null;
  cyclesCamera?: Record<string, unknown> | null;
}

type Rule = {
  sourceTypes: string[];
  sourceHandles?: string[];
  targetTypes: string[];
  targetHandle: Native3dSocket;
  edgeColor: string;
};

const IMAGE_SOURCE_TYPES = ["imageNode", "mediaNode", "imageShotNode", "photoEditorNode", "imageEditorNode"];

const PRINCIPLED_TEXTURE_HANDLE_LIST = [
  "texBaseColor",
  "texNormal",
  "texRoughness",
  "texMetallic",
  "texDisplacement",
  "texEmission",
  "texAlpha",
] as const;

const PRINCIPLED_TEXTURE_HANDLES = new Set<string>(PRINCIPLED_TEXTURE_HANDLE_LIST);

/** 合法连接白名单 */
const CONNECTION_RULES: Rule[] = [
  {
    sourceTypes: [...IMAGE_SOURCE_TYPES, "threeDRenderNode", "cyclesRendererNode"],
    targetTypes: ["imageTo3DNode"],
    targetHandle: "image",
    edgeColor: "#737373",
  },
  {
    sourceTypes: [
      "materialGenNode",
      "cyclesPrincipledNode",
      "cyclesImageTextureNode",
      "cyclesNormalMapNode",
      "cyclesDisplacementNode",
      ...CYCLES_COLOR_SOURCE_TYPES,
    ],
    sourceHandles: ["material"],
    targetTypes: ["materialReplaceNode"],
    targetHandle: "material",
    edgeColor: "#a855f7",
  },
  {
    sourceTypes: ["modelAssetNode", "imageTo3DNode"],
    sourceHandles: ["model"],
    targetTypes: ["materialReplaceNode"],
    targetHandle: "model",
    edgeColor: "#10b981",
  },
  {
    sourceTypes: ["modelAssetNode", "imageTo3DNode", "materialReplaceNode"],
    sourceHandles: ["model", "texturedModel"],
    targetTypes: ["threeDEditorNode", "cyclesRendererNode"],
    targetHandle: "modelInput",
    edgeColor: "#10b981",
  },
  {
    sourceTypes: [
      "materialGenNode",
      "cyclesPrincipledNode",
      "cyclesImageTextureNode",
      "cyclesNormalMapNode",
      "cyclesDisplacementNode",
      ...CYCLES_COLOR_SOURCE_TYPES,
    ],
    sourceHandles: ["material"],
    targetTypes: ["threeDEditorNode", "materialReplaceNode"],
    targetHandle: "material",
    edgeColor: "#a855f7",
  },
  ...PRINCIPLED_TEXTURE_HANDLE_LIST.map((targetHandle) => ({
    sourceTypes: ["cyclesImageTextureNode", ...CYCLES_COLOR_SOURCE_TYPES],
    sourceHandles: ["textureOut", "colorOut"],
    targetTypes: ["cyclesPrincipledNode"],
    targetHandle,
    edgeColor: "#8b5cf6",
  })),
  {
    sourceTypes: ["cyclesImageTextureNode", ...CYCLES_COLOR_SOURCE_TYPES],
    sourceHandles: ["textureOut", "colorOut"],
    targetTypes: [...CYCLES_COLOR_SOURCE_TYPES, "cyclesNormalMapNode", "cyclesDisplacementNode"],
    targetHandle: "colorIn",
    edgeColor: "#fbbf24",
  },
  {
    sourceTypes: ["cyclesImageTextureNode", ...CYCLES_COLOR_SOURCE_TYPES],
    sourceHandles: ["textureOut", "colorOut"],
    targetTypes: ["cyclesMixColorNode"],
    targetHandle: "mixA",
    edgeColor: "#fb7185",
  },
  {
    sourceTypes: ["cyclesImageTextureNode", ...CYCLES_COLOR_SOURCE_TYPES],
    sourceHandles: ["textureOut", "colorOut"],
    targetTypes: ["cyclesMixColorNode"],
    targetHandle: "mixB",
    edgeColor: "#fb7185",
  },
  {
    sourceTypes: ["cyclesImageTextureNode"],
    sourceHandles: ["textureOut"],
    targetTypes: ["cyclesNormalMapNode", "cyclesDisplacementNode"],
    targetHandle: "imageIn",
    edgeColor: "#22d3ee",
  },
  {
    sourceTypes: ["cyclesNormalMapNode", "cyclesDisplacementNode"],
    sourceHandles: ["textureOut"],
    targetTypes: ["cyclesPrincipledNode"],
    targetHandle: "texNormal",
    edgeColor: "#22d3ee",
  },
  {
    sourceTypes: ["cyclesNormalMapNode", "cyclesDisplacementNode"],
    sourceHandles: ["textureOut"],
    targetTypes: ["cyclesPrincipledNode"],
    targetHandle: "texDisplacement",
    edgeColor: "#fb923c",
  },
  {
    sourceTypes: CYCLES_LIGHT_NODE_TYPES,
    sourceHandles: ["cyclesLight"],
    targetTypes: ["threeDEditorNode", "cyclesRendererNode"],
    targetHandle: "cyclesLight",
    edgeColor: "#f59e0b",
  },
  {
    sourceTypes: ["cyclesCameraNode"],
    sourceHandles: ["cyclesCamera"],
    targetTypes: ["threeDEditorNode", "cyclesRendererNode"],
    targetHandle: "cyclesCamera",
    edgeColor: "#06b6d4",
  },
  {
    sourceTypes: ["cyclesRenderSettingsNode"],
    sourceHandles: ["cyclesRenderSettings"],
    targetTypes: ["threeDEditorNode"],
    targetHandle: "cyclesSettings",
    edgeColor: "#3b82f6",
  },
  {
    sourceTypes: ["threeDEditorNode"],
    sourceHandles: ["sceneData"],
    targetTypes: ["threeDRenderNode", "cyclesRendererNode"],
    targetHandle: "scene",
    edgeColor: "#ec4899",
  },
  {
    sourceTypes: ["textNode", "scriptNode"],
    targetTypes: ["threeDRenderNode"],
    targetHandle: "prompt",
    edgeColor: "#a3a3a3",
  },
];

function ruleMatches(
  rule: Rule,
  sourceType: string,
  sourceHandle: string | null | undefined,
  targetType: string,
  targetHandle: string | null | undefined,
): boolean {
  if (!rule.sourceTypes.includes(sourceType) || !rule.targetTypes.includes(targetType)) {
    return false;
  }
  if (rule.targetHandle !== (targetHandle as Native3dSocket)) return false;
  if (!rule.sourceHandles?.length) return true;
  const sh = sourceHandle || inferSourceHandle(sourceType);
  return rule.sourceHandles.includes(sh);
}

function inferSourceHandle(sourceType: string): string {
  switch (sourceType) {
    case "modelAssetNode":
    case "imageTo3DNode":
      return "model";
    case "materialReplaceNode":
      return "texturedModel";
    case "materialGenNode":
    case "cyclesPrincipledNode":
      return "material";
    case "cyclesImageTextureNode":
    case "cyclesNormalMapNode":
    case "cyclesDisplacementNode":
      return "textureOut";
    case "cyclesGammaNode":
    case "cyclesBrightContrastNode":
    case "cyclesRgbCurvesNode":
    case "cyclesRgbRampNode":
    case "cyclesMixColorNode":
    case "cyclesMapRangeNode":
    case "cyclesRgbToBwNode":
      return "colorOut";
    case "cyclesLightNode":
    case "cyclesPointLightNode":
    case "cyclesAreaLightNode":
    case "cyclesDirectionalLightNode":
    case "cyclesSunLightNode":
    case "cyclesHdrEnvironmentNode":
      return "cyclesLight";
    case "cyclesCameraNode":
      return "cyclesCamera";
    case "cyclesRenderSettingsNode":
      return "cyclesRenderSettings";
    case "threeDEditorNode":
      return "sceneData";
    case "threeDRenderNode":
    case "cyclesRendererNode":
      return "renderedImage";
    default:
      return "default";
  }
}

function inferTargetHandle(targetType: string, sourceType: string): Native3dSocket | null {
  if (targetType === "imageTo3DNode" && (IMAGE_SOURCE_TYPES.includes(sourceType) || sourceType === "threeDRenderNode")) {
    return "image";
  }
  if (targetType === "materialReplaceNode") {
    if (sourceType === "modelAssetNode" || sourceType === "imageTo3DNode") return "model";
    if (sourceType === "materialGenNode" || sourceType.startsWith("cycles")) return "material";
  }
  if (targetType === "threeDEditorNode") {
    if (CYCLES_LIGHT_NODE_TYPES.includes(sourceType)) return "cyclesLight";
    if (sourceType === "cyclesCameraNode") return "cyclesCamera";
    if (sourceType === "cyclesRenderSettingsNode") return "cyclesSettings";
    if (["modelAssetNode", "imageTo3DNode", "materialReplaceNode"].includes(sourceType)) {
      return "modelInput";
    }
    if (
      sourceType === "materialGenNode" ||
      sourceType === "cyclesPrincipledNode" ||
      sourceType === "cyclesImageTextureNode" ||
      sourceType === "cyclesNormalMapNode" ||
      sourceType === "cyclesDisplacementNode" ||
      CYCLES_COLOR_NODE_TYPES.has(sourceType)
    ) {
      return "material";
    }
  }
  if (targetType === "cyclesRendererNode") {
    if (sourceType === "threeDEditorNode") return "scene";
    if (CYCLES_LIGHT_NODE_TYPES.includes(sourceType)) return "cyclesLight";
    if (sourceType === "cyclesCameraNode") return "cyclesCamera";
    if (sourceType === "cyclesRenderSettingsNode") return "cyclesSettings";
  }
  if (targetType === "cyclesPrincipledNode") {
    if (sourceType === "cyclesImageTextureNode" || CYCLES_COLOR_NODE_TYPES.has(sourceType)) {
      return "texBaseColor";
    }
    if (sourceType === "cyclesNormalMapNode") return "texNormal";
    if (sourceType === "cyclesDisplacementNode") return "texDisplacement";
  }
  if (CYCLES_COLOR_NODE_TYPES.has(targetType)) {
    if (targetType === "cyclesMixColorNode") return "mixA";
    return "colorIn";
  }
  if (targetType === "cyclesNormalMapNode" || targetType === "cyclesDisplacementNode") {
    if (sourceType === "cyclesImageTextureNode") return "imageIn";
  }
  if (targetType === "threeDRenderNode") {
    if (sourceType === "threeDEditorNode") return "scene";
    if (sourceType === "textNode" || sourceType === "scriptNode") return "prompt";
  }
  return null;
}

export function isNative3dNodeType(type: string | undefined): boolean {
  return !!type && NATIVE_3D_NODE_TYPES.has(type);
}

export function validateNative3dConnection(
  connection: Connection,
  nodes: Node[],
): { ok: boolean; reason?: string } {
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  if (!source?.type || !target?.type) return { ok: true };

  const only3d =
    isNative3dNodeType(source.type) || isNative3dNodeType(target.type);
  const imageTo3d =
    target.type === "imageTo3DNode" || source.type === "imageTo3DNode";
  const renderPrompt =
    target.type === "threeDRenderNode" &&
    (source.type === "textNode" || source.type === "scriptNode");

  if (!only3d && !imageTo3d && !renderPrompt) return { ok: true };

  let targetHandle = connection.targetHandle;
  let sourceHandle = connection.sourceHandle;
  if (!targetHandle) {
    targetHandle = inferTargetHandle(target.type, source.type);
  }
  if (!sourceHandle) {
    sourceHandle = inferSourceHandle(source.type);
  }
  if (!targetHandle) {
    return { ok: false, reason: "无法识别目标插槽" };
  }

  if (
    target.type === "cyclesPrincipledNode" &&
    source.type === "cyclesImageTextureNode" &&
    PRINCIPLED_TEXTURE_HANDLES.has(targetHandle as Native3dSocket)
  ) {
    return { ok: true };
  }

  const matched = CONNECTION_RULES.some((rule) =>
    ruleMatches(rule, source.type, sourceHandle, target.type, targetHandle),
  );
  if (matched) return { ok: true };

  if (
    target.type === "threeDEditorNode" &&
    ["materialGenNode", "cyclesPrincipledNode", "cyclesImageTextureNode", "cyclesNormalMapNode", "cyclesDisplacementNode"].includes(source.type) &&
    targetHandle === "material"
  ) {
    return { ok: true };
  }

  if (
    target.type === "materialReplaceNode" &&
    source.type === "cyclesImageTextureNode" &&
    targetHandle === "material"
  ) {
    return { ok: false, reason: "纹理节点请接到 Principled BSDF，再连到材质重贴/编辑器" };
  }

  return {
    ok: false,
    reason: `${source.type} → ${target.type}（${targetHandle}）不是合法的原生 3D 连接`,
  };
}

export function normalizeNative3dConnection(
  connection: Connection,
  nodes: Node[],
): Connection {
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  if (!source?.type || !target?.type) return connection;

  const next = { ...connection };
  if (!next.sourceHandle) next.sourceHandle = inferSourceHandle(source.type);
  if (!next.targetHandle) {
    const inferred = inferTargetHandle(target.type, source.type);
    if (inferred) next.targetHandle = inferred;
  }

  if (
    target.type === "cyclesPrincipledNode" &&
    source.type === "cyclesImageTextureNode" &&
    (!next.targetHandle || next.targetHandle === "texBaseColor")
  ) {
    const channel = (source.data as { channel?: string })?.channel || "baseColor";
    const map: Record<string, Native3dSocket> = {
      baseColor: "texBaseColor",
      normal: "texNormal",
      roughness: "texRoughness",
      metallic: "texMetallic",
      displacement: "texDisplacement",
      emission: "texEmission",
      alpha: "texAlpha",
    };
    next.targetHandle = map[channel] || "texBaseColor";
  }

  return next;
}

export function edgeStyleForNative3dConnection(connection: Connection, nodes: Node[]): {
  stroke: string;
  strokeWidth: number;
} {
  const source = nodes.find((n) => n.id === connection.source);
  const target = nodes.find((n) => n.id === connection.target);
  if (!source?.type || !target?.type) {
    return { stroke: "#8b5cf6", strokeWidth: 3 };
  }

  const th = connection.targetHandle || inferTargetHandle(target.type, source.type);
  const rule = CONNECTION_RULES.find((r) =>
    ruleMatches(r, source.type, connection.sourceHandle, target.type, th),
  );
  return {
    stroke: rule?.edgeColor || "#8b5cf6",
    strokeWidth: 3,
  };
}

/** 从任意模型输出节点解析 GLB / 本地场景路径 */
export function resolveModelFromSourceNode(
  sourceNode: Node | null | undefined,
  nodes: Node[],
  edges: Edge[],
): Resolved3DModel | null {
  if (!sourceNode?.type) return null;
  const data = sourceNode.data as Record<string, unknown>;

  if (sourceNode.type === "materialReplaceNode") {
    const textured = data.texturedModel as {
      glbUrl?: string;
      modelName?: string;
      material?: unknown;
    } | undefined;
    if (textured?.glbUrl) {
      return {
        glbUrl: textured.glbUrl,
        modelName: textured.modelName,
        sourceNodeId: sourceNode.id,
        sourceType: sourceNode.type,
      };
    }
    const modelEdge = edges.find(
      (e) => e.target === sourceNode.id && e.targetHandle === "model",
    );
    if (modelEdge) {
      const upstream = nodes.find((n) => n.id === modelEdge.source);
      const up = resolveModelFromSourceNode(upstream, nodes, edges);
      if (up) return up;
    }
    if (typeof data.glbUrl === "string" && data.glbUrl) {
      return {
        glbUrl: data.glbUrl,
        sourceNodeId: sourceNode.id,
        sourceType: sourceNode.type,
      };
    }
    return null;
  }

  if (sourceNode.type === "imageTo3DNode") {
    const glbUrl = data.glbUrl as string | undefined;
    if (!glbUrl) return null;
    return {
      glbUrl,
      modelName: data.modelName as string | undefined,
      sourceNodeId: sourceNode.id,
      sourceType: sourceNode.type,
    };
  }

  if (sourceNode.type === "modelAssetNode") {
    const localAssetPath = data.localAssetPath as string | undefined;
    const nativeScenePath =
      (data.nativeScenePath as string) || localAssetPath || undefined;
    const glbUrl = localAssetPath
      ? toLocalAssetRef(localAssetPath)
      : (data.glbUrl as string) || (data.localPreviewUrl as string) || "";
    if (!glbUrl && !nativeScenePath) return null;
    return {
      glbUrl,
      nativeScenePath,
      modelName: data.modelName as string | undefined,
      blendSourcePath: data.blendSourcePath as string | undefined,
      blendImported: data.blendImported === true,
        previewCamera: data.previewCamera as Record<string, unknown> | undefined,
      sourceNodeId: sourceNode.id,
      sourceType: sourceNode.type,
    };
  }

  if (sourceNode.type === "threeDEditorNode") {
    const scene = data.sceneData as { glbUrl?: string; material?: unknown } | undefined;
    const textured = data.texturedModel as { glbUrl?: string; modelName?: string } | undefined;
    const glbUrl = textured?.glbUrl || scene?.glbUrl || "";
    if (!glbUrl) return null;
    return {
      glbUrl,
      modelName: textured?.modelName,
      sourceNodeId: sourceNode.id,
      sourceType: sourceNode.type,
    };
  }

  return null;
}

export function resolveImageReference(
  sourceNode: Node | null | undefined,
): string {
  if (!sourceNode) return "";
  const data = sourceNode.data as Record<string, unknown>;
  if (sourceNode.type === "imageNode" || sourceNode.type === "mediaNode") {
    return (data.url as string) || "";
  }
  if (sourceNode.type === "imageShotNode") {
    const shot = data.shot as { imageUrl?: string; imageUrls?: string[] } | undefined;
    return shot?.imageUrl || shot?.imageUrls?.[0] || "";
  }
  if (sourceNode.type === "threeDRenderNode" || sourceNode.type === "cyclesRendererNode") {
    return (data.url as string) || "";
  }
  return "";
}

export function resolveMaterialForEditor(
  materialNode: Node | null | undefined,
  nodes: Node[],
  edges: Edge[],
): CyclesMaterial | null {
  if (!materialNode) return null;
  const data = materialNode.data as Record<string, unknown>;

  if (materialNode.type === "materialReplaceNode") {
    const textured = data.texturedModel as { material?: Record<string, unknown> } | undefined;
    if (textured?.material) {
      return resolveCyclesMaterialForEditor(
        { ...materialNode, data: textured.material } as Node,
        nodes,
        edges,
      );
    }
    const matEdge = edges.find(
      (e) => e.target === materialNode.id && e.targetHandle === "material",
    );
    if (matEdge) {
      const src = nodes.find((n) => n.id === matEdge.source);
      return resolveCyclesMaterialForEditor(src, nodes, edges);
    }
    return resolveCyclesMaterialForEditor(materialNode, nodes, edges);
  }

  return resolveCyclesMaterialForEditor(materialNode, nodes, edges);
}

export function resolveEditorInputs(
  editorNode: Node,
  nodes: Node[],
  edges: Edge[],
): {
  model: Resolved3DModel | null;
  materialPreview: Record<string, unknown> | null;
  cyclesMaterial: CyclesMaterial | null;
  cyclesLight: Record<string, unknown> | null;
  cyclesCamera: Record<string, unknown> | null;
  cyclesRenderSettings: Record<string, unknown> | null;
} {
  const modelEdge = edges.find(
    (e) => e.target === editorNode.id && e.targetHandle === "modelInput",
  );
  const materialEdge = edges.find(
    (e) => e.target === editorNode.id && e.targetHandle === "material",
  );
  const lightEdge = edges.find(
    (e) => e.target === editorNode.id && e.targetHandle === "cyclesLight",
  );
  const cameraEdge = edges.find(
    (e) => e.target === editorNode.id && e.targetHandle === "cyclesCamera",
  );
  const settingsEdge = edges.find(
    (e) => e.target === editorNode.id && e.targetHandle === "cyclesSettings",
  );

  const modelNode = modelEdge ? nodes.find((n) => n.id === modelEdge.source) : null;
  const materialNode = materialEdge ? nodes.find((n) => n.id === materialEdge.source) : null;
  const lightNode = lightEdge ? nodes.find((n) => n.id === lightEdge.source) : null;
  const cameraNode = cameraEdge ? nodes.find((n) => n.id === cameraEdge.source) : null;
  const settingsNode = settingsEdge ? nodes.find((n) => n.id === settingsEdge.source) : null;

  const model = resolveModelFromSourceNode(modelNode, nodes, edges);
  let materialPreview = materialNode
    ? materialNodeDataForPreview(materialNode, nodes, edges)
    : null;

  if (!materialPreview && modelNode?.type === "materialReplaceNode") {
    const textured = (modelNode.data as { texturedModel?: { material?: unknown } })
      ?.texturedModel;
    if (textured?.material) {
      materialPreview = materialNodeDataForPreview(
        { ...modelNode, data: textured.material } as Node,
        nodes,
        edges,
      );
    }
  }

  return {
    model,
    materialPreview,
    cyclesMaterial: resolveMaterialForEditor(materialNode, nodes, edges),
    cyclesLight: (lightNode?.data as { cyclesLight?: Record<string, unknown> })?.cyclesLight || null,
    cyclesCamera:
      (cameraNode?.data as { cyclesCamera?: Record<string, unknown> })?.cyclesCamera || null,
    cyclesRenderSettings:
      (settingsNode?.data as { cyclesRenderSettings?: Record<string, unknown> })
        ?.cyclesRenderSettings || null,
  };
}

export function buildSceneExportFromEditor(
  editorData: Record<string, unknown>,
  resolved: ReturnType<typeof resolveEditorInputs>,
): Resolved3DSceneExport {
  const sceneData = editorData.sceneData as Record<string, unknown> | undefined;
  return {
    glbUrl: resolved.model?.glbUrl || (sceneData?.glbUrl as string) || "",
    material: resolved.cyclesMaterial,
    transform: (sceneData?.transform as Record<string, unknown>) || {},
    lights: (sceneData?.lights as Record<string, unknown>) || {},
    renderSettings: (sceneData?.renderSettings as Record<string, unknown>) || {},
    cyclesLight: resolved.cyclesLight,
    cyclesCamera: resolved.cyclesCamera,
  };
}
