import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { AI_ASSET_PREFIX } from "./ai-project-format";
import { readLocalModelBuffer, parseLocalAssetRef } from "./local-assets";
import { resolveNativeScenePath } from "./desktop-scene-path";
import { getAppOrigin, shouldUseLocalCanvasAssets } from "./runtime";
import { getLocalUserId } from "./local-user-id";

export function resolveModelAssetUrl(url: string): string {
  if (!url) return url;
  if (/^(https?:|blob:|data:|file:)/i.test(url)) return url;
  const base = getAppOrigin().replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

export function getExtensionFromUrlOrName(
  url: string,
  modelName?: string,
): string {
  const urlExt = (() => {
    const clean = url.split("?")[0].split("#")[0];
    const dot = clean.lastIndexOf(".");
    if (dot !== -1) return clean.substring(dot).toLowerCase();
    return "";
  })();
  if (urlExt && urlExt !== ".blend") return urlExt;

  if (modelName) {
    const ext = modelName.substring(modelName.lastIndexOf(".")).toLowerCase();
    if (ext && ext !== ".blend") return ext;
  }
  if (url.includes("/api/media/")) {
    try {
      const parts = url.split("/api/media/");
      const encoded = parts[parts.length - 1].split("?")[0];
      if (encoded) {
        let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4) base64 += "=";
        const decoded = atob(base64);
        const ext = decoded.substring(decoded.lastIndexOf(".")).toLowerCase();
        if (ext) return ext;
      }
    } catch {
      /* ignore */
    }
  }
  const cleanUrl = url.split("?")[0].split("#")[0];
  const lastDot = cleanUrl.lastIndexOf(".");
  if (lastDot !== -1) return cleanUrl.substring(lastDot).toLowerCase();
  return "";
}

export async function fetchModelArrayBuffer(url: string): Promise<ArrayBuffer> {
  const localPath = parseLocalAssetRef(url);
  if (localPath) {
    return readLocalModelBuffer(localPath);
  }

  if (url.startsWith(AI_ASSET_PREFIX) && shouldUseLocalCanvasAssets()) {
    const resolved = await resolveNativeScenePath(getLocalUserId(), { glbUrl: url });
    if (resolved.ok && resolved.scenePath) {
      return readLocalModelBuffer(resolved.scenePath);
    }
    throw new Error(resolved.error || "无法解析工程内模型路径");
  }

  if (shouldUseLocalCanvasAssets() && /^[a-zA-Z]:[\\/]/.test(url)) {
    return readLocalModelBuffer(url);
  }

  if (url.startsWith("blob:") || url.startsWith("data:")) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`读取模型失败 (${res.status})`);
    return res.arrayBuffer();
  }

  const full = resolveModelAssetUrl(url);
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("ais-token")
      : null;
  const res = await fetch(full, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`模型下载失败 HTTP ${res.status}，请检查登录或网络`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 16) {
    throw new Error("模型文件为空或响应异常");
  }
  return buf;
}

function fixMaterial(mat: THREE.Material): THREE.Material {
  if (mat instanceof THREE.MeshStandardMaterial) {
    if (mat.color.getHex() === 0x000000 && !mat.map) {
      mat.color.setHex(0xcccccc);
    }
    mat.needsUpdate = true;
    return mat;
  }
  if (
    mat instanceof THREE.MeshPhongMaterial ||
    mat instanceof THREE.MeshLambertMaterial
  ) {
    if (mat.color.getHex() === 0x000000 && !mat.map) {
      mat.color.setHex(0xcccccc);
    }
    mat.needsUpdate = true;
    return mat;
  }
  return mat;
}

export function normalizeSceneMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.material) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.2,
        roughness: 0.6,
      });
      return;
    }
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => fixMaterial(m));
    } else {
      mesh.material = fixMaterial(mesh.material as THREE.Material);
    }
  });
}

export function centerAndScaleObject(
  root: THREE.Object3D,
  targetSize = 1.25,
): { isEmpty: boolean; meshCount: number } {
  let meshCount = 0;
  root.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) meshCount++;
  });

  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty() || meshCount === 0) {
    return { isEmpty: true, meshCount };
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0 && Number.isFinite(maxDim)) {
    const scale = targetSize / maxDim;
    root.scale.setScalar(scale);
  }

  return { isEmpty: false, meshCount };
}

export async function loadModelGroup(
  url: string,
  modelName?: string,
): Promise<THREE.Group> {
  const ext = getExtensionFromUrlOrName(url, modelName);
  const buffer = await fetchModelArrayBuffer(url);
  const group = new THREE.Group();

  if (ext === ".fbx") {
    const loader = new FBXLoader();
    let obj: THREE.Group;
    try {
      obj = loader.parse(buffer, modelName || "model.fbx") as THREE.Group;
    } catch (e) {
      throw new Error(
        `FBX 解析失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    group.add(obj);
  } else if (ext === ".obj") {
    const text = new TextDecoder().decode(buffer);
    const loader = new OBJLoader();
    const obj = loader.parse(text);
    group.add(obj);
  } else {
    const loader = new GLTFLoader();
    const gltf = await new Promise<{
      scene: THREE.Group;
    }>((resolve, reject) => {
      loader.parse(
        buffer,
        "",
        (g) => resolve(g),
        (e) => reject(e),
      );
    });
    group.add(gltf.scene);
  }

  normalizeSceneMaterials(group);
  const { isEmpty, meshCount } = centerAndScaleObject(group);
  if (isEmpty) {
    throw new Error(
      `模型已加载但未发现可渲染网格（${meshCount} mesh），请检查 FBX 是否含几何体`,
    );
  }

  return group;
}
