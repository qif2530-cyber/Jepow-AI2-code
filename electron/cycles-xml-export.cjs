/**
 * Cycles Standalone XML — 与官方 intern/cycles/scene/shader_nodes.cpp 中
 * PrincipledBsdfNode 的 SOCKET 成员名一致（snake_case，见 NodeType "principled_bsdf"）。
 * 参考: https://developer.blender.org/docs/features/cycles/standalone/
 */

const {
  principledBsdfXmlAttrs,
  clampNumber,
  hexToRgb01,
  vec3,
  xmlEscape,
} = require('./cycles-xml-principled.cjs');
const { buildShaderBlockXml } = require('./cycles-shader-graph-xml.cjs');
const { stageShaderGraphTextures } = require('./cycles-texture-stage.cjs');

/** Standalone XML: strength/color on <background> are ignored; need background_shader child. */
function buildBackgroundBlockXml(strength, colorRgb) {
  return `  <background>
    <background_shader name="jepow_bg" color="${colorRgb}" strength="${strength}" />
    <connect from="jepow_bg Background" to="output surface" />
  </background>`;
}

/** Camera matrix on <camera> is overwritten by identity; wrap in <transform>. */
function buildCameraBlockXml(width, height, fov = 0.72, distance = 4.2) {
  return `  <transform matrix="1 0 0 0  0 1 0 0  0 0 1 0  0 0 ${distance} 1">
    <camera width="${width}" height="${height}" type="perspective" fov="${fov}" />
  </transform>`;
}

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

  const backgroundColor = vec3(hexToRgb01(light.backgroundColor, [0.11, 0.12, 0.14]));
  const environmentStrength = clampNumber(light.environmentStrength, 0, 8, 1.2);
  const keyStrength = clampNumber(light.keyStrength, 0, 5000, 800);
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

  const width = clampNumber(opts.width, 64, 8192, 768);
  const height = clampNumber(opts.height, 64, 8192, 512);
  const cameraDistance = clampNumber(
    opts.cameraDistance ?? opts.meshMeta?.cameraDistance,
    2.5,
    24,
    4.2,
  );

  const filmExposure = clampNumber(
    renderSettings.exposure ?? light.exposure,
    2.5,
    16,
    4,
  );

  return `<?xml version="1.0"?>
<cycles>
  <film exposure="${filmExposure}" />
  <integrator use_adaptive_sampling="0" max_bounce="${clampNumber(renderSettings.bounces, 1, 64, 8)}" diffuse_bounces="4" glossy_bounces="4" transparent_max_bounce="8" />
${buildCameraBlockXml(width, height, 0.72, cameraDistance)}
${buildBackgroundBlockXml(environmentStrength, backgroundColor)}
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
  buildBackgroundBlockXml,
  buildCameraBlockXml,
  buildCyclesSceneXml,
  clampNumber,
  hexToRgb01,
  vec3,
  xmlEscape,
};
