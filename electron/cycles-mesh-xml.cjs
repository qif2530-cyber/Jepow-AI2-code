/**
 * Build Cycles Standalone <mesh> blocks from jepow-engine mesh_for_cycles payload.
 */

function buildMeshStateBlock(meshPayload, shaderName = 'jepow_material') {
  const coords = meshPayload.coords || [];
  const normals = meshPayload.normals || [];
  const verts = meshPayload.verts || [];
  const nverts = meshPayload.nverts || [];
  const sceneFitMatrix = meshPayload.sceneFitMatrix || [];
  if (!coords.length || !verts.length) return '';

  const pAttr = coords.map((v) => Number(v).toFixed(6)).join(' ');
  const nAttr =
    normals.length === coords.length
      ? ` N="${normals.map((v) => Number(v).toFixed(6)).join(' ')}"`
      : '';
  const vertsAttr = verts.map(String).join(' ');
  const nvertsAttr = nverts.length
    ? nverts.map(String).join(' ')
    : Array(Math.floor(verts.length / 3)).fill('3').join(' ');

  const meshXml = `  <state shader="${shaderName}" interpolation="smooth">
    <mesh P="${pAttr}"${nAttr} verts="${vertsAttr}" nverts="${nvertsAttr}" />
  </state>`;
  if (sceneFitMatrix.length === 16) {
    const fit = sceneFitMatrix.map((v) => Number(v).toFixed(6)).join(' ');
    return `  <transform matrix="${fit}">\n${meshXml}\n  </transform>`;
  }
  return meshXml;
}

module.exports = { buildMeshStateBlock };
