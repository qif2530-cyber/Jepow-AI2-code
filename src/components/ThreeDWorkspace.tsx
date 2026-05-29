import React, { useEffect, useMemo, useRef, useState } from "react";

export type ThreeDObject = {
  id: string;
  name: string;
  type: "相机" | "网格" | "灯光";
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  visible?: boolean;
  locked?: boolean;
  materialColor?: string;
  assetPath?: string;
  importBackend?: string;
  triangleCount?: number;
  vertexCount?: number;
  boundsMin?: [number, number, number];
  boundsMax?: [number, number, number];
  boundsSize?: [number, number, number];
  hasBaseColorTexture?: boolean;
  hasMetallicRoughnessTexture?: boolean;
  metallicFactor?: number;
  roughnessFactor?: number;
};

type NativeArchitectureFeature = {
  label?: string;
  status?: boolean;
  runtimeReady?: boolean;
  productionReady?: boolean;
  detail?: string;
};

type NativeArchitectureStatus = {
  architectureReady?: boolean;
  architectureProductionReady?: boolean;
  architectureProgress?: ArchitectureProgress;
  architecture?: Record<string, NativeArchitectureFeature>;
  uiBackend?: string;
  uiRuntimeCapabilities?: string[];
  viewportBackend?: string;
  viewportRuntimeCapabilities?: string[];
  cyclesBackend?: string;
  cyclesProductionReady?: boolean;
  cyclesRuntimeCapabilities?: string[];
  cyclesRenderDevices?: string[];
  importBackend?: string;
  importRuntimeCapabilities?: string[];
  physicsBackend?: string;
  physicsRuntimeCapabilities?: string[];
};

type ArchitectureProgress = {
  currentPhase?: string;
  currentPhaseLabel?: string;
  description?: string;
  wiredCount?: number;
  runtimeCount?: number;
  productionCount?: number;
  total?: number;
  skeletonPercent?: number;
  runtimePercent?: number;
  productionPercent?: number;
  nextMilestone?: string;
};

type PipelineProbe = {
  title: string;
  ok: boolean;
  message: string;
  backend?: string;
  command?: string;
  details?: string[];
  timestamp: number;
};

type PhysicsStats = {
  time: number;
  stepCount: number;
  bodyCount: number;
  dynamicBodyCount: number;
  staticBodyCount: number;
  sleepingBodyCount: number;
  groundedBodyCount: number;
  floorContactCount: number;
  movingBodyCount: number;
  rotatingBodyCount: number;
  totalDynamicMass: number;
  centerOfMass: [number, number, number];
  kineticEnergy: number;
  angularEnergy: number;
  maxLinearSpeed: number;
  maxAngularSpeed: number;
  contactCount: number;
  bodyContactCount: number;
  contactPairCount: number;
  deepestContactLabel: string;
  wokenBodyCount: number;
  maxPenetration: number;
};

type ArchitectureDiagnostics = {
  ok?: boolean;
  generatedAt?: string;
  canonicalStack?: string;
  architectureReady?: boolean;
  architectureProductionReady?: boolean;
  architectureProgress?: ArchitectureProgress;
  checks?: Array<{
    id?: string;
    label?: string;
    ok?: boolean;
    productionReady?: boolean;
    detail?: string;
  }>;
};

interface ThreeDWorkspaceProps {
  objects: ThreeDObject[];
  selectedObjectId: string;
  onSelectObject: (id: string) => void;
  onUpdateObject: (id: string, patch: Partial<ThreeDObject>) => void;
  onSyncObjects?: (objects: ThreeDObject[], selectedObjectId?: string) => void;
  onApplyPhysicsObjects?: (objects: ThreeDObject[], selectedObjectId?: string) => void;
  onAddObject?: (type: ThreeDObject["type"]) => void;
  onImportObject?: (object: ThreeDObject) => void;
  onDuplicateObject?: () => void;
  onDeleteObject?: () => void;
  onResetObject?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const toolToHost: Record<string, string> = {
  选择: "select",
  移动: "translate",
  旋转: "rotate",
  缩放: "scale",
};

const displayToHost: Record<string, string> = {
  线框: "wireframe",
  实体: "solid",
  材质: "material",
  CL: "cl",
};
const displayModes = ["线框", "实体", "材质", "CL"];

const viewPresets: Record<
  string,
  { yaw: number; pitch: number; distance?: number; projection: "orthographic" | "perspective" }
> = {
  前: { yaw: 0, pitch: 0, projection: "orthographic" },
  后: { yaw: Math.PI, pitch: 0, projection: "orthographic" },
  右: { yaw: Math.PI / 2, pitch: 0, projection: "orthographic" },
  左: { yaw: -Math.PI / 2, pitch: 0, projection: "orthographic" },
  顶: { yaw: 0, pitch: 1.52, projection: "orthographic" },
  底: { yaw: 0, pitch: -1.52, projection: "orthographic" },
  透: { yaw: 0.72, pitch: 0.52, projection: "perspective" },
};

const typeToHost: Record<ThreeDObject["type"], string> = {
  相机: "camera",
  网格: "mesh",
  灯光: "light",
};

const hostToType: Record<string, ThreeDObject["type"]> = {
  camera: "相机",
  mesh: "网格",
  light: "灯光",
  相机: "相机",
  网格: "网格",
  灯光: "灯光",
};

const typeColor: Record<ThreeDObject["type"], string> = {
  相机: "text-emerald-300",
  网格: "text-orange-300",
  灯光: "text-yellow-300",
};

const toHostObjects = (objects: ThreeDObject[]) =>
  objects.map((object) => ({
    id: object.id,
    name: object.name,
    type: typeToHost[object.type] || "mesh",
    transform: {
      position: object.position,
      rotation: object.rotation,
      scale: object.scale,
    },
    visible: object.visible !== false,
    locked: object.locked === true,
    materialColor: object.materialColor,
    assetPath: object.assetPath,
    importBackend: object.importBackend,
    triangleCount: object.triangleCount,
    vertexCount: object.vertexCount,
    boundsMin: object.boundsMin,
    boundsMax: object.boundsMax,
    boundsSize: object.boundsSize,
    hasBaseColorTexture: object.hasBaseColorTexture,
    hasMetallicRoughnessTexture: object.hasMetallicRoughnessTexture,
    metallicFactor: object.metallicFactor,
    roughnessFactor: object.roughnessFactor,
  }));

const toVec3 = (value: unknown, fallback: [number, number, number]) => {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0] as [
    number,
    number,
    number,
  ];
};

const physicsHalfExtents = (object: ThreeDObject): [number, number, number] => {
  const bounds = object.boundsSize || [1, 1, 1];
  const raw = bounds.map((value) => Math.abs(value)) as [number, number, number];
  const maxExtent = Math.max(raw[0], raw[1], raw[2]);
  if (object.assetPath && maxExtent > 1e-5) {
    const triangles = Math.max(1, object.triangleCount || 0);
    const target = Math.min(4.5, Math.max(1.35, Math.log10(triangles) * 0.22 + 1.45));
    const normalized = raw.map((value) => value / maxExtent) as [number, number, number];
    return [
      Math.max(0.05, normalized[0] * Math.abs(object.scale[0]) * target * 0.5),
      Math.max(0.05, normalized[1] * Math.abs(object.scale[1]) * target * 0.5),
      Math.max(0.05, normalized[2] * Math.abs(object.scale[2]) * target * 0.5),
    ];
  }
  return [
    Math.max(0.05, Math.abs(bounds[0] * object.scale[0]) * 0.5),
    Math.max(0.05, Math.abs(bounds[1] * object.scale[1]) * 0.5),
    Math.max(0.05, Math.abs(bounds[2] * object.scale[2]) * 0.5),
  ];
};

const physicsBodyMass = (halfExtents: [number, number, number], object: ThreeDObject) => {
  if (object.locked) return 0;
  const volume = Math.max(0.001, halfExtents[0] * 2 * halfExtents[1] * 2 * halfExtents[2] * 2);
  const density = object.assetPath ? 1.35 : 1;
  return Number(Math.min(250, Math.max(0.1, volume * density)).toFixed(3));
};

const toPhysicsBodies = (objects: ThreeDObject[]) =>
  objects
    .filter((object) => object.type === "网格" && object.visible !== false)
    .map((object) => {
      const halfExtents = physicsHalfExtents(object);
      return {
        id: object.id,
        label: object.name,
        dynamic: object.locked !== true,
        position: object.position,
        rotation: object.rotation,
        velocity: [0, 0, 0],
        angularVelocity: object.locked ? [0, 0, 0] : [0, object.assetPath ? 0.18 : 0.12, 0],
        gravityScale: object.locked ? 0 : 1,
        linearDamping: object.assetPath ? 0.025 : 0.015,
        angularDamping: object.assetPath ? 0.22 : 0.18,
        maxLinearSpeed: object.assetPath ? 28 : 35,
        maxAngularSpeed: object.assetPath ? 14 : 18,
        grounded: false,
        halfExtents,
        mass: physicsBodyMass(halfExtents, object),
        restitution: object.locked ? 0.05 : 0.22,
        friction: object.assetPath ? 0.12 : 0.08,
        sleepThreshold: object.assetPath ? 0.025 : 0.035,
        sleeping: false,
      };
    });

const physicsBodiesFromSnapshot = (snapshot: Record<string, unknown> | null) => {
  const bodies = snapshot?.bodies;
  return Array.isArray(bodies) ? bodies : [];
};

const physicsContactLabel = (contact: unknown) => {
  if (!contact || typeof contact !== "object") return "";
  const raw = contact as Record<string, unknown>;
  const a = typeof raw.a === "string" ? raw.a : "";
  const b = typeof raw.b === "string" ? raw.b : "";
  const axis = typeof raw.axis === "string" ? raw.axis : "?";
  const penetration = Number(raw.penetration) || 0;
  return a && b ? `${a}/${b}:${axis}:${penetration.toFixed(2)}` : "";
};

const physicsColliderSignature = (objects: ThreeDObject[]) =>
  objects
    .filter((object) => object.type === "网格" && object.visible !== false)
    .map((object) => ({
      id: object.id,
      locked: object.locked === true,
      scale: object.scale.map((value) => Number(value.toFixed(4))),
      boundsSize: (object.boundsSize || [1, 1, 1]).map((value) => Number(value.toFixed(4))),
      assetPath: object.assetPath || "",
      triangleCount: object.triangleCount || 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => JSON.stringify(item))
    .join("|");

export function ThreeDWorkspace({
  objects,
  selectedObjectId,
  onSelectObject,
  onUpdateObject,
  onSyncObjects,
  onApplyPhysicsObjects,
  onAddObject,
  onImportObject,
  onDuplicateObject,
  onDeleteObject,
  onResetObject,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: ThreeDWorkspaceProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const physicsWorldRef = useRef<Record<string, unknown> | null>(null);
  const physicsColliderSignatureRef = useRef("");
  const hostSceneReadyRef = useRef(false);
  const hostSceneEpochRef = useRef(0);
  const objectsRef = useRef(objects);
  const [activeTool, setActiveTool] = useState("选择");
  const [displayMode, setDisplayMode] = useState("CL");
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapStep, setSnapStep] = useState(0.5);
  const [cameraProjection, setCameraProjection] = useState<"perspective" | "orthographic">(
    "perspective",
  );
  const [nativeStatus, setNativeStatus] = useState<NativeArchitectureStatus | null>(null);
  const [pipelineProbe, setPipelineProbe] = useState<PipelineProbe | null>(null);
  const [diagnostics, setDiagnostics] = useState<ArchitectureDiagnostics | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState<string | null>(null);
  const [physicsPlaying, setPhysicsPlaying] = useState(false);
  const [physicsStats, setPhysicsStats] = useState<PhysicsStats | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId) || objects[0],
    [objects, selectedObjectId],
  );
  const uiCapabilityBadges = useMemo(
    () =>
      (nativeStatus?.uiRuntimeCapabilities || [])
        .filter((capability): capability is string => typeof capability === "string")
        .slice(0, 5)
        .map((capability) => capability.replace(/-/g, " ")),
    [nativeStatus?.uiRuntimeCapabilities],
  );
  const cyclesCapabilityBadges = useMemo(
    () =>
      (nativeStatus?.cyclesRuntimeCapabilities || [])
        .filter((capability): capability is string => typeof capability === "string")
        .slice(0, 5)
        .map((capability) => capability.replace(/-/g, " ")),
    [nativeStatus?.cyclesRuntimeCapabilities],
  );
  const viewportCapabilityBadges = useMemo(
    () =>
      (nativeStatus?.viewportRuntimeCapabilities || [])
        .filter((capability): capability is string => typeof capability === "string")
        .slice(0, 5)
        .map((capability) => capability.replace(/-/g, " ")),
    [nativeStatus?.viewportRuntimeCapabilities],
  );
  const importCapabilityBadges = useMemo(
    () =>
      (nativeStatus?.importRuntimeCapabilities || [])
        .filter((capability): capability is string => typeof capability === "string")
        .slice(0, 5)
        .map((capability) => capability.replace(/-/g, " ")),
    [nativeStatus?.importRuntimeCapabilities],
  );
  const physicsCapabilityBadges = useMemo(
    () =>
      (nativeStatus?.physicsRuntimeCapabilities || [])
        .filter((capability): capability is string => typeof capability === "string")
        .slice(0, 5)
        .map((capability) => capability.replace(/-/g, " ")),
    [nativeStatus?.physicsRuntimeCapabilities],
  );
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);
  const applyViewPreset = (preset: keyof typeof viewPresets) => {
    const nextProjection = viewPresets[preset].projection;
    setCameraProjection(nextProjection);
    window.jepowDesktop?.viewportHost?.setCamera?.({
      ...viewPresets[preset],
      distance: viewPresets[preset].distance || 7,
      projection: nextProjection,
      speed: activeTool === "游走" ? 1.65 : 1,
    });
  };
  const toggleProjection = () => {
    const nextProjection = cameraProjection === "perspective" ? "orthographic" : "perspective";
    setCameraProjection(nextProjection);
    window.jepowDesktop?.viewportHost?.setCamera?.({
      projection: nextProjection,
      speed: activeTool === "游走" ? 1.65 : 1,
    });
  };
  const cycleDisplayMode = () => {
    setDisplayMode((current) => {
      const index = displayModes.indexOf(current);
      return displayModes[(index + 1) % displayModes.length] || "实体";
    });
  };
  const isolateSelection = () => {
    if (!selectedObjectId || !onSyncObjects) return;
    onSyncObjects(
      objectsRef.current.map((object) => ({
        ...object,
        visible: object.id === selectedObjectId,
      })),
      selectedObjectId,
    );
    window.jepowDesktop?.viewportHost?.focusSelection?.();
  };
  const revealAllObjects = () => {
    onSyncObjects?.(
      objectsRef.current.map((object) => ({ ...object, visible: true })),
      selectedObjectId,
    );
  };
  const selectAdjacentVisibleObject = (direction: 1 | -1) => {
    const visibleObjects = objectsRef.current.filter((object) => object.visible !== false);
    if (!visibleObjects.length) return;
    const currentIndex = visibleObjects.findIndex((object) => object.id === selectedObjectId);
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + direction + visibleObjects.length) % visibleObjects.length;
    onSelectObject(visibleObjects[nextIndex].id);
    window.jepowDesktop?.viewportHost?.focusSelection?.();
  };
  const nudgeSelectedObject = (delta: [number, number, number]) => {
    const object = objectsRef.current.find((item) => item.id === selectedObjectId);
    if (!object || object.locked) return;
    onUpdateObject(object.id, {
      position: [
        object.position[0] + delta[0],
        object.position[1] + delta[1],
        object.position[2] + delta[2],
      ],
    });
  };
  const rotateSelectedObject = (delta: [number, number, number]) => {
    const object = objectsRef.current.find((item) => item.id === selectedObjectId);
    if (!object || object.locked) return;
    onUpdateObject(object.id, {
      rotation: [
        object.rotation[0] + delta[0],
        object.rotation[1] + delta[1],
        object.rotation[2] + delta[2],
      ],
    });
  };
  const scaleSelectedObject = (factor: number) => {
    const object = objectsRef.current.find((item) => item.id === selectedObjectId);
    if (!object || object.locked) return;
    onUpdateObject(object.id, {
      scale: object.scale.map((value) => Math.max(0.01, value * factor)) as [number, number, number],
    });
  };
  const toggleSelectedObjectLock = () => {
    const object = objectsRef.current.find((item) => item.id === selectedObjectId);
    if (!object) return;
    onUpdateObject(object.id, { locked: object.locked !== true });
  };
  const unlockAllObjects = () => {
    onSyncObjects?.(
      objectsRef.current.map((object) => ({ ...object, locked: false })),
      selectedObjectId,
    );
  };
  const runPipelineProbe = async (
    key: string,
    title: string,
    action: () => Promise<Record<string, unknown> | undefined>,
  ) => {
    setPipelineBusy(key);
    const result = (await action().catch((error) => ({
      ok: false,
      message: error?.message || String(error),
    }))) as Record<string, unknown> | undefined;
    setPipelineBusy(null);
    if (!result) {
      setPipelineProbe({
        title,
        ok: false,
        message: "当前环境没有暴露该架构管线 API。",
        timestamp: Date.now(),
      });
      return;
    }
    const contactCount = Number(result.contactCount);
    const contactSuffix = Number.isFinite(contactCount) ? ` · contacts ${contactCount}` : "";
    const status = result.status && typeof result.status === "object"
      ? (result.status as Record<string, unknown>)
      : undefined;
    const nativeCapabilities = Array.isArray(result.native_runtime_capabilities)
      ? result.native_runtime_capabilities
      : Array.isArray(status?.native_runtime_capabilities)
        ? status.native_runtime_capabilities
        : [];
    const details = nativeCapabilities
      .filter((item): item is string => typeof item === "string")
      .slice(0, 6)
      .map((item) => item.replace(/-/g, " "));
    setPipelineProbe({
      title,
      ok: result.ok !== false,
      message: `${String(result.message || result.status || "管线接口已返回。")}${contactSuffix}`,
      backend: String(result.plannedBackend || result.backend || result.active_backend || ""),
      command: typeof result.command === "string" ? result.command : undefined,
      details,
      timestamp: Date.now(),
    });
  };
  const probeImportPipeline = () =>
    runPipelineProbe("import", "Assimp/USD Import", async () => {
      const status = await window.jepowDesktop?.viewport?.getImportPipelineStatus?.();
      const picked = await window.jepowDesktop?.viewport?.pickSceneFile?.();
      if (
        !picked ||
        picked.canceled ||
        !picked.filePath ||
        typeof picked.filePath !== "string"
      ) {
        return {
          ...(status || {}),
          ok: true,
          message: "导入管线状态已读取；未选择文件，未执行 runtime 导入。",
        };
      }
      const imported = await window.jepowDesktop?.viewport?.importScenePipeline?.({
        scenePath: picked.filePath,
        backend: "auto",
      });
      if (
        imported?.productionReady &&
        imported.scenePath &&
        typeof imported.scenePath === "string"
      ) {
        const fileName = imported.scenePath.split(/[\\/]/).pop() || "Imported Mesh";
        const importedCount = objects.filter((object) => object.assetPath).length;
        onImportObject?.({
          id: `import-${Date.now().toString(36)}`,
          name: fileName.replace(/\.[^.]+$/, "") || fileName,
          type: "网格",
          color: "text-orange-300",
          position: [importedCount * 1.4, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true,
          locked: false,
          materialColor:
            typeof imported.materialColor === "string" ? imported.materialColor : "#9fb7ff",
          assetPath: imported.scenePath,
          importBackend: String(imported.activeBackend || imported.plannedBackend || "native"),
          triangleCount: Number(imported.triangleCount) || 0,
          vertexCount: Number(imported.vertexCount) || 0,
          boundsMin: toVec3(imported.boundsMin, [0, 0, 0]),
          boundsMax: toVec3(imported.boundsMax, [0, 0, 0]),
          boundsSize: toVec3(imported.boundsSize, [1, 1, 1]),
          hasBaseColorTexture: imported.hasBaseColorTexture === true,
          hasMetallicRoughnessTexture: imported.hasMetallicRoughnessTexture === true,
          metallicFactor: Number(imported.metallicFactor) || 0,
          roughnessFactor: Number(imported.roughnessFactor) || 0.65,
        });
      }
      return imported || status;
    });
  const probeArchitectureSelfTest = () =>
    runPipelineProbe("architecture-self-test", "Architecture Self-Test", () =>
      window.jepowDesktop?.viewport?.runArchitectureSelfTest?.(),
    );
  const runArchitectureDiagnostics = async () => {
    setPipelineBusy("diagnostics");
    const report = (await window.jepowDesktop?.viewport
      ?.getArchitectureDiagnostics?.()
      .catch((error) => ({
        ok: false,
        generatedAt: new Date().toISOString(),
        canonicalStack: "diagnostics unavailable",
        checks: [
          {
            id: "diagnostics",
            label: "Architecture Diagnostics",
            ok: false,
            detail: error?.message || String(error),
          },
        ],
      }))) as ArchitectureDiagnostics | undefined;
    setPipelineBusy(null);
    if (!report) {
      setPipelineProbe({
        title: "Architecture Diagnostics",
        ok: false,
        message: "当前环境没有暴露架构诊断 API。",
        timestamp: Date.now(),
      });
      return;
    }
    setDiagnostics(report);
    setPipelineProbe({
      title: "Architecture Diagnostics",
      ok: report.ok !== false,
      message: report.architectureProductionReady
        ? "生产能力全部就绪。"
        : report.architectureReady
          ? "固定架构骨架完整，部分 runtime 仍在填充。"
          : "架构诊断发现缺失项。",
      backend: report.architectureProductionReady ? "production-ready" : "architecture-ready",
      timestamp: Date.now(),
    });
  };
  const applyPhysicsSnapshotToScene = (
    snapshot: Record<string, unknown> | null,
    sourceObjects = objectsRef.current,
  ) => {
    const positions = new Map<string, [number, number, number]>();
    const rotations = new Map<string, [number, number, number]>();
    for (const rawBody of physicsBodiesFromSnapshot(snapshot)) {
      if (!rawBody || typeof rawBody !== "object") continue;
      const body = rawBody as Record<string, unknown>;
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) continue;
      positions.set(id, toVec3(body.position, [0, 0, 0]));
      rotations.set(id, toVec3(body.rotation, [0, 0, 0]));
    }
    if (!positions.size) return;
    const nextObjects = sourceObjects.map((object) => {
      const position = positions.get(object.id);
      const rotation = rotations.get(object.id);
      return position ? { ...object, position, rotation: rotation || object.rotation } : object;
    });
    const applyObjects = onApplyPhysicsObjects || onSyncObjects;
    if (applyObjects) {
      applyObjects(nextObjects, selectedObjectId);
      return;
    }
    for (const [id, position] of positions) {
      if (sourceObjects.some((object) => object.id === id)) {
        const rotation = rotations.get(id);
        onUpdateObject(id, rotation ? { position, rotation } : { position });
      }
    }
  };
  const updatePhysicsStats = (
    snapshot: Record<string, unknown> | null,
    contactCount = physicsStats?.contactCount ?? 0,
    maxPenetration = physicsStats?.maxPenetration ?? 0,
    dynamicBodyCount = physicsStats?.dynamicBodyCount ?? 0,
    staticBodyCount = physicsStats?.staticBodyCount ?? 0,
    sleepingBodyCount = physicsStats?.sleepingBodyCount ?? 0,
    groundedBodyCount = physicsStats?.groundedBodyCount ?? 0,
    floorContactCount = physicsStats?.floorContactCount ?? 0,
    movingBodyCount = physicsStats?.movingBodyCount ?? 0,
    rotatingBodyCount = physicsStats?.rotatingBodyCount ?? 0,
    totalDynamicMass = physicsStats?.totalDynamicMass ?? 0,
    centerOfMass = physicsStats?.centerOfMass ?? [0, 0, 0],
    kineticEnergy = physicsStats?.kineticEnergy ?? 0,
    angularEnergy = physicsStats?.angularEnergy ?? 0,
    maxLinearSpeed = physicsStats?.maxLinearSpeed ?? 0,
    maxAngularSpeed = physicsStats?.maxAngularSpeed ?? 0,
    bodyContactCount = physicsStats?.bodyContactCount ?? contactCount,
    contactPairCount = physicsStats?.contactPairCount ?? 0,
    deepestContactLabel = physicsStats?.deepestContactLabel ?? "",
    wokenBodyCount = physicsStats?.wokenBodyCount ?? 0,
  ) => {
    const bodies = physicsBodiesFromSnapshot(snapshot);
    const bodyCount = bodies.length;
    const derivedDynamicBodyCount = bodies.filter(
      (body) => typeof body === "object" && body && (body as Record<string, unknown>).dynamic !== false,
    ).length;
    const derivedSleepingBodyCount = bodies.filter(
      (body) => typeof body === "object" && body && (body as Record<string, unknown>).sleeping === true,
    ).length;
    const derivedGroundedBodyCount = bodies.filter((body) => {
      if (typeof body !== "object" || !body || (body as Record<string, unknown>).dynamic === false) return false;
      if ((body as Record<string, unknown>).grounded === true) return true;
      const position = toVec3((body as Record<string, unknown>).position, [0, 0, 0]);
      const halfExtents = toVec3((body as Record<string, unknown>).halfExtents, [0.5, 0.5, 0.5]);
      return position[1] <= Math.max(0, halfExtents[1]) + 1e-6;
    }).length;
    const derivedMovingBodyCount = bodies.filter((body) => {
      if (typeof body !== "object" || !body || (body as Record<string, unknown>).dynamic === false) return false;
      const velocity = toVec3((body as Record<string, unknown>).velocity, [0, 0, 0]);
      return velocity.some((value) => Math.abs(value) > 0.001);
    }).length;
    const derivedRotatingBodyCount = bodies.filter((body) => {
      if (typeof body !== "object" || !body || (body as Record<string, unknown>).dynamic === false) return false;
      const angularVelocity = toVec3((body as Record<string, unknown>).angularVelocity, [0, 0, 0]);
      return angularVelocity.some((value) => Math.abs(value) > 0.001);
    }).length;
    const derivedTotalDynamicMass = bodies.reduce((total, body) => {
      if (typeof body !== "object" || !body || (body as Record<string, unknown>).dynamic === false) return total;
      return total + (Number((body as Record<string, unknown>).mass) || 0);
    }, 0);
    const derivedMaxLinearSpeed = bodies.reduce((maxSpeed, body) => {
      if (typeof body !== "object" || !body || (body as Record<string, unknown>).dynamic === false) return maxSpeed;
      const velocity = toVec3((body as Record<string, unknown>).velocity, [0, 0, 0]);
      const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
      return Math.max(maxSpeed, speed);
    }, 0);
    const derivedMaxAngularSpeed = bodies.reduce((maxSpeed, body) => {
      if (typeof body !== "object" || !body || (body as Record<string, unknown>).dynamic === false) return maxSpeed;
      const angularVelocity = toVec3((body as Record<string, unknown>).angularVelocity, [0, 0, 0]);
      const speed = Math.hypot(angularVelocity[0], angularVelocity[1], angularVelocity[2]);
      return Math.max(maxSpeed, speed);
    }, 0);
    const derivedCenterOfMass =
      derivedTotalDynamicMass > 0
        ? bodies.reduce(
            (center, body) => {
              if (typeof body !== "object" || !body || (body as Record<string, unknown>).dynamic === false) {
                return center;
              }
              const mass = Number((body as Record<string, unknown>).mass) || 0;
              const position = toVec3((body as Record<string, unknown>).position, [0, 0, 0]);
              return [
                center[0] + (position[0] * mass) / derivedTotalDynamicMass,
                center[1] + (position[1] * mass) / derivedTotalDynamicMass,
                center[2] + (position[2] * mass) / derivedTotalDynamicMass,
              ] as [number, number, number];
            },
            [0, 0, 0] as [number, number, number],
          )
        : ([0, 0, 0] as [number, number, number]);
    setPhysicsStats({
      time: Number(snapshot?.time) || 0,
      stepCount: Number(snapshot?.stepCount) || 0,
      bodyCount,
      dynamicBodyCount: dynamicBodyCount || derivedDynamicBodyCount,
      staticBodyCount: staticBodyCount || Math.max(0, bodyCount - derivedDynamicBodyCount),
      sleepingBodyCount: sleepingBodyCount || derivedSleepingBodyCount,
      groundedBodyCount: groundedBodyCount || derivedGroundedBodyCount,
      floorContactCount: floorContactCount || derivedGroundedBodyCount,
      movingBodyCount: movingBodyCount || derivedMovingBodyCount,
      rotatingBodyCount: rotatingBodyCount || derivedRotatingBodyCount,
      totalDynamicMass: totalDynamicMass || derivedTotalDynamicMass,
      centerOfMass: centerOfMass.some((value) => Math.abs(value) > 1e-6)
        ? centerOfMass
        : derivedCenterOfMass,
      kineticEnergy,
      angularEnergy,
      maxLinearSpeed: maxLinearSpeed || derivedMaxLinearSpeed,
      maxAngularSpeed: maxAngularSpeed || derivedMaxAngularSpeed,
      contactCount,
      bodyContactCount,
      contactPairCount,
      deepestContactLabel,
      wokenBodyCount,
      maxPenetration,
    });
  };
  const ensurePhysicsWorld = async (sourceObjects = objectsRef.current) => {
    const signature = physicsColliderSignature(sourceObjects);
    if (physicsWorldRef.current && physicsColliderSignatureRef.current === signature) {
      return physicsWorldRef.current;
    }
    physicsWorldRef.current = null;
    physicsColliderSignatureRef.current = signature;
    const created = await window.jepowDesktop?.viewport?.createPhysicsWorld?.({
      backend: "jolt",
      gravity: [0, -9.81, 0],
      bodies: toPhysicsBodies(sourceObjects),
    });
    if (created?.worldSnapshot && typeof created.worldSnapshot === "object") {
      physicsWorldRef.current = created.worldSnapshot as Record<string, unknown>;
      updatePhysicsStats(physicsWorldRef.current);
    }
    return physicsWorldRef.current;
  };
  const stepPhysicsOnce = async (sourceObjects = objectsRef.current) => {
    const world = await ensurePhysicsWorld(sourceObjects);
    const stepped = await window.jepowDesktop?.viewport?.stepPhysicsWorld?.({
      backend: "native-minimal",
      worldId: String(world?.worldId || "physics-world-native-minimal"),
      deltaTime: 1 / 60,
      substeps: 4,
      worldSnapshot: world || undefined,
    });
    if (stepped?.worldSnapshot && typeof stepped.worldSnapshot === "object") {
      physicsWorldRef.current = stepped.worldSnapshot as Record<string, unknown>;
      updatePhysicsStats(
        physicsWorldRef.current,
        Number(stepped.contactCount) || 0,
        Number(stepped.maxPenetration) || 0,
        Number(stepped.dynamicBodyCount) || 0,
        Number(stepped.staticBodyCount) || 0,
        Number(stepped.sleepingBodyCount) || 0,
        Number(stepped.groundedBodyCount) || 0,
        Number(stepped.floorContactCount) || 0,
        Number(stepped.movingBodyCount) || 0,
        Number(stepped.rotatingBodyCount) || 0,
        Number(stepped.totalDynamicMass) || 0,
        toVec3(stepped.centerOfMass, [0, 0, 0]),
        Number(stepped.kineticEnergy) || 0,
        Number(stepped.angularEnergy) || 0,
        Number(stepped.maxLinearSpeed) || 0,
        Number(stepped.maxAngularSpeed) || 0,
        Number(stepped.bodyContactCount) || Number(stepped.contactCount) || 0,
        Array.isArray(stepped.contactPairs) ? stepped.contactPairs.length : 0,
        physicsContactLabel(stepped.deepestContact),
        Number(stepped.wokenBodyCount) || 0,
      );
      applyPhysicsSnapshotToScene(physicsWorldRef.current, sourceObjects);
    }
    return stepped;
  };
  const probePhysicsWorld = () =>
    runPipelineProbe("physics-world", "Bullet/Jolt World", async () => {
      const created = await window.jepowDesktop?.viewport?.createPhysicsWorld?.({
        backend: "jolt",
        gravity: [0, -9.81, 0],
        bodies: toPhysicsBodies(objects),
      });
      if (created?.worldSnapshot && typeof created.worldSnapshot === "object") {
        physicsWorldRef.current = created.worldSnapshot as Record<string, unknown>;
        physicsColliderSignatureRef.current = physicsColliderSignature(objects);
        updatePhysicsStats(physicsWorldRef.current);
      }
      return created;
    });
  const probePhysicsStep = () =>
    runPipelineProbe("physics-step", "Bullet/Jolt Step", async () => {
      return stepPhysicsOnce();
    });
  const togglePhysicsPlayback = () => {
    setPhysicsPlaying((playing) => !playing);
  };
  const resetPhysicsWorld = () =>
    runPipelineProbe("physics-reset", "Bullet/Jolt Reset", async () => {
      setPhysicsPlaying(false);
      physicsWorldRef.current = null;
      physicsColliderSignatureRef.current = "";
      const created = await window.jepowDesktop?.viewport?.createPhysicsWorld?.({
        backend: "jolt",
        gravity: [0, -9.81, 0],
        bodies: toPhysicsBodies(objectsRef.current),
      });
      if (created?.worldSnapshot && typeof created.worldSnapshot === "object") {
        physicsWorldRef.current = created.worldSnapshot as Record<string, unknown>;
        physicsColliderSignatureRef.current = physicsColliderSignature(objectsRef.current);
        updatePhysicsStats(physicsWorldRef.current, 0);
      } else {
        setPhysicsStats(null);
      }
      return created;
    });

  useEffect(() => {
    let stopped = false;
    const loadStatus = async () => {
      const status = await window.jepowDesktop?.viewport?.getStatus?.().catch(() => null);
      if (!stopped && status) {
        setNativeStatus(status as NativeArchitectureStatus);
      }
    };
    loadStatus();
    const timer = window.setInterval(loadStatus, 3500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!physicsPlaying) return;
    let stopped = false;
    let stepping = false;
    const timer = window.setInterval(async () => {
      if (stopped || stepping) return;
      stepping = true;
      await stepPhysicsOnce(objectsRef.current).catch(() => {
        setPhysicsPlaying(false);
      });
      stepping = false;
    }, 1000 / 30);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [physicsPlaying]);

  useEffect(() => {
    const host = window.jepowDesktop?.viewportHost;
    if (!host) {
      setHostReady(false);
      setHostError("当前环境没有原生 viewport host，桌面端编译后可用。");
      return;
    }

    let stopped = false;
    const readHostBounds = () => {
      const rect = mountRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 4 || rect.height <= 4) return null;
      const chromeX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
      const chromeY = Math.max(0, window.outerHeight - window.innerHeight - chromeX);
      return {
        x: Math.round(window.screenX + chromeX + rect.left),
        y: Math.round(window.screenY + chromeY + rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        scaleFactor: window.devicePixelRatio || 1,
        alwaysOnTop: false,
      };
    };
    const updateBounds = () => {
      const bounds = readHostBounds();
      if (!bounds) return;
      host.setBounds(bounds).catch(() => undefined);
    };

    const initialBounds = readHostBounds();
    host
      .start({ bounds: initialBounds || undefined, visible: !!initialBounds })
      .then((result) => {
        if (stopped) return;
        if (!result.ok) {
          setHostError(String(result.error || "原生视窗启动失败"));
          return;
        }
        setHostReady(true);
        setHostError(null);
        updateBounds();
        host.setVisible(true).catch(() => undefined);
      })
      .catch((error) => {
        if (!stopped) setHostError(error?.message || "原生视窗启动失败");
      });

    const resizeObserver = new ResizeObserver(updateBounds);
    if (mountRef.current) resizeObserver.observe(mountRef.current);
    window.addEventListener("resize", updateBounds);
    window.addEventListener("scroll", updateBounds, true);
    const timer = window.setInterval(updateBounds, 650);

    return () => {
      stopped = true;
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateBounds);
      window.removeEventListener("scroll", updateBounds, true);
      window.clearInterval(timer);
      host.setVisible(false).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!hostReady) return;
    const epoch = hostSceneEpochRef.current + 1;
    hostSceneEpochRef.current = epoch;
    hostSceneReadyRef.current = false;
    window.jepowDesktop?.viewportHost
      ?.setScene({ objects: toHostObjects(objects) })
      .then((result) => {
        if (hostSceneEpochRef.current === epoch) {
          hostSceneReadyRef.current = result?.ok === true;
        }
      })
      .catch(() => {
        if (hostSceneEpochRef.current === epoch) {
          hostSceneReadyRef.current = false;
        }
      });
  }, [hostReady, objects]);

  useEffect(() => {
    window.jepowDesktop?.viewportHost?.setTool(toolToHost[activeTool] || "select");
    window.jepowDesktop?.viewportHost?.setCamera?.({
      speed: activeTool === "游走" ? 1.65 : 1,
    });
  }, [activeTool]);

  useEffect(() => {
    window.jepowDesktop?.viewportHost?.setDisplayMode?.(
      displayToHost[displayMode] || "solid",
    );
  }, [displayMode]);

  useEffect(() => {
    window.jepowDesktop?.viewportHost?.setSnap?.({
      enabled: snapEnabled,
      increment: snapStep,
    });
  }, [snapEnabled, snapStep]);

  useEffect(() => {
    if (!hostReady) return;
    const selectedHostObjectId =
      selectedObjectId && objects.some((object) => object.id === selectedObjectId && object.visible !== false)
        ? selectedObjectId
        : "";
    window.jepowDesktop?.viewportHost?.setSelection(selectedHostObjectId);
  }, [hostReady, objects, selectedObjectId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        selectAdjacentVisibleObject(event.shiftKey ? -1 : 1);
      }
      const nudgeStep = (snapEnabled ? snapStep : 0.1) * (event.shiftKey ? 5 : 1);
      const rotateStep = (Math.PI / 180) * (event.shiftKey ? 15 : 5);
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (event.altKey) rotateSelectedObject([0, -rotateStep, 0]);
        else nudgeSelectedObject([-nudgeStep, 0, 0]);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (event.altKey) rotateSelectedObject([0, rotateStep, 0]);
        else nudgeSelectedObject([nudgeStep, 0, 0]);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (event.altKey) rotateSelectedObject([-rotateStep, 0, 0]);
        else nudgeSelectedObject([0, 0, -nudgeStep]);
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (event.altKey) rotateSelectedObject([rotateStep, 0, 0]);
        else nudgeSelectedObject([0, 0, nudgeStep]);
      }
      if (event.key === "PageUp") {
        event.preventDefault();
        if (event.altKey) rotateSelectedObject([0, 0, rotateStep]);
        else nudgeSelectedObject([0, nudgeStep, 0]);
      }
      if (event.key === "PageDown") {
        event.preventDefault();
        if (event.altKey) rotateSelectedObject([0, 0, -rotateStep]);
        else nudgeSelectedObject([0, -nudgeStep, 0]);
      }
      if (event.key === "[" || event.key === "]") {
        event.preventDefault();
        const base = event.shiftKey ? 0.2 : 0.05;
        scaleSelectedObject(event.key === "]" ? 1 + base : 1 - base);
      }
      if (event.shiftKey && !event.metaKey && !event.ctrlKey) {
        const addKey = event.key.toLowerCase();
        if (addKey === "a" || addKey === "c" || addKey === "l") {
          event.preventDefault();
          const type =
            addKey === "c" ? "相机" : addKey === "l" ? "灯光" : "网格";
          onAddObject?.(type);
        }
      }
      if (event.key.toLowerCase() === "l" && (event.ctrlKey || event.altKey)) {
        event.preventDefault();
        if (event.altKey) {
          unlockAllObjects();
        } else {
          toggleSelectedObjectLock();
        }
      }
      if (event.key === "w" || event.key === "W") setActiveTool("移动");
      if (event.key === "g" || event.key === "G") setActiveTool("移动");
      if (event.key === "e" || event.key === "E") setActiveTool("旋转");
      if (event.key === "r" || event.key === "R") setActiveTool("缩放");
      if (!event.shiftKey && (event.key === "s" || event.key === "S")) setActiveTool("缩放");
      if (event.key === "v" || event.key === "V") setActiveTool("选择");
      if (event.code === "Numpad1" || event.key === "1") applyViewPreset(event.ctrlKey ? "后" : "前");
      if (event.code === "Numpad3" || event.key === "3") applyViewPreset(event.ctrlKey ? "左" : "右");
      if (event.code === "Numpad7" || event.key === "7") applyViewPreset(event.ctrlKey ? "底" : "顶");
      if (event.code === "Numpad5" || event.key === "5") toggleProjection();
      if (event.key === "/") {
        event.preventDefault();
        if (event.altKey) {
          revealAllObjects();
        } else {
          isolateSelection();
        }
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.altKey) {
          setDisplayMode("线框");
        } else if (event.shiftKey) {
          setDisplayMode("CL");
        } else {
          cycleDisplayMode();
        }
      }
      if (event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setSnapEnabled((current) => !current);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && onDeleteObject) {
        event.preventDefault();
        onDeleteObject();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && onDuplicateObject) {
        event.preventDefault();
        onDuplicateObject();
      }
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        window.jepowDesktop?.viewportHost?.focusSelection?.();
      }
      if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        if (event.altKey) {
          revealAllObjects();
        } else if (selectedObjectId) {
          onUpdateObject(selectedObjectId, { visible: false });
        }
      }
      if (event.altKey && event.key.toLowerCase() === "r" && onResetObject) {
        event.preventDefault();
        onResetObject();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeTool,
    cameraProjection,
    onDeleteObject,
    onDuplicateObject,
    onAddObject,
    onResetObject,
    onSelectObject,
    onSyncObjects,
    onUpdateObject,
    snapEnabled,
    snapStep,
    selectedObjectId,
    isolateSelection,
    nudgeSelectedObject,
    revealAllObjects,
    rotateSelectedObject,
    scaleSelectedObject,
    selectAdjacentVisibleObject,
    toggleSelectedObjectLock,
    unlockAllObjects,
  ]);

  useEffect(() => {
    if (!hostReady || !selectedObject) return;
    window.jepowDesktop?.viewportHost?.setObjectTransform(selectedObject.id, {
      position: selectedObject.position,
      rotation: selectedObject.rotation,
      scale: selectedObject.scale,
    });
  }, [hostReady, selectedObject]);

  useEffect(() => {
    const host = window.jepowDesktop?.viewportHost;
    if (!hostReady || !host || !onSyncObjects) return;
    const timer = window.setInterval(async () => {
      if (!hostSceneReadyRef.current) return;
      const state = await host.getState().catch(() => null);
      if (!state?.ok || !Array.isArray(state.objects)) return;
      const synced = state.objects.map((raw: any) => {
        const type = hostToType[String(raw.type || raw.kind || "mesh")] || "网格";
        const transform = raw.transform || {};
        return {
          id: String(raw.id),
          name: String(raw.name || raw.id || "对象"),
          type,
          color: typeColor[type],
          position: toVec3(transform.position, [0, 0, 0]),
          rotation: toVec3(transform.rotation, [0, 0, 0]),
          scale: toVec3(transform.scale, [1, 1, 1]),
          visible: raw.visible !== false,
          locked: raw.locked === true,
          materialColor: typeof raw.materialColor === "string" ? raw.materialColor : undefined,
          assetPath: typeof raw.assetPath === "string" ? raw.assetPath : undefined,
          importBackend: typeof raw.importBackend === "string" ? raw.importBackend : undefined,
          triangleCount: Number(raw.triangleCount) || undefined,
          vertexCount: Number(raw.vertexCount) || undefined,
          boundsMin: Array.isArray(raw.boundsMin) ? toVec3(raw.boundsMin, [0, 0, 0]) : undefined,
          boundsMax: Array.isArray(raw.boundsMax) ? toVec3(raw.boundsMax, [0, 0, 0]) : undefined,
          boundsSize: Array.isArray(raw.boundsSize) ? toVec3(raw.boundsSize, [1, 1, 1]) : undefined,
          hasBaseColorTexture: raw.hasBaseColorTexture === true,
          hasMetallicRoughnessTexture: raw.hasMetallicRoughnessTexture === true,
          metallicFactor: Number(raw.metallicFactor) || undefined,
          roughnessFactor: Number(raw.roughnessFactor) || undefined,
        } as ThreeDObject;
      });
      const syncedSelectedObjectId =
        typeof state.selectedObjectId === "string" ? state.selectedObjectId : undefined;
      onSyncObjects(synced, syncedSelectedObjectId);
      if (syncedSelectedObjectId) {
        onSelectObject(syncedSelectedObjectId);
      }
    }, 280);
    return () => window.clearInterval(timer);
  }, [hostReady, onSelectObject, onSyncObjects]);

  return (
    <div className="flex h-full w-full overflow-hidden rounded-[12px] bg-[#1f2023] text-[#d6d6d6]">
      <div className="w-9 shrink-0 border-r border-[#25272b] bg-[#252629] py-1.5">
        {["选择", "移动", "旋转", "缩放", "游走", "测量", "注释"].map((label) => (
          <button
            key={label}
            type="button"
            title={label}
            onClick={() => setActiveTool(label)}
            className={`mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-[5px] text-[10px] font-bold ${
              activeTool === label
                ? "bg-[#4772b3] text-white"
                : "text-neutral-400 hover:bg-[#34363a] hover:text-white"
            }`}
          >
            {label.slice(0, 1)}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#25272b] bg-[#303236] px-2 text-[11px]">
          <div className="flex items-center gap-1">
            {(["前", "后", "右", "左", "顶", "底", "透"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => applyViewPreset(item)}
                className="rounded-[3px] px-2 py-0.5 text-neutral-300 hover:bg-white/[0.08] hover:text-white"
                title="小键盘 1/3/7，Ctrl+1/3/7 反向视图，5 切换投影"
              >
                {item}
              </button>
            ))}
            <button
              type="button"
              onClick={toggleProjection}
              className={`rounded-[3px] px-2 py-0.5 ${
                cameraProjection === "orthographic"
                  ? "bg-[#4772b3] text-white"
                  : "text-neutral-300 hover:bg-white/[0.08] hover:text-white"
              }`}
              title="小键盘 5 切换正交/透视"
            >
              正交
            </button>
            {[
              { label: "网格", action: () => onAddObject?.("网格") },
              { label: "相机", action: () => onAddObject?.("相机") },
              { label: "灯光", action: () => onAddObject?.("灯光") },
              { label: "复制", action: onDuplicateObject },
              { label: "删除", action: onDeleteObject },
              { label: "聚焦", action: () => window.jepowDesktop?.viewportHost?.focusSelection?.() },
              { label: "重置", action: onResetObject },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                className="rounded-[3px] px-2 py-0.5 text-neutral-300 hover:bg-white/[0.08] hover:text-white"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="rounded-[3px] px-2 py-0.5 text-neutral-300 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              title="Ctrl/Cmd+Z"
            >
              撤销
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="rounded-[3px] px-2 py-0.5 text-neutral-300 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              title="Ctrl/Cmd+Shift+Z"
            >
              重做
            </button>
            <button
              type="button"
              onClick={runArchitectureDiagnostics}
              disabled={pipelineBusy !== null}
              className="rounded-[3px] px-2 py-0.5 text-emerald-200 hover:bg-emerald-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="聚合 native/Cycles/import/physics 架构诊断报告"
            >
              架构诊断
            </button>
            <button
              type="button"
              onClick={probeArchitectureSelfTest}
              disabled={pipelineBusy !== null}
              className="rounded-[3px] px-2 py-0.5 text-emerald-200 hover:bg-emerald-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="从 React/Electron 调用 Rust 架构自检"
            >
              架构自检
            </button>
            <button
              type="button"
              onClick={probeImportPipeline}
              disabled={pipelineBusy !== null}
              className="rounded-[3px] px-2 py-0.5 text-blue-200 hover:bg-blue-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="调用 Assimp/USD 导入管线占位接口"
            >
              导入管线
            </button>
            <button
              type="button"
              onClick={probePhysicsWorld}
              disabled={pipelineBusy !== null}
              className="rounded-[3px] px-2 py-0.5 text-blue-200 hover:bg-blue-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="调用 Bullet/Jolt 创建物理世界接口"
            >
              物理世界
            </button>
            <button
              type="button"
              onClick={probePhysicsStep}
              disabled={pipelineBusy !== null}
              className="rounded-[3px] px-2 py-0.5 text-blue-200 hover:bg-blue-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="调用 Bullet/Jolt 物理步进接口"
            >
              物理步进
            </button>
            <button
              type="button"
              onClick={togglePhysicsPlayback}
              disabled={pipelineBusy !== null}
              className={`rounded-[3px] px-2 py-0.5 ${
                physicsPlaying
                  ? "bg-blue-500/25 text-white"
                  : "text-blue-200 hover:bg-blue-400/10 hover:text-white"
              } disabled:cursor-wait disabled:opacity-50`}
              title="连续播放/暂停 native 物理模拟"
            >
              {physicsPlaying ? "物理暂停" : "物理播放"}
            </button>
            <button
              type="button"
              onClick={resetPhysicsWorld}
              disabled={pipelineBusy !== null}
              className="rounded-[3px] px-2 py-0.5 text-blue-200 hover:bg-blue-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="从当前场景对象重新生成 native 物理世界"
            >
              物理重置
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-[3px] bg-[#252629] p-0.5">
            <button
              type="button"
              onClick={() => setSnapEnabled((current) => !current)}
              className={`h-5 rounded-[3px] px-2 text-[10px] font-bold ${
                snapEnabled ? "bg-[#4772b3] text-white" : "text-neutral-400"
              }`}
              title="Shift+S 切换网格吸附"
            >
              吸附
            </button>
            <select
              value={snapStep}
              onChange={(event) => setSnapStep(Number(event.target.value))}
              className="h-5 rounded-[3px] border border-[#3a3c40] bg-[#1f2023] px-1 text-[10px] text-neutral-300 outline-none"
              title="吸附步长"
            >
              <option value={0.1}>0.1</option>
              <option value={0.25}>0.25</option>
              <option value={0.5}>0.5</option>
              <option value={1}>1</option>
            </select>
            {displayModes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setDisplayMode(item)}
                className={`h-5 rounded-[3px] px-2 text-[10px] font-bold ${
                  displayMode === item ? "bg-[#4772b3] text-white" : "text-neutral-400"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div ref={mountRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#30343a]">
          <div
            className="pointer-events-none absolute inset-0 opacity-45"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          <div className="pointer-events-none absolute right-3 top-3 grid h-20 w-20 place-items-center rounded-full border border-white/10 bg-black/20 text-[10px] text-neutral-300 backdrop-blur">
            <span className="absolute top-1 text-blue-300">Z</span>
            <span className="absolute right-2 text-green-300">Y</span>
            <span className="absolute left-2 text-red-300">X</span>
            <span className="rounded-full bg-white/10 px-1.5 py-0.5">视图</span>
          </div>
          <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/35 px-2 py-1 text-[10px] text-neutral-300">
            原生透视 · Collection | {selectedObject?.name || "对象"} · {activeTool}
          </div>
          {nativeStatus?.architecture && (
            <div className="pointer-events-none absolute left-3 top-10 max-h-[34vh] max-w-[560px] overflow-hidden rounded bg-black/35 px-2 py-1 text-[10px] text-neutral-300 backdrop-blur">
              <div className="mb-1 font-bold text-neutral-200">
                架构状态 ·{" "}
                {nativeStatus.architectureProductionReady
                  ? "生产能力就绪"
                  : nativeStatus.architectureReady
                    ? "骨架完成 / 功能填充中"
                    : "核心就绪 / 扩展接入中"}
              </div>
              {nativeStatus.architectureProgress && (
                <div className="mb-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-1">
                  <div className="flex items-center justify-between text-[9px] text-neutral-300">
                    <span>{nativeStatus.architectureProgress.currentPhaseLabel}</span>
                    <span>
                      骨架 {nativeStatus.architectureProgress.skeletonPercent ?? 0}% · Runtime{" "}
                      {nativeStatus.architectureProgress.runtimePercent ?? 0}% · 生产{" "}
                      {nativeStatus.architectureProgress.productionPercent ?? 0}%
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded bg-white/10">
                    <div
                      className="h-1 rounded bg-blue-400"
                      style={{
                        width: `${nativeStatus.architectureProgress.skeletonPercent ?? 0}%`,
                      }}
                    />
                  </div>
                  <div className="mt-0.5 h-1 rounded bg-white/10">
                    <div
                      className="h-1 rounded bg-purple-400"
                      style={{
                        width: `${nativeStatus.architectureProgress.runtimePercent ?? 0}%`,
                      }}
                    />
                  </div>
                  <div className="mt-0.5 h-1 rounded bg-white/10">
                    <div
                      className="h-1 rounded bg-emerald-400"
                      style={{
                        width: `${nativeStatus.architectureProgress.productionPercent ?? 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {Object.entries(nativeStatus.architecture).map(([key, feature]) => (
                  <span
                    key={key}
                    title={feature.detail}
                    className={`rounded border px-1.5 py-0.5 ${
                      feature.productionReady
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                        : feature.status
                          ? "border-blue-400/30 bg-blue-400/10 text-blue-200"
                        : "border-amber-400/30 bg-amber-400/10 text-amber-200"
                    }`}
                  >
                    {feature.productionReady
                      ? "可用"
                      : feature.runtimeReady
                        ? "Runtime"
                      : feature.status
                        ? "骨架已接入"
                        : "待接入"}{" "}
                    · {feature.label || key}
                  </span>
                ))}
              </div>
              {(nativeStatus.uiBackend || uiCapabilityBadges.length > 0) && (
                <div className="mt-1 rounded border border-neutral-300/20 bg-white/[0.06] px-1.5 py-1 text-[9px] text-neutral-100">
                  <div className="mb-1 font-bold">
                    UI runtime · {nativeStatus.uiBackend || "react-electron"}
                  </div>
                  {uiCapabilityBadges.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {uiCapabilityBadges.map((capability) => (
                        <span
                          key={capability}
                          className="rounded border border-white/15 bg-black/20 px-1 py-0.5"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(nativeStatus.viewportBackend || viewportCapabilityBadges.length > 0) && (
                <div className="mt-1 rounded border border-emerald-300/20 bg-emerald-400/10 px-1.5 py-1 text-[9px] text-emerald-100">
                  <div className="mb-1 font-bold">
                    Viewport runtime · {nativeStatus.viewportBackend || "rust-wgpu"}
                  </div>
                  {viewportCapabilityBadges.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {viewportCapabilityBadges.map((capability) => (
                        <span
                          key={capability}
                          className="rounded border border-emerald-200/20 bg-black/20 px-1 py-0.5"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(nativeStatus.cyclesBackend || cyclesCapabilityBadges.length > 0) && (
                <div className="mt-1 rounded border border-purple-300/20 bg-purple-400/10 px-1.5 py-1 text-[9px] text-purple-100">
                  <div className="mb-1 font-bold">
                    Cycles/CL runtime · {nativeStatus.cyclesBackend || "bridge"} ·{" "}
                    {nativeStatus.cyclesProductionReady ? "可渲染" : "桥接中"}
                    {nativeStatus.cyclesRenderDevices?.length
                      ? ` · ${nativeStatus.cyclesRenderDevices.join("/")}`
                      : ""}
                  </div>
                  {cyclesCapabilityBadges.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cyclesCapabilityBadges.map((capability) => (
                        <span
                          key={capability}
                          className="rounded border border-purple-200/20 bg-black/20 px-1 py-0.5"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(nativeStatus.importBackend || importCapabilityBadges.length > 0) && (
                <div className="mt-1 rounded border border-orange-300/20 bg-orange-400/10 px-1.5 py-1 text-[9px] text-orange-100">
                  <div className="mb-1 font-bold">
                    Import runtime · {nativeStatus.importBackend || "native"}
                  </div>
                  {importCapabilityBadges.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {importCapabilityBadges.map((capability) => (
                        <span
                          key={capability}
                          className="rounded border border-orange-200/20 bg-black/20 px-1 py-0.5"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(nativeStatus.physicsBackend || physicsCapabilityBadges.length > 0) && (
                <div className="mt-1 rounded border border-sky-300/20 bg-sky-400/10 px-1.5 py-1 text-[9px] text-sky-100">
                  <div className="mb-1 font-bold">
                    Physics runtime · {nativeStatus.physicsBackend || "native"} ·{" "}
                    {physicsPlaying ? "播放中" : "可步进"}
                  </div>
                  {physicsCapabilityBadges.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {physicsCapabilityBadges.map((capability) => (
                        <span
                          key={capability}
                          className="rounded border border-sky-200/20 bg-black/20 px-1 py-0.5"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {(pipelineProbe || pipelineBusy) && (
            <div className="pointer-events-none absolute left-3 top-[112px] max-w-[520px] rounded border border-blue-400/20 bg-black/45 px-2 py-1 text-[10px] text-neutral-300 backdrop-blur">
              <div className="mb-0.5 font-bold text-blue-100">
                架构管线控制台 · {pipelineBusy ? "调用中" : pipelineProbe?.title}
              </div>
              {pipelineBusy ? (
                <div className="text-blue-200">正在调用 {pipelineBusy} 管线接口...</div>
              ) : (
                <div>
                  <div className={pipelineProbe?.ok ? "text-emerald-200" : "text-amber-200"}>
                    {pipelineProbe?.ok ? "OK" : "WARN"}
                    {pipelineProbe?.backend ? ` · ${pipelineProbe.backend}` : ""}
                    {pipelineProbe?.command ? ` · ${pipelineProbe.command}` : ""} ·{" "}
                    {pipelineProbe?.message}
                  </div>
                  {pipelineProbe?.details?.length ? (
                    <div className="mt-1 flex max-w-[500px] flex-wrap gap-1 text-[9px] text-blue-100">
                      {pipelineProbe.details.map((detail) => (
                        <span
                          key={detail}
                          className="rounded border border-blue-300/20 bg-blue-400/10 px-1.5 py-0.5"
                        >
                          {detail}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
          {(physicsStats || physicsPlaying) && (
            <div className="pointer-events-none absolute left-3 top-[158px] max-w-[min(680px,calc(100%-24px))] rounded border border-sky-400/20 bg-black/45 px-2 py-1 text-[10px] leading-4 text-sky-100 backdrop-blur">
              <div className="font-bold">
                物理 runtime · {physicsPlaying ? "播放中" : "暂停"} · bodies{" "}
                {physicsStats?.bodyCount ?? 0} · dynamic {physicsStats?.dynamicBodyCount ?? 0} · static{" "}
                {physicsStats?.staticBodyCount ?? 0} · sleep {physicsStats?.sleepingBodyCount ?? 0}
              </div>
              <div className="text-sky-100/85">
                moving {physicsStats?.movingBodyCount ?? 0} · rotating {physicsStats?.rotatingBodyCount ?? 0} · grounded{" "}
                {physicsStats?.groundedBodyCount ?? 0} · floor {physicsStats?.floorContactCount ?? 0} · contacts{" "}
                {physicsStats?.contactCount ?? 0} · pairs {physicsStats?.contactPairCount ?? 0} · wake{" "}
                {physicsStats?.wokenBodyCount ?? 0}
              </div>
              <div className="text-sky-100/75">
                t {(physicsStats?.time ?? 0).toFixed(2)}s · pen {(physicsStats?.maxPenetration ?? 0).toFixed(3)} · mass{" "}
                {(physicsStats?.totalDynamicMass ?? 0).toFixed(1)} · com{" "}
                {(physicsStats?.centerOfMass ?? [0, 0, 0]).map((value) => value.toFixed(1)).join("/")} · E{" "}
                {((physicsStats?.kineticEnergy ?? 0) + (physicsStats?.angularEnergy ?? 0)).toFixed(2)} · vmax{" "}
                {(physicsStats?.maxLinearSpeed ?? 0).toFixed(1)} · wmax{" "}
                {(physicsStats?.maxAngularSpeed ?? 0).toFixed(1)}
                {physicsStats?.deepestContactLabel ? ` · deep ${physicsStats.deepestContactLabel}` : ""}
              </div>
            </div>
          )}
          {diagnostics?.checks && (
            <div className="pointer-events-none absolute right-3 bottom-3 w-[360px] rounded border border-emerald-400/20 bg-black/45 px-2 py-1.5 text-[10px] text-neutral-300 backdrop-blur">
              <div className="mb-1 font-bold text-emerald-100">
                架构诊断报告 · {diagnostics.ok ? "通过" : "需处理"}
              </div>
              {diagnostics.architectureProgress && (
                <div className="mb-1 rounded bg-white/[0.04] px-1.5 py-1 text-[9px] text-neutral-300">
                  阶段 · {diagnostics.architectureProgress.currentPhaseLabel} · 骨架{" "}
                  {diagnostics.architectureProgress.skeletonPercent ?? 0}% · Runtime{" "}
                  {diagnostics.architectureProgress.runtimePercent ?? 0}% · 生产{" "}
                  {diagnostics.architectureProgress.productionPercent ?? 0}%
                  <div className="mt-0.5 text-neutral-400">
                    下一步：{diagnostics.architectureProgress.nextMilestone}
                  </div>
                </div>
              )}
              <div className="mb-1 truncate text-[9px] text-neutral-400" title={diagnostics.canonicalStack}>
                {diagnostics.canonicalStack}
              </div>
              <div className="grid gap-1">
                {diagnostics.checks.map((check) => (
                  <div
                    key={check.id || check.label}
                    className={`rounded border px-1.5 py-1 ${
                      check.productionReady
                        ? "border-emerald-400/25 bg-emerald-400/10"
                        : check.ok
                          ? "border-blue-400/25 bg-blue-400/10"
                          : "border-amber-400/25 bg-amber-400/10"
                    }`}
                  >
                    <div className="font-bold text-neutral-100">
                      {check.productionReady ? "可用" : check.ok ? "骨架 OK" : "缺失"} ·{" "}
                      {check.label || check.id}
                    </div>
                    <div className="text-neutral-400">{check.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[calc(100%-24px)] rounded bg-black/35 px-2 py-1 text-[10px] leading-4 text-neutral-300 backdrop-blur">
            Ctrl+L 锁定 · 方向键微移 · Alt+方向旋转 · [/] 缩放 · Shift+A/C/L 添加 · Tab 切对象 ·
            Z/Alt+Z 显示 · H/Alt+H 显隐 · / 隔离
          </div>
          {!hostReady && (
            <div className="absolute inset-0 grid place-items-center bg-[#30343a] text-center">
              <div className="rounded-[10px] border border-[#25272b] bg-[#1f2023]/90 px-5 py-4 shadow-2xl">
                <div className="text-[12px] font-bold text-neutral-200">
                  正在启动原生 wgpu 视窗
                </div>
                <p className="mt-2 max-w-[260px] text-[10px] leading-relaxed text-neutral-500">
                  {hostError || "首次启动会拉起 jepow-engine viewport-host。"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="h-14 shrink-0 border-t border-[#25272b] bg-[#252629] px-2 py-1">
          <div className="mb-1 flex items-center gap-2 text-[10px] text-neutral-400">
            <span>起始 1</span>
            <span>结束 250</span>
            <span className="ml-auto">当前帧 1</span>
          </div>
          <div className="relative h-6 rounded bg-[#1b1c1f]">
            <div className="absolute inset-y-0 left-4 w-px bg-[#4772b3]" />
            <div className="absolute inset-x-2 top-1/2 h-px bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
