/**
 * Build Cycles Standalone <mesh> blocks from jepow-engine mesh_for_cycles payload.
 */

function buildMeshStateBlock(meshPayload, shaderName = 'jepow_material') {
  const coords = meshPayload.coords || [];
  const verts = meshPayload.verts || [];
  if (!coords.length || !verts.length) return '';

  const pAttr = coords.map((v) => Number(v).toFixed(6)).join(' ');
  const vertsAttr = verts.map(String).join(' ');
  const triCount = Math.floor(verts.length / 3);
  const nvertsAttr = Array(triCount).fill('3').join(' ');

  return `  <state shader="${shaderName}" interpolation="smooth">
    <mesh P="${pAttr}" verts="${vertsAttr}" nverts="${nvertsAttr}" />
  </state>`;
}

module.exports = { buildMeshStateBlock };
