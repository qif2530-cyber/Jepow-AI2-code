const { principledBsdfXmlAttrs, xmlEscape } = require('./cycles-xml-export.cjs');

function nodeXml(node) {
  const { name, type, params = {} } = node;
  const parts = [`name="${xmlEscape(name)}"`];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (type === 'principled_bsdf') continue;
    parts.push(`${k}="${xmlEscape(String(v))}"`);
  }
  return `    <${type} ${parts.join(' ')} />`;
}

function principledNodeXml(node) {
  const p = node.params || {};
  const attrs = principledBsdfXmlAttrs(p);
  return `    <principled_bsdf name="${xmlEscape(node.name)}" ${attrs} />`;
}

function buildShaderGraphInnerXml(shaderGraph) {
  if (!shaderGraph?.nodes?.length) return '';
  const lines = [];
  for (const node of shaderGraph.nodes) {
    if (node.type === 'principled_bsdf') {
      lines.push(principledNodeXml(node));
    } else {
      lines.push(nodeXml(node));
    }
  }
  for (const link of shaderGraph.links || []) {
    const [fromNode, fromSock] = link.from;
    const [toNode, toSock] = link.to;
    lines.push(
      `    <connect from="${xmlEscape(fromNode)} ${xmlEscape(fromSock)}" to="${xmlEscape(toNode)} ${xmlEscape(toSock)}" />`,
    );
  }
  return lines.join('\n');
}

function buildShaderBlockXml(shaderGraph, fallbackPrincipled) {
  if (shaderGraph?.nodes?.length) {
    return `  <shader name="jepow_material">\n${buildShaderGraphInnerXml(shaderGraph)}\n  </shader>`;
  }
  const attrs = principledBsdfXmlAttrs(fallbackPrincipled || {});
  return `  <shader name="jepow_material">
    <principled_bsdf name="principled" ${attrs} />
    <connect from="principled BSDF" to="output surface" />
  </shader>`;
}

module.exports = {
  buildShaderGraphInnerXml,
  buildShaderBlockXml,
};
