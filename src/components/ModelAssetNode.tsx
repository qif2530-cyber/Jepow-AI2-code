import React, { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { Box, RefreshCw, Layers, FileCode, Check, Upload, GripHorizontal, Plus, Pause, Play } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import api from "../lib/api";

interface ModelAssetNodeProps {
  id: string;
  data: {
    glbUrl?: string;
    modelName?: string;
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

// Helper to determine accurate file format from encoded media URLs or file names
function getExtensionFromUrlOrName(url: string, modelName?: string): string {
  if (modelName) {
    const ext = modelName.substring(modelName.lastIndexOf(".")).toLowerCase();
    if (ext) return ext;
  }
  if (url.includes("/api/media/")) {
    try {
      const parts = url.split("/api/media/");
      const encoded = parts[parts.length - 1];
      if (encoded) {
        let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4) {
          base64 += "=";
        }
        const decoded = atob(base64);
        const ext = decoded.substring(decoded.lastIndexOf(".")).toLowerCase();
        if (ext) return ext;
      }
    } catch (e) {
      console.error(e);
    }
  }
  const cleanUrl = url.split("?")[0].split("#")[0];
  const lastDot = cleanUrl.lastIndexOf(".");
  if (lastDot !== -1) {
    return cleanUrl.substring(lastDot).toLowerCase();
  }
  return "";
}

// Manual format loader to support and parse .glb, .gltf, .fbx, and .obj formats flawlessly
function ModelRenderer({ glbUrl, modelName }: { glbUrl: string; modelName?: string }) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    let active = true;
    const ext = getExtensionFromUrlOrName(glbUrl, modelName);

    const onModelLoaded = (loadedScene: any) => {
      if (!active) return;
      const mainScene = loadedScene.scene || loadedScene;
      setScene(mainScene);
    };

    const onError = (err: any) => {
      console.error("Format renderer load error:", err);
      if (active) setErrorText(String(err));
    };

    if (ext === ".fbx") {
      const fbxLoader = new FBXLoader();
      fbxLoader.load(glbUrl, onModelLoaded, undefined, onError);
    } else if (ext === ".obj") {
      const objLoader = new OBJLoader();
      objLoader.load(glbUrl, onModelLoaded, undefined, onError);
    } else {
      const loader = new GLTFLoader();

      if (glbUrl.startsWith("blob:")) {
        // Fetch binary content directly to bypass file extension check inside GLTFLoader
        fetch(glbUrl)
          .then((res) => {
            if (!res.ok) throw new Error("Local blob load failed");
            return res.arrayBuffer();
          })
          .then((buffer) => {
            if (!active) return;
            loader.parse(
              buffer,
              "",
              (gltf) => {
                if (active) setScene(gltf.scene);
              },
              onError
            );
          })
          .catch(onError);
      } else {
        // Standard HTTP network load
        loader.load(
          glbUrl,
          (gltf) => {
            if (active) setScene(gltf.scene);
          },
          undefined,
          onError
        );
      }
    }

    return () => {
      active = false;
    };
  }, [glbUrl, modelName]);

  // Clean up loaded scene WebGL resources when state scene changes or unmounts
  useEffect(() => {
    return () => {
      if (scene) {
        deepDispose(scene);
      }
    };
  }, [scene]);

  // Auto-center and normalize scale
  const computedModel = useMemo(() => {
    if (!scene) return null;
    const cloned = scene.clone();
    
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    cloned.position.x += -center.x;
    cloned.position.y += -center.y;
    cloned.position.z += -center.z;

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = 1.25 / maxDim;
      cloned.scale.set(scale, scale, scale);
    }

    return cloned;
  }, [scene]);

  // Rotates around Yaw on a rigid 45-degree isometric tilt
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.4;
    }
  });

  if (errorText || !computedModel) {
    return <ModelFallback modelName="Loading..." />;
  }

  return (
    <group 
      ref={groupRef} 
      rotation={[Math.PI / 6, Math.PI / 4, 0]}
    >
      <primitive object={computedModel} />
    </group>
  );
}

export function ModelAssetNode({ id, data, selected }: ModelAssetNodeProps) {
  const { updateNodeData } = useReactFlow();
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

  const glbUrl = data.glbUrl || "";
  const modelName = data.modelName || "unnamed_asset.glb";
  const fileExtension = modelName.substring(modelName.lastIndexOf(".")).toLowerCase();
  
  const renderActive = data.renderActive !== false;
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

  // Handlers for file upload overrides
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const isAcceptedModel = ext === ".glb" || ext === ".gltf" || ext === ".fbx" || ext === ".obj";

    if (!isAcceptedModel) {
      toast.error("只支持上传 .glb, .gltf, .fbx, .obj 格式的模型三维文件");
      return;
    }

    if (ext === ".gltf") {
      toast.warning("提示：您选择上传了 .gltf 格式。.gltf 为文本格式，需配套上传 .bin 和贴图才能完整显示。单文件上传下刷新必定报错丢模，强烈建议您换用 .glb 格式！", { duration: 10000 });
    } else if (ext === ".fbx" || ext === ".obj") {
      toast.warning(`提示：您选择上传了 ${ext.toUpperCase()} 格式。由于后台及网页 Three.js 引擎主要通过 GLTFLoader 驱动，该格式可能在重载刷新后失败。强烈建议导出为 .glb 上传！`, { duration: 10000 });
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        showToast: false,
      } as any);

      if (res.data && res.data.url) {
        updateNodeData(id, {
          glbUrl: res.data.url,
          modelName: file.name
        });
        toast.success("素材三维文件上传成功！");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("上传 model 失败，请稍后重试");
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
          title={renderActive ? "关闭/暂停 3D 渲染以保障系统运行" : "启动 3D 实时渲染"}
        >
          {renderActive ? <Pause className="w-3.5 h-3.5 text-emerald-400" /> : <Play className="w-3.5 h-3.5 text-neutral-400 animate-pulse" />}
        </Button>

        <div id={`model-canvas-container-${id}`} className="absolute inset-0 z-0 nodrag nopan nowheel" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
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
                  {glbUrl && !loadError ? (
                    <ModelRenderer glbUrl={glbUrl} modelName={modelName} />
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
        </div>

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

      {fileExtension && fileExtension !== ".glb" && (
        <div className="mt-2 bg-amber-500/10 border border-amber-500/30 rounded p-2 text-[10px] text-amber-300 select-none leading-relaxed text-left">
          <p className="font-bold flex items-center gap-1 mb-1 text-[11px] text-amber-400">
            ⚠️ 格式警告: {fileExtension.toUpperCase()} 依赖可能会丢失
          </p>
          {fileExtension === '.gltf' ? (
            <span>
              您当前加载的是 <strong>.gltf 文件</strong>。此格式仅包含纯文本 JSON 结构，并通常依赖同文件夹下的外部 <strong>.bin 几何文件</strong> 或 <strong>图片贴图</strong>。
              <br />
              由于网页多文件上传限制且后台未持有附加资源文件，在页面刷新/退出重新登入后会导致白模、加载失败或卡死报错。
              <br />
              <strong className="text-white mt-1 block">💡 解决方案：请在 Blender/C4D 或 3ds Max 中，导出为格式自包含、将贴图与数据全部打包在一起的单体 .glb (Binary GLTF) 格式模型后再上传！</strong>
            </span>
          ) : (
            <span>
              网页端标准 3D 渲染器仅原生高性能支持 <strong>.glb / .gltf</strong> 标准物理网格。
              直接上传 {fileExtension.toUpperCase()} 格式的素材可能无法通过 WebGL 渲染，
              <strong className="text-white mt-1 block">💡 强力推荐：将其导入 Blender 或 Unity 并直接导出打包为自包含的 .glb 格式上传，实现完美跨端显示。</strong>
            </span>
          )}
        </div>
      )}

      {/* Upload button panel mapping precisely to MaterialGenNode structure */}
      <div className="mt-2 text-center">
        <input
          id={fileInputId}
          type="file"
          accept=".glb,.gltf,.fbx,.obj"
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
              <span>上传/替换 .glb 三维参考模型</span>
            </>
          )}
        </Button>
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
