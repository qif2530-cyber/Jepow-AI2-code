import type { Edge, Node } from "@xyflow/react";
import { resolveCyclesMaterialForEditor } from "./cycles-shader-graph";
import { cyclesToViewportMaterial } from "./cycles-material";
import type { ViewportMaterialPreview } from "./viewport-engine/types";

export type SceneObjectMaterialOption = {
  materialNodeId: string;
  label: string;
  /** CSS hex for swatch */
  tint: string;
};

const MATERIAL_NODE_TYPES = new Set([
  "materialGenNode",
  "materialReplaceNode",
  "cyclesPrincipledNode",
]);

/** 已连到 3D 场景编辑器 material 端口的材质节点 */
export function listMaterialsForThreeDEditor(
  editorNodeId: string,
  nodes: Node[],
  edges: Edge[],
): SceneObjectMaterialOption[] {
  const out: SceneObjectMaterialOption[] = [];
  for (const edge of edges) {
    if (edge.target !== editorNodeId || edge.targetHandle !== "material") continue;
    const src = nodes.find((n) => n.id === edge.source);
    if (!src || !MATERIAL_NODE_TYPES.has(src.type)) continue;
    const data = src.data as Record<string, unknown>;
    const label = String(
      data.label || data.title || (src.type === "materialGenNode" ? "3D PBR材质生成" : src.type),
    );
    const cycles = resolveCyclesMaterialForEditor(src, nodes, edges);
    const tint =
      cycles?.principled.baseColor ||
      (typeof data.tint === "string" ? data.tint : "") ||
      "#cccccc";
    out.push({ materialNodeId: src.id, label, tint });
  }
  return out;
}

export function viewportMaterialForSceneObject(
  materialNodeId: string | null | undefined,
  nodes: Node[],
  edges: Edge[],
): ViewportMaterialPreview | null {
  if (!materialNodeId) return null;
  const node = nodes.find((n) => n.id === materialNodeId);
  if (!node) return null;
  const cycles = resolveCyclesMaterialForEditor(node, nodes, edges);
  if (cycles) {
    return cyclesToViewportMaterial({ cyclesMaterial: cycles });
  }
  const data = node.data as Record<string, unknown>;
  const tint =
    (typeof data.tint === "string" && data.tint.trim()) || "#cccccc";
  return {
    tint,
    roughness:
      typeof data.roughness === "number" && Number.isFinite(data.roughness)
        ? data.roughness
        : 0.5,
    metalness:
      typeof data.metalness === "number" && Number.isFinite(data.metalness)
        ? data.metalness
        : 0,
    specular: 0.5,
    clearcoat: 0,
    transmission: 0,
    emissionStrength: 0,
  };
}

export function findThreeDEditorForModelAsset(
  modelAssetNodeId: string,
  nodes: Node[],
  edges: Edge[],
): Node | undefined {
  return nodes.find(
    (n) =>
      n.type === "threeDEditorNode" &&
      edges.some(
        (e) =>
          e.source === modelAssetNodeId &&
          e.target === n.id &&
          (e.targetHandle === "modelInput" || e.targetHandle == null),
      ),
  );
}
