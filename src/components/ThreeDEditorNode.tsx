import React, {
  useState,
  useEffect,
  Suspense,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import {
  Handle,
  Position,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Box, Settings, Compass, Sun, Sliders, RefreshCw, ZoomIn, Eye, Plus, GripHorizontal, Pause, Play, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { isDesktopApp } from "../lib/runtime";
import { parseLocalAssetRef } from "../lib/local-assets";
import { loadModelGroup } from "../lib/model-asset-loader";
import {
  JepowViewportPreview,
  type AssignedSubmeshMaterialPreview,
} from "./JepowViewportPreview";
import { useDesktopScenePath } from "../hooks/useDesktopScenePath";
import { getLocalUserId } from "../lib/local-user-id";
import { getCurrentProjectId } from "../lib/current-project";
import {
  createCyclesMaterial,
  cyclesToViewportMaterial,
  type CyclesMaterial,
} from "../lib/cycles-material";

/** Cycles resident 路径只用 principled 标量；shaderGraph 留给 XML 回退且在主进程构建。 */
function cyclesMaterialForCyclesSession(mat: CyclesMaterial): CyclesMaterial {
  const { shaderGraph: _shaderGraph, ...rest } = mat;
  return rest;
}
import { resolveEditorInputs } from "../lib/native-3d-pipeline";
import {
  fetchSceneObjectList,
  type SceneObjectEntry,
} from "../lib/scene-object-list";
import { dispatchSceneObjectSelection } from "../lib/scene-object-selection";
import { viewportMaterialForSceneObject } from "../lib/scene-object-materials";
import { buildCyclesLightPayload } from "../lib/cycles-light-payload";
import { getViewportEngine } from "../lib/viewport-engine";
import type { ViewportCamera } from "../lib/viewport-engine/types";
import {
  cameraViewKey,
  cyclesLightToViewportLighting,
  focalLengthToFovRad,
  lightViewKey,
  mergeLightsForCameraView,
  normalizeJepCameras,
  normalizeJepRenderSettings,
  parseJepViewKey,
  resolveEditorConnectedLights,
  type JepCamera,
  type JepViewKind,
} from "../lib/jep-renderer";

interface ThreeDEditorNodeProps {
  id: string;
  data: {
    texturedModel?: {
      glbUrl: string;
      material?: {
        colorUrl?: string;
        normalUrl?: string;
        roughnessUrl?: string;
        metalnessUrl?: string;
        tiling?: number;
        tint?: string;
      };
    };
    sceneData?: any;
    status?: string;
    renderActive?: boolean;
    blendSourcePath?: string;
    blendFidelityRender?: boolean;
    /** 与 JEP / CL 共用的视口轨道相机（持久化在节点上） */
    cyclesViewportCamera?: ViewportCamera;
    jepCameras?: JepCamera[];
    jepRenderSettings?: Record<string, unknown>;
    jepViewKind?: JepViewKind;
    jepActiveViewKey?: string;
    jepViewStates?: Record<string, ViewportCamera>;
    renderSettings?: Record<string, unknown>;
  };
  selected?: boolean;
}

const DEFAULT_CYCLES_VIEWPORT_CAMERA: ViewportCamera = {
  yaw: 0.55,
  pitch: 0.38,
  distance: 2.45,
  panX: 0,
  panY: 0,
  fov: Math.PI / 4,
};

function cameraFromSceneExtent(triangleCount?: number): ViewportCamera {
  const tris = Math.max(0, Number(triangleCount) || 0);
  const extent = tris > 120_000 ? 5.2 : tris > 40_000 ? 4.4 : tris > 8_000 ? 3.8 : 3.2;
  return {
    ...DEFAULT_CYCLES_VIEWPORT_CAMERA,
    distance: Math.max(2.8, extent),
    pitch: 0.34,
    yaw: 0.62,
  };
}

function ModelRenderer({
  glbUrl,
  material,
  transform,
  modelName,
  onLoadError,
}: {
  glbUrl: string;
  material: any;
  transform: any;
  modelName?: string;
  onLoadError?: (msg: string | null) => void;
}) {
  const [scene, setScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    let active = true;
    setScene(null);
    onLoadError?.(null);

    loadModelGroup(glbUrl, modelName)
      .then((group) => {
        if (!active) return;
        setScene(group);
        onLoadError?.(null);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "模型加载失败";
        console.error("Format renderer load error in editor:", err);
        if (active) onLoadError?.(msg);
      });

    return () => {
      active = false;
    };
  }, [glbUrl, modelName, onLoadError]);

  // Clone scene so multiple render instances don't share identical memory instances
  const clonedScene = useMemo(() => {
    if (!scene) return null;
    return scene.clone();
  }, [scene]);

  useEffect(() => {
    if (!clonedScene) return;

    const loadedTextures: THREE.Texture[] = [];
    const createdMaterials: THREE.Material[] = [];

    if (!material) return;

    const textureLoader = new THREE.TextureLoader();
    let colorTex: THREE.Texture | null = null;
    let normalTex: THREE.Texture | null = null;
    let roughnessTex: THREE.Texture | null = null;
    let metalnessTex: THREE.Texture | null = null;

    const cyclesMaterial = createCyclesMaterial(material);
    const cycles = cyclesMaterial.principled;
    const repeatVal = material.tiling || 1;
    const textureSlots = cyclesMaterial.textures;

    try {
      if (textureSlots.baseColor) {
        colorTex = textureLoader.load(textureSlots.baseColor);
        loadedTextures.push(colorTex);
        colorTex.wrapS = THREE.RepeatWrapping;
        colorTex.wrapT = THREE.RepeatWrapping;
        colorTex.repeat.set(repeatVal, repeatVal);
        colorTex.anisotropy = 16;
        colorTex.generateMipmaps = true;
        colorTex.minFilter = THREE.LinearMipmapLinearFilter;
      }
      if (textureSlots.normal) {
        normalTex = textureLoader.load(textureSlots.normal);
        loadedTextures.push(normalTex);
        normalTex.wrapS = THREE.RepeatWrapping;
        normalTex.wrapT = THREE.RepeatWrapping;
        normalTex.repeat.set(repeatVal, repeatVal);
        normalTex.anisotropy = 16;
        normalTex.generateMipmaps = true;
        normalTex.minFilter = THREE.LinearMipmapLinearFilter;
      }
      if (textureSlots.roughness) {
        roughnessTex = textureLoader.load(textureSlots.roughness);
        loadedTextures.push(roughnessTex);
        roughnessTex.wrapS = THREE.RepeatWrapping;
        roughnessTex.wrapT = THREE.RepeatWrapping;
        roughnessTex.repeat.set(repeatVal, repeatVal);
        roughnessTex.anisotropy = 16;
        roughnessTex.generateMipmaps = true;
        roughnessTex.minFilter = THREE.LinearMipmapLinearFilter;
      }
      if (textureSlots.metallic) {
        metalnessTex = textureLoader.load(textureSlots.metallic);
        loadedTextures.push(metalnessTex);
        metalnessTex.wrapS = THREE.RepeatWrapping;
        metalnessTex.wrapT = THREE.RepeatWrapping;
        metalnessTex.repeat.set(repeatVal, repeatVal);
        metalnessTex.anisotropy = 16;
        metalnessTex.generateMipmaps = true;
        metalnessTex.minFilter = THREE.LinearMipmapLinearFilter;
      }

      // Traverse the nodes, swapping original maps with custom high-definition PBR SVGs
      clonedScene.traverse((child: any) => {
        if (child.isMesh) {
          // Upgrade to MeshPhysicalMaterial to support full physical properties (roughness, metalness, normal, bump, glass refraction)
          const customMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(cycles.baseColor),
            roughness: cycles.roughness,
            metalness: cycles.metallic,
            reflectivity: cycles.specularIorLevel,
            clearcoat: cycles.coatWeight,
            clearcoatRoughness: cycles.coatRoughness,
            transparent: cycles.alpha < 1.0,
            opacity: cycles.alpha,
          });
          createdMaterials.push(customMat);

          if (colorTex) customMat.map = colorTex;
          if (normalTex) {
            customMat.normalMap = normalTex;
            const nScale = cycles.normalStrength;
            customMat.normalScale.set(nScale, nScale);
          }
          if (roughnessTex) customMat.roughnessMap = roughnessTex;
          if (metalnessTex) customMat.metalnessMap = metalnessTex;

          // Custom bump mapping detail
          if (cycles.displacementScale > 0 && (colorTex || normalTex)) {
            customMat.bumpMap = colorTex || normalTex;
            customMat.bumpScale = cycles.displacementScale * 0.05;
          }

          customMat.transmission = cycles.transmissionWeight;
          customMat.ior = cycles.ior;
          if (cycles.transmissionWeight > 0) {
            customMat.thickness = 1.0;
          }

          if (cycles.emissionStrength > 0) {
            customMat.emissive.set(new THREE.Color(cycles.emissionColor));
            customMat.emissiveIntensity = cycles.emissionStrength;
          }

          child.material = customMat;
          child.material.needsUpdate = true;
        }
      });
    } catch (e) {
      console.error("Failed to map PBR textures to custom physical materials:", e);
    }

    return () => {
      // Clean up newly created textures to reclaim WebGL/GPU memory
      loadedTextures.forEach((tex) => {
        try {
          tex.dispose();
        } catch (err) {
          console.warn("Texture dispose error:", err);
        }
      });
      // Clean up newly created standard MeshPhysicalMaterials
      createdMaterials.forEach((mat) => {
        try {
          mat.dispose();
        } catch (err) {
          console.warn("Material dispose error:", err);
        }
      });
    };
  }, [clonedScene, material]);

  if (!clonedScene) return null;

  // Translate transform deg and scale
  const rotX = THREE.MathUtils.degToRad(transform.rx || 0);
  const rotY = THREE.MathUtils.degToRad(transform.ry || 0);
  const rotZ = THREE.MathUtils.degToRad(transform.rz || 0);
  const sc = transform.scale || 1;

  return (
    <primitive
      object={clonedScene}
      position={[transform.x, transform.y, transform.z]}
      rotation={[rotX, rotY, rotZ]}
      scale={[sc, sc, sc]}
    />
  );
}

// Localized canvas boundary to intercept react-three-fiber compile/render/mesh errors
class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode; onError?: (err: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("3D Viewport caught rendering crash:", error, errorInfo);
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Beautiful procedural 3D visual fallback to mapping textures without remote teapot glb download dependencies.
function ProceduralPlaceholder({
  material,
  transform
}: {
  material: any;
  transform: any;
}) {
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  
  const [textures, setTextures] = useState<{
    map: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    roughnessMap: THREE.Texture | null;
    metalnessMap: THREE.Texture | null;
  }>({ map: null, normalMap: null, roughnessMap: null, metalnessMap: null });

  useEffect(() => {
    if (!material) {
      setTextures({ map: null, normalMap: null, roughnessMap: null, metalnessMap: null });
      return;
    }
    const repeatVal = material.tiling || 1;

    let map: THREE.Texture | null = null;
    let normalMap: THREE.Texture | null = null;
    let roughnessMap: THREE.Texture | null = null;
    let metalnessMap: THREE.Texture | null = null;

    if (material.colorUrl) {
      map = textureLoader.load(material.colorUrl);
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeatVal, repeatVal);
      map.anisotropy = 16;
      map.generateMipmaps = true;
      map.minFilter = THREE.LinearMipmapLinearFilter;
    }
    if (material.normalUrl) {
      normalMap = textureLoader.load(material.normalUrl);
      normalMap.wrapS = THREE.RepeatWrapping;
      normalMap.wrapT = THREE.RepeatWrapping;
      normalMap.repeat.set(repeatVal, repeatVal);
      normalMap.anisotropy = 16;
      normalMap.generateMipmaps = true;
      normalMap.minFilter = THREE.LinearMipmapLinearFilter;
    }
    if (material.roughnessUrl) {
      roughnessMap = textureLoader.load(material.roughnessUrl);
      roughnessMap.wrapS = THREE.RepeatWrapping;
      roughnessMap.wrapT = THREE.RepeatWrapping;
      roughnessMap.repeat.set(repeatVal, repeatVal);
      roughnessMap.anisotropy = 16;
      roughnessMap.generateMipmaps = true;
      roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
    }
    if (material.metalnessUrl) {
      metalnessMap = textureLoader.load(material.metalnessUrl);
      metalnessMap.wrapS = THREE.RepeatWrapping;
      metalnessMap.wrapT = THREE.RepeatWrapping;
      metalnessMap.repeat.set(repeatVal, repeatVal);
      metalnessMap.anisotropy = 16;
      metalnessMap.generateMipmaps = true;
      metalnessMap.minFilter = THREE.LinearMipmapLinearFilter;
    }

    setTextures({ map, normalMap, roughnessMap, metalnessMap });
  }, [material, textureLoader]);

  const rotX = THREE.MathUtils.degToRad(transform.rx || 0);
  const rotY = THREE.MathUtils.degToRad(transform.ry || 0);
  const rotZ = THREE.MathUtils.degToRad(transform.rz || 0);
  const sc = (transform.scale || 2.0) * 0.45; // balanced size for torus knot

  return (
    <mesh
      position={[transform.x, transform.y, transform.z]}
      rotation={[rotX, rotY, rotZ]}
      scale={[sc, sc, sc]}
    >
      <torusKnotGeometry args={[1.2, 0.4, 120, 16]} />
      <meshPhysicalMaterial
        color={material?.tint || "#ffffff"}
        map={textures.map || undefined}
        normalMap={textures.normalMap || undefined}
        normalScale={new THREE.Vector2(material?.normalScale ?? 1.0, material?.normalScale ?? 1.0)}
        roughnessMap={textures.roughnessMap || undefined}
        metalnessMap={textures.metalnessMap || undefined}
        roughness={material?.roughness !== undefined ? material.roughness : 0.4}
        metalness={material?.metalness !== undefined ? material.metalness : 0.3}
        bumpMap={material?.displacementScale && (textures.map || textures.normalMap) ? (textures.map || textures.normalMap) : undefined}
        bumpScale={(material?.displacementScale ?? 0) * 0.05}
        transmission={material?.transmission ?? 0.0}
        ior={material?.ior ?? 1.5}
        thickness={material?.transmission > 0 ? 1.0 : 0.0}
      />
    </mesh>
  );
}

function LoadingPlaceholder() {
  return (
    <mesh rotation={[0.5, 0.5, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#6366f1" wireframe />
    </mesh>
  );
}

function ErrorPlaceholder() {
  return (
    <mesh rotation={[0.5, 0.5, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ef4444" wireframe />
    </mesh>
  );
}

function getCyclesViewportTarget(
  finalWidth: number,
  finalHeight: number,
  finalSamples: number,
  device: unknown,
  quality: "interactive" | "final",
  viewportSize?: { width: number; height: number },
) {
  const width = Math.max(64, Number(finalWidth) || 2048);
  const height = Math.max(64, Number(finalHeight) || 1536);
  const samples = Math.max(1, Number(finalSamples) || 32);
  const viewportW = Math.max(1, Number(viewportSize?.width) || width);
  const viewportH = Math.max(1, Number(viewportSize?.height) || height);
  const viewportAspectH = viewportH / viewportW;
  if (quality === "final") {
    let w = width;
    let h = Math.round(w * viewportAspectH);
    if (h > height) {
      h = height;
      w = Math.round(h / viewportAspectH);
    }
    return { width: w, height: h, samples };
  }

  const maxW = device === "METAL" ? 768 : 512;
  const w = Math.min(width, maxW);
  const h = Math.max(64, Math.round(w * viewportAspectH));
  return {
    width: w,
    height: Math.min(height, h),
    samples: Math.min(8, Math.max(2, Math.floor(samples / 16) || 4)),
  };
}

export function ThreeDEditorNode({ id, data, selected }: ThreeDEditorNodeProps) {
  const { getNodes, getEdges, updateNodeData } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canvasMounted, setCanvasMounted] = useState(false);
  const [viewportExpanded, setViewportExpanded] = useState(false);
  const [viewportWorkspacePortal, setViewportWorkspacePortal] =
    useState<HTMLElement | null>(null);

  useEffect(() => {
    setViewportWorkspacePortal(
      document.getElementById("jepow-viewport-workspace-overlay"),
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateNodeInternals(id);
    }, viewportExpanded ? 80 : 0);
    return () => window.clearTimeout(timer);
  }, [viewportExpanded, id, updateNodeInternals]);

  const renderActive = data.renderActive === true;
  const [viewportMode, setViewportMode] = useState<"preview" | "render">(
    "preview",
  );
  const toggleRenderActive = () => {
    updateNodeData(id, { renderActive: !renderActive });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setCanvasMounted(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const nodes = getNodes();
  const edges = getEdges();

  const modelEdge = edges.find((e) => e.target === id && e.targetHandle === "modelInput");
  const modelNode = modelEdge ? nodes.find((n) => n.id === modelEdge.source) : null;
  const sceneObjectNameById = useMemo(() => {
    const objects =
      (modelNode?.data as { sceneObjects?: SceneObjectEntry[] } | undefined)
        ?.sceneObjects ?? [];
    return Object.fromEntries(objects.map((object) => [object.id, object.name]));
  }, [modelNode?.data]);

  const editorPipeline = useMemo(
    () =>
      resolveEditorInputs(
        { id, type: "threeDEditorNode", data, position: { x: 0, y: 0 } },
        nodes,
        edges,
      ),
    [id, data, nodes, edges],
  );

  const jepCameras = useMemo(() => normalizeJepCameras(data.jepCameras), [data.jepCameras]);
  const jepRenderSettings = useMemo(
    () => normalizeJepRenderSettings(data.jepRenderSettings ?? data.renderSettings),
    [data.jepRenderSettings, data.renderSettings],
  );
  const connectedJepLights = useMemo(
    () => resolveEditorConnectedLights(id, nodes, edges),
    [id, nodes, edges],
  );
  const jepViewKind: JepViewKind = data.jepViewKind === "light" ? "light" : "camera";
  const jepActiveViewKey = String(
    data.jepActiveViewKey || cameraViewKey(jepCameras[0]?.id || ""),
  );
  const activeJepCamera = useMemo(() => {
    const parsed = parseJepViewKey(jepActiveViewKey);
    if (parsed?.kind === "camera") {
      return jepCameras.find((c) => c.id === parsed.id) || jepCameras[0];
    }
    return jepCameras[0];
  }, [jepActiveViewKey, jepCameras]);
  const activeJepLight = useMemo(() => {
    if (jepViewKind !== "light") return null;
    const parsed = parseJepViewKey(jepActiveViewKey);
    if (!parsed || parsed.kind !== "light") {
      return connectedJepLights[0] || null;
    }
    return (
      connectedJepLights.find((l) => l.edgeId === parsed.id) ||
      connectedJepLights[0] ||
      null
    );
  }, [jepViewKind, jepActiveViewKey, connectedJepLights]);
  const inLightView = jepViewKind === "light" && !!activeJepLight;

  useEffect(() => {
    if (Array.isArray(data.jepCameras) && data.jepCameras.length > 0) return;
    const cams = normalizeJepCameras(undefined);
    updateNodeData(id, {
      jepCameras: cams,
      jepRenderSettings: normalizeJepRenderSettings(
        data.jepRenderSettings ?? data.renderSettings,
      ),
      jepActiveViewKey: data.jepActiveViewKey || cameraViewKey(cams[0].id),
      jepViewKind: data.jepViewKind === "light" ? "light" : "camera",
    });
  }, [
    id,
    data.jepCameras,
    data.jepActiveViewKey,
    data.jepViewKind,
    data.jepRenderSettings,
    data.renderSettings,
    updateNodeData,
  ]);

  useEffect(() => {
    if (jepViewKind !== "light" || activeJepLight) return;
    const fallbackKey = cameraViewKey(jepCameras[0]?.id || "");
    updateNodeData(id, {
      jepActiveViewKey: fallbackKey,
      jepViewKind: "camera",
    });
  }, [jepViewKind, activeJepLight, jepCameras, id, updateNodeData]);

  const highlightSceneObjectId = useMemo(() => {
    const raw = modelNode?.data as { selectedSceneObjectId?: string };
    const id = raw?.selectedSceneObjectId?.trim();
    return id || null;
  }, [modelNode?.data]);

  const sceneObjectMaterialsKey = useMemo(() => {
    const data = modelNode?.data as {
      sceneObjectMaterials?: Record<string, string>;
      sceneObjectMaterialsVersion?: string;
    };
    return JSON.stringify({
      assignments: data?.sceneObjectMaterials ?? {},
      version: data?.sceneObjectMaterialsVersion ?? "",
    });
  }, [modelNode?.data]);

  const assignedMaterialNodeId = useMemo(() => {
    if (!highlightSceneObjectId || !modelNode) return null;
    const assignments = (
      modelNode.data as { sceneObjectMaterials?: Record<string, string> }
    )?.sceneObjectMaterials;
    return assignments?.[highlightSceneObjectId] ?? null;
  }, [highlightSceneObjectId, sceneObjectMaterialsKey, modelNode]);

  const assignedMaterialNodeDataKey = useMemo(() => {
    if (!assignedMaterialNodeId) return "";
    const node = nodes.find((n) => n.id === assignedMaterialNodeId);
    return node ? JSON.stringify(node.data) : "";
  }, [assignedMaterialNodeId, nodes]);

  const highlightSubmeshMaterial = useMemo(() => {
    if (!assignedMaterialNodeId) return null;
    return viewportMaterialForSceneObject(
      assignedMaterialNodeId,
      getNodes(),
      getEdges(),
    );
  }, [assignedMaterialNodeId, assignedMaterialNodeDataKey, getNodes, getEdges]);

  const assignedSubmeshMaterials = useMemo(() => {
    if (!modelNode) return [];
    const assignments = (
      modelNode.data as { sceneObjectMaterials?: Record<string, string> }
    )?.sceneObjectMaterials;
    if (!assignments) return [];
    const out: AssignedSubmeshMaterialPreview[] = [];
    for (const [objectId, materialNodeId] of Object.entries(assignments)) {
      if (!materialNodeId?.trim()) continue;
      const mat =
        viewportMaterialForSceneObject(
          materialNodeId,
          getNodes(),
          getEdges(),
        ) ?? { tint: "#cccccc", roughness: 0.5, metalness: 0, specular: 0.5 };
      out.push({
        objectId,
        tint: mat.tint || "#cccccc",
        roughness: mat.roughness,
        metalness: mat.metalness,
        specular: mat.specular,
        clearcoat: mat.clearcoat,
        transmission: mat.transmission,
        emissionStrength: mat.emissionStrength,
      });
    }
    return out;
  }, [modelNode, sceneObjectMaterialsKey, nodes, getNodes, getEdges]);
  const hasPerObjectViewportMaterial = assignedSubmeshMaterials.length > 0;

  /** 选中反馈由原生引擎描边通道绘制，不再整片填充高亮 */
  const viewportSelectionHighlightMaterial = null;

  const [materialPreviewRevision, setMaterialPreviewRevision] = useState(0);
  useEffect(() => {
    setMaterialPreviewRevision((value) => value + 1);
  }, [sceneObjectMaterialsKey]);

  const handleViewportSceneObjectPick = useCallback(
    (objectId: string | null) => {
      if (!modelNode) return;
      const objects =
        (modelNode.data as { sceneObjects?: SceneObjectEntry[] })
          ?.sceneObjects ?? [];
      if (!objectId) {
        updateNodeData(modelNode.id, {
          selectedSceneObjectId: undefined,
          selectedSceneObjectName: undefined,
        });
        dispatchSceneObjectSelection({ nodeId: modelNode.id, object: null });
        return;
      }
      const entry = objects.find((row) => row.id === objectId);
      if (entry) {
        updateNodeData(modelNode.id, {
          selectedSceneObjectId: entry.id,
          selectedSceneObjectName: entry.name,
        });
        dispatchSceneObjectSelection({ nodeId: modelNode.id, object: entry });
        return;
      }
      const scenePath =
        (modelNode.data as { nativeScenePath?: string } | undefined)
          ?.nativeScenePath?.trim() || "";
      if (!scenePath) return;
      void fetchSceneObjectList(scenePath).then((freshObjects) => {
        if (freshObjects.length === 0) return;
        updateNodeData(modelNode.id, { sceneObjects: freshObjects });
        const resolved = freshObjects.find((row) => row.id === objectId);
        if (!resolved) return;
        updateNodeData(modelNode.id, {
          selectedSceneObjectId: resolved.id,
          selectedSceneObjectName: resolved.name,
        });
        dispatchSceneObjectSelection({
          nodeId: modelNode.id,
          object: resolved,
        });
      });
    },
    [modelNode, updateNodeData],
  );

  const activeGlb =
    editorPipeline.model?.glbUrl ||
    data.texturedModel?.glbUrl ||
    (data.sceneData as { glbUrl?: string } | undefined)?.glbUrl ||
    "";
  const sceneDataRecord = data.sceneData as
    | {
        glbUrl?: string;
        nativeScenePath?: string;
        modelName?: string;
        blendImported?: boolean;
      }
    | undefined;
  const activeModelName =
    editorPipeline.model?.modelName ||
    sceneDataRecord?.modelName ||
    (sceneDataRecord?.nativeScenePath
      ? sceneDataRecord.nativeScenePath.split(/[/\\]/).pop()
      : undefined) ||
    (data.texturedModel as { modelName?: string } | undefined)?.modelName ||
    "";
  const activeMaterial = editorPipeline.materialPreview;
  const activeCyclesMaterial = editorPipeline.cyclesMaterial;
  const effectiveCyclesMaterialForRender = useMemo(
    () => activeCyclesMaterial || createCyclesMaterial(activeMaterial || {}),
    [activeCyclesMaterial, activeMaterial],
  );
  const cyclesMaterialRenderKey = useMemo(() => {
    return JSON.stringify(effectiveCyclesMaterialForRender);
  }, [effectiveCyclesMaterialForRender]);
  const activeViewportMaterial = useMemo(
    () =>
      effectiveCyclesMaterialForRender
        ? cyclesToViewportMaterial({ cyclesMaterial: effectiveCyclesMaterialForRender })
        : null,
    [cyclesMaterialRenderKey],
  );
  const previewUsesNativeMaterial =
    viewportMode === "preview" && !!activeViewportMaterial;

  const [debouncedCyclesMaterialKey, setDebouncedCyclesMaterialKey] =
    useState(cyclesMaterialRenderKey);
  const cyclesMaterialDebounceFirstRef = useRef(true);
  useEffect(() => {
    if (viewportMode !== "render") {
      cyclesMaterialDebounceFirstRef.current = true;
      setDebouncedCyclesMaterialKey(cyclesMaterialRenderKey);
      return;
    }
    const delay = cyclesMaterialDebounceFirstRef.current ? 0 : 480;
    cyclesMaterialDebounceFirstRef.current = false;
    const timer = window.setTimeout(() => {
      setDebouncedCyclesMaterialKey(cyclesMaterialRenderKey);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [cyclesMaterialRenderKey, viewportMode]);

  const glbToRender = activeGlb || "";
  const blendSourcePath =
    editorPipeline.model?.blendSourcePath ||
    (data.blendSourcePath as string | undefined) ||
    "";
  const {
    scenePath: resolvedScenePath,
    resolving: scenePathResolving,
    error: scenePathError,
  } = useDesktopScenePath(getLocalUserId(), {
    nativeScenePath:
      editorPipeline.model?.nativeScenePath || sceneDataRecord?.nativeScenePath,
    localAssetPath:
      editorPipeline.model?.nativeScenePath ||
      sceneDataRecord?.nativeScenePath,
    glbUrl: glbToRender,
    modelName: activeModelName,
    projectId: getCurrentProjectId(),
  });

  const hasNativeScene = isDesktopApp() && !!resolvedScenePath;
  const [viewportResetToken, setViewportResetToken] = useState(0);

  useEffect(() => {
    sceneCameraFramedRef.current = false;
  }, [resolvedScenePath]);

  const showLiveViewport = hasNativeScene && (inLightView || renderActive);
  const showPausedOverlay = hasNativeScene && !inLightView && !renderActive;
  const jepViewportLiveRender = inLightView || (renderActive && !inLightView);
  const jepViewportShading = inLightView
    ? "clay"
    : previewUsesNativeMaterial && !hasPerObjectViewportMaterial
      ? "render"
      : "clay";
  const jepViewportMaterial =
    inLightView || hasPerObjectViewportMaterial
      ? null
      : previewUsesNativeMaterial
        ? activeViewportMaterial
        : null;
  const jepAssignedSubmeshMaterials = inLightView ? [] : assignedSubmeshMaterials;

  // Position, Rotation, Scale configurations
  const [transform, setTransform] = useState({
    x: 0,
    y: -0.5,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    scale: 2.0
  });

  // Lighting configurations
  const [lights, setLights] = useState({
    ambient: 1.0,
    directional: 2.0,
    dirX: 5,
    dirY: 5,
    dirZ: 5,
    yaw: 45,
    pitch: 35,
    exposure: 1.0,
    environment: 1.0,
    areaSize: 4.0,
  });
  const [renderSettings, setRenderSettings] = useState({
    samples: 128,
    bounces: 8,
    denoise: true,
    engine: "jepow-cl-preview",
  });
  const initialCyclesViewportCamera = useMemo(() => {
    const fromNode = data.cyclesViewportCamera as ViewportCamera | undefined;
    const fromScene = (data.sceneData as { viewportCamera?: ViewportCamera } | undefined)
      ?.viewportCamera;
    return { ...DEFAULT_CYCLES_VIEWPORT_CAMERA, ...fromScene, ...fromNode };
  }, []);
  const [viewportCamera, setViewportCamera] = useState<ViewportCamera>(
    initialCyclesViewportCamera,
  );
  const viewportCameraRef = useRef<ViewportCamera>(initialCyclesViewportCamera);
  const cameraVersionRef = useRef(0);
  const [cameraVersion, setCameraVersion] = useState(0);
  const [cyclesFrame, setCyclesFrame] = useState<{
    status: "idle" | "rendering" | "done" | "error";
    previewDataUrl?: string;
    error?: string;
    detail?: string;
    renderSeconds?: number;
    cameraVersion?: number;
  }>({ status: "idle" });
  const [viewportInteracting, setViewportInteracting] = useState(false);
  const viewportInteractingRef = useRef(false);
  const viewportInteractionTimerRef = useRef<number | null>(null);
  const cyclesRenderSeqRef = useRef(0);
  const activeCyclesSessionRef = useRef<string | null>(null);
  const lastCyclesSessionPatchKeyRef = useRef("");
  const lastCameraChangeAtRef = useRef(0);
  const cyclesCameraPatchTimerRef = useRef<number | null>(null);
  const cyclesCameraSettleTimerRef = useRef<number | null>(null);
  const persistCameraTimerRef = useRef<number | null>(null);
  const sceneCameraFramedRef = useRef(false);
  const cyclesPatchInFlightRef = useRef(false);
  const cyclesCameraPatchEpochRef = useRef(0);
  const cyclesPatchQueuedRef = useRef(false);
  const pendingCameraRenderRef = useRef(false);
  const cyclesInteractLoopRef = useRef<number | null>(null);
  const lastInteractLoopCameraVersionRef = useRef(-1);
  const lastInteractLoopFlushAtRef = useRef(0);
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewportPixelSize, setViewportPixelSize] = useState({ width: 640, height: 360 });

  const connectedCyclesLight = editorPipeline.cyclesLight as {
    type?: string;
    lightKind?: string;
    yaw?: number;
    pitch?: number;
    keyStrength?: number;
    environmentStrength?: number;
  } | null;
  const connectedCyclesSettings = editorPipeline.cyclesRenderSettings as {
    samples?: number;
    bounces?: number;
    width?: number;
    height?: number;
    device?: string;
    denoise?: boolean;
  } | null;
  const connectedCyclesCamera = editorPipeline.cyclesCamera as
    | (ViewportCamera & {
        type?: "perspective" | "orthograph" | "panorama";
        fov?: number;
        aperturesize?: number;
        focaldistance?: number;
        blades?: number;
        bladesrotation?: number;
        nearclip?: number;
        farclip?: number;
      })
    | null;
  const effectiveRenderSettings = useMemo(() => {
    const merged = {
      ...renderSettings,
      ...(connectedCyclesSettings || {}),
    };
    const device = connectedCyclesSettings
      ? connectedCyclesSettings.device === "CPU"
        ? "CPU"
        : "METAL"
      : "METAL";
    return {
      ...merged,
      device,
      width: merged.width == null || merged.width === 768 ? 2048 : merged.width,
      height: merged.height == null || merged.height === 512 ? 1536 : merged.height,
    };
  }, [renderSettings, connectedCyclesSettings]);
  const renderSettingsKey = useMemo(
    () => JSON.stringify(effectiveRenderSettings),
    [effectiveRenderSettings],
  );

  const effectiveCyclesLight = useMemo(
    () => buildCyclesLightPayload(lights, connectedCyclesLight),
    [lights, connectedCyclesLight],
  );
  const cyclesLightKey = useMemo(
    () => JSON.stringify(effectiveCyclesLight),
    [effectiveCyclesLight],
  );

  const effectiveCyclesCamera = useMemo(
    () => ({
      ...(connectedCyclesCamera || {}),
      // Cycles viewport must follow the interactive 3D preview camera exactly.
      // Camera nodes only contribute optical parameters such as fov/aperture.
      yaw: viewportCamera.yaw,
      pitch: viewportCamera.pitch,
      distance: viewportCamera.distance,
      panX: viewportCamera.panX,
      panY: viewportCamera.panY,
      panZ: viewportCamera.panZ,
      fov: connectedCyclesCamera?.fov ?? viewportCamera.fov ?? Math.PI / 4,
    }),
    [viewportCamera, connectedCyclesCamera],
  );
  const effectiveViewportCamera = useMemo(() => {
    const fovFromJep = activeJepCamera
      ? focalLengthToFovRad(
          activeJepCamera.focalLengthMm,
          activeJepCamera.sensorWidthMm,
        )
      : undefined;
    return {
      ...viewportCamera,
      fov:
        connectedCyclesCamera?.fov ??
        (jepViewKind === "camera" ? fovFromJep : undefined) ??
        viewportCamera.fov ??
        Math.PI / 4,
    };
  }, [
    viewportCamera,
    connectedCyclesCamera?.fov,
    activeJepCamera,
    jepViewKind,
  ]);

  useEffect(() => {
    if (jepViewKind !== "camera" || !activeJepCamera) return;
    const fov = focalLengthToFovRad(
      activeJepCamera.focalLengthMm,
      activeJepCamera.sensorWidthMm,
    );
    if (Math.abs((viewportCameraRef.current.fov ?? 0) - fov) < 0.0001) return;
    const next = { ...viewportCameraRef.current, fov };
    viewportCameraRef.current = next;
    setViewportCamera(next);
  }, [activeJepCamera?.focalLengthMm, activeJepCamera?.id, jepViewKind]);

  const switchJepView = useCallback(
    (nextKey: string) => {
      const currentKey = String(
        data.jepActiveViewKey || cameraViewKey(jepCameras[0]?.id || ""),
      );
      const viewStates = {
        ...((data.jepViewStates as Record<string, ViewportCamera> | undefined) ||
          {}),
      };
      viewStates[currentKey] = { ...viewportCameraRef.current };
      const parsed = parseJepViewKey(nextKey);
      const nextCam =
        parsed?.kind === "camera"
          ? jepCameras.find((c) => c.id === parsed.id)
          : null;
      const stored = viewStates[nextKey] || DEFAULT_CYCLES_VIEWPORT_CAMERA;
      const nextViewport: ViewportCamera = {
        ...stored,
        fov: nextCam
          ? focalLengthToFovRad(nextCam.focalLengthMm, nextCam.sensorWidthMm)
          : (stored.fov ?? DEFAULT_CYCLES_VIEWPORT_CAMERA.fov),
      };
      viewportCameraRef.current = nextViewport;
      setViewportCamera(nextViewport);
      updateNodeData(id, {
        jepViewStates: viewStates,
        jepActiveViewKey: nextKey,
        jepViewKind: parsed?.kind === "light" ? "light" : "camera",
        cyclesViewportCamera: nextViewport,
      });
    },
    [data.jepActiveViewKey, data.jepViewStates, id, jepCameras, updateNodeData],
  );
  const getLiveCyclesCamera = (): ViewportCamera => {
    const cam = viewportCameraRef.current;
    return {
      ...(connectedCyclesCamera || {}),
      yaw: cam.yaw,
      pitch: cam.pitch,
      distance: cam.distance,
      panX: cam.panX,
      panY: cam.panY,
      panZ: cam.panZ,
      fov: connectedCyclesCamera?.fov ?? cam.fov ?? Math.PI / 4,
    };
  };

  const persistCyclesViewportCamera = (cam: ViewportCamera) => {
    if (persistCameraTimerRef.current != null) {
      window.clearTimeout(persistCameraTimerRef.current);
    }
    persistCameraTimerRef.current = window.setTimeout(() => {
      persistCameraTimerRef.current = null;
      const activeKey = String(
        data.jepActiveViewKey || cameraViewKey(jepCameras[0]?.id || ""),
      );
      const viewStates = {
        ...((data.jepViewStates as Record<string, ViewportCamera> | undefined) ||
          {}),
        [activeKey]: cam,
      };
      updateNodeData(id, {
        cyclesViewportCamera: cam,
        jepViewStates: viewStates,
      });
    }, 280);
  };

  const cyclesWantsInteractivePatch = () =>
    viewportInteractingRef.current ||
    Date.now() - lastCameraChangeAtRef.current < 2800;

  const applyCyclesFrameUpdate = (res: {
    previewDataUrl?: string;
    renderSeconds?: number;
    ok?: boolean;
    cameraVersion?: number;
  }) => {
    if (!res?.ok || !res.previewDataUrl) return false;
    if (
      res.cameraVersion != null &&
      Number(res.cameraVersion) !== cameraVersionRef.current
    ) {
      return false;
    }
    setCyclesFrame({
      status: "rendering",
      previewDataUrl: res.previewDataUrl,
      cameraVersion: Number(res.cameraVersion ?? cameraVersionRef.current),
      renderSeconds: res.renderSeconds,
      error: undefined,
      detail: undefined,
    });
    return true;
  };

  const flushCyclesCameraPatch = async (quality: "interactive" | "final") => {
    if (viewportMode !== "render" || !renderActive || hasPerObjectViewportMaterial) return;
    const sessionId = activeCyclesSessionRef.current;
    if (!sessionId) {
      pendingCameraRenderRef.current = true;
      return;
    }
    const patchEpoch = cyclesCameraPatchEpochRef.current;
    if (cyclesPatchInFlightRef.current) {
      cyclesPatchQueuedRef.current = true;
      pendingCameraRenderRef.current = true;
      return;
    }
    const stableRenderSettings = JSON.parse(renderSettingsKey);
    const target = getCyclesViewportTarget(
      Number(stableRenderSettings.width) || 2048,
      Number(stableRenderSettings.height) || 1536,
      Math.max(16, Number(stableRenderSettings.samples) || 32),
      stableRenderSettings.device,
      quality,
      viewportPixelSize,
    );
    const cam = getLiveCyclesCamera();
    const patchKey = JSON.stringify({
      camera: cam,
      width: target.width,
      height: target.height,
      samples: target.samples,
      cameraVersion: cameraVersionRef.current,
      quality,
    });
    if (lastCyclesSessionPatchKeyRef.current === patchKey) return;
    lastCyclesSessionPatchKeyRef.current = patchKey;
    cyclesPatchInFlightRef.current = true;
    const sentCameraVersion = cameraVersionRef.current;
    try {
      if (patchEpoch !== cyclesCameraPatchEpochRef.current) return;
      const engine = getViewportEngine();
      const update = (await engine.updateCyclesSession?.(sessionId, {
        camera: cam,
        width: target.width,
        height: target.height,
        samples: target.samples,
        renderSettings: stableRenderSettings,
        cameraVersion: cameraVersionRef.current,
      } as any)) as {
        frame?: {
          previewDataUrl?: string;
          ok?: boolean;
          renderSeconds?: number;
          cameraVersion?: number;
        };
        frameCaptured?: boolean;
      };
      if (patchEpoch !== cyclesCameraPatchEpochRef.current) return;
      const patchFrame = update?.frame;
      if (
        patchFrame &&
        (update?.frameCaptured || patchFrame.cameraVersion === cameraVersionRef.current) &&
        applyCyclesFrameUpdate(patchFrame)
      ) {
        return;
      }
      if (patchEpoch !== cyclesCameraPatchEpochRef.current) return;
      const state = (await engine.readCyclesSession?.(sessionId)) as {
        frame?: {
          previewDataUrl?: string;
          ok?: boolean;
          renderSeconds?: number;
          cameraVersion?: number;
        };
      };
      if (state?.frame) applyCyclesFrameUpdate(state.frame);
    } finally {
      cyclesPatchInFlightRef.current = false;
      const needsLatestCameraPatch =
        cyclesPatchQueuedRef.current || sentCameraVersion !== cameraVersionRef.current;
      cyclesPatchQueuedRef.current = false;
      pendingCameraRenderRef.current = needsLatestCameraPatch;
      if (
        needsLatestCameraPatch &&
        viewportMode === "render" &&
        renderActive &&
        !hasPerObjectViewportMaterial
      ) {
        lastCyclesSessionPatchKeyRef.current = "";
        scheduleCyclesCameraPatch(
          cyclesWantsInteractivePatch() ? "interactive" : "final",
          0,
        );
      }
    }
  };

  const scheduleCyclesCameraPatch = (
    quality: "interactive" | "final",
    delayMs = 28,
  ) => {
    if (cyclesCameraPatchTimerRef.current != null) {
      window.clearTimeout(cyclesCameraPatchTimerRef.current);
    }
    cyclesCameraPatchTimerRef.current = window.setTimeout(() => {
      cyclesCameraPatchTimerRef.current = null;
      void flushCyclesCameraPatch(quality);
    }, delayMs);
  };

  useEffect(() => {
    if (viewportMode !== "render" || hasPerObjectViewportMaterial) return;
    const live = getLiveCyclesCamera();
    viewportCameraRef.current = {
      ...viewportCameraRef.current,
      fov: live.fov,
    };
    setViewportCamera((prev) => ({ ...prev, fov: live.fov }));
    lastCyclesSessionPatchKeyRef.current = "";
    scheduleCyclesCameraPatch("interactive", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportMode, hasPerObjectViewportMaterial]);

  const handleViewportCameraChange = (next: ViewportCamera) => {
    const current = viewportCameraRef.current;
    const changed =
      Math.abs((current.yaw ?? 0) - (next.yaw ?? 0)) > 0.0001 ||
      Math.abs((current.pitch ?? 0) - (next.pitch ?? 0)) > 0.0001 ||
      Math.abs((current.distance ?? 0) - (next.distance ?? 0)) > 0.0001 ||
      Math.abs((current.panX ?? 0) - (next.panX ?? 0)) > 0.0001 ||
      Math.abs((current.panY ?? 0) - (next.panY ?? 0)) > 0.0001 ||
      Math.abs((current.panZ ?? 0) - (next.panZ ?? 0)) > 0.0001 ||
      Math.abs((current.fov ?? Math.PI / 4) - (next.fov ?? Math.PI / 4)) > 0.0001;
    viewportCameraRef.current = next;
    setViewportCamera(next);
    const nextCameraVersion = changed ? cameraVersionRef.current + 1 : cameraVersionRef.current;
    if (changed) {
      cameraVersionRef.current = nextCameraVersion;
      setCameraVersion(nextCameraVersion);
      lastCameraChangeAtRef.current = Date.now();
      persistCyclesViewportCamera(next);
      if (viewportMode === "render" && !hasPerObjectViewportMaterial) {
        cyclesCameraPatchEpochRef.current += 1;
        pendingCameraRenderRef.current = true;
        lastCyclesSessionPatchKeyRef.current = "";
        setCyclesFrame((prev) => ({
          ...prev,
          status: "rendering",
          previewDataUrl: undefined,
          cameraVersion: nextCameraVersion,
          error: undefined,
          detail: "正在同步视角…",
        }));
        scheduleCyclesCameraPatch("interactive", 0);
        if (cyclesCameraSettleTimerRef.current != null) {
          window.clearTimeout(cyclesCameraSettleTimerRef.current);
        }
        cyclesCameraSettleTimerRef.current = window.setTimeout(() => {
          cyclesCameraSettleTimerRef.current = null;
          if (!cyclesWantsInteractivePatch()) {
            scheduleCyclesCameraPatch("final", 0);
          }
        }, 850);
      }
    }
    if (!changed) {
      persistCyclesViewportCamera(next);
    }
  };
  const handleViewportInteractingChange = (interacting: boolean) => {
    if (viewportInteractionTimerRef.current != null) {
      window.clearTimeout(viewportInteractionTimerRef.current);
      viewportInteractionTimerRef.current = null;
    }
    viewportInteractingRef.current = interacting;
    setViewportInteracting(interacting);
    if (interacting && viewportMode === "render" && !hasPerObjectViewportMaterial) {
      lastCyclesSessionPatchKeyRef.current = "";
      scheduleCyclesCameraPatch("interactive", 0);
      viewportInteractionTimerRef.current = window.setTimeout(() => {
        viewportInteractionTimerRef.current = null;
        viewportInteractingRef.current = false;
        setViewportInteracting(false);
        scheduleCyclesCameraPatch("final", 80);
      }, 700);
    } else if (!interacting && viewportMode === "render" && !hasPerObjectViewportMaterial) {
      lastCyclesSessionPatchKeyRef.current = "";
      scheduleCyclesCameraPatch("final", 0);
    }
  };

  useEffect(() => {
    if (
      viewportMode !== "render" ||
      !renderActive ||
      !viewportInteracting ||
      hasPerObjectViewportMaterial
    ) {
      if (cyclesInteractLoopRef.current != null) {
        window.clearInterval(cyclesInteractLoopRef.current);
        cyclesInteractLoopRef.current = null;
      }
      return;
    }
    cyclesInteractLoopRef.current = window.setInterval(() => {
      const cameraVersionNow = cameraVersionRef.current;
      const hasNewCamera =
        cameraVersionNow !== lastInteractLoopCameraVersionRef.current;
      const hasQueuedPatch =
        pendingCameraRenderRef.current || cyclesPatchQueuedRef.current;
      if (!hasNewCamera && !hasQueuedPatch) return;

      const now = Date.now();
      if (now - lastInteractLoopFlushAtRef.current < 140) return;
      lastInteractLoopCameraVersionRef.current = cameraVersionNow;
      lastInteractLoopFlushAtRef.current = now;
      void flushCyclesCameraPatch("interactive");
    }, 120);
    return () => {
      if (cyclesInteractLoopRef.current != null) {
        window.clearInterval(cyclesInteractLoopRef.current);
        cyclesInteractLoopRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    viewportMode,
    renderActive,
    viewportInteracting,
    cameraVersion,
    hasPerObjectViewportMaterial,
  ]);

  useEffect(
    () => () => {
      if (viewportInteractionTimerRef.current != null) {
        window.clearTimeout(viewportInteractionTimerRef.current);
      }
      if (cyclesCameraPatchTimerRef.current != null) {
        window.clearTimeout(cyclesCameraPatchTimerRef.current);
      }
      if (cyclesCameraSettleTimerRef.current != null) {
        window.clearTimeout(cyclesCameraSettleTimerRef.current);
      }
      if (persistCameraTimerRef.current != null) {
        window.clearTimeout(persistCameraTimerRef.current);
      }
      if (cyclesInteractLoopRef.current != null) {
        window.clearInterval(cyclesInteractLoopRef.current);
      }
    },
    [],
  );

  const nativeLighting = useMemo(() => {
    if (inLightView && activeJepLight) {
      return cyclesLightToViewportLighting(
        activeJepLight.cyclesLight,
        jepRenderSettings.exposure,
      );
    }
    if (connectedJepLights.length > 0) {
      return mergeLightsForCameraView(
        connectedJepLights,
        jepRenderSettings.exposure,
      );
    }
    return {
      type: String(connectedCyclesLight?.type ?? connectedCyclesLight?.lightKind ?? ""),
      yaw: Number(connectedCyclesLight?.yaw ?? lights.yaw),
      pitch: Number(connectedCyclesLight?.pitch ?? lights.pitch),
      ambient: lights.ambient,
      directional:
        connectedCyclesLight?.keyStrength != null
          ? Math.max(0, Number(connectedCyclesLight.keyStrength) / 325)
          : lights.directional,
      exposure: jepRenderSettings.exposure,
      environment: Number(
        connectedCyclesLight?.environmentStrength ?? lights.environment,
      ),
    };
  }, [
    inLightView,
    activeJepLight,
    connectedJepLights,
    jepRenderSettings.exposure,
    connectedCyclesLight,
    lights.yaw,
    lights.pitch,
    lights.ambient,
    lights.directional,
    lights.environment,
  ]);
  const nativeLightingKey = useMemo(
    () => JSON.stringify(nativeLighting),
    [nativeLighting],
  );
  const transformKey = useMemo(() => JSON.stringify(transform), [transform]);

  const cameraYawDeg = Math.round(
    THREE.MathUtils.radToDeg(viewportCamera.yaw ?? 0.55),
  );
  const cameraPitchDeg = Math.round(
    THREE.MathUtils.radToDeg(viewportCamera.pitch ?? 0.38),
  );
  const updateCyclesOrbitCamera = (patch: Partial<ViewportCamera>) => {
    handleViewportCameraChange({
      ...viewportCameraRef.current,
      ...patch,
    });
  };

  const updateLightAngle = (newYaw: number, newPitch: number) => {
    const radius = 8.6;
    const yawRad = THREE.MathUtils.degToRad(newYaw);
    const pitchRad = THREE.MathUtils.degToRad(newPitch);
    const x = radius * Math.cos(pitchRad) * Math.sin(yawRad);
    const y = radius * Math.sin(pitchRad);
    const z = radius * Math.cos(pitchRad) * Math.cos(yawRad);
    setLights((prev) => ({
      ...prev,
      yaw: newYaw,
      pitch: newPitch,
      dirX: x,
      dirY: y,
      dirZ: z
    }));
  };

  // 同步 sceneData 给独立渲染节点；材质只写入稳定 JSON 快照，避免 shaderGraph 对象引用触发循环。
  const sceneDataSyncKey = useMemo(
    () =>
      JSON.stringify({
        glbUrl: glbToRender,
        scenePath: resolvedScenePath,
        blendSourcePath,
        jepRenderer: "JEP",
        jepRenderMode: "physical-preview",
        transform,
        lights,
        renderSettings,
        cyclesLight: connectedCyclesLight,
        cyclesCamera: connectedCyclesCamera,
        cyclesMaterial: JSON.parse(cyclesMaterialRenderKey),
      }),
    [
      glbToRender,
      resolvedScenePath,
      blendSourcePath,
      transform,
      lights,
      renderSettings,
      connectedCyclesLight,
      connectedCyclesCamera,
      cyclesMaterialRenderKey,
    ],
  );
  const sceneDataSyncRef = useRef<string>("");
  useEffect(() => {
    if (sceneDataSyncRef.current === sceneDataSyncKey) return;
    sceneDataSyncRef.current = sceneDataSyncKey;
    updateNodeData(id, {
      sceneData: {
        glbUrl: glbToRender,
        scenePath: resolvedScenePath,
        blendSourcePath,
        jepRenderer: "JEP",
        jepRenderMode: "physical-preview",
        transform,
        lights,
        renderSettings,
        cyclesLight: connectedCyclesLight,
        cyclesCamera: connectedCyclesCamera,
        cyclesMaterial: JSON.parse(cyclesMaterialRenderKey),
      },
    });
  }, [
    sceneDataSyncKey,
    glbToRender,
    resolvedScenePath,
    blendSourcePath,
    transform,
    lights,
    renderSettings,
    connectedCyclesLight,
    connectedCyclesCamera,
    cyclesMaterialRenderKey,
    updateNodeData,
    id,
  ]);

  useEffect(() => {
    if (viewportMode !== "render" || hasPerObjectViewportMaterial) {
      setCyclesFrame({ status: "idle" });
    }
  }, [viewportMode, hasPerObjectViewportMaterial]);

  useEffect(() => {
    if (
      viewportMode !== "render" ||
      !renderActive ||
      !effectiveCyclesMaterialForRender ||
      hasPerObjectViewportMaterial
    ) return;
    let cancelled = false;
    let pollTimer: number | null = null;
    const seq = cyclesRenderSeqRef.current + 1;
    cyclesRenderSeqRef.current = seq;

    const applyCyclesResult = (
      res: any,
      finalFrame: boolean,
      frameCameraVersion = cameraVersionRef.current,
    ) => {
      if (cancelled || cyclesRenderSeqRef.current !== seq) return false;
      if (frameCameraVersion !== cameraVersionRef.current) {
        return false;
      }
      const previewDataUrl = res.previewDataUrl as string | undefined;
      const triCount = Number((res as { triangleCount?: number }).triangleCount ?? 0);
      if (res.ok && previewDataUrl) {
        if ((res as { convertedScene?: boolean }).convertedScene && triCount <= 0) {
          setCyclesFrame({
            status: "error",
            error: "模型导出无三角面，请检查 FBX/GLB 文件",
          });
          return false;
        }
        const lumMax = Number((res as { luminanceMax?: number }).luminanceMax ?? 255);
        const lumSpan = Number(
          (res as { luminanceSpan?: number }).luminanceSpan ??
            lumMax - Number((res as { luminanceMin?: number }).luminanceMin ?? 0),
        );
        setCyclesFrame({
          status: finalFrame ? "done" : "rendering",
          previewDataUrl,
          renderSeconds: res.renderSeconds,
          cameraVersion: frameCameraVersion,
          error: undefined,
        });
        return true;
      }
      setCyclesFrame({
        status: "error",
        cameraVersion: frameCameraVersion,
        error:
          res.error ||
          (res as { stderr?: string }).stderr?.slice(-200) ||
          "Cycles 渲染失败",
      });
      return false;
    };

    const timer = window.setTimeout(async () => {
      setCyclesFrame((prev) => ({
        ...prev,
        status: "rendering",
        error: undefined,
        detail: "jepow-cycles 渲染中...",
      }));

      const engine = getViewportEngine();
      if (!engine.renderCyclesFrame && !engine.startCyclesSession) {
        setCyclesFrame({ status: "error", error: "Cycles 渲染入口不可用（请 npm run native:cycles:build）" });
        return;
      }
      const scenePath = resolvedScenePath || "";
      if (!scenePath) {
        setCyclesFrame({ status: "error", error: "未找到可渲染的场景路径" });
        return;
      }

      const stableCyclesMaterial = cyclesMaterialForCyclesSession(
        JSON.parse(debouncedCyclesMaterialKey) as CyclesMaterial,
      );
      const stableNativeLighting = JSON.parse(nativeLightingKey);
      const stableTransform = JSON.parse(transformKey);
      const baseRequest = {
        scenePath,
        blendPath: blendSourcePath || (scenePath.endsWith(".blend") ? scenePath : ""),
        blendSourcePath,
        material: stableCyclesMaterial as any,
        cyclesMaterial: stableCyclesMaterial,
        renderSettings: JSON.parse(renderSettingsKey),
        cyclesLight: JSON.parse(cyclesLightKey),
        camera: getLiveCyclesCamera(),
        lighting: stableNativeLighting,
        transform: stableTransform,
        device: effectiveRenderSettings.device,
      } as any;
      const stableRenderSettings = JSON.parse(renderSettingsKey);
      const finalWidth = Number(stableRenderSettings.width) || 2048;
      const finalHeight = Number(stableRenderSettings.height) || 1536;
      const finalSamples = Math.max(16, Number(stableRenderSettings.samples) || 32);
      const interactiveTarget = getCyclesViewportTarget(
        finalWidth,
        finalHeight,
        finalSamples,
        stableRenderSettings.device || effectiveRenderSettings.device,
        "interactive",
        viewportPixelSize,
      );
      const sessionCameraVersion = cameraVersionRef.current;

      try {
        if (engine.startCyclesSession && engine.readCyclesSession) {
          const currentCamera = getLiveCyclesCamera();
          const start = await engine.startCyclesSession({
            ...baseRequest,
            camera: currentCamera,
            width: interactiveTarget.width,
            height: interactiveTarget.height,
            samples: interactiveTarget.samples,
            cameraVersion: sessionCameraVersion,
          } as any);
          if (cancelled || cyclesRenderSeqRef.current !== seq) return;
          const sessionId = String((start as { sessionId?: string }).sessionId || "");
          if (!start.ok || !sessionId) {
            applyCyclesResult(start, true);
            return;
          }
          activeCyclesSessionRef.current = sessionId;
          lastCyclesSessionPatchKeyRef.current = JSON.stringify({
            camera: currentCamera,
            width: interactiveTarget.width,
            height: interactiveTarget.height,
            samples: interactiveTarget.samples,
            cameraVersion: sessionCameraVersion,
          });
          if (pendingCameraRenderRef.current) {
            lastCyclesSessionPatchKeyRef.current = "";
            scheduleCyclesCameraPatch("interactive", 0);
          }
          let lastFrameVersion = -1;
          let lastDaemonFrameVersion = -1;
          const poll = async () => {
            if (cancelled || cyclesRenderSeqRef.current !== seq || !activeCyclesSessionRef.current) return;
            const state = await engine.readCyclesSession!(activeCyclesSessionRef.current);
            if (cancelled || cyclesRenderSeqRef.current !== seq) return;
            const frame = (state as { frame?: any }).frame;
            if (!frame) {
              const debugStage = String((state as { debugStage?: string }).debugStage || state.status || "starting");
              const debugMessage = String((state as { debugMessage?: string }).debugMessage || "");
              setCyclesFrame((prev) => ({
                ...prev,
                status: "rendering",
                detail: debugMessage ? `${debugStage}: ${debugMessage}` : `Cycles ${debugStage}`,
              }));
            }
            const frameVersion = Number(frame?.frameVersion ?? 0);
            const daemonFrameVersion = Number(frame?.daemonFrameVersion ?? 0);
            const frameChanged =
              frame &&
              (frameVersion !== lastFrameVersion ||
                daemonFrameVersion !== lastDaemonFrameVersion);
            if (frameChanged) {
              lastFrameVersion = frameVersion;
              lastDaemonFrameVersion = daemonFrameVersion;
              applyCyclesResult(
                frame,
                frame.status === "done" || frame.stage === "final",
                Number(frame.cameraVersion ?? sessionCameraVersion),
              );
            }
            if (state.status === "error") {
              if (!frame) {
                setCyclesFrame({
                  status: "error",
                  cameraVersion: sessionCameraVersion,
                  error: (state as { error?: string }).error || "Cycles 渲染失败，未返回有效帧",
                });
              }
              return;
            }
            if (state.status === "done") return;
            const pollMs =
              Date.now() - lastCameraChangeAtRef.current < 3000 ? 120 : 300;
            pollTimer = window.setTimeout(poll, pollMs);
          };
          pollTimer = window.setTimeout(poll, 120);
          return;
        }

        const previewScale = Math.min(1, 384 / Math.max(finalWidth, finalHeight));
        const previewRes = await engine.renderCyclesFrame!({
          ...baseRequest,
          width: Math.max(192, Math.round(finalWidth * previewScale)),
          height: Math.max(128, Math.round(finalHeight * previewScale)),
          samples: Math.min(16, finalSamples),
          cameraVersion: sessionCameraVersion,
        } as any);
        const previewOk = applyCyclesResult(previewRes, false, sessionCameraVersion);
        if (!previewOk || cancelled || cyclesRenderSeqRef.current !== seq) return;

        const finalRes = await engine.renderCyclesFrame!({
          ...baseRequest,
          width: finalWidth,
          height: finalHeight,
          samples: finalSamples,
          cameraVersion: sessionCameraVersion,
        } as any);
        applyCyclesResult(finalRes, true, sessionCameraVersion);
      } catch (err: unknown) {
        if (cancelled || cyclesRenderSeqRef.current !== seq) return;
        setCyclesFrame({
          status: "error",
          error: err instanceof Error ? err.message : "Cycles 渲染失败",
        });
      }
    }, Date.now() - lastCameraChangeAtRef.current < 3000 ? 40 : 140);
    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearTimeout(pollTimer);
      if (activeCyclesSessionRef.current) {
        void getViewportEngine().stopCyclesSession?.(activeCyclesSessionRef.current);
        activeCyclesSessionRef.current = null;
      }
      lastCyclesSessionPatchKeyRef.current = "";
      window.clearTimeout(timer);
    };
  }, [
    viewportMode,
    renderActive,
    renderSettingsKey,
    cyclesLightKey,
    transformKey,
    resolvedScenePath,
    glbToRender,
    nativeLightingKey,
    viewportPixelSize,
    blendSourcePath,
    debouncedCyclesMaterialKey,
    hasPerObjectViewportMaterial,
  ]);

  useEffect(() => {
    if (
      viewportMode !== "render" ||
      !renderActive ||
      hasPerObjectViewportMaterial ||
      !activeCyclesSessionRef.current
    ) return;
    const quality = cyclesWantsInteractivePatch() ? "interactive" : "final";
    scheduleCyclesCameraPatch(quality, quality === "interactive" ? 40 : 320);
    return () => {
      if (cyclesCameraPatchTimerRef.current != null) {
        window.clearTimeout(cyclesCameraPatchTimerRef.current);
      }
    };
  }, [
    viewportMode,
    renderActive,
    renderSettingsKey,
    viewportInteracting,
    cameraVersion,
    viewportPixelSize,
    hasPerObjectViewportMaterial,
  ]);

  useEffect(() => {
    const el = viewportContainerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      setViewportPixelSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleResetTransforms = () => {
    setTransform({
      x: 0,
      y: -0.5,
      z: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      scale: 2.0,
    });
    setViewportResetToken((t) => t + 1);
  };

  const handleResetLights = () => {
    updateLightAngle(45, 35);
    setLights({
      ambient: 1.0,
      directional: 2.0,
      dirX: 5,
      dirY: 5,
      dirZ: 5,
      yaw: 45,
      pitch: 35,
      exposure: 1.0,
      environment: 1.0,
      areaSize: 4.0,
    });
  };

  const cyclesFrameMatchesCamera =
    viewportMode === "render" &&
    !hasPerObjectViewportMaterial &&
    !!cyclesFrame.previewDataUrl &&
    cyclesFrame.status !== "error" &&
    (cyclesFrame.cameraVersion == null ||
      cyclesFrame.cameraVersion === cameraVersion);

  const cyclesShowLiveNativeOverlay =
    viewportMode === "render" &&
    renderActive &&
    (viewportInteracting || !cyclesFrameMatchesCamera);

  const zoom = useStore((s) => s.transform[2]);
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );

  const usePerObjectViewportMaterial = hasPerObjectViewportMaterial;
  const modelInputMissing = hasNativeScene && !modelNode;

  const nodeSurfaceClass = `relative flex h-full min-h-0 min-w-0 flex-col bg-[#141414] font-sans text-white transition-all duration-200 ${
    viewportExpanded ? "rounded-xl" : "rounded-lg"
  } ${
    selected || viewportExpanded
      ? "shadow-[0_0_20px_rgba(147,51,234,0.4)] ring-2 ring-inset ring-purple-600"
      : "ring-1 ring-inset ring-neutral-800"
  }`;

  const nodeHandles = (
    <>
      <div className="absolute -top-[26px] left-1/2 -translate-x-1/2 z-[999] flex h-6 w-36 cursor-grab select-none items-center justify-center rounded border border-neutral-800/80 bg-neutral-900/90 shadow-xl backdrop-blur-md transition-all hover:border-neutral-700 active:cursor-grabbing group">
        <GripHorizontal className="h-4 w-4 text-purple-400 opacity-60 transition-opacity group-hover:opacity-100" />
      </div>
      {/* Visual Input / Output Connections — 始终挂在流程图节点上，避免全屏后入出点丢失 */}
      <Handle
        type="target"
        position={Position.Left}
        id="modelInput"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
        style={{ top: "35%" }}
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>
      <Handle
        type="target"
        position={Position.Left}
        id="material"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-[#a855f7] hover:!border-purple-400 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-purple-400 hover:text-white shadow-xl"
        style={{ top: "65%" }}
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>
      <Handle
        type="target"
        position={Position.Left}
        id="cyclesLight"
        className="!w-7 !h-7 !bg-[#2A2A2A] !border-[1.5px] !border-amber-500 hover:!border-amber-300 transition-all rounded-full !left-[-14px] z-[100] flex items-center justify-center text-amber-400 hover:text-white shadow-xl"
        style={{ top: "78%" }}
        title="接入 Cycles Light 节点"
      >
        <Plus className="w-4 h-4 pointer-events-none" />
      </Handle>
      <Handle
        type="target"
        position={Position.Left}
        id="cyclesCamera"
        className="!w-7 !h-7 !bg-[#2A2A2A] !border-[1.5px] !border-cyan-500 hover:!border-cyan-300 transition-all rounded-full !left-[-14px] z-[100] flex items-center justify-center text-cyan-400 hover:text-white shadow-xl"
        style={{ top: "84%" }}
        title="接入 Cycles Camera 节点"
      >
        <Plus className="w-4 h-4 pointer-events-none" />
      </Handle>
      <Handle
        type="target"
        position={Position.Left}
        id="cyclesSettings"
        className="!w-7 !h-7 !bg-[#2A2A2A] !border-[1.5px] !border-blue-500 hover:!border-blue-300 transition-all rounded-full !left-[-14px] z-[100] flex items-center justify-center text-blue-400 hover:text-white shadow-xl"
        style={{ top: "93%" }}
        title="接入 Cycles Render Settings 节点"
      >
        <Plus className="w-4 h-4 pointer-events-none" />
      </Handle>
      <Handle
        type="source"
        position={Position.Right}
        id="sceneData"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !right-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
        style={{ top: "50%" }}
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>
    </>
  );

  const nodeViewport = (
    <>
      {/* Main Workspace */}
      <div
        ref={viewportContainerRef}
        id={`canvas-container-${id}`}
        className={`${
          viewportExpanded
            ? "relative min-h-0 flex-1 w-full"
            : "absolute inset-0"
        } bg-neutral-950 overflow-hidden nodrag nowheel nopan z-0 select-none`}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onDragStart={(e) => e.preventDefault()}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          #canvas-container-${id} canvas {
            width: 100% !important;
            height: 100% !important;
          }
        `}} />

        {modelInputMissing ? (
          <div className="absolute top-12 left-3 right-3 z-[35] pointer-events-none rounded-md border border-amber-500/40 bg-amber-950/80 px-2 py-1.5 text-[9px] text-amber-100 leading-snug">
            模型资产未连到「模型输入」端口，场景树中的按对象赋材质无法作用到本视口。
          </div>
        ) : null}
        {hasNativeScene ? (
          <div className="absolute top-2 left-2 z-[32] pointer-events-auto select-none">
            <select
              value={jepActiveViewKey}
              onChange={(e) => {
                e.stopPropagation();
                switchJepView(e.target.value);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="h-7 max-w-[160px] truncate rounded-md border border-cyan-800/60 bg-black/75 px-2 pr-6 text-[9px] font-bold text-cyan-100 outline-none backdrop-blur-md focus:border-cyan-400/50"
              title="切换摄像机或灯光视角"
            >
              <optgroup label="摄像机">
                {jepCameras.map((cam) => (
                  <option key={cam.id} value={cameraViewKey(cam.id)}>
                    {cam.name}
                  </option>
                ))}
              </optgroup>
              {connectedJepLights.length > 0 ? (
                <optgroup label="灯光视角">
                  {connectedJepLights.map((light) => (
                    <option key={light.edgeId} value={lightViewKey(light.edgeId)}>
                      {light.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            {inLightView ? (
              <span className="mt-1 block text-[8px] font-bold text-amber-300/90">
                灯光预览 · 白模
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="absolute top-2 right-2 z-[30] flex gap-1.5 pointer-events-auto select-none">
            <div className="h-7 p-0.5 rounded bg-black/70 border border-neutral-700/90 backdrop-blur-md flex items-center gap-0.5 shadow-lg">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewportMode("preview");
                }}
                className={`h-6 px-2 rounded text-[9px] font-bold transition-all ${
                  viewportMode === "preview"
                    ? "bg-purple-500/25 text-purple-200"
                    : "text-neutral-500 hover:text-neutral-200"
                }`}
                title="预览"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button
              type="button"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setViewportExpanded((value) => !value);
              }}
              className="h-7 w-7 bg-black/70 hover:bg-black/90 border border-neutral-700/90 text-neutral-400 hover:text-white backdrop-blur-md shadow-lg rounded animate-in fade-in transition-all"
              title={viewportExpanded ? "缩小视窗" : "放大视窗"}
            >
              {viewportExpanded ? (
                <Minimize2 className="w-3.5 h-3.5 text-cyan-300" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                toggleRenderActive();
              }}
              className="h-7 w-7 bg-black/70 hover:bg-black/90 border border-neutral-700/90 text-neutral-400 hover:text-white backdrop-blur-md shadow-lg rounded animate-in fade-in transition-all"
              title={
                renderActive
                  ? "暂停渲染器（保留静态预览）"
                  : "启动渲染器（实时视角与光照）"
              }
            >
              {renderActive ? <Pause className="w-3.5 h-3.5 text-purple-400" /> : <Play className="w-3.5 h-3.5 text-zinc-500 animate-pulse" />}
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={handleResetTransforms}
              className="h-7 w-7 bg-black/70 hover:bg-black/90 border border-neutral-700/90 text-neutral-400 hover:text-white backdrop-blur-md shadow-lg rounded animate-in fade-in transition-all"
              title="重置旋转与缩放"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
        </div>

        {isDesktopApp() && (modelNode || glbToRender) && !resolvedScenePath && !scenePathResolving ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-neutral-950">
            <Compass className="w-10 h-10 text-amber-400 mb-3" />
            <span className="text-[10px] font-bold text-amber-300">{scenePathError || "未找到模型"}</span>
          </div>
        ) : showLiveViewport ? (
          <div
            className="absolute inset-0 z-[20] pointer-events-auto"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <JepowViewportPreview
              key={`${id}-mat-${materialPreviewRevision}-${sceneObjectMaterialsKey}-${inLightView ? "light" : "cam"}`}
              scenePath={resolvedScenePath}
              fill
              mode="orbit"
              liveRender={jepViewportLiveRender}
              previewMaxWidth={2048}
              native2KFinal
              jepRenderMode="physical-preview"
              lockRenderSize
              highPerformanceMode={false}
              shading={jepViewportShading}
              ghostOverlay={false}
              transform={{
                x: transform.x,
                y: transform.y,
                z: transform.z,
                rx: transform.rx,
                ry: transform.ry,
                rz: transform.rz,
                scale: transform.scale,
              }}
              lighting={nativeLighting}
              material={jepViewportMaterial}
              resetViewToken={viewportResetToken}
              viewCamera={effectiveViewportCamera}
              onCameraChange={handleViewportCameraChange}
              onInteractingChange={handleViewportInteractingChange}
              highlightSceneObjectId={highlightSceneObjectId}
              highlightSubmeshMaterial={viewportSelectionHighlightMaterial}
              assignedSubmeshMaterials={jepAssignedSubmeshMaterials}
              onSceneObjectPick={handleViewportSceneObjectPick}
              sceneObjectNameById={sceneObjectNameById}
              onSceneInfo={(info) => {
                if (sceneCameraFramedRef.current) return;
                const tris = Number(info.triangleCount ?? 0);
                if (tris <= 0) return;
                sceneCameraFramedRef.current = true;
                const framed = cameraFromSceneExtent(tris);
                viewportCameraRef.current = framed;
                setViewportCamera(framed);
                persistCyclesViewportCamera(framed);
                if (viewportMode === "render" && !hasPerObjectViewportMaterial) {
                  cameraVersionRef.current += 1;
                  setCameraVersion(cameraVersionRef.current);
                  lastCyclesSessionPatchKeyRef.current = "";
                  scheduleCyclesCameraPatch("interactive", 0);
                }
              }}
            />
          </div>
        ) : showPausedOverlay ? (
          <>
            <div
              className="absolute inset-0 z-[20] pointer-events-auto"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <JepowViewportPreview
                key={`${id}-mat-paused-${materialPreviewRevision}-${sceneObjectMaterialsKey}`}
                scenePath={resolvedScenePath}
                fill
                mode="orbit"
                liveRender={false}
                previewMaxWidth={2048}
                native2KFinal
                jepRenderMode="physical-preview"
                shading={jepViewportShading}
                lighting={nativeLighting}
                material={jepViewportMaterial}
                resetViewToken={viewportResetToken}
                viewCamera={effectiveViewportCamera}
                onCameraChange={handleViewportCameraChange}
                onInteractingChange={handleViewportInteractingChange}
                highlightSceneObjectId={highlightSceneObjectId}
                highlightSubmeshMaterial={viewportSelectionHighlightMaterial}
                assignedSubmeshMaterials={jepAssignedSubmeshMaterials}
                onSceneObjectPick={handleViewportSceneObjectPick}
                sceneObjectNameById={sceneObjectNameById}
              />
            </div>
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
              <Pause className="w-8 h-8 text-purple-400/90 mb-2" />
              <span className="text-[9px] text-zinc-400">渲染已暂停 · 仍可单击选中零件</span>
            </div>
          </>
        ) : canvasMounted && renderActive && glbToRender ? (
          <Canvas
            dpr={1.5}
            gl={{
              preserveDrawingBuffer: true,
              antialias: true,
              powerPreference: "high-performance",
            }}
            camera={{ position: [0, 0, 4.5], fov: 45 }}
            className="w-full h-full block"
            style={{ width: "100%", height: "100%", display: "block" }}
          >
            <ambientLight intensity={lights.ambient} />
            <directionalLight
              intensity={lights.directional}
              position={[lights.dirX, lights.dirY, lights.dirZ]}
              castShadow
            />
            
            <Suspense fallback={<LoadingPlaceholder />}>
              <CanvasErrorBoundary
                onError={(err) => setLoadError(err.message || "GLTF Loading / Parsing Error")}
                fallback={<ErrorPlaceholder />}
              >
                <ModelRenderer
                  glbUrl={glbToRender}
                  material={activeMaterial}
                  transform={transform}
                  modelName={activeModelName}
                  onLoadError={setLoadError}
                />
              </CanvasErrorBoundary>
            </Suspense>
   
            <OrbitControls
              makeDefault
              enableZoom={true}
              enablePan={true}
              enableRotate={true}
              enableDamping={true}
              dampingFactor={0.05}
              maxPolarAngle={Math.PI / 1.1}
              minDistance={1.0}
              maxDistance={24}
              target={[0, 0, 0]}
            />
          </Canvas>
        ) : (
          canvasMounted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#070708]/98 select-none border border-neutral-900 rounded-[7px] z-0 transition-all">
              <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-3.5 shadow-md">
                {glbToRender ? (
                  <Pause className="w-5 h-5 text-purple-400 animate-pulse" />
                ) : (
                  <Box className="w-6 h-6 text-purple-400 animate-pulse" />
                )}
              </div>
              {glbToRender && (
                <Button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRenderActive();
                  }}
                  className="h-8 px-4 text-xs font-bold bg-purple-950/40 hover:bg-purple-900 border border-purple-800/80 text-purple-400 hover:text-white transition-all cursor-pointer shadow-md"
                >
                  启动
                </Button>
              )}
            </div>
          )
        )}

        {viewportMode === "render" &&
          cyclesFrame.previewDataUrl &&
          cyclesFrameMatchesCamera &&
          !viewportInteracting && (
          <div className="absolute inset-0 z-[13] bg-neutral-950 pointer-events-none">
            <img
              src={cyclesFrame.previewDataUrl}
              alt="Cycles Render"
              draggable={false}
              className="w-full h-full object-cover opacity-100 pointer-events-none select-none [user-drag:none] [-webkit-user-drag:none]"
              onDragStart={(e) => e.preventDefault()}
              onError={() =>
                setCyclesFrame({
                  status: "error",
                  error: "Cycles 预览图加载失败",
                })
              }
            />
          </div>
        )}

        {viewportMode === "render" && cyclesFrame.status !== "idle" && (
          <div className="absolute left-3 bottom-3 z-[12] pointer-events-none rounded-md border border-emerald-900/50 bg-black/75 backdrop-blur-sm px-2 py-1.5 shadow-xl">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  cyclesFrame.status === "rendering"
                    ? "bg-amber-400 animate-pulse"
                    : cyclesFrame.status === "done"
                      ? "bg-emerald-400"
                      : "bg-red-400"
                }`}
              />
              <span className="text-[9px] font-bold text-neutral-200">
                {cyclesFrame.status === "rendering"
                  ? cyclesFrame.previewDataUrl
                    ? "Cycles Refining..."
                    : cyclesFrame.detail?.includes("prepare_mesh_cache")
                      ? "Cycles Sync Mesh..."
                      : cyclesFrame.detail?.includes("load_mesh_cache")
                        ? "Cycles Load Mesh..."
                        : "Cycles Path Tracing..."
                  : cyclesFrame.status === "done"
                    ? `Cycles ${cyclesFrame.renderSeconds?.toFixed(2) ?? ""}s`
                    : "Cycles Error"}
              </span>
            </div>
            {cyclesFrame.error && (
              <div className="mt-1 max-w-[300px] text-[8px] text-red-300 leading-snug break-words line-clamp-5">
                {cyclesFrame.error}
              </div>
            )}
            {!cyclesFrame.error && cyclesFrame.detail && (
              <div className="mt-1 max-w-[300px] text-[8px] text-emerald-200/70 leading-snug break-words line-clamp-5">
                {cyclesFrame.detail}
              </div>
            )}
          </div>
        )}
 
        {loadError && (
          <div className="absolute inset-0 bg-black/92 flex flex-col items-center justify-center p-5 text-center z-20 pointer-events-auto">
            <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider mb-1">
              ⚠️ 模型加载出错
            </span>
            <p className="text-[9px] text-zinc-400 max-w-[200px] leading-relaxed mb-3">
              模型地址加载失败，这可能是由于网络问题或源文件外部资源无法访问。
            </p>

            {/* Smart diagnosis context based on file format extension */}
            {(activeModelName.toLowerCase().endsWith(".gltf") || glbToRender.toLowerCase().includes(".gltf")) && (
              <div className="bg-amber-950/40 border border-amber-900/40 rounded p-2 text-left text-[8px] text-amber-300 max-w-[280px] leading-relaxed mb-3">
                <strong className="block text-amber-400 font-bold mb-0.5">💡 排错提示 (.gltf 缺外部依赖) :</strong>
                您当前使用的是 .gltf 开放结构格式模型。此格式由纯 JSON 描述文本构成，并依赖同级的 <strong>.bin 文件</strong>、外部贴图或着色器资源。
                <br />
                在一个单文件上传环境中，当刷新页面或再次进入工程时，浏览器向服务器拉取单体 .gltf，却因无法获取其依赖的二进制数据和外部图片，导致引擎语法解析白屏/崩溃。
                <br />
                <strong>💡 解决方案：请在 Blender、Cinema 4D (C4D) 或 3ds Max 中挑选 [模型 + 材质 + 纹理]，选择打包选项并导出为单个自包含二进制 .glb (Binary GLTF) 格式模型并上传，退出或刷新将万无一失！</strong>
              </div>
            )}

            {!(activeModelName.toLowerCase().endsWith(".gltf") || glbToRender.toLowerCase().includes(".gltf")) && 
             (activeModelName.toLowerCase().endsWith(".fbx") || activeModelName.toLowerCase().endsWith(".obj") || glbToRender.toLowerCase().includes(".fbx") || glbToRender.toLowerCase().includes(".obj")) && (
              <div className="bg-amber-950/40 border border-amber-900/40 rounded p-2 text-left text-[8px] text-amber-300 max-w-[280px] leading-relaxed mb-3">
                <strong className="block text-amber-400 font-bold mb-0.5">💡 排错提示 :</strong>
                {isDesktopApp()
                  ? "桌面端支持 FBX/OBJ/GLB。若仍无法加载，请检查网络或素材是否含外部贴图路径。"
                  : "网页端更推荐自包含的 .glb。可将 FBX/OBJ 在 Blender 中导出为 .glb 后重试。"}
              </div>
            )}

            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
              onClick={() => {
                setLoadError(null);
                handleResetTransforms();
              }}
            >
              重试加载 3D 模型
            </Button>
          </div>
        )}
      </div>

      {/* Footer Overlay removed to keep the interface absolutely clean and text-free */}

      {/* Floating Control Panel */}
      {selected && isOnlySelected && (
        <div
          className="absolute z-[9999] pointer-events-auto nodrag nopan nowheel animate-in fade-in slide-in-from-top-4 duration-300"
          style={{
            top: "100%",
            marginTop: 12 * (1 / Math.max(0.01, zoom)),
            left: "50%",
            transform: `translateX(-50%) scale(${1 / Math.max(0.01, zoom)})`,
            transformOrigin: "top center",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
        >
          <div
            id={`editor-floating-panel-${id}`}
            className="nodrag nopan nowheel w-[390px] bg-[#151515]/96 border border-neutral-800 rounded-lg p-2.5 shadow-2xl flex flex-col gap-2 backdrop-blur-md"
          >
            <style dangerouslySetInnerHTML={{ __html: `
              #editor-floating-panel-${id} input[type="range"] { height: 3px; margin-top: 6px; }
              #editor-floating-panel-${id} .editor-param-card { padding: 8px !important; gap: 4px !important; border-radius: 7px !important; }
            `}} />
            <div className="flex flex-col gap-1 border-b border-neutral-800/80 pb-1.5">
              <div className="flex items-center gap-2">
                <Sun className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[11px] font-bold text-neutral-200">JEP 物理视口参数</span>
              </div>
              {hasNativeScene && (
                <p className="text-[9px] text-amber-300/90 leading-snug truncate">
                  JEP Renderer · 物理材质/HDR/灯光 · CL 渲染请连接独立节点
                </p>
              )}
            </div>

            {hasNativeScene && (
              <p className="text-[9px] text-cyan-300/80 leading-snug pb-1 border-b border-neutral-800/80">
                摄像机/灯光在视口左上角切换；焦距与渲染参数见右侧 JEP 属性栏。
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              {/* Card 1: Ambient Intensity */}
              <div className="editor-param-card flex flex-col gap-2.5 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
                <div className="flex items-center justify-between text-[11px] font-medium text-neutral-300">
                  <span className="flex items-center gap-1.5 font-sans text-xs">
                    <Sun className="w-3.5 h-3.5 text-purple-400" />
                    环境光强度
                  </span>
                  <span className="text-purple-400 font-mono text-[10px] font-bold bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-900/30">
                    {lights.ambient.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="0.05"
                  value={lights.ambient}
                  onChange={(e) => setLights({ ...lights, ambient: parseFloat(e.target.value) })}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-purple-500 nodrag"
                />
              </div>

              {/* Card 2: Directional Intensity */}
              <div className="editor-param-card flex flex-col gap-2.5 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
                <div className="flex items-center justify-between text-[11px] font-medium text-neutral-300">
                  <span className="flex items-center gap-1.5 font-sans text-xs">
                    <Compass className="w-3.5 h-3.5 text-amber-500" />
                    直射光强度
                  </span>
                  <span className="text-amber-500 font-mono text-[10px] font-bold bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/30">
                    {lights.directional.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="0.05"
                  value={lights.directional}
                  onChange={(e) => setLights({ ...lights, directional: parseFloat(e.target.value) })}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-500 nodrag"
                />
              </div>

              {/* Card 3: Environment */}
              <div className="editor-param-card flex flex-col gap-2.5 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
                <div className="flex items-center justify-between text-[11px] font-medium text-neutral-300">
                  <span className="flex items-center gap-1.5 font-sans text-xs">
                    <Sun className="w-3.5 h-3.5 text-cyan-400" />
                    环境/HDRI 强度
                  </span>
                  <span className="text-cyan-400 font-mono text-[10px] font-bold bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-900/30">
                    {lights.environment.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="0.05"
                  value={lights.environment}
                  onChange={(e) => setLights({ ...lights, environment: parseFloat(e.target.value) })}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-cyan-500 nodrag"
                />
              </div>

              {/* Card 4: Exposure */}
              <div className="editor-param-card flex flex-col gap-2.5 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
                <div className="flex items-center justify-between text-[11px] font-medium text-neutral-300">
                  <span className="flex items-center gap-1.5 font-sans text-xs">
                    <Sliders className="w-3.5 h-3.5 text-pink-400" />
                    Camera Exposure
                  </span>
                  <span className="text-pink-400 font-mono text-[10px] font-bold bg-pink-950/40 px-1.5 py-0.5 rounded border border-pink-900/30">
                    {lights.exposure.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.05"
                  value={lights.exposure}
                  onChange={(e) => setLights({ ...lights, exposure: parseFloat(e.target.value) })}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-pink-500 nodrag"
                />
              </div>

              {/* Card 5: Yaw Angle */}
              <div className="editor-param-card flex flex-col gap-2.5 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
                <div className="flex items-center justify-between text-[11px] font-medium text-neutral-300">
                  <span className="flex items-center gap-1.5 font-sans text-xs">
                    <Sliders className="w-3.5 h-3.5 text-blue-400" />
                    主光方位角
                  </span>
                  <span className="text-blue-400 font-mono text-[10px] font-bold bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-900/30">
                    {lights.yaw}°
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  value={lights.yaw}
                  onChange={(e) => updateLightAngle(parseInt(e.target.value), lights.pitch)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-blue-500 nodrag"
                />
              </div>

              {/* Card 6: Pitch Angle */}
              <div className="editor-param-card flex flex-col gap-2.5 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
                <div className="flex items-center justify-between text-[11px] font-medium text-neutral-300">
                  <span className="flex items-center gap-1.5 font-sans text-xs">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    主光高度角
                  </span>
                  <span className="text-emerald-400 font-mono text-[10px] font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/30">
                    {lights.pitch}°
                  </span>
                </div>
                <input
                  type="range"
                  min="-90"
                  max="90"
                  step="1"
                  value={lights.pitch}
                  onChange={(e) => updateLightAngle(lights.yaw, parseInt(e.target.value))}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 nodrag"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-neutral-800/60">
              <div className="editor-param-card flex flex-col gap-2 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
                <div className="flex items-center justify-between text-[11px] text-neutral-300">
                  <span className="font-bold">Samples</span>
                  <span className="text-emerald-400 font-mono text-[10px]">{renderSettings.samples}</span>
                </div>
                <input
                  type="range"
                  min="32"
                  max="512"
                  step="32"
                  value={renderSettings.samples}
                  onChange={(e) => setRenderSettings({ ...renderSettings, samples: parseInt(e.target.value) })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 nodrag"
                />
              </div>
              <div className="editor-param-card flex flex-col gap-2 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
                <div className="flex items-center justify-between text-[11px] text-neutral-300">
                  <span className="font-bold">Bounces</span>
                  <span className="text-blue-400 font-mono text-[10px]">{renderSettings.bounces}</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="16"
                  step="1"
                  value={renderSettings.bounces}
                  onChange={(e) => setRenderSettings({ ...renderSettings, bounces: parseInt(e.target.value) })}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-blue-500 nodrag"
                />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenderSettings({ ...renderSettings, denoise: !renderSettings.denoise });
                }}
                className={`editor-param-card rounded-md border p-3 text-left transition-all ${
                  renderSettings.denoise
                    ? "border-purple-700/60 bg-purple-950/30 text-purple-200"
                    : "border-neutral-800 bg-neutral-900/40 text-neutral-500"
                }`}
              >
                <span className="block text-[11px] font-bold">Denoise</span>
                <span className="block text-[9px] mt-1 font-mono">{renderSettings.denoise ? "OIDN/OptiX Ready" : "OFF"}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-1 pt-1.5 border-t border-neutral-800/60">
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetTransforms();
                }}
                className="text-[10px] h-7 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded font-bold"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                复位三维视角
              </Button>
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetLights();
                }}
                className="text-[10px] h-7 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded font-bold"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                重置系统光源
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const expandedViewport =
    viewportExpanded && viewportWorkspacePortal
      ? createPortal(
          <div
            className={`pointer-events-auto absolute inset-0 flex h-full w-full min-h-0 min-w-0 select-none overflow-hidden ${nodeSurfaceClass}`}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onDragStart={(e) => e.preventDefault()}
          >
            {nodeViewport}
          </div>,
          viewportWorkspacePortal,
        )
      : null;

  return (
    <div
      id={`node-${id}`}
      className={`relative h-[390px] w-[520px] overflow-visible ${
        viewportExpanded ? "" : ""
      }`}
    >
      {expandedViewport}
      <div
        className={`relative h-full w-full overflow-visible ${nodeSurfaceClass}`}
        onDragStart={(e) => e.preventDefault()}
      >
        {nodeHandles}
        {!viewportExpanded ? (
          <div className="relative min-h-0 flex-1 overflow-hidden">{nodeViewport}</div>
        ) : (
          <div className="relative h-[340px] shrink-0 overflow-hidden rounded-lg bg-neutral-950/80" aria-hidden />
        )}
      </div>
    </div>
  );
}
