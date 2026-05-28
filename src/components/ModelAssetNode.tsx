import React, { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Box, RefreshCw, Layers, Upload, GripHorizontal, Plus, Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import api from "../lib/api";
import {
  saveLocalModelBuffer,
  shouldUseLocalAssets,
  toLocalAssetRef,
  importLocalModelFile,
  pickLocalBlendFile,
  importBlendProjectFromPath,
  ingestBlendProjectFile,
} from "../lib/local-assets";
import { buildBlendProjectGraph, mergeBlendImportGraph } from "../lib/blend-project-import";
import { isDesktopApp, shouldUseLocalCanvasAssets } from "../lib/runtime";
import { loadModelGroup } from "../lib/model-asset-loader";
import { JepowViewportPreview, PREVIEW_CAM_45 } from "./JepowViewportPreview";
import { getViewportEngine } from "../lib/viewport-engine";
import { useDesktopScenePath } from "../hooks/useDesktopScenePath";
import { scenePathToNodePatch } from "../lib/desktop-scene-path";
import { getLocalUserId } from "../lib/local-user-id";
import { getCurrentProjectId } from "../lib/current-project";

interface ModelAssetNodeProps {
  id: string;
  data: {
    glbUrl?: string;
    /** 上传时生成的本地 blob，优先用于预览（避免远程 FBX 加载失败） */
    localPreviewUrl?: string;
    localAssetPath?: string;
    modelName?: string;
    nativeScenePath?: string;
    viewportBackend?: "web" | "jepow-native";
    renderActive?: boolean;
  };
  selected?: boolean;
}

// Deep disposal helper to completely free GPU memory
function deepDispose(obj: any) {
  if (!obj) return;
  
  obj.traverse((child: any) => {
    if (child.isMesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if (mat.dispose) mat.dispose();
            for (const key of Object.keys(mat)) {
              const val = mat[key];
              if (val && val.isTexture && typeof val.dispose === "function") {
                val.dispose();
              }
            }
          });
        } else {
          if (child.material.dispose) child.material.dispose();
          for (const key of Object.keys(child.material)) {
            const val = child.material[key];
            if (val && val.isTexture && typeof val.dispose === "function") {
              val.dispose();
            }
          }
        }
      }
    }
  });
}

// Localized canvas boundary to catch loading/parsing errors gracefully
class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode; onError?: (err: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
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

// Beautiful fallback when 3D model fails to load or during non-glb formats (.fbx, .obj)
function ModelFallback({ modelName }: { modelName?: string }) {
  const meshRef = useRef<THREE.Mesh>(null);

  return (
    <group rotation={[Math.PI / 6, Math.PI / 4, 0]}>
      <mesh ref={meshRef}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color="#10b981" 
          roughness={0.2}
          metalness={0.8}
          wireframe
        />
      </mesh>
    </group>
  );
}

function ModelRenderer({
  glbUrl,
  modelName,
  onLoadError,
}: {
  glbUrl: string;
  modelName?: string;
  onLoadError?: (msg: string | null) => void;
}) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    let active = true;
    setScene(null);
    onLoadError?.(null);

    loadModelGroup(glbUrl, modelName)
      .then((group) => {
        if (!active) {
          deepDispose(group);
          return;
        }
        setScene(group);
        onLoadError?.(null);
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : "模型加载失败";
        console.error("Model load error:", err);
        if (active) onLoadError?.(msg);
      });

    return () => {
      active = false;
    };
  }, [glbUrl, modelName, onLoadError]);

  useEffect(() => {
    return () => {
      if (scene) deepDispose(scene);
    };
  }, [scene]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.4;
    }
  });

  if (!scene) {
    return <ModelFallback modelName={modelName || "Loading…"} />;
  }

  return (
    <group ref={groupRef} rotation={[Math.PI / 6, Math.PI / 4, 0]}>
      <primitive object={scene} />
    </group>
  );
}

export function ModelAssetNode({ id, data, selected }: ModelAssetNodeProps) {
  const { updateNodeData, setNodes, setEdges, getNode } = useReactFlow();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [canvasMounted, setCanvasMounted] = useState(false);
  const fileInputId = `model-file-uploader-${id}`;

  const zoom = useStore((s) => s.transform[2]);
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );

  const nativeScenePath =
    data.nativeScenePath || data.localAssetPath || "";
  const glbUrl =
    (data.localAssetPath
      ? toLocalAssetRef(data.localAssetPath)
      : nativeScenePath
        ? toLocalAssetRef(nativeScenePath)
        : null) ||
    data.localPreviewUrl ||
    data.glbUrl ||
    "";
  const modelName =
    data.modelName ||
    (nativeScenePath
      ? nativeScenePath.split(/[/\\]/).pop() || "scene.glb"
      : "unnamed_asset.glb");
  const fileExtension = modelName.substring(modelName.lastIndexOf(".")).toLowerCase();
  const desktop3d = isDesktopApp();

  const {
    scenePath: scenePathForNative,
    resolving: scenePathResolving,
    error: scenePathError,
  } = useDesktopScenePath(getLocalUserId(), {
    nativeScenePath: data.nativeScenePath,
    localAssetPath: data.localAssetPath,
    glbUrl: data.glbUrl,
    modelName,
    projectId: getCurrentProjectId(),
  });

  useEffect(() => {
    if (!scenePathForNative) return;
    if (
      data.nativeScenePath === scenePathForNative &&
      data.localAssetPath === scenePathForNative
    ) {
      return;
    }
    updateNodeData(id, scenePathToNodePatch(scenePathForNative));
  }, [
    scenePathForNative,
    id,
    data.nativeScenePath,
    data.localAssetPath,
    updateNodeData,
  ]);

  /** 桌面端：自研 jepow-engine（FBX 导入规则对齐 Blender，非调用 Blender） */
  const useDesktopNativeRenderer = desktop3d && !!scenePathForNative;

  const renderActive = data.renderActive === true;
  const toggleRenderActive = () => {
    updateNodeData(id, { renderActive: !renderActive });
  };

  // Reset errors when URLs change
  useEffect(() => {
    setLoadError(null);
  }, [glbUrl]);

  // Delayed mount of canvas to stabilize camera measurements and center perfect on initial render
  useEffect(() => {
    const timer = setTimeout(() => {
      setCanvasMounted(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const applyLocalScene = async (filePath: string, fileName: string) => {
    let localPath = filePath;
    let assetRef: string | undefined;
    if (shouldUseLocalAssets()) {
      const copied = await importLocalModelFile(getLocalUserId(), filePath, {
        projectId: getCurrentProjectId(),
        nodeType: 'modelAssetNode',
      });
      if (copied.ok && copied.localPath) {
        localPath = copied.localPath;
        fileName = copied.fileName || fileName;
        assetRef = copied.assetRef;
      }
    }
    const ref = assetRef || toLocalAssetRef(localPath);
    updateNodeData(id, {
      nativeScenePath: localPath,
      localAssetPath: localPath,
      glbUrl: ref,
      modelName: fileName,
      viewportBackend: "jepow-native",
      localPreviewUrl: "",
    });
    setLoadError(null);
    toast.success("已导入本地场景，由 Jepow 原生渲染器加载");
  };

  const handleImportBlendProject = async (file?: File) => {
    if (!shouldUseLocalCanvasAssets()) {
      toast.error("仅桌面端支持导入 Blender 工程");
      return;
    }
    setIsUploading(true);
    try {
      const self = getNode(id);
      const position = self?.position || { x: 0, y: 0 };
      if (file) {
        const ingested = await ingestBlendProjectFile(
          getLocalUserId(),
          file,
          { x: position.x + 40, y: position.y + 40 },
        );
        if (!ingested.ok || !ingested.graph) {
          throw new Error(ingested.error || "Blender 工程导入失败");
        }
        mergeBlendImportGraph(setNodes, setEdges, ingested.graph);
        toast.success("已导入 Blender 工程并生成节点图");
        return;
      }
      const picked = await pickLocalBlendFile();
      if (picked.canceled || !picked.filePath) return;
      const imported = await importBlendProjectFromPath(
        getLocalUserId(),
        picked.filePath,
      );
      if (!imported.ok || !imported.blueprint) {
        throw new Error(imported.error || "Blender 工程解析失败");
      }
      const graph = buildBlendProjectGraph(imported.blueprint, {
        x: position.x + 40,
        y: position.y + 40,
      });
      mergeBlendImportGraph(setNodes, setEdges, graph);
      toast.success(`已导入 ${imported.blueprint.blendFileName}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Blender 工程导入失败");
    } finally {
      setIsUploading(false);
    }
  };

  const handleImportNativeScene = async () => {
    if (shouldUseLocalAssets()) {
      const picked = await window.jepowDesktop!.assets!.pickModelFile();
      if (picked.canceled || !picked.filePath) return;
      const name = picked.filePath.split(/[/\\]/).pop() || "scene.glb";
      await applyLocalScene(picked.filePath, name);
      return;
    }
    const eng = getViewportEngine();
    const picked = await eng.pickSceneFile();
    if (picked.canceled || !picked.filePath) return;
    const name = picked.filePath.split(/[/\\]/).pop() || "scene.glb";
    await applyLocalScene(picked.filePath, name);
  };

  // Handlers for file upload overrides
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const isAcceptedModel = ext === ".glb" || ext === ".gltf" || ext === ".fbx" || ext === ".obj";
    const isBlend = ext === ".blend";

    if (isBlend && shouldUseLocalCanvasAssets()) {
      await handleImportBlendProject(file);
      return;
    }

    if (!isAcceptedModel) {
      toast.error("只支持上传 .glb, .gltf, .fbx, .obj 或 .blend（工程）");
      return;
    }

    if (ext === ".gltf") {
      toast.warning("提示：您选择上传了 .gltf 格式。.gltf 为文本格式，需配套上传 .bin 和贴图才能完整显示。单文件上传下刷新必定报错丢模，强烈建议您换用 .glb 格式！", { duration: 10000 });
    } else if (ext === ".fbx" || ext === ".obj") {
      if (!isDesktopApp()) {
        toast.warning(
          `提示：您选择上传了 ${ext.toUpperCase()} 格式。网页端更推荐 .glb；桌面端已原生支持 FBX/OBJ 预览。`,
          { duration: 8000 },
        );
      }
    }

    setIsUploading(true);
    try {
      if (shouldUseLocalCanvasAssets() && shouldUseLocalAssets()) {
        const buf = await file.arrayBuffer();
        const saved = await saveLocalModelBuffer(
          getLocalUserId(),
          file.name,
          buf,
        );
        if (!saved.ok || !saved.localPath) {
          throw new Error(saved.error || "本地保存失败");
        }
        const ref =
          (saved as { assetRef?: string }).assetRef ||
          toLocalAssetRef(saved.localPath);
        updateNodeData(id, {
          glbUrl: ref,
          localAssetPath: saved.localPath,
          nativeScenePath: saved.localPath,
          modelName: file.name,
          viewportBackend: "jepow-native",
          localPreviewUrl: "",
        });
        setLoadError(null);
        toast.success(
          `已保存到本地 (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
        );
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        showToast: false,
      } as any);

      if (res.data?.url) {
        const localPreviewUrl = URL.createObjectURL(file);
        updateNodeData(id, {
          glbUrl: res.data.url,
          localPreviewUrl,
          modelName: file.name,
          nativeScenePath: "",
          viewportBackend: "web",
        });
        setLoadError(null);
        toast.success("素材三维文件上传成功！");
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "导入模型失败，请稍后重试",
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div
      id={`node-${id}`}
      style={{ width: "290px" }}
      className={`relative rounded-lg overflow-visible font-sans text-white transition-all duration-200 ${
        selected ? "scale-[1.02] z-50" : ""
      }`}
    >
      {/* Outer Floating Drag Grip Handle (Grab to Move Node) */}
      <div className="absolute -top-[26px] left-1/2 -translate-x-1/2 w-36 h-6 bg-neutral-900/90 border border-neutral-800/80 rounded flex items-center justify-center select-none shadow-xl backdrop-blur-md cursor-grab active:cursor-grabbing hover:bg-neutral-850 hover:border-neutral-700 transition-all z-[999] group">
        <GripHorizontal className="w-4 h-4 text-emerald-400 opacity-60 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Sockets Handle exactly mimicking MaterialGenNode style */}
      <Handle
        type="source"
        position={Position.Right}
        id="model"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-[#10b981] hover:!border-emerald-400 transition-all rounded-full !right-[-16px] z-[100] flex items-center justify-center text-emerald-400 hover:text-white shadow-xl"
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>

      {/* Viewport Box mirroring MaterialGenNode exactly */}
      <div className={`w-full h-[220px] bg-neutral-950 rounded-md relative overflow-hidden flex flex-col border ${selected ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)]" : "border-neutral-800"} transition-all duration-300 group`}>
        {/* Play/Pause render button to control heavy WebGL thread & memory allocations */}
        <Button
          type="button"
          size="icon"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleRenderActive();
          }}
          className="absolute top-2 right-2 h-7 w-7 bg-black/75 hover:bg-black border border-neutral-800 text-neutral-400 hover:text-white pointer-events-auto backdrop-blur-sm rounded z-20 transition-all cursor-pointer shadow-md"
          title={
            useDesktopNativeRenderer
              ? "素材节点为静态预览；连线到 3D 编辑器后点 ▶ 启动渲染器"
              : renderActive
                ? "暂停 WebGL 预览"
                : "启动 WebGL 预览"
          }
        >
          {renderActive ? <Pause className="w-3.5 h-3.5 text-emerald-400" /> : <Play className="w-3.5 h-3.5 text-neutral-400 animate-pulse" />}
        </Button>

        <div id={`model-canvas-container-${id}`} className="absolute inset-0 z-0 nodrag nopan nowheel" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          {desktop3d && !scenePathForNative && !scenePathResolving ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 text-center bg-neutral-950">
              <Box className="w-8 h-8 text-amber-400 mb-2" />
              <span className="text-[10px] font-bold text-amber-300 mb-1">
                未找到本地模型文件
              </span>
              <p className="text-[9px] text-amber-100/80 leading-relaxed max-w-[220px]">
                {scenePathError ||
                  `「${modelName}」路径已丢失。请点下方「从磁盘选择大场景」重新指定文件。`}
              </p>
            </div>
          ) : useDesktopNativeRenderer ? (
            <JepowViewportPreview
              scenePath={scenePathForNative}
              height={220}
              mode="orbit"
              orbitOnly
              liveRender
              lockRenderSize
              defaultCamera={PREVIEW_CAM_45}
              lighting={{
                yaw: 45,
                pitch: 35,
                ambient: 1.0,
                directional: 2.0,
              }}
            />
          ) : (
          <>
          <style dangerouslySetInnerHTML={{ __html: `
            #model-canvas-container-${id} canvas {
              width: 100% !important;
              height: 100% !important;
            }
          `}} />
          {canvasMounted && renderActive ? (
            <Canvas
              dpr={1.5}
              gl={{ antialias: true, powerPreference: "high-performance" }}
              camera={{ position: [0, 0, 2.0], fov: 45 }}
              style={{ background: "radial-gradient(circle, #0e0e0f 0%, #030303 100%)" }}
            >
              <ambientLight intensity={1.5} />
              <directionalLight position={[3, 3, 3]} intensity={2.2} />
              <directionalLight position={[-3, -3, -3]} intensity={0.5} />
              
              <Suspense fallback={<ModelFallback modelName={modelName} />}>
                <CanvasErrorBoundary
                  onError={(err) => {
                    console.warn("GLTF Load error:", err);
                    setLoadError(err.message || "Failed to load model file");
                  }}
                  fallback={<ModelFallback modelName={modelName} />}
                >
                  {glbUrl ? (
                    <ModelRenderer
                      glbUrl={glbUrl}
                      modelName={modelName}
                      onLoadError={setLoadError}
                    />
                  ) : (
                    <ModelFallback modelName={modelName} />
                  )}
                </CanvasErrorBoundary>
              </Suspense>
            </Canvas>
          ) : (
            canvasMounted && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-[#070708]/95 select-none z-10 transition-all">
                <div className="w-10 h-10 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-2.5 shadow-inner">
                  <Box className="w-5 h-5 text-neutral-400" />
                </div>
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1.5 font-mono">
                  3D 渲染控制已暂停
                </span>
                <p className="text-[9px] text-zinc-500 max-w-[210px] leading-relaxed mb-3">
                  加载自C4D的模型过大可能占用大量内容而导致浏览器卡死，已自动或手动为您挂起。
                </p>
                <Button
                  type="button"
                  size="sm"
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-6.5 px-3 text-[9px] font-bold bg-emerald-950/40 hover:bg-emerald-900 border border-emerald-800/80 text-emerald-400 hover:text-white transition-all cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRenderActive();
                  }}
                >
                  点击启动 3D 实时渲染
                </Button>
              </div>
            )
          )}
          </>
          )}
        </div>

        {loadError && glbUrl && !useDesktopNativeRenderer && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-3 bg-black/90 text-center pointer-events-auto">
            <span className="text-[10px] font-bold text-red-400 mb-1">
              模型未能显示
            </span>
            <p className="text-[9px] text-zinc-400 leading-relaxed max-w-[220px]">
              {loadError}
            </p>
          </div>
        )}
        {/* Display tag mimicking MaterialGenNode's indicators */}
        <div className="absolute bottom-2.5 left-2.5 z-10 flex gap-1 pointer-events-none select-none select-none">
          <span className="bg-black/85 text-emerald-400 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-emerald-950/50">
            3D MODEL
          </span>
          <span className="bg-black/60 text-neutral-300 text-[8px] tracking-wider px-1.5 py-0.5 rounded border border-neutral-900/60 max-w-[150px] truncate">
            {modelName}
          </span>
        </div>
      </div>

      {fileExtension === ".gltf" && (
        <div className="mt-2 bg-amber-500/10 border border-amber-500/30 rounded p-2 text-[10px] text-amber-300 select-none leading-relaxed text-left">
          <p className="font-bold flex items-center gap-1 mb-1 text-[11px] text-amber-400">
            ⚠️ .GLTF 需外部依赖
          </p>
          <span>
            .gltf 常依赖同级 .bin 与贴图，单文件上传后刷新可能丢模。建议导出为自包含的 <strong>.glb</strong>。
          </span>
        </div>
      )}
      {!desktop3d &&
        fileExtension &&
        (fileExtension === ".fbx" || fileExtension === ".obj") && (
          <div className="mt-2 bg-amber-500/10 border border-amber-500/30 rounded p-2 text-[10px] text-amber-300 select-none leading-relaxed text-left">
            <p className="font-bold text-[11px] text-amber-400 mb-1">
              网页端提示
            </p>
            <span>
              浏览器环境对 {fileExtension.toUpperCase()} 支持有限，建议转为 <strong>.glb</strong> 上传。
            </span>
          </div>
        )}
      {desktop3d &&
        fileExtension &&
        (fileExtension === ".fbx" || fileExtension === ".obj") && (
          <div className="mt-2 bg-emerald-500/10 border border-emerald-500/25 rounded p-2 text-[10px] text-emerald-200/90 select-none leading-relaxed text-left">
            <span>
              桌面端模型保存在本机，由 <strong>Jepow 自研 wgpu 内核</strong> 绘制白膜（FBX
              导入规则参照 Blender <code>io_scene_fbx</code>，不启动 Blender 程序）。
            </span>
          </div>
        )}

      <div className="mt-2 flex flex-col gap-1.5">
        <input
          id={fileInputId}
          type="file"
          accept=".glb,.gltf,.fbx,.obj,.blend"
          onChange={handleFileUpload}
          className="hidden"
        />
        <Button
          size="sm"
          className="w-full text-[11px] h-8 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 font-bold rounded shadow-sm transition-all flex items-center justify-center gap-1.5"
          disabled={isUploading}
          onClick={() => document.getElementById(fileInputId)?.click()}
        >
          {isUploading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span>正在导入三维资产...</span>
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {shouldUseLocalCanvasAssets()
                  ? "本地导入 3D 模型"
                  : "上传/替换 3D 模型"}
              </span>
            </>
          )}
        </Button>
        {desktop3d && (
          <Button
            size="sm"
            className="w-full text-[11px] h-8 bg-emerald-950/50 border border-emerald-800/80 hover:bg-emerald-900/60 text-emerald-300 font-bold rounded shadow-sm flex items-center justify-center gap-1.5"
            onClick={(e) => {
              e.stopPropagation();
              handleImportNativeScene();
            }}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>从磁盘选择大场景</span>
          </Button>
        )}
        {shouldUseLocalCanvasAssets() && (
          <Button
            size="sm"
            className="w-full text-[11px] h-8 bg-orange-950/40 border border-orange-800/70 hover:bg-orange-900/50 text-orange-200 font-bold rounded shadow-sm flex items-center justify-center gap-1.5"
            disabled={isUploading}
            onClick={(e) => {
              e.stopPropagation();
              void handleImportBlendProject();
            }}
          >
            <Box className="w-3.5 h-3.5" />
            <span>导入 Blender 工程 (.blend)</span>
          </Button>
        )}
      </div>

      {/* Simplified Indicator Tooltip Console */}
      {selected && isOnlySelected && (
        <div
          className="absolute z-[9999] pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300"
          style={{
            top: "100%",
            marginTop: 20 * (1 / Math.max(0.01, zoom)),
            left: "50%",
            transform: `translateX(-50%) scale(${1 / Math.max(0.01, zoom)})`,
            transformOrigin: "top center",
          }}
        >
          <div className="w-[320px] bg-[#161616]/95 border border-neutral-800 rounded-lg p-3.5 shadow-2xl flex flex-col gap-2 backdrop-blur-md select-none">
            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              模型素材联结指示
            </span>
            <p className="text-[10px] text-neutral-400 leading-relaxed">
              此节点输出原始三维模型资产。
              请按住右侧绿色 <strong>OUT ▶</strong> 插槽拉出连线，连接至你的 <strong>3D编辑器</strong> 或是 <strong>材质重映射节点</strong> 来对其渲染。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
