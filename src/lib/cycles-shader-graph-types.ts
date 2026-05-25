/**
 * Cycles Standalone shader graph IR — 节点 type 名与 intern/cycles/scene/shader_nodes.cpp 一致。
 */

export type CyclesShaderGraphNodeType =
  | "image_texture"
  | "gamma"
  | "brightness_contrast"
  | "rgb_curves"
  | "rgb_ramp"
  | "mix_color"
  | "map_range"
  | "rgb_to_bw"
  | "normal_map"
  | "displacement"
  | "principled_bsdf";

export type CyclesShaderGraphNode = {
  name: string;
  type: CyclesShaderGraphNodeType;
  params: Record<string, unknown>;
};

export type CyclesShaderGraphLink = {
  from: [string, string];
  to: [string, string];
};

export type CyclesShaderGraphIR = {
  nodes: CyclesShaderGraphNode[];
  links: CyclesShaderGraphLink[];
  /** 是否连接 output displacement */
  useDisplacementOutput?: boolean;
};

/** Principled 画布 handle → 官方 socket 显示名 */
export const PRINCIPLED_TEXTURE_SOCKETS: Record<string, string> = {
  texBaseColor: "Base Color",
  texRoughness: "Roughness",
  texMetallic: "Metallic",
  texNormal: "Normal",
  texEmission: "Emission Color",
  texAlpha: "Alpha",
};

export const CYCLES_COLOR_NODE_TYPES = new Set([
  "cyclesGammaNode",
  "cyclesBrightContrastNode",
  "cyclesRgbCurvesNode",
  "cyclesRgbRampNode",
  "cyclesMixColorNode",
  "cyclesMapRangeNode",
  "cyclesRgbToBwNode",
]);

export const CYCLES_GRAPH_SOURCE_TYPES = new Set([
  "cyclesImageTextureNode",
  "cyclesNormalMapNode",
  "cyclesDisplacementNode",
  ...CYCLES_COLOR_NODE_TYPES,
]);
