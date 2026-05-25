/**
 * Cycles 原生数据契约 — 与 Blender Cycles 源码对齐
 * Principled: intern/cycles/scene/shader_nodes.cpp → PrincipledBsdfNode
 * Standalone XML: intern/cycles/app/cycles_xml.cpp → NodeType::find(node_name)
 *
 * @see https://developer.blender.org/docs/features/cycles/standalone/
 * @see https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html
 */

/** Standalone XML 节点类型名（与 NodeType::add 一致） */
export const CYCLES_XML_SHADER_NODES = {
  principledBsdf: "principled_bsdf",
  imageTexture: "image_texture",
  normalMap: "normal_map",
  bump: "bump",
  displacement: "displacement",
  gamma: "gamma",
  brightnessContrast: "brightness_contrast",
  rgbCurves: "rgb_curves",
  rgbRamp: "rgb_ramp",
  mixColor: "mix_color",
  mapRange: "map_range",
  rgbToBw: "rgb_to_bw",
  background: "background",
} as const;

/** Principled BSDF 官方 SOCKET 字段（XML 属性名 = 结构体成员 snake_case） */
export const CYCLES_PRINCIPLED_SOCKETS = [
  "distribution",
  "base_color",
  "metallic",
  "roughness",
  "ior",
  "alpha",
  "specular_ior_level",
  "specular_tint",
  "anisotropic",
  "anisotropic_rotation",
  "transmission_weight",
  "sheen_weight",
  "sheen_roughness",
  "sheen_tint",
  "coat_weight",
  "coat_roughness",
  "coat_ior",
  "coat_tint",
  "emission_color",
  "emission_strength",
  "thin_film_thickness",
  "thin_film_ior",
] as const;

/**
 * 画布节点 → Cycles 原生节点映射（UI 为简化封装，导出时收敛到官方节点）
 */
export const CANVAS_TO_CYCLES_NATIVE = {
  cyclesPrincipledNode: CYCLES_XML_SHADER_NODES.principledBsdf,
  cyclesImageTextureNode: CYCLES_XML_SHADER_NODES.imageTexture,
  cyclesNormalMapNode: CYCLES_XML_SHADER_NODES.normalMap,
  cyclesDisplacementNode: CYCLES_XML_SHADER_NODES.displacement,
  cyclesGammaNode: CYCLES_XML_SHADER_NODES.gamma,
  cyclesBrightContrastNode: CYCLES_XML_SHADER_NODES.brightnessContrast,
  cyclesRgbCurvesNode: CYCLES_XML_SHADER_NODES.rgbCurves,
  cyclesRgbRampNode: CYCLES_XML_SHADER_NODES.rgbRamp,
  cyclesMixColorNode: CYCLES_XML_SHADER_NODES.mixColor,
  cyclesMapRangeNode: CYCLES_XML_SHADER_NODES.mapRange,
  cyclesRgbToBwNode: CYCLES_XML_SHADER_NODES.rgbToBw,
  cyclesLightNode: "background + point light (standalone XML)",
  cyclesRenderSettingsNode: "integrator + film settings",
} as const;

export type CyclesNativeCompliance = {
  principledSockets: boolean;
  standaloneXml: boolean;
  fullShaderGraph: boolean;
  notes: string[];
};

export function getCyclesNativeCompliance(): CyclesNativeCompliance {
  return {
    principledSockets: true,
    standaloneXml: true,
    fullShaderGraph: true,
    notes: [
      "Principled / image_texture / normal_map / displacement / gamma / brightness_contrast / rgb_curves / rgb_ramp / mix_color / map_range / rgb_to_bw 均使用 Cycles standalone XML 节点名。",
      "画布连线导出为 <connect from=\"node Socket\" to=\"node Socket\" />，socket 名为官方显示名（如 Base Color、Color）。",
      "离线渲染前由 Electron 将纹理复制到 scene 旁 textures/ 目录，filename 相对 XML 路径。",
      "交互视口预览仍由 jepow-engine PBR-lite 负责（GPL 隔离）。",
    ],
  };
}
