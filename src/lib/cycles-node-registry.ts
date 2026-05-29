/**
 * Cycles 原生节点注册表 — 仅用于画布手动创建（右键菜单等）。
 * 不接入 AI functionDeclarations / createNodeViaAi，避免影响原有 AI 调度 API。
 */

export type CyclesNodeCategory = "material" | "color" | "light" | "camera" | "render";

export interface CyclesPaletteItem {
  type: string;
  label: string;
  hint?: string;
  category: CyclesNodeCategory;
}

export const CYCLES_CATEGORY_LABELS: Record<CyclesNodeCategory, string> = {
  material: "Cycles · 材质",
  color: "Cycles · 颜色校正",
  light: "Cycles · 灯光",
  camera: "Cycles · 摄像机",
  render: "Cycles · 渲染",
};

/** 手动创建菜单项（按分类顺序） */
export const CYCLES_NODE_PALETTE: CyclesPaletteItem[] = [
  {
    type: "cyclesPrincipledNode",
    label: "Principled BSDF",
    hint: "物理材质主节点",
    category: "material",
  },
  {
    type: "cyclesImageTextureNode",
    label: "图像纹理",
    hint: "Base / Normal / Roughness…",
    category: "material",
  },
  {
    type: "cyclesNormalMapNode",
    label: "法线贴图",
    hint: "接入图像纹理",
    category: "material",
  },
  {
    type: "cyclesDisplacementNode",
    label: "置换",
    hint: "Height / Displacement",
    category: "material",
  },
  {
    type: "cyclesGammaNode",
    label: "Gamma",
    hint: "官方 gamma 节点",
    category: "color",
  },
  {
    type: "cyclesBrightContrastNode",
    label: "亮度 / 对比度",
    hint: "brightness_contrast",
    category: "color",
  },
  {
    type: "cyclesRgbCurvesNode",
    label: "RGB 曲线",
    hint: "rgb_curves",
    category: "color",
  },
  {
    type: "cyclesRgbRampNode",
    label: "色带",
    hint: "rgb_ramp",
    category: "color",
  },
  {
    type: "cyclesMixColorNode",
    label: "混合颜色",
    hint: "mix_color",
    category: "color",
  },
  {
    type: "cyclesMapRangeNode",
    label: "映射范围",
    hint: "map_range",
    category: "color",
  },
  {
    type: "cyclesRgbToBwNode",
    label: "RGB 转 BW",
    hint: "rgb_to_bw",
    category: "color",
  },
  {
    type: "cyclesLightNode",
    label: "灯光",
    hint: "环境光 + 主光",
    category: "light",
  },
  {
    type: "cyclesPointLightNode",
    label: "点光源",
    hint: "Point Light",
    category: "light",
  },
  {
    type: "cyclesAreaLightNode",
    label: "面光源",
    hint: "Area Light",
    category: "light",
  },
  {
    type: "cyclesDirectionalLightNode",
    label: "平行光",
    hint: "Directional Light",
    category: "light",
  },
  {
    type: "cyclesSunLightNode",
    label: "物理太阳光",
    hint: "Physical Sun",
    category: "light",
  },
  {
    type: "cyclesHdrEnvironmentNode",
    label: "HDR 环境",
    hint: "HDRI Environment",
    category: "light",
  },
  {
    type: "cyclesCameraNode",
    label: "摄像机",
    hint: "FOV / DOF / Clip",
    category: "camera",
  },
  {
    type: "cyclesRenderSettingsNode",
    label: "渲染设置",
    hint: "采样 / 分辨率 / 降噪",
    category: "render",
  },
  {
    type: "cyclesRendererNode",
    label: "CL 渲染器",
    hint: "独立 Cycles/CL 输出",
    category: "render",
  },
];

const CYCLES_MANUAL_TYPES = new Set(CYCLES_NODE_PALETTE.map((p) => p.type));

export function isManualCyclesNodeType(type: string) {
  return CYCLES_MANUAL_TYPES.has(type);
}

export function getCyclesNodeDefaultData(
  type: string,
): Record<string, unknown> | undefined {
  switch (type) {
    case "cyclesPrincipledNode":
      return {
        tint: "#b8b8b8",
        roughness: 0.45,
        metalness: 0.0,
        specular: 0.5,
        transmission: 0.0,
        ior: 1.5,
        clearcoat: 0.0,
        emissionStrength: 0.0,
        alpha: 1.0,
      };
    case "cyclesImageTextureNode":
      return {
        imageUrl: "",
        channel: "baseColor",
      };
    case "cyclesNormalMapNode":
      return {
        strength: 1.0,
      };
    case "cyclesDisplacementNode":
      return {
        scale: 0.0,
        midlevel: 0.5,
      };
    case "cyclesGammaNode":
      return { gamma: 1.0 };
    case "cyclesBrightContrastNode":
      return { bright: 0, contrast: 0 };
    case "cyclesRgbCurvesNode":
      return { fac: 1, curves: "0 0 0 1 1 1", extrapolate: true };
    case "cyclesRgbRampNode":
      return {
        fac: 0,
        ramp: "0 0 0 1 1 1",
        rampAlpha: "0 1",
        interpolate: true,
      };
    case "cyclesMixColorNode":
      return { blendType: "mix", factor: 0.5 };
    case "cyclesMapRangeNode":
      return {
        rangeType: "linear",
        fromMin: 0,
        fromMax: 1,
        toMin: 0,
        toMax: 1,
        steps: 4,
        clamp: false,
      };
    case "cyclesRgbToBwNode":
      return {};
    case "cyclesLightNode":
      return {
        lightKind: "rig",
        environmentStrength: 0.75,
        keyStrength: 650,
        keySize: 3,
        yaw: 45,
        pitch: 35,
        backgroundColor: "#08090a",
        cyclesLight: {
          type: "cycles_light_rig",
          environmentStrength: 0.75,
          keyStrength: 650,
          keySize: 3,
          yaw: 45,
          pitch: 35,
          backgroundColor: "#08090a",
        },
      };
    case "cyclesPointLightNode":
      return {
        lightKind: "point",
        keyStrength: 800,
        keySize: 0.15,
        yaw: 45,
        pitch: 35,
        environmentStrength: 0.2,
        backgroundColor: "#08090a",
        cyclesLight: {
          type: "point",
          keyStrength: 800,
          keySize: 0.15,
          yaw: 45,
          pitch: 35,
          environmentStrength: 0.2,
          backgroundColor: "#08090a",
        },
      };
    case "cyclesAreaLightNode":
      return {
        lightKind: "area",
        keyStrength: 600,
        keySize: 4,
        yaw: 45,
        pitch: 35,
        environmentStrength: 0.25,
        backgroundColor: "#08090a",
        cyclesLight: {
          type: "area",
          keyStrength: 600,
          keySize: 4,
          yaw: 45,
          pitch: 35,
          environmentStrength: 0.25,
          backgroundColor: "#08090a",
        },
      };
    case "cyclesDirectionalLightNode":
      return {
        lightKind: "directional",
        keyStrength: 700,
        keySize: 1,
        yaw: 45,
        pitch: 35,
        environmentStrength: 0.25,
        backgroundColor: "#08090a",
        cyclesLight: {
          type: "directional",
          keyStrength: 700,
          keySize: 1,
          yaw: 45,
          pitch: 35,
          environmentStrength: 0.25,
          backgroundColor: "#08090a",
        },
      };
    case "cyclesSunLightNode":
      return {
        lightKind: "sun",
        keyStrength: 1200,
        keySize: 0.53,
        yaw: 45,
        pitch: 35,
        environmentStrength: 0.35,
        backgroundColor: "#87a8d8",
        cyclesLight: {
          type: "sun",
          keyStrength: 1200,
          keySize: 0.53,
          yaw: 45,
          pitch: 35,
          environmentStrength: 0.35,
          backgroundColor: "#87a8d8",
        },
      };
    case "cyclesHdrEnvironmentNode":
      return {
        lightKind: "hdr",
        environmentStrength: 1.0,
        keyStrength: 0,
        keySize: 3,
        yaw: 0,
        pitch: 0,
        backgroundColor: "#08090a",
        hdrUrl: "",
        hdrName: "",
        cyclesLight: {
          type: "hdr_environment",
          environmentStrength: 1.0,
          keyStrength: 0,
          keySize: 3,
          yaw: 0,
          pitch: 0,
          backgroundColor: "#08090a",
          hdrUrl: "",
          hdrName: "",
        },
      };
    case "cyclesCameraNode":
      return {
        type: "perspective",
        fov: Math.PI / 4,
        aperturesize: 0,
        focaldistance: 10,
        blades: 0,
        bladesrotation: 0,
        nearclip: 0.00001,
        farclip: 100000,
        cyclesCamera: {
          type: "perspective",
          fov: Math.PI / 4,
          aperturesize: 0,
          focaldistance: 10,
          blades: 0,
          bladesrotation: 0,
          nearclip: 0.00001,
          farclip: 100000,
        },
      };
    case "cyclesRenderSettingsNode":
      return {
        samples: 128,
        bounces: 8,
        width: 2048,
        height: 1536,
        device: "METAL",
        denoise: true,
        cyclesRenderSettings: {
          type: "cycles_render_settings",
          samples: 128,
          bounces: 8,
          width: 2048,
          height: 1536,
          device: "METAL",
          denoise: true,
        },
      };
    case "cyclesRendererNode":
      return {
        status: "idle",
      };
    default:
      return undefined;
  }
}
