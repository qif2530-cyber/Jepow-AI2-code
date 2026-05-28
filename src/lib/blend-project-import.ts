/**
 * 从 Blender .blend 导入结果自动生成画布节点图（模型 + Cycles 节点 + 3D 编辑器）。
 */
import type { Edge, Node } from "@xyflow/react";
import { toLocalAssetRef } from "./local-assets";
import { getCyclesNodeDefaultData } from "./cycles-node-registry";

export type BlendProjectBlueprint = {
  blendPath: string;
  glbPath: string;
  blendFileName: string;
  assetRef?: string | null;
  glbAssetRef?: string | null;
  sceneName?: string;
  principled?: Record<string, unknown>;
  cyclesLight?: Record<string, unknown>;
  cyclesCamera?: Record<string, unknown>;
  viewportCamera?: Record<string, unknown>;
  cyclesRenderSettings?: Record<string, unknown>;
  renderEngine?: string;
};

export type BlendImportGraph = {
  nodes: Node[];
  edges: Edge[];
};

function mergeDefaults(
  type: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(getCyclesNodeDefaultData(type) || {}), ...patch };
}

export function buildBlendProjectGraph(
  blueprint: BlendProjectBlueprint,
  dropPosition: { x: number; y: number },
): BlendImportGraph {
  const ts = Date.now();
  const modelId = `model-blend-${ts}`;
  const matId = `mat-blend-${ts}`;
  const lightId = `light-blend-${ts}`;
  const camId = `cam-blend-${ts}`;
  const settingsId = `settings-blend-${ts}`;
  const editorId = `editor-blend-${ts}`;

  const glbRef = blueprint.glbAssetRef || toLocalAssetRef(blueprint.glbPath);
  const principled = blueprint.principled || {};
  const lightRig = blueprint.cyclesLight || {};
  const cyclesCam = blueprint.cyclesCamera || {};
  const renderSettings = blueprint.cyclesRenderSettings || {};
  const viewportCam = blueprint.viewportCamera || {};

  const matDefaults = getCyclesNodeDefaultData("cyclesPrincipledNode") || {};
  const lightDefaults = getCyclesNodeDefaultData("cyclesLightNode") || {};
  const camDefaults = getCyclesNodeDefaultData("cyclesCameraNode") || {};
  const settingsDefaults = getCyclesNodeDefaultData("cyclesRenderSettingsNode") || {};

  const ox = dropPosition.x;
  const oy = dropPosition.y;

  const nodes: Node[] = [
    {
      id: modelId,
      type: "modelAssetNode",
      position: { x: ox, y: oy },
      data: {
        glbUrl: glbRef,
        nativeScenePath: blueprint.glbPath,
        localAssetPath: blueprint.glbPath,
        blendSourcePath: blueprint.blendPath,
        modelName: blueprint.blendFileName,
        viewportBackend: "jepow-native",
        localPreviewUrl: "",
        blendImported: true,
      },
    },
    {
      id: matId,
      type: "cyclesPrincipledNode",
      position: { x: ox + 320, y: oy - 80 },
      data: mergeDefaults("cyclesPrincipledNode", {
        ...matDefaults,
        ...principled,
      }),
    },
    {
      id: lightId,
      type: "cyclesLightNode",
      position: { x: ox + 320, y: oy + 60 },
      data: {
        ...lightDefaults,
        environmentStrength: lightRig.environmentStrength ?? lightDefaults.environmentStrength,
        keyStrength: lightRig.keyStrength ?? lightDefaults.keyStrength,
        keySize: lightRig.keySize ?? lightDefaults.keySize,
        yaw: lightRig.yaw ?? lightDefaults.yaw,
        pitch: lightRig.pitch ?? lightDefaults.pitch,
        backgroundColor: lightRig.backgroundColor ?? lightDefaults.backgroundColor,
        cyclesLight: lightRig,
      },
    },
    {
      id: camId,
      type: "cyclesCameraNode",
      position: { x: ox + 320, y: oy + 200 },
      data: {
        ...camDefaults,
        ...cyclesCam,
        cyclesCamera: cyclesCam,
      },
    },
    {
      id: settingsId,
      type: "cyclesRenderSettingsNode",
      position: { x: ox + 320, y: oy + 340 },
      data: {
        ...settingsDefaults,
        samples: renderSettings.samples ?? settingsDefaults.samples,
        bounces: renderSettings.bounces ?? settingsDefaults.bounces,
        width: renderSettings.width ?? settingsDefaults.width,
        height: renderSettings.height ?? settingsDefaults.height,
        device: renderSettings.device ?? settingsDefaults.device,
        denoise: renderSettings.denoise ?? settingsDefaults.denoise,
        cyclesRenderSettings: renderSettings,
      },
    },
    {
      id: editorId,
      type: "threeDEditorNode",
      position: { x: ox + 640, y: oy + 40 },
      data: {
        renderActive: true,
        blendSourcePath: blueprint.blendPath,
        blendFidelityRender: true,
        sceneData: {
          glbUrl: glbRef,
          transform: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 },
          lights: {},
          renderSettings: {},
          viewportCamera: viewportCam,
        },
      },
    },
  ];

  const edges: Edge[] = [
    {
      id: `e-blend-model-${ts}`,
      source: modelId,
      target: editorId,
      sourceHandle: "model",
      targetHandle: "modelInput",
      style: { stroke: "#10b981", strokeWidth: 2 },
    },
    {
      id: `e-blend-mat-${ts}`,
      source: matId,
      target: editorId,
      sourceHandle: "material",
      targetHandle: "material",
      style: { stroke: "#a855f7", strokeWidth: 2 },
    },
    {
      id: `e-blend-light-${ts}`,
      source: lightId,
      target: editorId,
      sourceHandle: "cyclesLight",
      targetHandle: "cyclesLight",
      style: { stroke: "#f59e0b", strokeWidth: 2 },
    },
    {
      id: `e-blend-cam-${ts}`,
      source: camId,
      target: editorId,
      sourceHandle: "cyclesCamera",
      targetHandle: "cyclesCamera",
      style: { stroke: "#3b82f6", strokeWidth: 2 },
    },
    {
      id: `e-blend-settings-${ts}`,
      source: settingsId,
      target: editorId,
      sourceHandle: "cyclesRenderSettings",
      targetHandle: "cyclesSettings",
      style: { stroke: "#ef4444", strokeWidth: 2 },
    },
  ];

  return { nodes, edges };
}

export function mergeBlendImportGraph(
  setNodes: (updater: (nodes: Node[]) => Node[]) => void,
  setEdges: (updater: (edges: Edge[]) => Edge[]) => void,
  graph: BlendImportGraph,
) {
  setNodes((nds) => [...nds, ...graph.nodes]);
  setEdges((eds) => [...eds, ...graph.edges]);
}
