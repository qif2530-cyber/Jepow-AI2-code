import React, { useState, useEffect, Suspense, useMemo } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Box, Settings, Compass, Sun, Sliders, RefreshCw, ZoomIn, Eye, Plus, GripHorizontal, Pause, Play } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { isDesktopApp } from "../lib/runtime";
import { parseLocalAssetRef, toLocalAssetRef } from "../lib/local-assets";
import { loadModelGroup } from "../lib/model-asset-loader";
import { JepowViewportPreview } from "./JepowViewportPreview";
import { useDesktopScenePath } from "../hooks/useDesktopScenePath";

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
  };
  selected?: boolean;
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

    const repeatVal = material.tiling || 1;

    try {
      if (material.colorUrl) {
        colorTex = textureLoader.load(material.colorUrl);
        loadedTextures.push(colorTex);
        colorTex.wrapS = THREE.RepeatWrapping;
        colorTex.wrapT = THREE.RepeatWrapping;
        colorTex.repeat.set(repeatVal, repeatVal);
        colorTex.anisotropy = 16;
        colorTex.generateMipmaps = true;
        colorTex.minFilter = THREE.LinearMipmapLinearFilter;
      }
      if (material.normalUrl) {
        normalTex = textureLoader.load(material.normalUrl);
        loadedTextures.push(normalTex);
        normalTex.wrapS = THREE.RepeatWrapping;
        normalTex.wrapT = THREE.RepeatWrapping;
        normalTex.repeat.set(repeatVal, repeatVal);
        normalTex.anisotropy = 16;
        normalTex.generateMipmaps = true;
        normalTex.minFilter = THREE.LinearMipmapLinearFilter;
      }
      if (material.roughnessUrl) {
        roughnessTex = textureLoader.load(material.roughnessUrl);
        loadedTextures.push(roughnessTex);
        roughnessTex.wrapS = THREE.RepeatWrapping;
        roughnessTex.wrapT = THREE.RepeatWrapping;
        roughnessTex.repeat.set(repeatVal, repeatVal);
        roughnessTex.anisotropy = 16;
        roughnessTex.generateMipmaps = true;
        roughnessTex.minFilter = THREE.LinearMipmapLinearFilter;
      }
      if (material.metalnessUrl) {
        metalnessTex = textureLoader.load(material.metalnessUrl);
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
            roughness: material?.roughness !== undefined ? material.roughness : 0.4,
            metalness: material?.metalness !== undefined ? material.metalness : 0.3,
          });
          createdMaterials.push(customMat);

          if (colorTex) customMat.map = colorTex;
          if (normalTex) {
            customMat.normalMap = normalTex;
            const nScale = material?.normalScale !== undefined ? material.normalScale : 1.0;
            customMat.normalScale.set(nScale, nScale);
          }
          if (roughnessTex) customMat.roughnessMap = roughnessTex;
          if (metalnessTex) customMat.metalnessMap = metalnessTex;

          // Custom bump mapping detail
          if (material?.displacementScale && (colorTex || normalTex)) {
            customMat.bumpMap = colorTex || normalTex;
            customMat.bumpScale = material.displacementScale * 0.05;
          }

          // Transmission (glass refraction) properties
          if (material?.transmission !== undefined) {
            customMat.transmission = material.transmission;
          }
          if (material?.ior !== undefined) {
            customMat.ior = material.ior;
          }
          if (material?.transmission && material.transmission > 0) {
            customMat.thickness = 1.0;
          }

          if (material?.tint) {
            customMat.color.set(new THREE.Color(material.tint));
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

function getLocalUserId() {
  try {
    const raw = localStorage.getItem("ais-user");
    if (!raw) return "default";
    return String(JSON.parse(raw).id || "default");
  } catch {
    return "default";
  }
}

export function ThreeDEditorNode({ id, data, selected }: ThreeDEditorNodeProps) {
  const { getNodes, getEdges, updateNodeData } = useReactFlow();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canvasMounted, setCanvasMounted] = useState(false);

  const renderActive = data.renderActive !== false;
  const toggleRenderActive = () => {
    updateNodeData(id, { renderActive: !renderActive });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setCanvasMounted(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Find incoming model stream
  const nodes = getNodes();
  const edges = getEdges();

  const modelEdge = edges.find((e) => e.target === id && e.targetHandle === "modelInput");
  const modelNode = modelEdge ? nodes.find((n) => n.id === modelEdge.source) : null;

  const materialEdge = edges.find((e) => e.target === id && e.targetHandle === "material");
  const materialNode = materialEdge ? nodes.find((n) => n.id === materialEdge.source) : null;

  // Derive model data
  let activeGlb = "";
  let activeMaterial: any = null;
  let activeModelName = "";

  if (modelNode) {
    const nodeData = modelNode.data as any;
    if (nodeData.modelName) {
      activeModelName = nodeData.modelName;
    }
    if (modelNode.type === "materialReplaceNode" && nodeData.texturedModel) {
      activeGlb = nodeData.texturedModel.glbUrl;
      activeMaterial = nodeData.texturedModel.material;
      if (nodeData.texturedModel.modelName) {
        activeModelName = nodeData.texturedModel.modelName;
      }
    } else if (modelNode.type === "imageTo3DNode" && nodeData.glbUrl) {
      activeGlb = nodeData.glbUrl;
    } else if (
      modelNode.type === "modelAssetNode" &&
      (nodeData.localAssetPath || nodeData.glbUrl || nodeData.localPreviewUrl)
    ) {
      activeGlb = nodeData.localAssetPath
        ? toLocalAssetRef(nodeData.localAssetPath)
        : nodeData.localPreviewUrl || nodeData.glbUrl;
    } else if (modelNode.type === "threeDEditorNode") {
      // Direct pass-through
      activeGlb = nodeData.texturedModel?.glbUrl || "";
      activeMaterial = nodeData.texturedModel?.material || null;
      if (nodeData.texturedModel?.modelName) {
        activeModelName = nodeData.texturedModel.modelName;
      }
    }
  } else if (data.texturedModel) {
    activeGlb = data.texturedModel.glbUrl;
    activeMaterial = data.texturedModel.material;
    activeModelName = (data.texturedModel as any).modelName || "";
  }

  // Override or supply material directly from linked material node
  if (materialNode) {
    activeMaterial = materialNode.data;
  }

  // Fallback to offline procedural preview if no active connection (completely bypassing raw.githubusercontent.com)
  const glbToRender = activeGlb || "";
  const modelNodeData = (modelNode?.data || {}) as {
    nativeScenePath?: string;
    localAssetPath?: string;
    glbUrl?: string;
    modelName?: string;
  };

  const {
    scenePath: resolvedScenePath,
    resolving: scenePathResolving,
    error: scenePathError,
  } = useDesktopScenePath(getLocalUserId(), {
    nativeScenePath:
      modelNodeData.nativeScenePath || modelNodeData.localAssetPath,
    localAssetPath: modelNodeData.localAssetPath,
    glbUrl: glbToRender || modelNodeData.glbUrl,
    modelName: activeModelName || modelNodeData.modelName,
  });

  const useDesktopNativeRenderer =
    isDesktopApp() && !!resolvedScenePath && renderActive;

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
    pitch: 35
  });

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

  // Keep React Flow output in-sync
  useEffect(() => {
    updateNodeData(id, {
      sceneData: {
        glbUrl: glbToRender,
        material: activeMaterial,
        transform,
        lights
      }
    });
  }, [glbToRender, activeMaterial, transform, lights]);

  const handleResetTransforms = () => {
    setTransform({
      x: 0,
      y: -0.5,
      z: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      scale: 2.0
    });
    setLights({
      ambient: 1.0,
      directional: 2.0,
      dirX: 5,
      dirY: 5,
      dirZ: 5,
      yaw: 45,
      pitch: 35
    });
  };

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
        type="source"
        position={Position.Right}
        id="sceneData"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !right-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
        style={{ top: "50%" }}
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>
 
      {/* Main Workspace (Full viewport width & height covering with perfect 1px inset to avoid border overlap & clipping bleed) */}
      <div id={`canvas-container-${id}`} className="absolute inset-[1px] bg-neutral-950 rounded-[7px] overflow-hidden nodrag nowheel nopan z-0">
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
            <Button
              type="button"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                toggleRenderActive();
              }}
              className="h-7 w-7 bg-black/60 hover:bg-black/85 border border-neutral-800/80 text-neutral-400 hover:text-white backdrop-blur-sm rounded animate-in fade-in transition-all"
              title={renderActive ? "关闭/暂停 3D 渲染以保障系统运行" : "启动 3D 实时渲染"}
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

        {isDesktopApp() && modelNode && !resolvedScenePath && !scenePathResolving ? (
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
        ) : useDesktopNativeRenderer ? (
          <div className="w-full h-full min-h-[480px]">
            <JepowViewportPreview scenePath={resolvedScenePath} height={480} />
          </div>
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
          className="absolute z-[9999] pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300"
          style={{
            top: "100%",
            marginTop: 24 * (1 / Math.max(0.01, zoom)),
            left: "50%",
            transform: `translateX(-50%) scale(${1 / Math.max(0.01, zoom)})`,
            transformOrigin: "top center",
          }}
        >
          <div className="nodrag w-[480px] bg-[#161616]/95 border border-neutral-800 rounded-lg p-4 shadow-2xl flex flex-col gap-3.5 backdrop-blur-md">
            <div className="flex items-center gap-2 border-b border-neutral-800/80 pb-2">
              <Sun className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-neutral-200">3D 光源调节控制台</span>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {/* Card 1: Ambient Intensity */}
              <div className="flex flex-col gap-2.5 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
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
              <div className="flex flex-col gap-2.5 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
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

              {/* Card 3: Yaw Angle */}
              <div className="flex flex-col gap-2.5 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
                <div className="flex items-center justify-between text-[11px] font-medium text-neutral-300">
                  <span className="flex items-center gap-1.5 font-sans text-xs">
                    <Sliders className="w-3.5 h-3.5 text-blue-400" />
                    水平方位角
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

              {/* Card 4: Pitch Angle */}
              <div className="flex flex-col gap-2.5 bg-neutral-900/40 p-3 rounded-md border border-neutral-800/40">
                <div className="flex items-center justify-between text-[11px] font-medium text-neutral-300">
                  <span className="flex items-center gap-1.5 font-sans text-xs">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                    垂直高度角
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

            <div className="grid grid-cols-2 gap-3 mt-1.5 pt-2 border-t border-neutral-800/60">
              <Button
                onClick={() => {
                  setTransform({
                    x: 0,
                    y: -0.5,
                    z: 0,
                    rx: 0,
                    ry: 0,
                    rz: 0,
                    scale: 2.0
                  });
                }}
                className="text-[10px] h-7 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded font-bold animate-pulse"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                复位三维视角
              </Button>
              <Button
                onClick={() => {
                  updateLightAngle(45, 35);
                  setLights((prev) => ({
                    ...prev,
                    ambient: 1.0,
                    directional: 2.0
                  }));
                }}
                className="text-[10px] h-7 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-white rounded font-bold animate-pulse"
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
