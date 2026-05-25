/**
 * Cycles Standalone XML — 与官方 intern/cycles/scene/shader_nodes.cpp 中
 * PrincipledBsdfNode 的 SOCKET 成员名一致（snake_case，见 NodeType "principled_bsdf"）。
 * 参考: https://developer.blender.org/docs/features/cycles/standalone/
 */

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function hexToRgb01(hex, fallback = [0.8, 0.8, 0.8]) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function vec3(values) {
  return values.map((v) => clampNumber(v, 0, 100, 0).toFixed(6)).join(' ');
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 官方 principled_bsdf XML 属性（Cycles 源码 SOCKET_IN_* 字段名） */
function principledBsdfXmlAttrs(p) {
  const base = vec3(hexToRgb01(p.baseColor, [0.8, 0.8, 0.8]));
  const emission = vec3(hexToRgb01(p.emissionColor, [1.0, 1.0, 1.0]));
  const coatTint = vec3(hexToRgb01(p.coatTint, [1.0, 1.0, 1.0]));
  const sheenTint = vec3(hexToRgb01(p.sheenTint, [1.0, 1.0, 1.0]));
  const specTintLevel = clampNumber(p.specularTint, 0, 1, 0);
  const specularTint = vec3([specTintLevel, specTintLevel, specTintLevel]);
  const distribution = p.distribution === 'ggx' ? 'ggx' : 'multi_ggx';

  return [
    `distribution="${distribution}"`,
    `base_color="${base}"`,
    `metallic="${clampNumber(p.metallic, 0, 1, 0)}"`,
    `roughness="${clampNumber(p.roughness, 0, 1, 0.5)}"`,
    `ior="${clampNumber(p.ior, 1, 3, 1.5)}"`,
    `alpha="${clampNumber(p.alpha, 0, 1, 1)}"`,
    `specular_ior_level="${clampNumber(p.specularIorLevel, 0, 1, 0.5)}"`,
    `specular_tint="${specularTint}"`,
    `anisotropic="${clampNumber(p.anisotropic, 0, 1, 0)}"`,
    `anisotropic_rotation="${clampNumber(p.anisotropicRotation, 0, 1, 0)}"`,
    `transmission_weight="${clampNumber(p.transmissionWeight, 0, 1, 0)}"`,
    `sheen_weight="${clampNumber(p.sheenWeight, 0, 1, 0)}"`,
    `sheen_roughness="${clampNumber(p.sheenRoughness, 0, 1, 0.5)}"`,
    `sheen_tint="${sheenTint}"`,
    `coat_weight="${clampNumber(p.coatWeight, 0, 1, 0)}"`,
    `coat_roughness="${clampNumber(p.coatRoughness, 0, 1, 0.03)}"`,
    `coat_ior="${clampNumber(p.coatIor, 1, 3, 1.5)}"`,
    `coat_tint="${coatTint}"`,
    `emission_color="${emission}"`,
    `emission_strength="${clampNumber(p.emissionStrength, 0, 100, 0)}"`,
    `thin_film_thickness="${clampNumber(p.thinFilmThickness, 0, 2000, 0)}"`,
    `thin_film_ior="${clampNumber(p.thinFilmIor, 1, 3, 1.33)}"`,
  ].join(' ');
}

const { buildShaderBlockXml } = require('./cycles-shader-graph-xml.cjs');
const { stageShaderGraphTextures } = require('./cycles-texture-stage.cjs');

function buildCyclesSceneXml(opts) {
  const cyclesMaterial = opts?.cyclesMaterial || opts?.material;
  const material = cyclesMaterial?.principled || {};
  const light = opts?.cyclesLight || {};
  const renderSettings = opts?.renderSettings || {};
  const cacheDir = opts?.cacheDir;
  let shaderGraph = cyclesMaterial?.shaderGraph;
  if (shaderGraph && cacheDir) {
    shaderGraph = stageShaderGraphTextures(shaderGraph, cacheDir);
  }

  const backgroundColor = vec3(hexToRgb01(light.backgroundColor, [0.03, 0.035, 0.04]));
  const environmentStrength = clampNumber(light.environmentStrength, 0, 4, 0.75);
  const keyStrength = clampNumber(light.keyStrength, 0, 5000, 650);
  const keySize = clampNumber(light.keySize, 0.01, 20, 3);
  const yaw = (clampNumber(light.yaw, 0, 360, 45) * Math.PI) / 180;
  const pitch = (clampNumber(light.pitch, -85, 85, 35) * Math.PI) / 180;
  const lx = (Math.cos(pitch) * Math.sin(yaw) * 3.2).toFixed(4);
  const ly = (Math.sin(pitch) * 3.2).toFixed(4);
  const lz = (Math.cos(pitch) * Math.cos(yaw) * 3.2).toFixed(4);

  const shaderBlock = buildShaderBlockXml(shaderGraph, material);
  const meshBlocks = opts.meshBlocks?.length
    ? opts.meshBlocks.join('\n')
    : `  <state shader="jepow_material" interpolation="smooth">
    <mesh P="-1 -1 0  1 -1 0  1 1 0  -1 1 0  0 0 1.35" verts="0 1 4  1 2 4  2 3 4  3 0 4  3 2 1 0" nverts="3 3 3 3 4" />
  </state>`;

  return `<?xml version="1.0"?>
<cycles>
  <integrator max_bounce="${clampNumber(renderSettings.bounces, 1, 64, 8)}" diffuse_bounces="4" glossy_bounces="4" transparent_max_bounce="8" />
  <camera width="${clampNumber(opts.width, 64, 8192, 768)}" height="${clampNumber(opts.height, 64, 8192, 512)}" type="perspective" fov="0.72" matrix="1 0 0 0  0 1 0 0  0 0 1 0  0 0 4.2 1" />
  <background strength="${environmentStrength}" color="${backgroundColor}" />
${shaderBlock}
  <transform translate="${lx} ${ly} ${lz}">
    <light light_type="point" strength="${keyStrength}" size="${keySize}" />
  </transform>
${meshBlocks}
</cycles>
`;
}

module.exports = {
  principledBsdfXmlAttrs,
  buildCyclesSceneXml,
  clampNumber,
  hexToRgb01,
  vec3,
  xmlEscape,
};
