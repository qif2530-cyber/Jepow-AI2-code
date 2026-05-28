import React, { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Box, Settings, Compass, Sun, Sliders, RefreshCw, ZoomIn, Eye, Plus, GripHorizontal, Pause, Play } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { isDesktopApp } from "../lib/runtime";
import { parseLocalAssetRef } from "../lib/local-assets";
import { loadModelGroup } from "../lib/model-asset-loader";
import { JepowViewportPreview } from "./JepowViewportPreview";
import { useDesktopScenePath } from "../hooks/useDesktopScenePath";
import { getLocalUserId } from "../lib/local-user-id";
import { getCurrentProjectId } from "../lib/current-project";
import { createCyclesMaterial, cyclesToViewportMaterial } from "../lib/cycles-material";
import { resolveEditorInputs } from "../lib/native-3d-pipeline";
import { buildCyclesLightPayload } from "../lib/cycles-light-payload";
import { getViewportEngine } from "../lib/viewport-engine";
import type { ViewportCamera } from "../lib/viewport-engine/types";

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
    /** 与 Cycles 路径追踪共用的视口轨道相机（持久化在节点上） */
    cyclesViewportCamera?: ViewportCamera;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canvasMounted, setCanvasMounted] = useState(false);

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

  const editorPipeline = useMemo(
    () =>
      resolveEditorInputs(
        { id, type: "threeDEditorNode", data, position: { x: 0, y: 0 } },
        nodes,
        edges,
      ),
    [id, nodes, edges],
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
  const [perfProfile, setPerfProfile] = useState<"unknown" | "high" | "low">(
    "unknown",
  );
  const editorAutoStarted = useRef(false);

  useEffect(() => {
    if (!resolvedScenePath) {
      setPerfProfile("unknown");
      return;
    }
    let cancelled = false;
    import("../lib/viewport-performance").then(({ detectViewportPerformance }) =>
      detectViewportPerformance(resolvedScenePath).then((p) => {
        if (!cancelled) setPerfProfile(p);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [resolvedScenePath]);

  useEffect(() => {
    sceneCameraFramedRef.current = false;
  }, [resolvedScenePath]);

  useEffect(() => {
    if (!modelNode) {
      editorAutoStarted.current = false;
      return;
    }
    if (!hasNativeScene || editorAutoStarted.current) return;
    editorAutoStarted.current = true;
    if (data.renderActive !== true) {
      updateNodeData(id, { renderActive: true });
    }
  }, [hasNativeScene, modelNode, id, data.renderActive, updateNodeData]);

  const highPerfDynamic = perfProfile === "high";
  const showLiveViewport = hasNativeScene;
  const showPausedOverlay = hasNativeScene && !renderActive;

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
  const pendingCameraRenderRef = useRef(false);
  const cyclesInteractLoopRef = useRef<number | null>(null);
  const cyclesRestartTimerRef = useRef<number | null>(null);
  const [cyclesRestartNonce, setCyclesRestartNonce] = useState(0);
  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewportPixelSize, setViewportPixelSize] = useState({ width: 640, height: 360 });

  const connectedCyclesLight = editorPipeline.cyclesLight as {
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
  const effectiveRenderSettings = useMemo(
    () => {
      const merged = {
        ...renderSettings,
        ...(connectedCyclesSettings || {}),
      };
      return {
        ...merged,
        width: merged.width == null || merged.width === 768 ? 2048 : merged.width,
        height: merged.height == null || merged.height === 512 ? 1536 : merged.height,
      };
    },
    [renderSettings, connectedCyclesSettings],
  );
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
      fov: connectedCyclesCamera?.fov ?? viewportCamera.fov ?? Math.PI / 4,
    }),
    [viewportCamera, connectedCyclesCamera],
  );
  const effectiveViewportCamera = useMemo(
    () => ({
      ...viewportCamera,
      fov: connectedCyclesCamera?.fov ?? viewportCamera.fov ?? Math.PI / 4,
    }),
    [viewportCamera, connectedCyclesCamera?.fov],
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
      fov: connectedCyclesCamera?.fov ?? cam.fov ?? Math.PI / 4,
    };
  };

  const persistCyclesViewportCamera = (cam: ViewportCamera) => {
    if (persistCameraTimerRef.current != null) {
      window.clearTimeout(persistCameraTimerRef.current);
    }
    persistCameraTimerRef.current = window.setTimeout(() => {
      persistCameraTimerRef.current = null;
      updateNodeData(id, { cyclesViewportCamera: cam });
    }, 280);
  };

  const cyclesWantsInteractivePatch = () =>
    viewportInteractingRef.current ||
    Date.now() - lastCameraChangeAtRef.current < 2800;

  const applyCyclesFrameUpdate = (res: {
    previewDataUrl?: string;
    renderSeconds?: number;
    ok?: boolean;
  }) => {
    if (!res?.ok || !res.previewDataUrl) return false;
    setCyclesFrame({
      status: "rendering",
      previewDataUrl: res.previewDataUrl,
      cameraVersion: cameraVersionRef.current,
      renderSeconds: res.renderSeconds,
      error: undefined,
      detail: undefined,
    });
    return true;
  };

  const flushCyclesCameraPatch = async (quality: "interactive" | "final") => {
    if (viewportMode !== "render" || !renderActive) return;
    const sessionId = activeCyclesSessionRef.current;
    if (!sessionId) {
      pendingCameraRenderRef.current = true;
      return;
    }
    if (cyclesPatchInFlightRef.current && quality === "interactive") return;
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
    try {
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
      const patchFrame = update?.frame;
      if (
        patchFrame &&
        (update?.frameCaptured || patchFrame.cameraVersion === cameraVersionRef.current) &&
        applyCyclesFrameUpdate(patchFrame)
      ) {
        return;
      }
      const state = (await engine.readCyclesSession?.(sessionId)) as {
        frame?: { previewDataUrl?: string; ok?: boolean; renderSeconds?: number };
      };
      if (state?.frame) applyCyclesFrameUpdate(state.frame);
    } finally {
      cyclesPatchInFlightRef.current = false;
      pendingCameraRenderRef.current = false;
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

  const scheduleCyclesSessionRestart = (delayMs = 120) => {
    if (cyclesRestartTimerRef.current != null) {
      window.clearTimeout(cyclesRestartTimerRef.current);
    }
    cyclesRestartTimerRef.current = window.setTimeout(() => {
      cyclesRestartTimerRef.current = null;
      lastCyclesSessionPatchKeyRef.current = "";
      if (activeCyclesSessionRef.current) {
        void getViewportEngine().stopCyclesSession?.(activeCyclesSessionRef.current);
        activeCyclesSessionRef.current = null;
      }
      setCyclesRestartNonce((n) => n + 1);
    }, delayMs);
  };

  useEffect(() => {
    if (viewportMode !== "render") return;
    const live = getLiveCyclesCamera();
    viewportCameraRef.current = {
      ...viewportCameraRef.current,
      fov: live.fov,
    };
    setViewportCamera((prev) => ({ ...prev, fov: live.fov }));
    lastCyclesSessionPatchKeyRef.current = "";
    scheduleCyclesCameraPatch("interactive", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportMode]);

  const handleViewportCameraChange = (next: ViewportCamera) => {
    const current = viewportCameraRef.current;
    const changed =
      Math.abs((current.yaw ?? 0) - (next.yaw ?? 0)) > 0.0001 ||
      Math.abs((current.pitch ?? 0) - (next.pitch ?? 0)) > 0.0001 ||
      Math.abs((current.distance ?? 0) - (next.distance ?? 0)) > 0.0001 ||
      Math.abs((current.panX ?? 0) - (next.panX ?? 0)) > 0.0001 ||
      Math.abs((current.panY ?? 0) - (next.panY ?? 0)) > 0.0001 ||
      Math.abs((current.fov ?? Math.PI / 4) - (next.fov ?? Math.PI / 4)) > 0.0001;
    viewportCameraRef.current = next;
    setViewportCamera(next);
    const nextCameraVersion = changed ? cameraVersionRef.current + 1 : cameraVersionRef.current;
    if (changed) {
      cameraVersionRef.current = nextCameraVersion;
      setCameraVersion(nextCameraVersion);
      lastCameraChangeAtRef.current = Date.now();
      persistCyclesViewportCamera(next);
      if (viewportMode === "render") {
        pendingCameraRenderRef.current = true;
        lastCyclesSessionPatchKeyRef.current = "";
        scheduleCyclesCameraPatch("interactive", 16);
        scheduleCyclesSessionRestart(viewportInteractingRef.current ? 180 : 80);
        if (cyclesCameraSettleTimerRef.current != null) {
          window.clearTimeout(cyclesCameraSettleTimerRef.current);
        }
        cyclesCameraSettleTimerRef.current = window.setTimeout(() => {
          cyclesCameraSettleTimerRef.current = null;
          if (!cyclesWantsInteractivePatch()) {
            scheduleCyclesCameraPatch("final", 0);
            scheduleCyclesSessionRestart(0);
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
    if (interacting && viewportMode === "render") {
      lastCyclesSessionPatchKeyRef.current = "";
      scheduleCyclesCameraPatch("interactive", 0);
      viewportInteractionTimerRef.current = window.setTimeout(() => {
        viewportInteractionTimerRef.current = null;
        viewportInteractingRef.current = false;
        setViewportInteracting(false);
        scheduleCyclesCameraPatch("final", 80);
      }, 700);
    }
  };

  useEffect(() => {
    if (viewportMode !== "render" || !renderActive || !viewportInteracting) {
      if (cyclesInteractLoopRef.current != null) {
        window.clearInterval(cyclesInteractLoopRef.current);
        cyclesInteractLoopRef.current = null;
      }
      return;
    }
    cyclesInteractLoopRef.current = window.setInterval(() => {
      lastCyclesSessionPatchKeyRef.current = "";
      void flushCyclesCameraPatch("interactive");
    }, 160);
    return () => {
      if (cyclesInteractLoopRef.current != null) {
        window.clearInterval(cyclesInteractLoopRef.current);
        cyclesInteractLoopRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportMode, renderActive, viewportInteracting, cameraVersion]);

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
      if (cyclesRestartTimerRef.current != null) {
        window.clearTimeout(cyclesRestartTimerRef.current);
      }
    },
    [],
  );

  const nativeLighting = useMemo(
    () => ({
      yaw: Number(connectedCyclesLight?.yaw ?? lights.yaw),
      pitch: Number(connectedCyclesLight?.pitch ?? lights.pitch),
      ambient: lights.ambient,
      directional:
        connectedCyclesLight?.keyStrength != null
          ? Math.max(0, Number(connectedCyclesLight.keyStrength) / 325)
          : lights.directional,
      exposure: lights.exposure,
      environment: Number(
        connectedCyclesLight?.environmentStrength ?? lights.environment,
      ),
    }),
    [
      connectedCyclesLight,
      lights.yaw,
      lights.pitch,
      lights.ambient,
      lights.directional,
      lights.exposure,
      lights.environment,
    ],
  );
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

  // 同步 sceneData（勿写入 cyclesMaterial / shaderGraph，否则每次解析都会生成新对象引用 → updateNodeData 死循环）
  const sceneDataSyncKey = useMemo(
    () =>
      JSON.stringify({
        glbUrl: glbToRender,
        transform,
        lights,
        renderSettings,
        cyclesLight: connectedCyclesLight,
        cyclesCamera: connectedCyclesCamera,
      }),
    [glbToRender, transform, lights, renderSettings, connectedCyclesLight, connectedCyclesCamera],
  );
  const sceneDataSyncRef = useRef<string>("");
  useEffect(() => {
    if (sceneDataSyncRef.current === sceneDataSyncKey) return;
    sceneDataSyncRef.current = sceneDataSyncKey;
    updateNodeData(id, {
      sceneData: {
        glbUrl: glbToRender,
        transform,
        lights,
        renderSettings,
        cyclesLight: connectedCyclesLight,
        cyclesCamera: connectedCyclesCamera,
      },
    });
  }, [sceneDataSyncKey, glbToRender, transform, lights, renderSettings, connectedCyclesLight, connectedCyclesCamera, updateNodeData, id]);

  useEffect(() => {
    if (viewportMode !== "render") {
      setCyclesFrame({ status: "idle" });
    }
  }, [viewportMode]);

  useEffect(() => {
    if (viewportMode !== "render" || !renderActive || !effectiveCyclesMaterialForRender) return;
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
      if (
        finalFrame &&
        frameCameraVersion !== cameraVersionRef.current &&
        !viewportInteractingRef.current &&
        Date.now() - lastCameraChangeAtRef.current > 2800
      ) {
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
          cameraVersion: cameraVersionRef.current,
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

      const stableCyclesMaterial = JSON.parse(cyclesMaterialRenderKey);
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
        device: effectiveRenderSettings.device || "CPU",
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
    cyclesMaterialRenderKey,
    renderSettingsKey,
    cyclesLightKey,
    transformKey,
    resolvedScenePath,
    glbToRender,
    nativeLightingKey,
    viewportPixelSize,
    blendSourcePath,
    cameraVersion,
    cyclesRestartNonce,
  ]);

  useEffect(() => {
    if (viewportMode !== "render" || !renderActive || !activeCyclesSessionRef.current) return;
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
    !!cyclesFrame.previewDataUrl &&
    cyclesFrame.status !== "error" &&
    (cyclesFrame.cameraVersion == null ||
      cyclesFrame.cameraVersion === cameraVersion);

  const zoom = useStore((s) => s.transform[2]);
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );

  return (
    <div id={`node-${id}`} className={`w-[520px] h-[390px] bg-[#141414] border ${selected ? "border-purple-600 shadow-[0_0_20px_rgba(147,51,234,0.4)]" : "border-neutral-800"} rounded-lg font-sans text-white transition-all duration-200 relative`}>
      {/* Outer Floating Drag Grip Handle (Grab to Move Node) */}
      <div className="absolute -top-[26px] left-1/2 -translate-x-1/2 w-36 h-6 bg-neutral-900/90 border border-neutral-800/80 rounded flex items-center justify-center select-none shadow-xl backdrop-blur-md cursor-grab active:cursor-grabbing hover:bg-neutral-850 hover:border-neutral-700 transition-all z-[999] group">
        <GripHorizontal className="w-4 h-4 text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Visual Input / Output Connections */}
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
 
      {/* Main Workspace (Full viewport width & height covering with perfect 1px inset to avoid border overlap & clipping bleed) */}
      <div
        ref={viewportContainerRef}
        id={`canvas-container-${id}`}
        className="absolute inset-[1px] bg-neutral-950 rounded-[7px] overflow-hidden nodrag nowheel nopan z-0"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          #canvas-container-${id} canvas {
            width: 100% !important;
            height: 100% !important;
          }
        `}} />

        {/* Header Overlay - Safely tucked inside overflow-hidden to clip at rounded corners */}
        <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between px-3.5 pt-3 z-10 pointer-events-none select-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="bg-purple-950/60 p-1.5 rounded border border-purple-900/40 backdrop-blur-sm animate-pulse">
              <Compass className="w-4 h-4 text-purple-400" />
            </div>
          </div>
          <div className="flex gap-1.5 pointer-events-auto">
            <div className="h-7 p-0.5 rounded bg-black/60 border border-neutral-800/80 backdrop-blur-sm flex items-center gap-0.5">
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
                title="预览模式：轻量白膜，只检查模型、构图和视角"
              >
                预览
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewportMode("render");
                  if (!renderActive) updateNodeData(id, { renderActive: true });
                }}
                className={`h-6 px-2 rounded text-[9px] font-bold transition-all ${
                  viewportMode === "render"
                    ? "bg-emerald-500/25 text-emerald-200"
                    : "text-neutral-500 hover:text-neutral-200"
                }`}
                title="渲染模式：读取 Cycles Principled BSDF 材质参数并进行实时预览"
              >
                Cycles
              </button>
            </div>
            <Button
              type="button"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                toggleRenderActive();
              }}
              className="h-7 w-7 bg-black/60 hover:bg-black/85 border border-neutral-800/80 text-neutral-400 hover:text-white backdrop-blur-sm rounded animate-in fade-in transition-all"
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
              className="h-7 w-7 bg-black/60 hover:bg-black/85 border border-neutral-800/80 text-neutral-400 hover:text-white backdrop-blur-sm rounded animate-in fade-in transition-all"
              title="重置旋转与缩放"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {isDesktopApp() && (modelNode || glbToRender) && !resolvedScenePath && !scenePathResolving ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-neutral-950">
            <Compass className="w-10 h-10 text-amber-400 mb-3" />
            <span className="text-[11px] font-bold text-amber-300 mb-2">
              3D 视口：找不到模型文件
            </span>
            <p className="text-[10px] text-amber-100/80 leading-relaxed max-w-[320px]">
              {scenePathError ||
                "请在左侧模型节点用「从磁盘选择大场景」重新导入 FBX/GLB。"}
            </p>
          </div>
        ) : showLiveViewport ? (
          <div
            className={`absolute inset-0 ${viewportMode === "render" ? "z-[10]" : "z-0"}`}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <JepowViewportPreview
              scenePath={resolvedScenePath}
              fill
              mode="orbit"
              liveRender
              lockRenderSize
              highPerformanceMode={highPerfDynamic}
              shading="clay"
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
              material={null}
              resetViewToken={viewportResetToken}
              viewCamera={effectiveViewportCamera}
              onCameraChange={handleViewportCameraChange}
              onInteractingChange={handleViewportInteractingChange}
              onSceneInfo={(info) => {
                if (sceneCameraFramedRef.current) return;
                const tris = Number(info.triangleCount ?? 0);
                if (tris <= 0) return;
                sceneCameraFramedRef.current = true;
                const framed = cameraFromSceneExtent(tris);
                viewportCameraRef.current = framed;
                setViewportCamera(framed);
                persistCyclesViewportCamera(framed);
                if (viewportMode === "render") {
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
            <JepowViewportPreview
              scenePath={resolvedScenePath}
              fill
              mode="turntable"
              liveRender={false}
              shading="clay"
              lighting={nativeLighting}
              material={null}
              resetViewToken={viewportResetToken}
              viewCamera={effectiveViewportCamera}
              onCameraChange={handleViewportCameraChange}
              onInteractingChange={handleViewportInteractingChange}
            />
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/55 pointer-events-none">
              <Pause className="w-8 h-8 text-purple-400/90 mb-2" />
              <span className="text-[11px] font-bold text-neutral-200">
                预览模式 · 渲染器已暂停
              </span>
              <span className="text-[9px] text-neutral-400 mt-1">
                点击右上角 ▶ 启动实时渲染与交互
              </span>
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
              <span className="text-[11px] font-black text-neutral-300 uppercase tracking-widest mb-1.5 font-mono">
                {!glbToRender ? "3D 渲染就绪 · 无模型输入" : "3D 渲染控制已暂停"}
              </span>
              <p className="text-[10px] text-zinc-400 max-w-[280px] leading-relaxed mb-4">
                {!glbToRender 
                  ? "当前编辑器尚未关联三维模型。请使用左侧的紫色 modelInput 插槽，连线并接入 [3D 图像转模型] 或 [三维素材] 节点的输出，即可触发真实的物理模型渲染。"
                  : "由于从 C4D 导出的高分辨率模型含复杂材质时可能引起卡顿，已为您自动或手动挂起此节点渲染。请点击下方按钮重新恢复。"}
              </p>
              {glbToRender && (
                <Button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRenderActive();
                  }}
                  className="h-8 px-4 text-xs font-bold bg-purple-950/40 hover:bg-purple-900 border border-purple-800/80 text-purple-400 hover:text-white transition-all cursor-pointer shadow-md"
                >
                  点击启动 3D 实时渲染
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
              className="w-full h-full object-cover opacity-100"
              onError={() =>
                setCyclesFrame({
                  status: "error",
                  error: "Cycles 预览图加载失败",
                })
              }
            />
          </div>
        )}

        {viewportMode === "render" && showLiveViewport && (
          <div className="absolute left-3 top-14 z-[20] pointer-events-none flex flex-col gap-1">
            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-200 border border-cyan-900/60">
              CL 相机视窗
            </span>
            {cyclesFrame.status === "rendering" && !cyclesFrameMatchesCamera && (
              <span className="text-[9px] text-amber-200/90 font-medium animate-pulse">
                路径追踪跟拍中…
              </span>
            )}
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
                <span className="text-[11px] font-bold text-neutral-200">CL 渲染参数</span>
              </div>
              {hasNativeScene && (
                <p className="text-[9px] text-amber-300/90 leading-snug truncate">
                  {viewportMode === "render"
                    ? `${renderSettings.samples}spp / ${renderSettings.bounces} bounces · 视口拖拽=CL相机`
                    : "Preview clay mode"}
                </p>
              )}
            </div>

            {viewportMode === "render" && (
              <div className="grid grid-cols-3 gap-2 pb-1 border-b border-cyan-900/40">
                <div className="editor-param-card flex flex-col gap-1.5 bg-cyan-950/20 p-2 rounded-md border border-cyan-900/40 col-span-3">
                  <span className="text-[10px] font-bold text-cyan-300">CL 相机（与视口拖拽同步）</span>
                </div>
                <div className="editor-param-card flex flex-col gap-1.5 bg-neutral-900/40 p-2 rounded-md border border-cyan-900/30">
                  <span className="text-[9px] text-neutral-400">距离</span>
                  <span className="text-cyan-400 font-mono text-[10px]">
                    {(viewportCamera.distance ?? 2.45).toFixed(2)}
                  </span>
                  <input
                    type="range"
                    min="0.8"
                    max="24"
                    step="0.05"
                    value={viewportCamera.distance ?? 2.45}
                    onChange={(e) =>
                      updateCyclesOrbitCamera({ distance: parseFloat(e.target.value) })
                    }
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-full h-1 accent-cyan-500 nodrag"
                  />
                </div>
                <div className="editor-param-card flex flex-col gap-1.5 bg-neutral-900/40 p-2 rounded-md border border-cyan-900/30">
                  <span className="text-[9px] text-neutral-400">水平°</span>
                  <span className="text-cyan-400 font-mono text-[10px]">{cameraYawDeg}°</span>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={((cameraYawDeg % 360) + 360) % 360}
                    onChange={(e) =>
                      updateCyclesOrbitCamera({
                        yaw: THREE.MathUtils.degToRad(parseFloat(e.target.value)),
                      })
                    }
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-full h-1 accent-cyan-500 nodrag"
                  />
                </div>
                <div className="editor-param-card flex flex-col gap-1.5 bg-neutral-900/40 p-2 rounded-md border border-cyan-900/30">
                  <span className="text-[9px] text-neutral-400">俯仰°</span>
                  <span className="text-cyan-400 font-mono text-[10px]">{cameraPitchDeg}°</span>
                  <input
                    type="range"
                    min="-75"
                    max="75"
                    step="1"
                    value={cameraPitchDeg}
                    onChange={(e) =>
                      updateCyclesOrbitCamera({
                        pitch: THREE.MathUtils.degToRad(parseFloat(e.target.value)),
                      })
                    }
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-full h-1 accent-cyan-500 nodrag"
                  />
                </div>
              </div>
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
    </div>
  );
}
