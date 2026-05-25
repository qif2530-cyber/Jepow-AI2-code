import type { Edge, Node } from "@xyflow/react";
import type { CyclesMaterial } from "./cycles-material";
import {
  CYCLES_COLOR_NODE_TYPES,
  PRINCIPLED_TEXTURE_SOCKETS,
  type CyclesShaderGraphIR,
  type CyclesShaderGraphLink,
  type CyclesShaderGraphNode,
} from "./cycles-shader-graph-types";

let nameSeq = 0;
function uid(prefix: string) {
  nameSeq += 1;
  return `${prefix}_${nameSeq}`;
}

function upstreamColorEdge(targetId: string, edges: Edge[], handle = "colorIn") {
  const edge = edges.find(
    (e) => e.target === targetId && (e.targetHandle === handle || e.targetHandle === "imageIn"),
  );
  if (!edge) return null;
  return edge;
}

function imageUrlFromNode(node: Node, nodes: Node[], edges: Edge[]): string | undefined {
  const d = node.data as { imageUrl?: string; url?: string };
  if (d.imageUrl || d.url) return d.imageUrl || d.url;
  const up = upstreamColorEdge(node.id, edges, "imageIn");
  if (!up) return undefined;
  const src = nodes.find((n) => n.id === up.source);
  if (!src) return undefined;
  if (src.type === "cyclesImageTextureNode" || src.type === "imageNode" || src.type === "mediaNode") {
    const sd = src.data as { imageUrl?: string; url?: string };
    return sd.imageUrl || sd.url;
  }
  return undefined;
}

type ChainEnd = { nodeName: string; socket: string };

function traceColorChain(
  startNodeId: string,
  nodes: Node[],
  edges: Edge[],
  ir: { nodes: CyclesShaderGraphNode[]; links: CyclesShaderGraphLink[] },
): ChainEnd | null {
  let currentId = startNodeId;
  let lastOut: ChainEnd | null = null;

  for (let guard = 0; guard < 24; guard++) {
    const node = nodes.find((n) => n.id === currentId);
    if (!node) return lastOut;

    const type = node.type || "";
    const data = node.data as Record<string, unknown>;

    if (type === "cyclesImageTextureNode") {
      const url = imageUrlFromNode(node, nodes, edges);
      const name = uid("tex");
      ir.nodes.push({
        name,
        type: "image_texture",
        params: {
          filename: url || "",
          colorspace: "sRGB",
          interpolation: "linear",
          extension: "repeat",
        },
      });
      lastOut = { nodeName: name, socket: "Color" };
      const upEdge = upstreamColorEdge(node.id, edges, "colorIn");
      if (!upEdge) return lastOut;
      currentId = upEdge.source;
      continue;
    }

    if (CYCLES_COLOR_NODE_TYPES.has(type)) {
      const name = uid(type.replace("cycles", "").replace("Node", ""));
      const n: CyclesShaderGraphNode = { name, type: "gamma", params: {} };

      switch (type) {
        case "cyclesGammaNode":
          n.type = "gamma";
          n.params = { gamma: Number(data.gamma ?? 1) };
          break;
        case "cyclesBrightContrastNode":
          n.type = "brightness_contrast";
          n.params = {
            bright: Number(data.bright ?? 0),
            contrast: Number(data.contrast ?? 0),
          };
          break;
        case "cyclesRgbCurvesNode":
          n.type = "rgb_curves";
          n.params = {
            fac: Number(data.fac ?? 1),
            min_x: 0,
            max_x: 1,
            extrapolate: true,
            curves: data.curves ?? "0 0 0 1 1 1",
          };
          break;
        case "cyclesRgbRampNode":
          n.type = "rgb_ramp";
          n.params = {
            fac: Number(data.fac ?? 0),
            interpolate: data.interpolate !== false,
            ramp: data.ramp ?? "0 0 0 1 1 1",
            ramp_alpha: data.rampAlpha ?? "0 1",
          };
          break;
        case "cyclesMixColorNode":
          n.type = "mix_color";
          n.params = {
            blend_type: String(data.blendType ?? "mix"),
            fac: Number(data.factor ?? 0.5),
            use_clamp: true,
            use_clamp_result: false,
          };
          break;
        case "cyclesMapRangeNode":
          n.type = "map_range";
          n.params = {
            range_type: String(data.rangeType ?? "linear"),
            from_min: Number(data.fromMin ?? 0),
            from_max: Number(data.fromMax ?? 1),
            to_min: Number(data.toMin ?? 0),
            to_max: Number(data.toMax ?? 1),
            steps: Number(data.steps ?? 4),
            clamp: Boolean(data.clamp ?? false),
          };
          break;
        case "cyclesRgbToBwNode":
          n.type = "rgb_to_bw";
          n.params = {};
          break;
        default:
          break;
      }

      ir.nodes.push(n);
      if (lastOut) {
        ir.links.push({
          from: [lastOut.nodeName, lastOut.socket],
          to: [name, inputSocketForType(n.type)],
        });
      }
      lastOut = { nodeName: name, socket: outputSocketForType(n.type) };

      if (type === "cyclesMixColorNode") {
        const aEdge = edges.find((e) => e.target === node.id && e.targetHandle === "mixA");
        const bEdge = edges.find((e) => e.target === node.id && e.targetHandle === "mixB");
        if (aEdge) {
          const aEnd = traceColorChain(aEdge.source, nodes, edges, ir);
          if (aEnd) {
            ir.links.push({ from: [aEnd.nodeName, aEnd.socket], to: [name, "A"] });
          }
        }
        if (bEdge) {
          const bEnd = traceColorChain(bEdge.source, nodes, edges, ir);
          if (bEnd) {
            ir.links.push({ from: [bEnd.nodeName, bEnd.socket], to: [name, "B"] });
          }
        }
        return lastOut;
      }
      const upEdge = upstreamColorEdge(node.id, edges, "colorIn");
      if (!upEdge) return lastOut;
      currentId = upEdge.source;
      continue;
    }

    return lastOut;
  }
  return lastOut;
}

function inputSocketForType(type: CyclesShaderGraphNode["type"]): string {
  switch (type) {
    case "gamma":
    case "brightness_contrast":
    case "rgb_curves":
    case "rgb_ramp":
    case "rgb_to_bw":
      return "Color";
    case "mix_color":
      return "A";
    case "map_range":
      return "Value";
    case "normal_map":
      return "Color";
    case "displacement":
      return "Height";
    default:
      return "Color";
  }
}

function outputSocketForType(type: CyclesShaderGraphNode["type"]): string {
  switch (type) {
    case "rgb_to_bw":
    case "map_range":
      return type === "map_range" ? "Result" : "Val";
    case "mix_color":
      return "Result";
    case "normal_map":
      return "Normal";
    case "displacement":
      return "Displacement";
    default:
      return "Color";
  }
}

function buildNormalChain(
  normalNode: Node,
  nodes: Node[],
  edges: Edge[],
  ir: { nodes: CyclesShaderGraphNode[]; links: CyclesShaderGraphLink[] },
): ChainEnd | null {
  const colorEnd = traceColorChain(normalNode.id, nodes, edges, ir);
  if (!colorEnd) return null;
  const sd = normalNode.data as { strength?: number };
  const name = uid("nrm");
  ir.nodes.push({
    name,
    type: "normal_map",
    params: { space: "tangent", strength: Number(sd.strength ?? 1) },
  });
  ir.links.push({ from: [colorEnd.nodeName, colorEnd.socket], to: [name, "Color"] });
  return { nodeName: name, socket: "Normal" };
}

function buildDisplacementChain(
  dispNode: Node,
  nodes: Node[],
  edges: Edge[],
  ir: { nodes: CyclesShaderGraphNode[]; links: CyclesShaderGraphLink[] },
): ChainEnd | null {
  const colorEnd = traceColorChain(dispNode.id, nodes, edges, ir);
  if (!colorEnd) return null;
  const sd = dispNode.data as { scale?: number; midlevel?: number };
  let heightName = colorEnd.nodeName;
  let heightSocket = colorEnd.socket;

  if (colorEnd.socket === "Color") {
    const bw = uid("disp_bw");
    ir.nodes.push({ name: bw, type: "rgb_to_bw", params: {} });
    ir.links.push({ from: [colorEnd.nodeName, colorEnd.socket], to: [bw, "Color"] });
    heightName = bw;
    heightSocket = "Val";
  }

  const name = uid("disp");
  ir.nodes.push({
    name,
    type: "displacement",
    params: {
      space: "object",
      scale: Number(sd.scale ?? 0),
      midlevel: Number(sd.midlevel ?? 0.5),
    },
  });
  ir.links.push({ from: [heightName, heightSocket], to: [name, "Height"] });
  return { nodeName: name, socket: "Displacement" };
}

/** 从 Principled 节点 + 入边构建官方 shader graph IR */
export function buildCyclesShaderGraphIR(
  materialNode: Node | null | undefined,
  nodes: Node[],
  edges: Edge[],
  material: CyclesMaterial,
): CyclesShaderGraphIR {
  nameSeq = 0;
  const ir: CyclesShaderGraphIR = { nodes: [], links: [] };
  const p = material.principled;
  const principledName = uid("principled");

  ir.nodes.push({
    name: principledName,
    type: "principled_bsdf",
    params: { ...p },
  });
  ir.links.push({
    from: [principledName, "BSDF"],
    to: ["output", "surface"],
  });

  if (materialNode?.type === "cyclesPrincipledNode") {
    const incoming = edges.filter((e) => e.target === materialNode.id);
    for (const edge of incoming) {
      const socket = PRINCIPLED_TEXTURE_SOCKETS[edge.targetHandle || ""];
      if (!socket) continue;
      const src = nodes.find((n) => n.id === edge.source);
      if (!src) continue;

      if (src.type === "cyclesNormalMapNode") {
        const end = buildNormalChain(src, nodes, edges, ir);
        if (end) {
          ir.links.push({ from: [end.nodeName, end.socket], to: [principledName, socket] });
        }
        continue;
      }

      if (src.type === "cyclesDisplacementNode") {
        const end = buildDisplacementChain(src, nodes, edges, ir);
        if (end) {
          ir.links.push({ from: [end.nodeName, end.socket], to: ["output", "displacement"] });
          ir.useDisplacementOutput = true;
        }
        continue;
      }

      const end = traceColorChain(src.id, nodes, edges, ir);
      if (end) {
        ir.links.push({ from: [end.nodeName, end.socket], to: [principledName, socket] });
      }
    }
  }

  appendTextureFallbacks(material, principledName, ir);
  appendColorManagementGamma(material, principledName, ir);

  return ir;
}

function appendTextureFallbacks(
  material: CyclesMaterial,
  principledName: string,
  ir: CyclesShaderGraphIR,
) {
  const linked = new Set(ir.links.map((l) => l.to[1]));
  const slotMap: Array<{ key: keyof typeof material.textures; handle: string }> = [
    { key: "baseColor", handle: "Base Color" },
    { key: "roughness", handle: "Roughness" },
    { key: "metallic", handle: "Metallic" },
    { key: "emission", handle: "Emission Color" },
    { key: "alpha", handle: "Alpha" },
  ];

  for (const { key, handle } of slotMap) {
    if (linked.has(handle)) continue;
    const url = material.textures[key];
    if (!url) continue;
    const name = uid(`tex_${key}`);
    ir.nodes.push({
      name,
      type: "image_texture",
      params: { filename: url, colorspace: "sRGB", interpolation: "linear", extension: "repeat" },
    });
    ir.links.push({ from: [name, "Color"], to: [principledName, handle] });
    linked.add(handle);
  }

  if (!linked.has("Normal") && material.textures.normal) {
    const tex = uid("tex_normal");
    const nrm = uid("nrm");
    ir.nodes.push({
      name: tex,
      type: "image_texture",
      params: {
        filename: material.textures.normal,
        colorspace: "Non-Color",
        interpolation: "linear",
        extension: "repeat",
      },
    });
    ir.nodes.push({
      name: nrm,
      type: "normal_map",
      params: { space: "tangent", strength: material.principled.normalStrength },
    });
    ir.links.push({ from: [tex, "Color"], to: [nrm, "Color"] });
    ir.links.push({ from: [nrm, "Normal"], to: [principledName, "Normal"] });
  }

  if (
    !ir.useDisplacementOutput &&
    material.textures.displacement &&
    material.principled.displacementScale > 0
  ) {
    const tex = uid("tex_disp");
    const bw = uid("disp_bw");
    const disp = uid("disp");
    ir.nodes.push({
      name: tex,
      type: "image_texture",
      params: {
        filename: material.textures.displacement,
        colorspace: "Non-Color",
        interpolation: "linear",
        extension: "repeat",
      },
    });
    ir.nodes.push({ name: bw, type: "rgb_to_bw", params: {} });
    ir.nodes.push({
      name: disp,
      type: "displacement",
      params: {
        space: "object",
        scale: material.principled.displacementScale,
        midlevel: material.principled.displacementMidlevel,
      },
    });
    ir.links.push({ from: [tex, "Color"], to: [bw, "Color"] });
    ir.links.push({ from: [bw, "Val"], to: [disp, "Height"] });
    ir.links.push({ from: [disp, "Displacement"], to: ["output", "displacement"] });
    ir.useDisplacementOutput = true;
  }
}

function appendColorManagementGamma(
  material: CyclesMaterial,
  principledName: string,
  ir: CyclesShaderGraphIR,
) {
  const gamma = material.colorManagement?.gamma ?? 1;
  if (Math.abs(gamma - 1) < 0.001) return;
  const baseLink = ir.links.find((l) => l.to[0] === principledName && l.to[1] === "Base Color");
  if (!baseLink) return;
  const g = uid("view_gamma");
  ir.nodes.push({ name: g, type: "gamma", params: { gamma } });
  ir.links.push({ from: [baseLink.from[0], baseLink.from[1]], to: [g, "Color"] });
  baseLink.from = [g, "Color"];
}
