import React, { useState, useEffect } from "react";
import { Handle, Position, useReactFlow, useStore } from "@xyflow/react";
import { Sparkles, Loader2, Link, RefreshCw, Layers, Plus, Settings, Upload, Check, GripHorizontal } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { toast } from "sonner";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import api from "../lib/api";
import { createCyclesMaterial } from "../lib/cycles-material";

interface MaterialGenNodeProps {
  id: string;
  data: {
    prompt?: string;
    colorUrl?: string;
    normalUrl?: string;
    roughnessUrl?: string;
    metalnessUrl?: string;
    bumpUrl?: string;
    tiling?: number;
    status?: string;
    tint?: string;
    roughness?: number;
    metalness?: number;
    normalScale?: number;
    displacementScale?: number;
    transmission?: number;
    ior?: number;
    specular?: number;
    clearcoat?: number;
    emissionStrength?: number;
    alpha?: number;
    specularTint?: number;
    anisotropic?: number;
    anisotropicRotation?: number;
    coatRoughness?: number;
    coatIor?: number;
    sheenWeight?: number;
    sheenRoughness?: number;
    thinFilmThickness?: number;
    thinFilmIor?: number;
    displacementMidlevel?: number;
    emissionColor?: string;
    cyclesMaterial?: ReturnType<typeof createCyclesMaterial>;
  };
  selected?: boolean;
}

// 3D Preview Sphere supporting comprehensive dynamic properties
function MaterialPreviewSphere({
  colorUrl,
  normalUrl,
  roughnessUrl,
  metalnessUrl,
  bumpUrl,
  tint,
  roughness,
  metalness,
  normalScale,
  displacementScale,
  transmission,
  ior,
  specular,
  clearcoat,
  coatRoughness,
  alpha,
  emissionColor,
  emissionStrength,
  tiling
}: any) {
  const [textures, setTextures] = useState<any>({});

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    let map: THREE.Texture | null = null;
    let normalMap: THREE.Texture | null = null;
    let roughnessMap: THREE.Texture | null = null;
    let metalnessMap: THREE.Texture | null = null;
    let bumpMap: THREE.Texture | null = null;

    const repeatVal = tiling || 1;

    if (colorUrl) {
      map = loader.load(colorUrl);
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeatVal, repeatVal);
      map.anisotropy = 16;
    }
    if (normalUrl) {
      normalMap = loader.load(normalUrl);
      normalMap.wrapS = THREE.RepeatWrapping;
      normalMap.wrapT = THREE.RepeatWrapping;
      normalMap.repeat.set(repeatVal, repeatVal);
      normalMap.anisotropy = 16;
    }
    if (roughnessUrl) {
      roughnessMap = loader.load(roughnessUrl);
      roughnessMap.wrapS = THREE.RepeatWrapping;
      roughnessMap.wrapT = THREE.RepeatWrapping;
      roughnessMap.repeat.set(repeatVal, repeatVal);
      roughnessMap.anisotropy = 16;
    }
    if (metalnessUrl) {
      metalnessMap = loader.load(metalnessUrl);
      metalnessMap.wrapS = THREE.RepeatWrapping;
      metalnessMap.wrapT = THREE.RepeatWrapping;
      metalnessMap.repeat.set(repeatVal, repeatVal);
      metalnessMap.anisotropy = 16;
    }
    if (bumpUrl) {
      bumpMap = loader.load(bumpUrl);
      bumpMap.wrapS = THREE.RepeatWrapping;
      bumpMap.wrapT = THREE.RepeatWrapping;
      bumpMap.repeat.set(repeatVal, repeatVal);
      bumpMap.anisotropy = 16;
    }

    setTextures({ map, normalMap, roughnessMap, metalnessMap, bumpMap });
  }, [colorUrl, normalUrl, roughnessUrl, metalnessUrl, bumpUrl, tiling]);

  return (
    <mesh rotation={[0, -Math.PI / 4, 0]}>
      <sphereGeometry args={[1.1, 64, 64]} />
      <meshPhysicalMaterial
        color={new THREE.Color(tint || "#ffffff")}
        map={textures.map || null}
        normalMap={textures.normalMap || null}
        normalScale={new THREE.Vector2(normalScale ?? 1.0, normalScale ?? 1.0)}
        roughnessMap={textures.roughnessMap || null}
        roughness={roughness ?? 0.4}
        metalnessMap={textures.metalnessMap || null}
        metalness={metalness ?? 0.3}
        bumpMap={displacementScale > 0 ? (textures.bumpMap || textures.map || textures.normalMap || null) : null}
        bumpScale={displacementScale * 0.05}
        transmission={transmission ?? 0.0}
        ior={ior ?? 1.5}
        reflectivity={specular ?? 0.5}
        clearcoat={clearcoat ?? 0.0}
        clearcoatRoughness={coatRoughness ?? Math.min(1, (roughness ?? 0.4) * 0.65)}
        transparent={(alpha ?? 1.0) < 1.0}
        opacity={alpha ?? 1.0}
        emissive={new THREE.Color(emissionColor || tint || "#ffffff")}
        emissiveIntensity={emissionStrength ?? 0.0}
        thickness={transmission > 0 ? 1.0 : 0.0}
      />
    </mesh>
  );
}

// Deep analyze image algorithm using simulated Canvas processing
const analyzeImageMaterial = (imgUrl: string): Promise<{
  tint: string;
  roughness: number;
  metalness: number;
  displacementScale: number;
}> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = 64;
        tempCanvas.height = 64;
        const ctx = tempCanvas.getContext("2d");
        if (!ctx) {
          resolve({ tint: "#ffffff", roughness: 0.5, metalness: 0.0, displacementScale: 0.2 });
          return;
        }
        ctx.drawImage(img, 0, 0, 64, 64);
        const imgData = ctx.getImageData(0, 0, 64, 64).data;

        let rSum = 0, gSum = 0, bSum = 0;
        let brightnessMin = 255;
        let brightnessMax = 0;

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];

          rSum += r;
          gSum += g;
          bSum += b;

          const brightness = r * 0.299 + g * 0.587 + b * 0.114;
          if (brightness < brightnessMin) brightnessMin = brightness;
          if (brightness > brightnessMax) brightnessMax = brightness;
        }

        const count = imgData.length / 4;
        const rAvg = Math.round(rSum / count);
        const gAvg = Math.round(gSum / count);
        const bAvg = Math.round(bSum / count);

        const toHex = (c: number) => {
          const hex = c.toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        };
        const tintHex = `#${toHex(rAvg)}${toHex(gAvg)}${toHex(bAvg)}`;

        const contrast = brightnessMax - brightnessMin;
        const isSaturated = Math.max(rAvg, gAvg, bAvg) - Math.min(rAvg, gAvg, bAvg) > 60;

        let roughnessVal = 0.5;
        let metalnessVal = 0.0;
        let dispScale = 0.2;

        if (contrast > 140) {
          roughnessVal = 0.2;
          metalnessVal = isSaturated ? 0.75 : 0.55;
          dispScale = 0.15;
        } else if (contrast < 65) {
          roughnessVal = 0.8;
          metalnessVal = 0.0;
          dispScale = 0.35;
        } else {
          roughnessVal = 0.45;
          metalnessVal = rAvg > 160 && gAvg > 160 && bAvg > 160 ? 0.25 : 0.0;
          dispScale = 0.25;
        }

        resolve({
          tint: tintHex,
          roughness: roughnessVal,
          metalness: metalnessVal,
          displacementScale: dispScale
        });
      } catch (err) {
        console.error("Local canvas reading failed:", err);
        resolve({ tint: "#ffffff", roughness: 0.5, metalness: 0.0, displacementScale: 0.2 });
      }
    };
    img.onerror = () => {
      resolve({ tint: "#ffffff", roughness: 0.5, metalness: 0.0, displacementScale: 0.2 });
    };
    img.src = imgUrl;
  });
};

export function MaterialGenNode({ id, data, selected }: MaterialGenNodeProps) {
  const { getNodes, getEdges, updateNodeData } = useReactFlow();
  const [localPrompt, setLocalPrompt] = useState(data.prompt || "");
  const [tilingScale, setTilingScale] = useState(data.tiling || 1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeSlotKey, setActiveSlotKey] = useState<string | null>(null);
  const [assetSelectorOpenFor, setAssetSelectorOpenFor] = useState<string | null>(null);
  const [canvasMounted, setCanvasMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCanvasMounted(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const addToPersistentHistory = (url: string) => {
    try {
      const existing = JSON.parse(localStorage.getItem("material_asset_history") || "[]");
      if (Array.isArray(existing)) {
        if (!existing.includes(url)) {
          localStorage.setItem("material_asset_history", JSON.stringify([...existing, url]));
        }
      } else {
        localStorage.setItem("material_asset_history", JSON.stringify([url]));
      }
      // Also dispatch event to allow other listeners to refresh
      window.dispatchEvent(new Event("material-asset-history-updated"));
    } catch (e) {
      console.warn("Failed to update localStorage asset history:", e);
    }
  };

  const getCanvasImages = () => {
    const urls = new Set<string>();
    const nodes = getNodes();
    nodes.forEach((n) => {
      if (n.data) {
        if (typeof n.data.url === "string" && n.data.url.startsWith("http")) urls.add(n.data.url);
        if (typeof n.data.colorUrl === "string" && n.data.colorUrl.startsWith("http")) urls.add(n.data.colorUrl);
        if (typeof n.data.normalUrl === "string" && n.data.normalUrl.startsWith("http")) urls.add(n.data.normalUrl);
        if (typeof n.data.roughnessUrl === "string" && n.data.roughnessUrl.startsWith("http")) urls.add(n.data.roughnessUrl);
        if (typeof n.data.metalnessUrl === "string" && n.data.metalnessUrl.startsWith("http")) urls.add(n.data.metalnessUrl);
        if (typeof n.data.bumpUrl === "string" && n.data.bumpUrl.startsWith("http")) urls.add(n.data.bumpUrl);
        if (typeof n.data.activeColor === "string" && n.data.activeColor.startsWith("http")) urls.add(n.data.activeColor);
        if (typeof n.data.activeRoughness === "string" && n.data.activeRoughness.startsWith("http")) urls.add(n.data.activeRoughness);
        if (typeof n.data.activeNormal === "string" && n.data.activeNormal.startsWith("http")) urls.add(n.data.activeNormal);
        if (typeof n.data.activeMetalness === "string" && n.data.activeMetalness.startsWith("http")) urls.add(n.data.activeMetalness);
        if (typeof n.data.activeBump === "string" && n.data.activeBump.startsWith("http")) urls.add(n.data.activeBump);
        if (Array.isArray(n.data.urls)) {
          n.data.urls.forEach((u: any) => {
            if (typeof u === "string" && u.startsWith("http")) urls.add(u);
          });
        }
      }
    });

    try {
      const history = JSON.parse(localStorage.getItem("material_asset_history") || "[]");
      if (Array.isArray(history)) {
        history.forEach((u: string) => {
          if (typeof u === "string" && u.startsWith("http")) urls.add(u);
        });
      }
    } catch (_) {}

    return Array.from(urls);
  };

  const getSlotName = (key: string) => {
    switch (key) {
      case "colorUrl": return "漫反射底色贴图";
      case "roughnessUrl": return "表面粗糙度贴图";
      case "metalnessUrl": return "金属度物理贴图";
      case "normalUrl": return "法线凹凸细节贴图";
      case "bumpUrl": return "高度起伏置换贴图";
      default: return key;
    }
  };

  const handleDirectMapUpload = async (key: string, file: File) => {
    const toastId = toast.loading(`正在关联并应用 PBR 通道贴图...`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const url = res.data.url;
      const nextRaw = { ...data, [key]: url };
      updateNodeData(id, {
        [key]: url,
        cyclesMaterial: createCyclesMaterial(nextRaw),
        status: "done"
      });
      addToPersistentHistory(url);
      toast.success(`该通道的 3D 贴图已成功关联并实时更新！`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(`关联贴图失败，请稍后重试`, { id: toastId });
    }
  };

  const triggerDirectMapUpload = (key: string) => {
    setActiveSlotKey(key);
    setTimeout(() => {
      const el = document.getElementById(`direct-slot-picker-${id}`);
      if (el) {
        (el as HTMLInputElement).value = "";
        el.click();
      }
    }, 50);
  };

  const zoom = useStore((s) => s.transform[2]);
  const isOnlySelected = useStore(
    (s) =>
      (s.nodeLookup ? Array.from(s.nodeLookup.values()) : s.nodes || []).filter(
        (n) => n.selected,
      ).length === 1,
  );

  // Cycles is the source of truth. Legacy flat fields are read only for migration.
  const cyclesMaterial = createCyclesMaterial(data);
  const cycles = cyclesMaterial.principled;
  const tint = cycles.baseColor;
  const roughness = cycles.roughness;
  const metalness = cycles.metallic;
  const normalScale = cycles.normalStrength;
  const displacementScale = cycles.displacementScale;
  const transmission = cycles.transmissionWeight;
  const ior = cycles.ior;
  const specular = cycles.specularIorLevel;
  const clearcoat = cycles.coatWeight;
  const emissionStrength = cycles.emissionStrength;
  const alpha = cycles.alpha;
  const specularTint = cycles.specularTint;
  const anisotropic = cycles.anisotropic;
  const anisotropicRotation = cycles.anisotropicRotation;
  const coatRoughness = cycles.coatRoughness;
  const coatIor = cycles.coatIor;
  const sheenWeight = cycles.sheenWeight;
  const sheenRoughness = cycles.sheenRoughness;
  const thinFilmThickness = cycles.thinFilmThickness;
  const thinFilmIor = cycles.thinFilmIor;
  const displacementMidlevel = cycles.displacementMidlevel;
  const emissionColor = cycles.emissionColor;

  useEffect(() => {
    if (!data.cyclesMaterial) {
      updateNodeData(id, { cyclesMaterial });
    }
  }, [data.cyclesMaterial, id, updateNodeData, cyclesMaterial]);

  const nodes = getNodes();
  const edges = getEdges();

  const incomingEdge = edges.find((e) => e.target === id && e.targetHandle === "textOrImage");
  const sourceNode = incomingEdge ? nodes.find((n) => n.id === incomingEdge.source) : null;

  let connectedPrompt = "";
  if (sourceNode) {
    if (sourceNode.type === "textNode") {
      connectedPrompt = sourceNode.data.text as string;
    } else if (sourceNode.type === "scriptNode") {
      connectedPrompt = sourceNode.data.prompt as string;
    }
  }

  const activePrompt = connectedPrompt || localPrompt;

  // Propagate tiling shifts
  useEffect(() => {
    if (tilingScale !== data.tiling) {
      const nextRaw = { ...data, tiling: tilingScale };
      updateNodeData(id, {
        tiling: tilingScale,
        cyclesMaterial: createCyclesMaterial(nextRaw),
      });
    }
  }, [tilingScale]);

  const handleGenerateMaterial = async () => {
    const finalPrompt = activePrompt.trim();
    if (!finalPrompt) {
      toast.error("请输入材质描述文本或连线接入 [文本/脚本节点]！");
      return;
    }

    setIsGenerating(true);
    setProgress(20);

    try {
      const interval = setInterval(() => {
        setProgress((p) => {
          if (p >= 85) {
            clearInterval(interval);
            return 85;
          }
          return p + Math.floor(Math.random() * 10) + 1;
        });
      }, 100);

      const res = await api.post("/3d/generate-material", { prompt: finalPrompt });

      clearInterval(interval);
      setProgress(100);
      toast.success("材质贴图生成成功，扣除 50 积分");

      updateNodeData(id, {
        prompt: finalPrompt,
        colorUrl: res.data.colorUrl,
        normalUrl: res.data.normalUrl,
        roughnessUrl: res.data.roughnessUrl,
        metalnessUrl: res.data.metalnessUrl,
        tiling: tilingScale,
        tint: "#ffffff",
        cyclesMaterial: createCyclesMaterial({
          ...data,
          colorUrl: res.data.colorUrl,
          normalUrl: res.data.normalUrl,
          roughnessUrl: res.data.roughnessUrl,
          metalnessUrl: res.data.metalnessUrl,
          tiling: tilingScale,
          tint: "#ffffff",
        }),
        status: "done"
      });

      if (res.data.colorUrl) addToPersistentHistory(res.data.colorUrl);
      if (res.data.normalUrl) addToPersistentHistory(res.data.normalUrl);
      if (res.data.roughnessUrl) addToPersistentHistory(res.data.roughnessUrl);
      if (res.data.metalnessUrl) addToPersistentHistory(res.data.metalnessUrl);

      window.dispatchEvent(new Event("credits-changed"));
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || "材质生成异常，请重新提交");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClear = () => {
    updateNodeData(id, {
      colorUrl: undefined,
      normalUrl: undefined,
      roughnessUrl: undefined,
      metalnessUrl: undefined,
      status: undefined,
      tint: "#ffffff",
      roughness: 0.5,
      metalness: 0.0,
      normalScale: 1.0,
      displacementScale: 0.0,
      transmission: 0.0,
      ior: 1.5,
      specular: 0.5,
      clearcoat: 0.0,
      emissionStrength: 0.0,
      alpha: 1.0,
      specularTint: 0.0,
      anisotropic: 0.0,
      anisotropicRotation: 0.0,
      coatRoughness: 0.25,
      coatIor: 1.5,
      sheenWeight: 0.0,
      sheenRoughness: 0.5,
      thinFilmThickness: 0.0,
      thinFilmIor: 1.33,
      displacementMidlevel: 0.5,
      emissionColor: "#ffffff",
      cyclesMaterial: createCyclesMaterial({})
    });
    setProgress(0);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    const toastId = toast.loading("正在上传参考图片并提取材质图谱...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      const imgUrl = res.data.url;
      const analysis = await analyzeImageMaterial(imgUrl);

      updateNodeData(id, {
        colorUrl: imgUrl,
        normalUrl: undefined,
        roughnessUrl: undefined,
        metalnessUrl: undefined,
        tint: analysis.tint,
        roughness: analysis.roughness,
        metalness: analysis.metalness,
        displacementScale: analysis.displacementScale,
        transmission: 0.0,
        status: "done",
        tiling: tilingScale,
        cyclesMaterial: createCyclesMaterial({
          ...data,
          colorUrl: imgUrl,
          normalUrl: undefined,
          roughnessUrl: undefined,
          metalnessUrl: undefined,
          tint: analysis.tint,
          roughness: analysis.roughness,
          metalness: analysis.metalness,
          displacementScale: analysis.displacementScale,
          transmission: 0.0,
          tiling: tilingScale,
        }),
      });

      addToPersistentHistory(imgUrl);

      toast.success("材质智能提取合并成功！已应用于3D球!", { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error("提取失败，请检查文件类型", { id: toastId });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleValChange = (key: string, val: any) => {
    const nextRaw = { ...data, [key]: val };
    updateNodeData(id, {
      [key]: val,
      cyclesMaterial: createCyclesMaterial(nextRaw),
    });
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

      {/* Sockets */}
      <Handle
        type="target"
        position={Position.Left}
        id="textOrImage"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-neutral-700 hover:!border-neutral-500 transition-all rounded-full !left-[-16px] z-[100] flex items-center justify-center text-neutral-500 hover:text-white shadow-xl"
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>
      <Handle
        type="source"
        position={Position.Right}
        id="material"
        className="!w-8 !h-8 !bg-[#2A2A2A] !border-[1.5px] !border-[#10b981] hover:!border-emerald-400 transition-all rounded-full !right-[-16px] z-[100] flex items-center justify-center text-emerald-400 hover:text-white shadow-xl"
      >
        <Plus className="w-5 h-5 pointer-events-none" />
      </Handle>

      {/* Viewport viewport Box: Default 3D Live material sphere */}
      <div className={`w-full h-[220px] bg-neutral-950 rounded-md relative overflow-hidden flex flex-col border ${selected ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)]" : "border-neutral-800"} transition-all duration-300 group`}>
        <div id={`material-canvas-container-${id}`} className="absolute inset-0 z-0 nodrag nopan nowheel" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          <style dangerouslySetInnerHTML={{ __html: `
            #material-canvas-container-${id} canvas {
              width: 100% !important;
              height: 100% !important;
            }
          `}} />
          {canvasMounted && (
            <Canvas
              dpr={2}
              gl={{ antialias: true, powerPreference: "high-performance" }}
              camera={{ position: [0, 0, 2.4] }}
              style={{ background: "radial-gradient(circle, #0e0e0f 0%, #030303 100%)" }}
            >
              <ambientLight intensity={1.5} />
              <directionalLight position={[2, 2, 2]} intensity={2.0} />
              <directionalLight position={[-2, -2, -2]} intensity={0.5} />
              <MaterialPreviewSphere
                colorUrl={data.colorUrl}
                normalUrl={data.normalUrl}
                roughnessUrl={data.roughnessUrl}
                metalnessUrl={data.metalnessUrl}
                bumpUrl={data.bumpUrl}
                tint={tint}
                roughness={roughness}
                metalness={metalness}
                normalScale={normalScale}
                displacementScale={displacementScale}
                transmission={transmission}
                ior={ior}
                specular={specular}
                clearcoat={clearcoat}
                coatRoughness={coatRoughness}
                alpha={alpha}
                emissionColor={emissionColor}
                emissionStrength={emissionStrength}
                tiling={tilingScale}
              />
              <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.8} target={[0, 0, 0]} />
            </Canvas>
          )}
        </div>

        {/* Display tags for loaded map types */}
        {data.colorUrl && (
          <div className="absolute bottom-2.5 left-2.5 z-10 flex gap-1 pointer-events-none select-none">
            <span className="bg-black/80 text-emerald-400 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-emerald-950/50">COLOR</span>
            <span className={data.normalUrl ? "bg-black/80 text-blue-400 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-blue-950/50" : "bg-black/50 text-neutral-600 text-[8px] tracking-wider px-1.5 py-0.5 rounded"}>NORMAL</span>
            <span className={data.roughnessUrl ? "bg-black/80 text-amber-400 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-950/50" : "bg-black/50 text-neutral-600 text-[8px] tracking-wider px-1.5 py-0.5 rounded"}>ROUGH</span>
            <span className={data.metalnessUrl ? "bg-black/80 text-zinc-400 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-neutral-900" : "bg-black/50 text-neutral-600 text-[8px] tracking-wider px-1.5 py-0.5 rounded"}>METAL</span>
          </div>
        )}

        {isGenerating && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 z-10 animate-in fade-in duration-300">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-black text-neutral-200 tracking-wider">烘培程序贴图序列中 ({progress}%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Expanded Control Preset floating control */}
      {selected && isOnlySelected && (
        <div
          className="absolute z-[9999] pointer-events-auto nodrag nopan nowheel animate-in fade-in slide-in-from-top-4 duration-300 animate-out fade-out"
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
            id={`material-floating-panel-${id}`}
            className="nodrag nopan nowheel w-[420px] bg-[#151515]/96 border border-neutral-800 rounded-lg p-2.5 shadow-2xl flex flex-col gap-2 max-h-[430px] overflow-y-auto backdrop-blur-md"
          >
            <style dangerouslySetInnerHTML={{ __html: `
              #material-floating-panel-${id} input[type="range"] { height: 3px; margin-top: 6px; }
              #material-floating-panel-${id} .material-param-grid > div { padding: 8px !important; gap: 4px !important; border-radius: 7px !important; }
              #material-floating-panel-${id} .material-param-grid span { font-size: 10px !important; }
              #material-floating-panel-${id} .material-param-grid input[type="text"] { height: 24px !important; font-size: 9px !important; }
              #material-floating-panel-${id} .material-param-grid input[type="color"] { width: 24px !important; height: 24px !important; }
            `}} />
            {assetSelectorOpenFor ? (
              <div className="flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    关联{getSlotName(assetSelectorOpenFor)}
                  </span>
                  <button
                    onClick={() => setAssetSelectorOpenFor(null)}
                    className="text-[10px] text-neutral-400 hover:text-white transition-colors"
                  >
                    返回控制台
                  </button>
                </div>
                
                <div className="grid grid-cols-6 gap-1.5 max-h-[220px] overflow-y-auto pr-1 py-1">
                  {/* Upload new option tile */}
                  <div
                    onClick={() => {
                      triggerDirectMapUpload(assetSelectorOpenFor);
                      setAssetSelectorOpenFor(null);
                    }}
                    className="aspect-square rounded border border-dashed border-neutral-800 hover:border-emerald-500/50 bg-neutral-950 flex flex-col items-center justify-center cursor-pointer group transition-all text-neutral-500 hover:text-emerald-400"
                    title="上传本地电脑贴图作为当前通道贴图"
                  >
                    <Plus className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] font-bold">上传本地</span>
                  </div>

                  {getCanvasImages().map((url, idx) => {
                    const isSelected = data[assetSelectorOpenFor as keyof typeof data] === url;
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          const nextRaw = { ...data, [assetSelectorOpenFor]: url };
                          updateNodeData(id, {
                            [assetSelectorOpenFor]: url,
                            cyclesMaterial: createCyclesMaterial(nextRaw),
                            status: "done"
                          });
                          addToPersistentHistory(url);
                          setAssetSelectorOpenFor(null);
                        }}
                        className={`aspect-square rounded overflow-hidden cursor-pointer relative group border transition-all ${
                          isSelected ? "border-emerald-500 ring-1 ring-emerald-500/50 bg-emerald-950/10" : "border-neutral-800 hover:border-neutral-700 bg-neutral-950"
                        }`}
                      >
                        <img src={url} className="w-full h-full object-cover group-hover:scale-105 transition-transform" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[9px] bg-black/80 text-white px-2 py-0.5 rounded font-black scale-90 text-[10px]">选择</span>
                        </div>
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-[1px] shadow z-10">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {getCanvasImages().length === 0 && (
                  <div className="text-center py-6 text-[10px] text-neutral-600 bg-neutral-950/30 border border-neutral-900 rounded">
                    当前画布或会话历史中暂无可用素材图，请尝试连线导入或点击 [上传本地]
                  </div>
                )}

                <div className="flex gap-2 justify-end pt-2 border-t border-neutral-800/40">
                  {data[assetSelectorOpenFor as keyof typeof data] && (
                    <button
                      onClick={() => {
                        const nextRaw = { ...data, [assetSelectorOpenFor]: undefined };
                        updateNodeData(id, {
                          [assetSelectorOpenFor]: undefined,
                          cyclesMaterial: createCyclesMaterial(nextRaw),
                        });
                        setAssetSelectorOpenFor(null);
                      }}
                      className="text-[10px] text-red-500 bg-red-950/20 border border-red-900/30 px-2.5 py-1 rounded transition-all hover:bg-red-500 hover:text-white"
                    >
                      从此通道解绑
                    </button>
                  )}
                  <button
                    onClick={() => setAssetSelectorOpenFor(null)}
                    className="text-[10px] text-neutral-400 bg-neutral-950 border border-neutral-800 px-3 py-1 rounded transition-all hover:bg-neutral-800 hover:text-white"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-neutral-800/80 pb-1.5 justify-between select-none">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] font-bold text-neutral-200">Cycles Principled BSDF</span>
                  </div>
                  <span className="text-[8px] bg-emerald-950/80 text-emerald-400 border border-emerald-900/60 font-semibold px-1.5 py-0.5 rounded-full font-mono">
                    CYCLES
                  </span>
                </div>
                <div className="rounded-md border border-emerald-900/30 bg-emerald-950/15 px-2 py-1.5 text-[9px] leading-snug text-emerald-100/70">
                  输出 <strong className="text-emerald-300">cyclesMaterial</strong>，视口仅预览，物理渲染读取同一套参数。
                </div>

                {/* PBR parameter grids */}
                <div className="flex flex-col gap-1.5 pt-0.5">
                  {/* Hidden direct channel picker */}
                  <input
                    id={`direct-slot-picker-${id}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && activeSlotKey) {
                        handleDirectMapUpload(activeSlotKey, file);
                        setActiveSlotKey(null);
                      }
                    }}
                  />

                  <div className="material-param-grid grid grid-cols-2 gap-2 pb-1 text-[10px] select-none text-white">
                    {/* 1. Diffuse Tint */}
                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200">
                      <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={async (e) => {
                              e.preventDefault(); e.stopPropagation();
                              const file = e.dataTransfer.files?.[0];
                              if (file) handleDirectMapUpload("colorUrl", file);
                            }}
                            onClick={() => setAssetSelectorOpenFor("colorUrl")}
                            className="w-6 h-6 rounded border border-dashed border-neutral-700 hover:border-emerald-505 bg-neutral-950 flex items-center justify-center cursor-pointer shrink-0 overflow-hidden relative group transition-all"
                            title="点击选择现有贴图或上传漫反射色贴图"
                          >
                            {data.colorUrl ? (
                              <img src={data.colorUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Plus className="w-3 h-3 text-neutral-500 group-hover:text-emerald-400" />
                            )}
                          </div>
                          <span className="text-[11px] font-bold text-neutral-300 truncate">Base Color / 底色</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-neutral-400 px-1.5 py-0.5 bg-neutral-950 rounded border border-neutral-805">{tint}</span>
                      </div>
                      <div className="flex items-center gap-1.5 h-7 mt-0.5">
                        <input
                          type="color"
                          value={tint}
                          onChange={(e) => handleValChange("tint", e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-7 h-7 rounded border border-neutral-800 bg-transparent cursor-pointer shrink-0"
                        />
                        <input
                          type="text"
                          value={tint}
                          onChange={(e) => handleValChange("tint", e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="h-7 text-[10px] font-mono bg-neutral-950 border border-neutral-850 text-white rounded px-2 w-full focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    {/* 2. Roughness */}
                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200">
                      <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={async (e) => {
                              e.preventDefault(); e.stopPropagation();
                              const file = e.dataTransfer.files?.[0];
                              if (file) handleDirectMapUpload("roughnessUrl", file);
                            }}
                            onClick={() => setAssetSelectorOpenFor("roughnessUrl")}
                            className="w-6 h-6 rounded border border-dashed border-neutral-700 hover:border-emerald-505 bg-neutral-950 flex items-center justify-center cursor-pointer shrink-0 overflow-hidden relative group transition-all"
                            title="点击选择现有贴图或上传粗糙度贴图"
                          >
                            {data.roughnessUrl ? (
                              <img src={data.roughnessUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Plus className="w-3 h-3 text-neutral-500 group-hover:text-emerald-400" />
                            )}
                          </div>
                          <span className="text-[11px] font-bold text-neutral-300 truncate">Roughness / 粗糙度</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{roughness.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={roughness}
                        onChange={(e) => handleValChange("roughness", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2"
                      />
                    </div>

                    {/* 3. Metalness */}
                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200">
                      <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={async (e) => {
                              e.preventDefault(); e.stopPropagation();
                              const file = e.dataTransfer.files?.[0];
                              if (file) handleDirectMapUpload("metalnessUrl", file);
                            }}
                            onClick={() => setAssetSelectorOpenFor("metalnessUrl")}
                            className="w-6 h-6 rounded border border-dashed border-neutral-700 hover:border-emerald-505 bg-neutral-950 flex items-center justify-center cursor-pointer shrink-0 overflow-hidden relative group transition-all"
                            title="点击选择现有贴图或上传金属度贴图"
                          >
                            {data.metalnessUrl ? (
                              <img src={data.metalnessUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Plus className="w-3 h-3 text-neutral-500 group-hover:text-emerald-400" />
                            )}
                          </div>
                          <span className="text-[11px] font-bold text-neutral-300 truncate">Metallic / 金属度</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{metalness.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={metalness}
                        onChange={(e) => handleValChange("metalness", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2"
                      />
                    </div>

                    {/* 4. Normal Scale */}
                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200">
                      <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={async (e) => {
                              e.preventDefault(); e.stopPropagation();
                              const file = e.dataTransfer.files?.[0];
                              if (file) handleDirectMapUpload("normalUrl", file);
                            }}
                            onClick={() => setAssetSelectorOpenFor("normalUrl")}
                            className="w-6 h-6 rounded border border-dashed border-neutral-700 hover:border-emerald-505 bg-neutral-950 flex items-center justify-center cursor-pointer shrink-0 overflow-hidden relative group transition-all"
                            title="点击选择现有贴图或上传法线贴图"
                          >
                            {data.normalUrl ? (
                              <img src={data.normalUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Plus className="w-3 h-3 text-neutral-500 group-hover:text-emerald-400" />
                            )}
                          </div>
                          <span className="text-[11px] font-bold text-neutral-300 truncate">Normal Map / 法线</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{normalScale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="2.0"
                        step="0.1"
                        value={normalScale}
                        onChange={(e) => handleValChange("normalScale", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2"
                      />
                    </div>

                    {/* 5. Bump/Displacement Scale */}
                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200">
                      <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={async (e) => {
                              e.preventDefault(); e.stopPropagation();
                              const file = e.dataTransfer.files?.[0];
                              if (file) handleDirectMapUpload("bumpUrl", file);
                            }}
                            onClick={() => setAssetSelectorOpenFor("bumpUrl")}
                            className="w-6 h-6 rounded border border-dashed border-neutral-700 hover:border-emerald-505 bg-neutral-950 flex items-center justify-center cursor-pointer shrink-0 overflow-hidden relative group transition-all"
                            title="点击选择现有贴图或上传高度凹凸贴图"
                          >
                            {data.bumpUrl ? (
                              <img src={data.bumpUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Plus className="w-3 h-3 text-neutral-500 group-hover:text-emerald-400" />
                            )}
                          </div>
                          <span className="text-[11px] font-bold text-neutral-300 truncate">Height / Bump（预览球）</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{displacementScale.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={displacementScale}
                        onChange={(e) => handleValChange("displacementScale", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2"
                      />
                    </div>

                    {/* 6. Transmission */}
                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Transmission（预留离线渲染）</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{transmission.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={transmission}
                        onChange={(e) => handleValChange("transmission", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    {/* 7. IOR */}
                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>IOR（预留离线渲染）</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{ior.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="2.33"
                        step="0.05"
                        value={ior}
                        onChange={(e) => handleValChange("ior", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    {/* 8. Tiling repetitiveness */}
                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Alpha / 透明度</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{alpha.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={alpha}
                        onChange={(e) => handleValChange("alpha", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Specular IOR Level</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{specular.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={specular}
                        onChange={(e) => handleValChange("specular", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Specular Tint</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{specularTint.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={specularTint}
                        onChange={(e) => handleValChange("specularTint", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Anisotropic / 各向异性</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{anisotropic.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={anisotropic}
                        onChange={(e) => handleValChange("anisotropic", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Anisotropic Rotation</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{anisotropicRotation.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={anisotropicRotation}
                        onChange={(e) => handleValChange("anisotropicRotation", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Coat Weight / 清漆层</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{clearcoat.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={clearcoat}
                        onChange={(e) => handleValChange("clearcoat", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Coat Roughness</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{coatRoughness.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={coatRoughness}
                        onChange={(e) => handleValChange("coatRoughness", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Coat IOR</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{coatIor.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="3.0"
                        step="0.05"
                        value={coatIor}
                        onChange={(e) => handleValChange("coatIor", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Sheen Weight</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{sheenWeight.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={sheenWeight}
                        onChange={(e) => handleValChange("sheenWeight", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Sheen Roughness</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{sheenRoughness.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={sheenRoughness}
                        onChange={(e) => handleValChange("sheenRoughness", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Emission Strength / 自发光</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{emissionStrength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="8.0"
                        step="0.1"
                        value={emissionStrength}
                        onChange={(e) => handleValChange("emissionStrength", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200">
                      <div className="flex items-center justify-between min-w-0">
                        <span className="text-[11px] font-bold text-neutral-300 truncate">Emission Color</span>
                        <span className="text-[10px] font-mono font-bold text-neutral-400 px-1.5 py-0.5 bg-neutral-950 rounded border border-neutral-805">{emissionColor}</span>
                      </div>
                      <div className="flex items-center gap-1.5 h-7 mt-0.5">
                        <input
                          type="color"
                          value={emissionColor}
                          onChange={(e) => handleValChange("emissionColor", e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-7 h-7 rounded border border-neutral-800 bg-transparent cursor-pointer shrink-0"
                        />
                        <input
                          type="text"
                          value={emissionColor}
                          onChange={(e) => handleValChange("emissionColor", e.target.value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="h-7 text-[10px] font-mono bg-neutral-950 border border-neutral-850 text-white rounded px-2 w-full focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Thin Film Thickness</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{thinFilmThickness.toFixed(0)}nm</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2000"
                        step="10"
                        value={thinFilmThickness}
                        onChange={(e) => handleValChange("thinFilmThickness", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Thin Film IOR</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{thinFilmIor.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="1.0"
                        max="3.0"
                        step="0.05"
                        value={thinFilmIor}
                        onChange={(e) => handleValChange("thinFilmIor", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>Displacement Midlevel</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{displacementMidlevel.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={displacementMidlevel}
                        onChange={(e) => handleValChange("displacementMidlevel", parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>

                    {/* 11. Tiling repetitiveness */}
                    <div className="flex flex-col gap-1.5 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/40 hover:border-neutral-700/80 transition-all duration-200 font-sans">
                      <div className="flex justify-between items-center text-[11px] font-bold text-neutral-300">
                        <span>贴图密度 (Tiling)</span>
                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-950/40 rounded border border-emerald-900/40">{tilingScale}x</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="0.5"
                        value={tilingScale}
                        onChange={(e) => setTilingScale(parseFloat(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-emerald-500 mt-2.5"
                      />
                    </div>
                  </div>
                </div>

                {/* Map layers summary row */}
                {data.colorUrl && (
                  <div className="flex items-center justify-between border-t border-neutral-800/40 pt-2 text-[10px]">
                    <span className="text-neutral-500 font-bold uppercase tracking-wide">已绑定烘焙物理贴图 (PBR MAPS)</span>
                    <div className="flex gap-1.5 align-middle">
                      <div className="w-6 h-6 bg-neutral-950 border border-neutral-800 rounded overflow-hidden flex items-center justify-center relative group shrink-0" title="Albedo Colour Map">
                        <img src={data.colorUrl} alt="COL" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div className={`w-6 h-6 border rounded flex items-center justify-center text-[8px] font-black shrink-0 ${data.normalUrl ? "bg-neutral-950 border-blue-900 text-blue-400" : "bg-neutral-950/40 border-neutral-900 text-neutral-700"}`} title="Normal Map">
                        NRM
                      </div>
                      <div className={`w-6 h-6 border rounded flex items-center justify-center text-[8px] font-black shrink-0 ${data.roughnessUrl ? "bg-neutral-950 border-amber-900 text-amber-550" : "bg-neutral-950/40 border-neutral-900 text-neutral-700"}`} title="Roughness Map">
                        RGH
                      </div>
                      <div className={`w-6 h-6 border rounded flex items-center justify-center text-[8px] font-black shrink-0 ${data.metalnessUrl ? "bg-neutral-950 border-zinc-700 text-zinc-400" : "bg-neutral-950/40 border-neutral-900 text-neutral-700"}`} title="Metalness Map">
                        MTL
                      </div>
                      <div className={`w-6 h-6 border rounded flex items-center justify-center text-[8px] font-black shrink-0 ${data.bumpUrl ? "bg-neutral-950 border-teal-900 text-teal-400" : "bg-neutral-950/40 border-neutral-900 text-neutral-700"}`} title="Height/Bump Map">
                        BMP
                      </div>
                    </div>
                  </div>
                )}

                {/* Triggers */}
                <div className="flex border-t border-neutral-800/60 pt-2.5 text-center">
                  <Button
                    size="sm"
                    className="w-full text-[11px] h-8 bg-neutral-900 text-neutral-305 hover:bg-neutral-800 hover:text-white border border-neutral-800 rounded font-bold transition-all"
                    onClick={handleClear}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    重置默认物理材质球
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
