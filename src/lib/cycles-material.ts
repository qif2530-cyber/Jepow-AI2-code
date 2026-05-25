export interface CyclesTextureSlots {
  baseColor?: string;
  normal?: string;
  roughness?: string;
  metallic?: string;
  displacement?: string;
  emission?: string;
  alpha?: string;
}

export interface CyclesPrincipledBSDF {
  type: "principled_bsdf";
  version: "blender_4_principled_v2";
  distribution: "multi_ggx";
  baseColor: string;
  metallic: number;
  roughness: number;
  alpha: number;
  ior: number;
  specularIorLevel: number;
  specularTint: number;
  anisotropic: number;
  anisotropicRotation: number;
  transmissionWeight: number;
  coatWeight: number;
  coatRoughness: number;
  coatIor: number;
  coatTint: string;
  sheenWeight: number;
  sheenRoughness: number;
  sheenTint: string;
  emissionColor: string;
  emissionStrength: number;
  thinFilmThickness: number;
  thinFilmIor: number;
  normalStrength: number;
  displacementScale: number;
  displacementMidlevel: number;
}

import type { CyclesShaderGraphIR } from "./cycles-shader-graph-types";

export interface CyclesMaterial {
  engine: "cycles";
  shader: "principled_bsdf";
  schemaVersion: 1;
  principled: CyclesPrincipledBSDF;
  textures: CyclesTextureSlots;
  /** 官方 Standalone shader graph（离线 Cycles 渲染） */
  shaderGraph?: CyclesShaderGraphIR;
  colorManagement: {
    viewTransform: "Filmic";
    look: "Medium High Contrast";
    exposure: number;
    gamma: number;
  };
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
};

const color = (value: unknown, fallback = "#ffffff") =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

const has = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const own = (obj: any, key: string) => (has(obj, key) ? obj[key] : undefined);

export function createCyclesMaterial(raw: any = {}): CyclesMaterial {
  const existing = raw.cyclesMaterial;
  const principled = existing?.principled ?? {};
  const textures = existing?.textures ?? {};
  const baseColor = color(own(raw, "tint") ?? principled.baseColor, "#ffffff");
  const roughness = clamp(own(raw, "roughness") ?? principled.roughness, 0, 1, 0.5);
  const metallic = clamp(own(raw, "metalness") ?? principled.metallic, 0, 1, 0.0);
  const transmission = clamp(
    own(raw, "transmission") ?? principled.transmissionWeight,
    0,
    1,
    0.0,
  );

  return {
    engine: "cycles",
    shader: "principled_bsdf",
    schemaVersion: 1,
    principled: {
      type: "principled_bsdf",
      version: "blender_4_principled_v2",
      distribution: "multi_ggx",
      baseColor,
      metallic,
      roughness,
      alpha: clamp(own(raw, "alpha") ?? principled.alpha, 0, 1, 1.0),
      ior: clamp(own(raw, "ior") ?? principled.ior, 1.0, 3.0, 1.5),
      specularIorLevel: clamp(
        own(raw, "specular") ?? principled.specularIorLevel,
        0,
        1,
        0.5,
      ),
      specularTint: clamp(own(raw, "specularTint") ?? principled.specularTint, 0, 1, 0.0),
      anisotropic: clamp(own(raw, "anisotropic") ?? principled.anisotropic, 0, 1, 0.0),
      anisotropicRotation: clamp(
        own(raw, "anisotropicRotation") ?? principled.anisotropicRotation,
        0,
        1,
        0.0,
      ),
      transmissionWeight: transmission,
      coatWeight: clamp(own(raw, "clearcoat") ?? principled.coatWeight, 0, 1, 0.0),
      coatRoughness: clamp(
        own(raw, "coatRoughness") ?? principled.coatRoughness,
        0,
        1,
        Math.min(1, roughness * 0.65),
      ),
      coatIor: clamp(own(raw, "coatIor") ?? principled.coatIor, 1.0, 3.0, 1.5),
      coatTint: color(own(raw, "coatTint") ?? principled.coatTint, "#ffffff"),
      sheenWeight: clamp(own(raw, "sheenWeight") ?? principled.sheenWeight, 0, 1, 0.0),
      sheenRoughness: clamp(own(raw, "sheenRoughness") ?? principled.sheenRoughness, 0, 1, 0.5),
      sheenTint: color(own(raw, "sheenTint") ?? principled.sheenTint, "#ffffff"),
      emissionColor: color(own(raw, "emissionColor") ?? principled.emissionColor ?? baseColor, baseColor),
      emissionStrength: clamp(
        own(raw, "emissionStrength") ?? principled.emissionStrength,
        0,
        20,
        0.0,
      ),
      thinFilmThickness: clamp(
        own(raw, "thinFilmThickness") ?? principled.thinFilmThickness,
        0,
        2000,
        0,
      ),
      thinFilmIor: clamp(own(raw, "thinFilmIor") ?? principled.thinFilmIor, 1.0, 3.0, 1.33),
      normalStrength: clamp(own(raw, "normalScale") ?? principled.normalStrength, 0, 4, 1.0),
      displacementScale: clamp(
        own(raw, "displacementScale") ?? principled.displacementScale,
        0,
        2,
        0.0,
      ),
      displacementMidlevel: clamp(
        own(raw, "displacementMidlevel") ?? principled.displacementMidlevel,
        0,
        1,
        0.5,
      ),
    },
    textures: {
      baseColor: has(raw, "colorUrl") ? raw.colorUrl : textures.baseColor,
      normal: has(raw, "normalUrl") ? raw.normalUrl : textures.normal,
      roughness: has(raw, "roughnessUrl") ? raw.roughnessUrl : textures.roughness,
      metallic: has(raw, "metalnessUrl") ? raw.metalnessUrl : textures.metallic,
      displacement: has(raw, "bumpUrl") ? raw.bumpUrl : textures.displacement,
      emission: has(raw, "emissionUrl") ? raw.emissionUrl : textures.emission,
      alpha: has(raw, "alphaUrl") ? raw.alphaUrl : textures.alpha,
    },
    colorManagement: {
      viewTransform: "Filmic",
      look: "Medium High Contrast",
      exposure: clamp(existing?.colorManagement?.exposure, -10, 10, 0),
      gamma: clamp(existing?.colorManagement?.gamma, 0.1, 5, 1),
    },
  };
}

export function cyclesToViewportMaterial(raw: any = {}) {
  const mat = createCyclesMaterial(raw);
  const p = mat.principled;
  return {
    tint: p.baseColor,
    roughness: p.roughness,
    metalness: p.metallic,
    specular: p.specularIorLevel,
    clearcoat: p.coatWeight,
    transmission: p.transmissionWeight,
    emissionStrength: p.emissionStrength,
  };
}
