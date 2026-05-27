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
function buildCameraBlockXml(width, height, fov = Math.PI / 4, distance = 4.2, camera = {}) {
  const yaw = clampNumber(camera.yaw, -Math.PI * 4, Math.PI * 4, 0);
  const pitch = clampNumber(camera.pitch, -1.2, 1.2, 0);
  const dist = clampNumber(camera.distance ?? distance, 0.35, 48, distance);
  const center = [
    clampNumber(camera.panX, -24, 24, 0),
    clampNumber(camera.panY, -24, 24, 0),
    0,
  ];
  const eye = [
    center[0] + dist * Math.cos(pitch) * Math.sin(yaw),
    center[1] + dist * Math.sin(pitch),
    center[2] + dist * Math.cos(pitch) * Math.cos(yaw),
  ];
  const forward = normalize3([center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]]);
  const z_axis = [-forward[0], -forward[1], -forward[2]];
  const right = normalize3(cross3([0, 1, 0], z_axis));
  const up = cross3(z_axis, right);
  const matrix = [
    ...right, 0,
    ...up, 0,
    ...z_axis, 0,
    ...eye, 1,
  ].map((v) => Number(v).toFixed(6)).join(' ');
  const type = camera.type === 'panorama' || camera.type === 'orthograph' ? camera.type : 'perspective';
  const apertureSize = clampNumber(camera.aperturesize ?? camera.apertureSize, 0, 10, 0);
  const focalDistance = clampNumber(camera.focaldistance ?? camera.focalDistance, 0.001, 10000, 10);
  const blades = Math.round(clampNumber(camera.blades, 0, 64, 0));
  const bladesRotation = clampNumber(camera.bladesrotation ?? camera.bladesRotation, -Math.PI * 2, Math.PI * 2, 0);
  const nearclip = clampNumber(camera.nearclip ?? camera.nearClip, 0.00001, 100, 0.00001);
  const farclip = clampNumber(camera.farclip ?? camera.farClip, 1, 1000000, 100000);
  return `  <transform matrix="${matrix}">
    <camera width="${width}" height="${height}" type="${type}" fov="${fov}" aperturesize="${apertureSize}" focaldistance="${focalDistance}" blades="${blades}" bladesrotation="${bladesRotation}" nearclip="${nearclip}" farclip="${farclip}" />
  </transform>`;
}

function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function buildObjectTransformMatrix(t = {}) {
  const sx = clampNumber(t.scale, 0.001, 100, 1);
  const rx = (clampNumber(t.rx, -3600, 3600, 0) * Math.PI) / 180;
  const ry = (clampNumber(t.ry, -3600, 3600, 0) * Math.PI) / 180;
  const rz = (clampNumber(t.rz, -3600, 3600, 0) * Math.PI) / 180;
  const cx = Math.cos(rx), sxr = Math.sin(rx);
  const cy = Math.cos(ry), syr = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const m00 = (cz * cy) * sx;
  const m01 = (cz * syr * sxr - sz * cx) * sx;
  const m02 = (cz * syr * cx + sz * sxr) * sx;
  const m10 = (sz * cy) * sx;
  const m11 = (sz * syr * sxr + cz * cx) * sx;
  const m12 = (sz * syr * cx - cz * sxr) * sx;
  const m20 = (-syr) * sx;
  const m21 = (cy * sxr) * sx;
  const m22 = (cy * cx) * sx;
  return [
    m00, m10, m20, 0,
    m01, m11, m21, 0,
    m02, m12, m22, 0,
    clampNumber(t.x, -1000, 1000, 0),
    clampNumber(t.y, -1000, 1000, 0),
    clampNumber(t.z, -1000, 1000, 0),
    1,
  ].map((v) => Number(v).toFixed(6)).join(' ');
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
  const transformedMeshBlocks = opts.transform
    ? `  <transform matrix="${buildObjectTransformMatrix(opts.transform)}">\n${meshBlocks}\n  </transform>`
    : meshBlocks;

  const width = clampNumber(opts.width, 64, 8192, 2048);
  const height = clampNumber(opts.height, 64, 8192, 1536);
  const camera = opts.cyclesCamera || opts.camera || {};
  const cameraDistance = clampNumber(
    camera.distance ?? opts.cameraDistance ?? opts.meshMeta?.cameraDistance,
    0.35,
    48,
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
${buildCameraBlockXml(width, height, clampNumber(camera.fov, 0.05, 3.13, Math.PI / 4), cameraDistance, camera)}
${buildBackgroundBlockXml(environmentStrength, backgroundColor)}
${shaderBlock}
  <transform translate="${lx} ${ly} ${lz}">
    <light light_type="point" strength="${keyStrength}" size="${keySize}" />
  </transform>
${transformedMeshBlocks}
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
