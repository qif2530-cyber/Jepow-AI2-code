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
const objectModes = ["对象", "编辑", "雕刻", "姿态"] as const;
const transformOrientations = ["全局", "局部", "视图"] as const;
const pivotPoints = ["中点", "原点", "游标"] as const;
const selectionModes = ["对象", "点", "边", "面"] as const;
const axisConstraints = ["自由", "X", "Y", "Z"] as const;
const blenderMenuSections = ["文件", "编辑", "渲染", "窗口", "帮助"] as const;
const workspaceTabs = ["Layout", "Modeling", "Sculpting", "UV Editing", "Shading", "Animation", "Render"] as const;
const viewportHeaderMenus = ["视图", "选择", "添加", "对象"] as const;
const propertiesTabs = ["工具", "对象", "材质", "物理", "渲染"] as const;
const viewportSidebarTabs = ["Item", "Tool", "View"] as const;
const menuOperatorQueries: Record<string, string> = {
  文件: "Add",
  编辑: "Object",
  渲染: "Diagnostics",
  窗口: "View",
  帮助: "Diagnostics",
  视图: "View",
  选择: "Object",
  添加: "Add",
  对象: "Object",
};
const transformRows = [
  { label: "Location", field: "position" as const },
  { label: "Rotation", field: "rotation" as const },
  { label: "Scale", field: "scale" as const },
];

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

const toolIcons: Record<string, string> = {
  选择: "⌖",
  移动: "↔",
  旋转: "⟳",
  缩放: "□",
  游标: "⊕",
  游走: "⌁",
  测量: "⌇",
  注释: "✎",
};

const viewIcons: Record<string, string> = {
  前: "F",
  后: "B",
  右: "R",
  左: "L",
  顶: "T",
  底: "D",
  透: "P",
};

const actionIcons: Record<string, string> = {
  网格: "▣",
  相机: "▱",
  灯光: "✦",
  复制: "⧉",
  删除: "⌫",
  聚焦: "◎",
  重置: "↺",
  撤销: "↶",
  重做: "↷",
  架构诊断: "◆",
  诊断层: "◈",
  弹出原生: "▤",
  收回原生: "▥",
  开发工具: "⚙",
  架构自检: "✓",
  导入管线: "⇣",
  物理世界: "⬡",
  物理步进: "▶",
  物理播放: "▷",
  物理暂停: "Ⅱ",
  物理重置: "↻",
  吸附: "⌁",
};

const displayIcons: Record<string, string> = {
  线框: "◇",
  实体: "●",
  材质: "◐",
  CL: "CL",
};

const navigationGizmoAxes = [
  { axis: "X", label: "右", className: "right-1 top-1/2 -translate-y-1/2 text-red-300" },
  { axis: "Y", label: "前", className: "left-1/2 bottom-1 -translate-x-1/2 text-green-300" },
  { axis: "Z", label: "顶", className: "left-1/2 top-1 -translate-x-1/2 text-blue-300" },
] as const;

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

const scenePixel = (value: number) => value * 72;
const formatTransformNumber = (value: number) => Number(value.toFixed(3));
const normalizeHexColor = (value?: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "#9ebeed";

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
  const dockedDragRef = useRef<{ button: number; x: number; y: number } | null>(null);
  const objectsRef = useRef(objects);
  const [activeWorkspace, setActiveWorkspace] = useState<(typeof workspaceTabs)[number]>("Layout");
  const [activeTool, setActiveTool] = useState("选择");
  const [propertiesTab, setPropertiesTab] = useState<(typeof propertiesTabs)[number]>("对象");
  const [threeDCursor, setThreeDCursor] = useState<[number, number, number]>([0, 0, 0]);
  const [displayMode, setDisplayMode] = useState("CL");
  const [objectMode, setObjectMode] = useState<(typeof objectModes)[number]>("对象");
  const [transformOrientation, setTransformOrientation] =
    useState<(typeof transformOrientations)[number]>("全局");
  const [pivotPoint, setPivotPoint] = useState<(typeof pivotPoints)[number]>("中点");
  const [selectionMode, setSelectionMode] = useState<(typeof selectionModes)[number]>("对象");
  const [axisConstraint, setAxisConstraint] = useState<(typeof axisConstraints)[number]>("自由");
  const [proportionalEditing, setProportionalEditing] = useState(false);
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
  const [nativeViewportPopout, setNativeViewportPopout] = useState(false);
  const [showRuntimeOverlay, setShowRuntimeOverlay] = useState(false);
  const [showDeveloperTools, setShowDeveloperTools] = useState(false);
  const [showViewportOverlays, setShowViewportOverlays] = useState(true);
  const [showViewportGizmos, setShowViewportGizmos] = useState(true);
  const [showViewportSidebar, setShowViewportSidebar] = useState(false);
  const [viewportSidebarTab, setViewportSidebarTab] = useState<(typeof viewportSidebarTabs)[number]>("Item");
  const [viewportFocalLength, setViewportFocalLength] = useState(50);
  const [viewportClipStart, setViewportClipStart] = useState(0.1);
  const [viewportClipEnd, setViewportClipEnd] = useState(1000);
  const [timelineFrame, setTimelineFrame] = useState(1);
  const [viewportContextMenu, setViewportContextMenu] = useState<{
    x: number;
    y: number;
    objectId?: string;
  } | null>(null);
  const [operatorSearchOpen, setOperatorSearchOpen] = useState(false);
  const [operatorSearchQuery, setOperatorSearchQuery] = useState("");
  const [outlinerSearch, setOutlinerSearch] = useState("");
  const [openPropertySections, setOpenPropertySections] = useState({
    transform: true,
    objectData: true,
    material: true,
    physics: true,
    render: true,
  });
  const [dockedCamera, setDockedCamera] = useState({
    yaw: -38,
    pitch: 58,
    zoom: 1,
    panX: 0,
    panY: 0,
  });
  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId) || objects[0],
    [objects, selectedObjectId],
  );
  const filteredOutlinerObjects = useMemo(() => {
    const query = outlinerSearch.trim().toLowerCase();
    if (!query) return objects;
    return objects.filter(
      (object) =>
        object.name.toLowerCase().includes(query) ||
        object.type.toLowerCase().includes(query) ||
        object.importBackend?.toLowerCase().includes(query),
    );
  }, [objects, outlinerSearch]);
  const sceneStats = useMemo(() => {
    const visibleObjects = objects.filter((object) => object.visible !== false);
    return {
      total: objects.length,
      visible: visibleObjects.length,
      meshes: objects.filter((object) => object.type === "网格").length,
      cameras: objects.filter((object) => object.type === "相机").length,
      lights: objects.filter((object) => object.type === "灯光").length,
      triangles: objects.reduce((sum, object) => sum + (object.triangleCount || 0), 0),
    };
  }, [objects]);
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
  useEffect(() => {
    if (!viewportContextMenu) return;
    const onWindowPointerDown = () => closeViewportContextMenu();
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeViewportContextMenu();
    };
    window.addEventListener("pointerdown", onWindowPointerDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onWindowPointerDown);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [viewportContextMenu]);
  useEffect(() => {
    if (!operatorSearchOpen) return;
    const onWindowPointerDown = () => closeOperatorSearch();
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOperatorSearch();
    };
    window.addEventListener("pointerdown", onWindowPointerDown);
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onWindowPointerDown);
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [operatorSearchOpen]);
  const applyViewPreset = (preset: keyof typeof viewPresets) => {
    const nextProjection = viewPresets[preset].projection;
    const presetCamera = viewPresets[preset];
    setCameraProjection(nextProjection);
    setDockedCamera((camera) => ({
      ...camera,
      yaw: (presetCamera.yaw * 180) / Math.PI - 38,
      pitch: Math.max(-78, Math.min(78, (presetCamera.pitch * 180) / Math.PI + 28)),
      zoom: preset === "透" ? 1 : camera.zoom,
      panX: 0,
      panY: 0,
    }));
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
  const resetDockedView = () => {
    setDockedCamera({ yaw: -38, pitch: 58, zoom: 1, panX: 0, panY: 0 });
  };
  const onDockedViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (nativeViewportPopout) return;
    event.preventDefault();
    dockedDragRef.current = { button: event.button, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onDockedViewportPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dockedDragRef.current;
    if (!drag || nativeViewportPopout) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    dockedDragRef.current = { ...drag, x: event.clientX, y: event.clientY };
    setDockedCamera((camera) => {
      if (drag.button === 1 || drag.button === 2 || event.altKey) {
        return {
          ...camera,
          panX: camera.panX + dx,
          panY: camera.panY + dy,
        };
      }
      return {
        ...camera,
        yaw: camera.yaw + dx * 0.45,
        pitch: Math.max(-78, Math.min(78, camera.pitch - dy * 0.35)),
      };
    });
  };
  const onDockedViewportPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dockedDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onDockedViewportWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (nativeViewportPopout) return;
    event.preventDefault();
    setDockedCamera((camera) => ({
      ...camera,
      zoom: Math.max(0.45, Math.min(2.8, camera.zoom - event.deltaY * 0.0015)),
    }));
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
  const closeOperatorSearch = () => {
    setOperatorSearchOpen(false);
    setOperatorSearchQuery("");
  };
  const openOperatorSearch = (query = "") => {
    setOperatorSearchQuery(query);
    setOperatorSearchOpen(true);
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
  const updateSelectedVector = (
    field: "position" | "rotation" | "scale",
    axis: 0 | 1 | 2,
    value: number,
  ) => {
    const object = objectsRef.current.find((item) => item.id === selectedObjectId);
    if (!object || object.locked || Number.isNaN(value)) return;
    const next = [...object[field]] as [number, number, number];
    next[axis] = field === "scale" ? Math.max(0.01, value) : value;
    onUpdateObject(object.id, { [field]: next });
  };
  const updateSelectedMaterialColor = (color: string) => {
    const object = objectsRef.current.find((item) => item.id === selectedObjectId);
    if (!object || object.locked) return;
    onUpdateObject(object.id, { materialColor: color, color });
  };
  const updateThreeDCursor = (axis: 0 | 1 | 2, value: number) => {
    if (Number.isNaN(value)) return;
    setThreeDCursor((current) => {
      const next = [...current] as [number, number, number];
      next[axis] = value;
      return next;
    });
  };
  const closeViewportContextMenu = () => setViewportContextMenu(null);
  const runViewportContextAction = (action: () => void) => {
    action();
    closeViewportContextMenu();
  };
  const moveSelectionToCursor = () => {
    const object = objectsRef.current.find((item) => item.id === selectedObjectId);
    if (!object || object.locked) return;
    onUpdateObject(object.id, { position: threeDCursor });
  };
  const toggleSelectedObjectLock = () => {
    const object = objectsRef.current.find((item) => item.id === selectedObjectId);
    if (!object) return;
    onUpdateObject(object.id, { locked: object.locked !== true });
  };
  const togglePropertySection = (section: keyof typeof openPropertySections) => {
    setOpenPropertySections((current) => ({ ...current, [section]: !current[section] }));
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

  const operatorCommands = useMemo(
    () => [
      { label: "Add Mesh", group: "Add", run: () => onAddObject?.("网格") },
      { label: "Add Camera", group: "Add", run: () => onAddObject?.("相机") },
      { label: "Add Light", group: "Add", run: () => onAddObject?.("灯光") },
      { label: "Duplicate Object", group: "Object", run: () => onDuplicateObject?.(), disabled: !onDuplicateObject },
      { label: "Delete Object", group: "Object", run: () => onDeleteObject?.(), disabled: !onDeleteObject },
      { label: "Focus Selection", group: "View", run: () => window.jepowDesktop?.viewportHost?.focusSelection?.() },
      { label: "Isolate Selection", group: "View", run: isolateSelection, disabled: !onSyncObjects || !selectedObjectId },
      { label: "Reveal All Objects", group: "View", run: revealAllObjects, disabled: !onSyncObjects },
      { label: "Toggle Wireframe", group: "Viewport", run: () => setDisplayMode("线框") },
      { label: "Toggle Material Preview", group: "Viewport", run: () => setDisplayMode("材质") },
      { label: "Toggle CL View", group: "Viewport", run: () => setDisplayMode("CL") },
      { label: "Toggle Overlays", group: "Viewport", run: () => setShowViewportOverlays((current) => !current) },
      { label: "Toggle Gizmos", group: "Viewport", run: () => setShowViewportGizmos((current) => !current) },
      { label: "Toggle N Panel", group: "Viewport", run: () => setShowViewportSidebar((current) => !current) },
      { label: "Cursor to Selection", group: "Cursor", run: () => selectedObject && setThreeDCursor(selectedObject.position), disabled: !selectedObject },
      { label: "Selection to Cursor", group: "Cursor", run: moveSelectionToCursor, disabled: !selectedObject || selectedObject.locked },
      { label: "Physics Play/Pause", group: "Physics", run: togglePhysicsPlayback, disabled: pipelineBusy !== null },
      { label: "Physics Step", group: "Physics", run: probePhysicsStep, disabled: pipelineBusy !== null },
      { label: "Run Architecture Diagnostics", group: "Diagnostics", run: runArchitectureDiagnostics, disabled: pipelineBusy !== null },
    ],
    [
      isolateSelection,
      moveSelectionToCursor,
      onAddObject,
      onDeleteObject,
      onDuplicateObject,
      onSyncObjects,
      pipelineBusy,
      probePhysicsStep,
      revealAllObjects,
      runArchitectureDiagnostics,
      selectedObject,
      selectedObjectId,
      togglePhysicsPlayback,
    ],
  );
  const filteredOperatorCommands = useMemo(() => {
    const query = operatorSearchQuery.trim().toLowerCase();
    if (!query) return operatorCommands;
    return operatorCommands.filter(
      (command) =>
        command.label.toLowerCase().includes(query) || command.group.toLowerCase().includes(query),
    );
  }, [operatorCommands, operatorSearchQuery]);
  const runOperatorCommand = (command: (typeof operatorCommands)[number]) => {
    if (command.disabled) return;
    command.run();
    closeOperatorSearch();
  };

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
    if (!nativeViewportPopout) {
      host?.setVisible(false).catch(() => undefined);
      setHostReady(false);
      setHostError(null);
      return;
    }
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
  }, [nativeViewportPopout]);

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
      if (event.key === "F3") {
        event.preventDefault();
        openOperatorSearch();
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

  const renderDockedSceneObject = (object: ThreeDObject) => {
    const isSelected = object.id === selectedObjectId;
    const baseTransform = `translate3d(calc(-50% + ${scenePixel(object.position[0])}px), calc(-50% + ${scenePixel(
      -object.position[2],
    )}px), ${scenePixel(object.position[1])}px) rotateX(${object.rotation[0]}deg) rotateY(${
      object.rotation[1]
    }deg) rotateZ(${object.rotation[2]}deg) scale3d(${object.scale[0]}, ${object.scale[1]}, ${
      object.scale[2]
    })`;
    const renderTransformGizmo = () => {
      if (!isSelected || !showViewportGizmos) return null;
      if (activeTool === "旋转") {
        return (
          <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 [transform:translateZ(74px)] blender-transform-gizmo blender-rotate-gizmo">
            <div className="absolute inset-0 rounded-full border-2 border-red-400/80" />
            <div className="absolute inset-3 rounded-full border-2 border-green-400/80 [transform:rotateX(70deg)]" />
            <div className="absolute inset-6 rounded-full border-2 border-blue-400/80 [transform:rotateY(70deg)]" />
          </div>
        );
      }
      if (activeTool === "缩放") {
        return (
          <div className="absolute left-1/2 top-1/2 [transform-style:preserve-3d] blender-transform-gizmo blender-scale-gizmo">
            <div className="absolute h-1 w-32 bg-red-400/80 [transform:translateZ(68px)]" />
            <div className="absolute h-32 w-1 bg-green-400/80 [transform:translateZ(70px)]" />
            <div className="absolute h-1 w-24 bg-blue-400/80 [transform:rotateY(90deg)_translateZ(70px)]" />
            <div className="absolute left-32 top-0 h-4 w-4 -translate-y-1/2 bg-red-400 [transform:translateZ(72px)]" />
            <div className="absolute left-0 top-32 h-4 w-4 -translate-x-1/2 bg-green-400 [transform:translateZ(72px)]" />
            <div className="absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 bg-blue-400 [transform:rotateY(90deg)_translateZ(82px)]" />
          </div>
        );
      }
      return (
        <div className="absolute left-1/2 top-1/2 [transform-style:preserve-3d] blender-transform-gizmo blender-translate-gizmo">
          <div className="absolute h-1 w-36 -translate-y-1/2 bg-red-400/80 [transform:translateZ(66px)]" />
          <div className="absolute left-[142px] top-1/2 h-0 w-0 -translate-y-1/2 border-y-[6px] border-l-[10px] border-y-transparent border-l-red-400 [transform:translateZ(66px)]" />
          <div className="absolute h-36 w-1 -translate-x-1/2 bg-green-400/80 [transform:translateZ(68px)]" />
          <div className="absolute left-1/2 top-[-10px] h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[10px] border-x-transparent border-b-green-400 [transform:translateZ(68px)]" />
          <div className="absolute h-1 w-28 -translate-x-1/2 bg-blue-400/80 [transform:rotateY(90deg)_translateZ(68px)]" />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-orange-300 [transform:translateZ(72px)]" />
        </div>
      );
    };

    if (object.type === "网格") {
      return (
        <div
          key={object.id}
          className="pointer-events-auto absolute left-1/2 top-1/2 h-24 w-24 cursor-pointer [transform-style:preserve-3d]"
          style={{ transform: baseTransform }}
          title={`${object.name} · 位置 ${object.position.map(formatTransformNumber).join(", ")}`}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelectObject(object.id);
          }}
        >
          {isSelected && <div className="absolute -inset-2 border-2 border-orange-300/95 [transform:translateZ(68px)]" />}
          <div
            className={`absolute inset-0 border ${
              isSelected ? "border-orange-300/80" : "border-sky-200/45"
            } bg-[#9ebeed]/90 [transform:translateZ(48px)]`}
          />
          <div className="absolute inset-0 border border-sky-200/30 bg-[#58749e]/85 [transform:rotateY(180deg)_translateZ(48px)]" />
          <div className="absolute inset-0 border border-sky-200/35 bg-[#6f8db9]/85 [transform:rotateY(90deg)_translateZ(48px)]" />
          <div className="absolute inset-0 border border-sky-200/35 bg-[#6f8db9]/80 [transform:rotateY(-90deg)_translateZ(48px)]" />
          <div className="absolute inset-0 border border-sky-200/40 bg-[#b8d4ff]/90 [transform:rotateX(90deg)_translateZ(48px)]" />
          <div className="absolute inset-0 border border-sky-200/25 bg-[#3e536f]/90 [transform:rotateX(-90deg)_translateZ(48px)]" />
          {renderTransformGizmo()}
        </div>
      );
    }

    if (object.type === "相机") {
      return (
        <div
          key={object.id}
          className={`pointer-events-auto absolute left-1/2 top-1/2 h-20 w-28 cursor-pointer border-2 bg-black/10 text-[10px] [transform-style:preserve-3d] ${
            isSelected ? "border-orange-300/90 text-orange-100" : "border-emerald-300/70 text-emerald-100"
          }`}
          style={{ transform: baseTransform }}
          title={`${object.name} · Camera`}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelectObject(object.id);
          }}
        >
          <div className="absolute inset-2 border border-current/60" />
          <div className="absolute -left-7 top-1/2 h-px w-7 bg-current/70" />
          <div className="absolute -right-7 top-1/2 h-px w-7 bg-current/70" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">Camera</div>
        </div>
      );
    }

    return (
      <div
        key={object.id}
        className={`pointer-events-auto absolute left-1/2 top-1/2 grid h-20 w-20 cursor-pointer place-items-center rounded-full border-2 text-[10px] ${
          isSelected ? "border-orange-300/90 text-orange-100" : "border-yellow-200/80 text-yellow-100"
        } bg-yellow-300/20`}
        style={{ transform: baseTransform }}
        title={`${object.name} · Light`}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelectObject(object.id);
        }}
      >
        <div className="absolute h-28 w-px bg-yellow-200/50" />
        <div className="absolute h-px w-28 bg-yellow-200/50" />
        <span className="rounded-full bg-yellow-300/20 px-2 py-1">Light</span>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[12px] bg-[#1f2023] text-[#d6d6d6]">
      <div className="flex h-7 shrink-0 items-center gap-3 border-b border-[#25272b] bg-[#191a1d] px-2 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#4772b3] px-1.5 py-0.5 text-[10px] font-bold text-white">Jepow</span>
          {blenderMenuSections.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => openOperatorSearch(menuOperatorQueries[section] || "")}
              className="rounded px-1.5 py-0.5 text-neutral-300 hover:bg-white/[0.08] hover:text-white"
              title={`打开 ${section} 相关命令`}
            >
              {section}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 truncate text-center text-[10px] text-neutral-500">
          React/Electron UI + Rust/wgpu Core Viewport + Cycles/CL Render + Assimp/USD Import + Bullet/Jolt Physics
        </div>
        <div className="text-[10px] text-neutral-400">Scene · ViewLayer</div>
      </div>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[#25272b] bg-[#252629] px-2 text-[11px]">
        {workspaceTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveWorkspace(tab)}
            className={`h-6 rounded-t px-2 text-[10px] ${
              activeWorkspace === tab
                ? "bg-[#303236] text-white"
                : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-100"
            }`}
            title={`${tab} workspace`}
          >
            {tab}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-neutral-500">Workspace · {activeWorkspace}</span>
      </div>
      <div className="flex min-h-0 flex-1">
      <div className="w-9 shrink-0 border-r border-[#25272b] bg-[#252629] py-1.5">
        {["选择", "游标", "移动", "旋转", "缩放", "游走", "测量", "注释"].map((label) => (
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
            {toolIcons[label] || label.slice(0, 1)}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-[#25272b] bg-[#303236] px-2 text-[11px]">
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            <select
              value={objectMode}
              onChange={(event) => setObjectMode(event.target.value as (typeof objectModes)[number])}
              className="h-5 rounded-[3px] border border-[#3a3c40] bg-[#1f2023] px-1 text-[10px] text-neutral-300 outline-none"
              title="Blender-style 模式切换"
            >
              {objectModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-0.5 rounded-[3px] bg-[#252629] p-0.5 blender-selection-mode-strip">
              {selectionModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSelectionMode(mode)}
                  className={`h-5 min-w-5 rounded-[3px] px-1.5 text-[10px] ${
                    selectionMode === mode ? "bg-[#4772b3] text-white" : "text-neutral-400 hover:bg-white/[0.08]"
                  }`}
                  title={`选择模式 · ${mode}`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <span className="mx-1 h-4 w-px shrink-0 bg-white/10" />
            {(["前", "后", "右", "左", "顶", "底", "透"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => applyViewPreset(item)}
                className="grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] text-neutral-300 hover:bg-white/[0.08] hover:text-white"
                title={`${item}视图 · 小键盘 1/3/7，Ctrl+1/3/7 反向视图`}
              >
                {viewIcons[item]}
              </button>
            ))}
            <button
              type="button"
              onClick={toggleProjection}
              className={`grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] ${
                cameraProjection === "orthographic"
                  ? "bg-[#4772b3] text-white"
                  : "text-neutral-300 hover:bg-white/[0.08] hover:text-white"
              }`}
              title="小键盘 5 切换正交/透视"
            >
              ⊥
            </button>
            <span className="mx-1 h-4 w-px shrink-0 bg-white/10" />
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
                disabled={!item.action}
                title={item.label}
                className="grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] text-neutral-300 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              >
                {actionIcons[item.label] || item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] text-neutral-300 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              title="撤销 · Ctrl/Cmd+Z"
            >
              {actionIcons["撤销"]}
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] text-neutral-300 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              title="重做 · Ctrl/Cmd+Shift+Z"
            >
              {actionIcons["重做"]}
            </button>
            <span className="mx-1 h-4 w-px shrink-0 bg-white/10" />
            <button
              type="button"
              onClick={() => setShowDeveloperTools((current) => !current)}
              className={`grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] ${
                showDeveloperTools
                  ? "bg-emerald-500/25 text-white"
                  : "text-neutral-300 hover:bg-white/[0.08] hover:text-white"
              }`}
              title="开发/诊断工具"
            >
              {actionIcons["开发工具"]}
            </button>
            {showDeveloperTools && (
              <>
            <button
              type="button"
              onClick={runArchitectureDiagnostics}
              disabled={pipelineBusy !== null}
              className="grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] text-emerald-200 hover:bg-emerald-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="聚合 native/Cycles/import/physics 架构诊断报告"
            >
              {actionIcons["架构诊断"]}
            </button>
            <button
              type="button"
              onClick={() => setShowRuntimeOverlay((current) => !current)}
              className={`grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] ${
                showRuntimeOverlay
                  ? "bg-emerald-500/25 text-white"
                  : "text-emerald-200 hover:bg-emerald-400/10 hover:text-white"
              }`}
              title="显示/隐藏运行时诊断叠层"
            >
              {actionIcons["诊断层"]}
            </button>
            <button
              type="button"
              onClick={() => setNativeViewportPopout((current) => !current)}
              className={`grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] ${
                nativeViewportPopout
                  ? "bg-sky-500/25 text-white"
                  : "text-sky-200 hover:bg-sky-400/10 hover:text-white"
              }`}
              title="调试模式：弹出 Rust/wgpu 原生视窗。商业默认视图保持停靠式。"
            >
              {nativeViewportPopout ? actionIcons["收回原生"] : actionIcons["弹出原生"]}
            </button>
            <button
              type="button"
              onClick={probeArchitectureSelfTest}
              disabled={pipelineBusy !== null}
              className="grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] text-emerald-200 hover:bg-emerald-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="从 React/Electron 调用 Rust 架构自检"
            >
              {actionIcons["架构自检"]}
            </button>
            <button
              type="button"
              onClick={probeImportPipeline}
              disabled={pipelineBusy !== null}
              className="grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] text-blue-200 hover:bg-blue-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="调用 Assimp/USD 导入管线占位接口"
            >
              {actionIcons["导入管线"]}
            </button>
              </>
            )}
            <span className="mx-1 h-4 w-px shrink-0 bg-white/10" />
            <button
              type="button"
              onClick={probePhysicsWorld}
              disabled={pipelineBusy !== null}
              className="grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] text-blue-200 hover:bg-blue-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="调用 Bullet/Jolt 创建物理世界接口"
            >
              {actionIcons["物理世界"]}
            </button>
            <button
              type="button"
              onClick={probePhysicsStep}
              disabled={pipelineBusy !== null}
              className="grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] text-blue-200 hover:bg-blue-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="调用 Bullet/Jolt 物理步进接口"
            >
              {actionIcons["物理步进"]}
            </button>
            <button
              type="button"
              onClick={togglePhysicsPlayback}
              disabled={pipelineBusy !== null}
              className={`grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] ${
                physicsPlaying
                  ? "bg-blue-500/25 text-white"
                  : "text-blue-200 hover:bg-blue-400/10 hover:text-white"
              } disabled:cursor-wait disabled:opacity-50`}
              title="连续播放/暂停 native 物理模拟"
            >
              {physicsPlaying ? actionIcons["物理暂停"] : actionIcons["物理播放"]}
            </button>
            <button
              type="button"
              onClick={resetPhysicsWorld}
              disabled={pipelineBusy !== null}
              className="grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] text-blue-200 hover:bg-blue-400/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              title="从当前场景对象重新生成 native 物理世界"
            >
              {actionIcons["物理重置"]}
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-[3px] bg-[#252629] p-0.5">
            <select
              value={transformOrientation}
              onChange={(event) =>
                setTransformOrientation(event.target.value as (typeof transformOrientations)[number])
              }
              className="h-5 rounded-[3px] border border-[#3a3c40] bg-[#1f2023] px-1 text-[10px] text-neutral-300 outline-none"
              title="变换坐标系"
            >
              {transformOrientations.map((orientation) => (
                <option key={orientation} value={orientation}>
                  {orientation}
                </option>
              ))}
            </select>
            <select
              value={pivotPoint}
              onChange={(event) => setPivotPoint(event.target.value as (typeof pivotPoints)[number])}
              className="h-5 rounded-[3px] border border-[#3a3c40] bg-[#1f2023] px-1 text-[10px] text-neutral-300 outline-none"
              title="枢轴点"
            >
              {pivotPoints.map((pivot) => (
                <option key={pivot} value={pivot}>
                  {pivot}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setProportionalEditing((current) => !current)}
              className={`grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 text-[10px] font-bold ${
                proportionalEditing ? "bg-[#4772b3] text-white" : "text-neutral-400 hover:bg-white/[0.08]"
              }`}
              title="Proportional Editing"
            >
              ○
            </button>
            <select
              value={axisConstraint}
              onChange={(event) => setAxisConstraint(event.target.value as (typeof axisConstraints)[number])}
              className="h-5 rounded-[3px] border border-[#3a3c40] bg-[#1f2023] px-1 text-[10px] text-neutral-300 outline-none blender-axis-constraint-control"
              title="轴向约束"
            >
              {axisConstraints.map((axis) => (
                <option key={axis} value={axis}>
                  {axis}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSnapEnabled((current) => !current)}
              className={`grid h-5 min-w-5 place-items-center rounded-[3px] px-1.5 font-mono text-[10px] font-bold ${
                snapEnabled ? "bg-[#4772b3] text-white" : "text-neutral-400"
              }`}
              title="Shift+S 切换网格吸附"
            >
              {actionIcons["吸附"]}
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
                {displayIcons[item] || item}
              </button>
            ))}
          </div>
        </div>
        <div className="flex h-6 shrink-0 items-center gap-2 border-b border-[#25272b] bg-[#292b2f] px-2 text-[10px] text-neutral-400 blender-tool-settings-strip">
          <span className="font-bold text-neutral-200">{activeTool}</span>
          <span>选择模式 {selectionMode}</span>
          <span>坐标系 {transformOrientation}</span>
          <span>枢轴 {pivotPoint}</span>
          <span>轴向 {axisConstraint}</span>
          <span>{proportionalEditing ? "比例编辑 ON" : "比例编辑 OFF"}</span>
          <span>Gizmo {showViewportGizmos ? activeTool : "隐藏"}</span>
          <span>3D Cursor {threeDCursor.map(formatTransformNumber).join(" / ")}</span>
          <span className="ml-auto">
            {selectedObject?.name || "No Selection"} · {selectedObject?.locked ? "Locked" : "Editable"}
          </span>
        </div>

        <div
          ref={mountRef}
          onPointerDown={onDockedViewportPointerDown}
          onPointerMove={onDockedViewportPointerMove}
          onPointerUp={onDockedViewportPointerUp}
          onPointerCancel={onDockedViewportPointerUp}
          onWheel={onDockedViewportWheel}
          onContextMenu={(event) => {
            if (nativeViewportPopout) return;
            event.preventDefault();
            const bounds = event.currentTarget.getBoundingClientRect();
            setViewportContextMenu({
              x: Math.min(event.clientX - bounds.left, bounds.width - 220),
              y: Math.min(event.clientY - bounds.top, bounds.height - 260),
              objectId: selectedObjectId,
            });
          }}
          className={`relative min-h-0 flex-1 overflow-hidden bg-[#30343a] ${
            nativeViewportPopout ? "" : "cursor-grab active:cursor-grabbing"
          }`}
        >
          <div
            className={`pointer-events-none absolute inset-0 ${showViewportOverlays ? "opacity-45" : "opacity-0"}`}
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
          <div className="pointer-events-auto absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between border-b border-black/25 bg-[#303236]/90 px-2 text-[10px] text-neutral-300 backdrop-blur viewport-header-menu">
            <div className="flex items-center gap-1">
              {viewportHeaderMenus.map((menu) => (
                <button
                  key={menu}
                  type="button"
                  onClick={() => openOperatorSearch(menuOperatorQueries[menu] || "")}
                  className="rounded px-1.5 py-0.5 hover:bg-white/[0.08] hover:text-white"
                  title={`打开 3D Viewport ${menu} 命令`}
                >
                  {menu}
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-white/10" />
              <span className="text-neutral-500">Object Mode</span>
              <span className="mx-1 h-4 w-px bg-white/10" />
              <button
                type="button"
                onClick={() => openOperatorSearch()}
                className="rounded bg-black/25 px-1.5 py-0.5 text-neutral-300 hover:bg-white/[0.08] hover:text-white operator-search-trigger"
                title="Operator Search · F3"
              >
                F3 Search
              </button>
              <span className="mx-1 h-4 w-px bg-white/10" />
              <div className="flex items-center gap-0.5 viewport-quick-add-controls">
                <button
                  type="button"
                  onClick={() => openOperatorSearch("Add")}
                  className="rounded bg-black/25 px-1.5 py-0.5 text-neutral-300 hover:bg-white/[0.08] hover:text-white"
                  title="Quick Add · opens mesh/camera/light operators"
                >
                  Add...
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowViewportOverlays((current) => !current)}
                className={`rounded px-1.5 py-0.5 ${
                  showViewportOverlays ? "bg-[#4772b3] text-white" : "text-neutral-400 hover:bg-white/[0.08]"
                }`}
                title="Viewport Overlays"
              >
                Overlay
              </button>
              <button
                type="button"
                onClick={() => setShowViewportGizmos((current) => !current)}
                className={`rounded px-1.5 py-0.5 ${
                  showViewportGizmos ? "bg-[#4772b3] text-white" : "text-neutral-400 hover:bg-white/[0.08]"
                }`}
                title="Viewport Gizmos"
              >
                Gizmo
              </button>
              <button
                type="button"
                onClick={() => setShowViewportSidebar((current) => !current)}
                className={`rounded px-1.5 py-0.5 ${
                  showViewportSidebar ? "bg-[#4772b3] text-white" : "text-neutral-400 hover:bg-white/[0.08]"
                }`}
                title="Toggle N Sidebar"
              >
                N Panel
              </button>
              <span className="mx-1 h-4 w-px bg-white/10" />
              {displayModes.map((item) => (
                <button
                  key={`viewport-${item}`}
                  type="button"
                  onClick={() => setDisplayMode(item)}
                  className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-mono ${
                    displayMode === item ? "bg-[#4772b3] text-white" : "text-neutral-400 hover:bg-white/[0.08]"
                  }`}
                  title={`Viewport Shading · ${item}`}
                >
                  {displayIcons[item] || item}
                </button>
              ))}
            </div>
          </div>
          {showViewportGizmos && (
          <div className="absolute right-3 top-12 h-24 w-24 rounded-full border border-white/10 bg-black/20 text-[10px] text-neutral-300 backdrop-blur">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                resetDockedView();
              }}
              className="absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-[9px] text-neutral-200 hover:bg-white/20"
              title="重置停靠视图"
            >
              视图
            </button>
            {navigationGizmoAxes.map((item) => (
              <button
                key={item.axis}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  applyViewPreset(item.label);
                }}
                className={`absolute grid h-6 w-6 place-items-center rounded-full bg-black/25 font-bold hover:bg-white/15 ${item.className}`}
                title={`${item.axis} 轴 · 切到${item.label}视图`}
              >
                {item.axis}
              </button>
            ))}
          </div>
          )}
          {!nativeViewportPopout && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center [perspective:900px]">
              <div
                className="relative h-[520px] w-[520px] [transform-style:preserve-3d]"
                style={{
                  transform: `translate3d(${dockedCamera.panX}px, ${dockedCamera.panY}px, 0) scale(${dockedCamera.zoom}) rotateX(${dockedCamera.pitch}deg) rotateZ(${dockedCamera.yaw}deg)`,
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 border border-white/5 opacity-80"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(180,205,240,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(180,205,240,0.18) 1px, transparent 1px), linear-gradient(rgba(255,80,80,0.22) 2px, transparent 2px), linear-gradient(90deg, rgba(90,255,130,0.18) 2px, transparent 2px)",
                    backgroundSize: "32px 32px, 32px 32px, 760px 380px, 380px 760px",
                    transform: "translateZ(-36px)",
                  }}
                />
                <div className="pointer-events-none absolute left-1/2 top-1/2 text-[10px] font-bold text-red-300 [transform:translate3d(348px,-12px,-32px)]">
                  X
                </div>
                <div className="pointer-events-none absolute left-1/2 top-1/2 text-[10px] font-bold text-green-300 [transform:translate3d(10px,-348px,-32px)]">
                  Y
                </div>
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-300/70 text-[10px] text-white three-d-cursor-marker"
                  style={{
                    transform: `translate3d(calc(-50% + ${scenePixel(threeDCursor[0])}px), calc(-50% + ${scenePixel(
                      -threeDCursor[2],
                    )}px), ${scenePixel(threeDCursor[1])}px)`,
                  }}
                >
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/60" />
                  <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/60" />
                  <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-300" />
                </div>
                {objects.filter((object) => object.visible !== false).map(renderDockedSceneObject)}
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute left-3 top-11 rounded bg-black/35 px-2 py-1 text-[10px] text-neutral-300">
            <div className="font-bold text-neutral-100">
              {nativeViewportPopout ? "原生弹出" : "停靠视图"} · {cameraProjection === "orthographic" ? "正交" : "透视"} · {displayMode}
            </div>
            <div className="mt-0.5 text-neutral-400">
              {objectMode}模式 · Collection / {selectedObject?.name || "对象"} · 工具 {activeTool} ·{" "}
              {selectionMode}选择 · {transformOrientation} / {pivotPoint} · 轴向 {axisConstraint} ·{" "}
              {proportionalEditing ? "比例编辑" : "普通编辑"} · {selectedObject?.locked ? "锁定" : "可编辑"} ·{" "}
              {snapEnabled ? `吸附 ${snapStep}` : "自由"} · 3D Cursor {threeDCursor.map(formatTransformNumber).join("/")} · 已选{" "}
              {selectedObject ? 1 : 0}/{objects.length}
            </div>
          </div>
          <div className="pointer-events-none absolute left-3 top-[84px] rounded bg-black/30 px-2 py-1 text-[10px] text-neutral-400 viewport-scene-stats">
            Stats · objects {sceneStats.visible}/{sceneStats.total} · mesh {sceneStats.meshes} · camera{" "}
            {sceneStats.cameras} · light {sceneStats.lights} · tris {sceneStats.triangles.toLocaleString()}
          </div>
          {viewportContextMenu && (
            <div
              className="pointer-events-auto absolute z-30 w-52 overflow-hidden rounded border border-white/10 bg-[#252629]/98 py-1 text-[10px] text-neutral-300 shadow-2xl backdrop-blur viewport-context-menu"
              style={{ left: viewportContextMenu.x, top: viewportContextMenu.y }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="border-b border-white/10 px-2 py-1 text-neutral-500">
                Object Context · {selectedObject?.name || "No Selection"}
              </div>
              {[
                { label: "Duplicate Object", action: () => onDuplicateObject?.(), disabled: !selectedObject || !onDuplicateObject },
                { label: "Delete Object", action: () => onDeleteObject?.(), disabled: !selectedObject || !onDeleteObject },
                {
                  label: selectedObject?.visible === false ? "Show Object" : "Hide Object",
                  action: () => selectedObject && onUpdateObject(selectedObject.id, { visible: selectedObject.visible === false }),
                  disabled: !selectedObject,
                },
                {
                  label: selectedObject?.locked ? "Unlock Object" : "Lock Object",
                  action: () => selectedObject && onUpdateObject(selectedObject.id, { locked: selectedObject.locked !== true }),
                  disabled: !selectedObject,
                },
                {
                  label: "Focus Selection",
                  action: () => window.jepowDesktop?.viewportHost?.focusSelection?.(),
                  disabled: !selectedObject,
                },
                {
                  label: "Cursor to Selection",
                  action: () => selectedObject && setThreeDCursor(selectedObject.position),
                  disabled: !selectedObject,
                },
                {
                  label: "Selection to Cursor",
                  action: moveSelectionToCursor,
                  disabled: !selectedObject || selectedObject.locked,
                },
                {
                  label: "Reveal All Objects",
                  action: revealAllObjects,
                  disabled: !onSyncObjects,
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => runViewportContextAction(item.action)}
                  className="flex w-full items-center justify-between px-2 py-1 text-left hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent"
                >
                  <span>{item.label}</span>
                  <span className="text-neutral-600">›</span>
                </button>
              ))}
            </div>
          )}
          {operatorSearchOpen && (
            <div
              className="pointer-events-auto absolute left-1/2 top-16 z-40 w-[360px] -translate-x-1/2 overflow-hidden rounded border border-white/10 bg-[#252629]/98 text-[10px] text-neutral-300 shadow-2xl backdrop-blur operator-search-palette"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="border-b border-white/10 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-bold text-neutral-100">Operator Search</span>
                  <span className="text-neutral-500">F3 · Esc</span>
                </div>
                <input
                  autoFocus
                  value={operatorSearchQuery}
                  onChange={(event) => setOperatorSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") closeOperatorSearch();
                    if (event.key === "Enter" && filteredOperatorCommands[0]) {
                      runOperatorCommand(filteredOperatorCommands[0]);
                    }
                  }}
                  placeholder="Search commands..."
                  className="h-7 w-full rounded border border-white/10 bg-black/25 px-2 text-neutral-100 outline-none placeholder:text-neutral-600"
                />
              </div>
              <div className="max-h-64 overflow-auto py-1">
                {filteredOperatorCommands.map((command) => (
                  <button
                    key={`${command.group}-${command.label}`}
                    type="button"
                    disabled={command.disabled}
                    onClick={() => runOperatorCommand(command)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:text-neutral-600 disabled:hover:bg-transparent"
                  >
                    <span className="w-20 shrink-0 text-neutral-500">{command.group}</span>
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  </button>
                ))}
                {filteredOperatorCommands.length === 0 && (
                  <div className="px-2 py-4 text-center text-neutral-500">No matching operators</div>
                )}
              </div>
            </div>
          )}
          {showViewportSidebar && (
            <div className="pointer-events-auto absolute right-3 top-40 w-64 overflow-hidden rounded border border-white/10 bg-[#252629]/95 text-[10px] text-neutral-300 shadow-2xl backdrop-blur viewport-n-sidebar">
              <div className="flex h-7 items-center gap-1 border-b border-white/10 px-1.5">
                {viewportSidebarTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setViewportSidebarTab(tab)}
                    className={`h-5 rounded px-2 ${
                      viewportSidebarTab === tab ? "bg-[#4772b3] text-white" : "text-neutral-400 hover:bg-white/[0.08]"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowViewportSidebar(false)}
                  className="ml-auto rounded px-1.5 text-neutral-500 hover:bg-white/[0.08] hover:text-white"
                  title="Close N Sidebar"
                >
                  ×
                </button>
              </div>
              <div className="max-h-[38vh] overflow-auto p-2">
                {viewportSidebarTab === "Item" && (
                  <div className="space-y-2 viewport-n-sidebar-item">
                    <div className="font-bold text-neutral-100">Item</div>
                    <div className="grid grid-cols-[66px_1fr] gap-y-1 text-neutral-400">
                      <span>Name</span>
                      <span className="truncate text-neutral-200">{selectedObject?.name || "No Selection"}</span>
                      <span>Type</span>
                      <span className="text-neutral-200">{selectedObject?.type || "-"}</span>
                      <span>Location</span>
                      <span className="text-neutral-200">
                        {(selectedObject?.position || [0, 0, 0]).map(formatTransformNumber).join(" / ")}
                      </span>
                      <span>Rotation</span>
                      <span className="text-neutral-200">
                        {(selectedObject?.rotation || [0, 0, 0]).map(formatTransformNumber).join(" / ")}
                      </span>
                      <span>Scale</span>
                      <span className="text-neutral-200">
                        {(selectedObject?.scale || [1, 1, 1]).map(formatTransformNumber).join(" / ")}
                      </span>
                    </div>
                  </div>
                )}
                {viewportSidebarTab === "Tool" && (
                  <div className="space-y-2 viewport-n-sidebar-tool">
                    <div className="font-bold text-neutral-100">Tool</div>
                    <div className="grid grid-cols-[82px_1fr] gap-y-1 text-neutral-400">
                      <span>Active</span>
                      <span className="text-neutral-200">{activeTool}</span>
                      <span>Gizmo</span>
                      <span className="text-neutral-200">{showViewportGizmos ? activeTool : "Hidden"}</span>
                      <span>Selection</span>
                      <span className="text-neutral-200">{selectionMode}</span>
                      <span>Axis</span>
                      <span className="text-neutral-200">{axisConstraint}</span>
                      <span>3D Cursor</span>
                      <span className="text-neutral-200">{threeDCursor.map(formatTransformNumber).join(" / ")}</span>
                    </div>
                  </div>
                )}
                {viewportSidebarTab === "View" && (
                  <div className="space-y-2 viewport-n-sidebar-view">
                    <div className="font-bold text-neutral-100">View</div>
                    {[
                      { label: "Focal", value: viewportFocalLength, setter: setViewportFocalLength, step: 1 },
                      { label: "Clip Start", value: viewportClipStart, setter: setViewportClipStart, step: 0.1 },
                      { label: "Clip End", value: viewportClipEnd, setter: setViewportClipEnd, step: 10 },
                    ].map((row) => (
                      <label key={row.label} className="grid grid-cols-[72px_1fr] items-center gap-2 text-neutral-400">
                        <span>{row.label}</span>
                        <input
                          type="number"
                          step={row.step}
                          value={row.value}
                          onChange={(event) => row.setter(Number(event.target.value))}
                          className="h-6 rounded border border-white/10 bg-black/25 px-2 text-right text-neutral-100 outline-none"
                        />
                      </label>
                    ))}
                    <div className="grid grid-cols-[72px_1fr] gap-y-1 border-t border-white/10 pt-2 text-neutral-400">
                      <span>Projection</span>
                      <span className="text-neutral-200">{cameraProjection}</span>
                      <span>Zoom</span>
                      <span className="text-neutral-200">{dockedCamera.zoom.toFixed(2)}</span>
                      <span>Pan</span>
                      <span className="text-neutral-200">
                        {formatTransformNumber(dockedCamera.panX)} / {formatTransformNumber(dockedCamera.panY)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {showRuntimeOverlay && nativeStatus?.architecture && (
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
            LMB 旋转视图 · MMB/RMB/Alt 平移 · Wheel 缩放 · G/R/S 工具 · Shift+A/C/L 添加 · Tab 切对象 ·
            Z/Alt+Z 显示 · H/Alt+H 显隐 · / 隔离
          </div>
          {nativeViewportPopout && !hostReady && (
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
          {!nativeViewportPopout && (
            <div className="pointer-events-none absolute right-3 bottom-3 rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-neutral-300 backdrop-blur">
              停靠式商业视图 · Rust/wgpu 视窗在“弹出原生”调试模式启动
            </div>
          )}
        </div>

        <div className="h-[68px] shrink-0 border-t border-[#25272b] bg-[#252629] px-2 py-1 blender-status-timeline-area">
          <div className="mb-1 flex items-center gap-2 text-[10px] text-neutral-400">
            <span>起始 1</span>
            <span>结束 250</span>
            <div className="ml-auto flex items-center gap-1">
              {[
                { label: "|<", action: () => setTimelineFrame(1) },
                { label: "<", action: () => setTimelineFrame((frame) => Math.max(1, frame - 1)) },
                { label: physicsPlaying ? "Ⅱ" : "▶", action: togglePhysicsPlayback },
                { label: ">", action: () => setTimelineFrame((frame) => Math.min(250, frame + 1)) },
                { label: ">|", action: () => setTimelineFrame(250) },
              ].map((control) => (
                <button
                  key={control.label}
                  type="button"
                  onClick={control.action}
                  className="h-4 min-w-5 rounded bg-black/25 px-1 text-[9px] text-neutral-300 hover:bg-white/[0.08]"
                  title={`Timeline ${control.label}`}
                >
                  {control.label}
                </button>
              ))}
              <span className="ml-2">当前帧 {timelineFrame}</span>
            </div>
          </div>
          <div className="relative h-6 rounded bg-[#1b1c1f] timeline-dopesheet-strip">
            <div
              className="absolute inset-y-0 w-px bg-[#4772b3] timeline-current-frame"
              style={{ left: `${Math.min(100, Math.max(0, ((timelineFrame - 1) / 249) * 100))}%` }}
            />
            <div className="absolute inset-x-2 top-1/2 h-px bg-white/10" />
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={index}
                className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/10"
                style={{ left: `${8 + index * 9}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[9px] text-neutral-500 blender-status-bar">
            <span>工具 {activeTool}</span>
            <span>模式 {objectMode}/{selectionMode}</span>
            <span>约束 {axisConstraint}</span>
            <span>比例编辑 {proportionalEditing ? "ON" : "OFF"}</span>
            <span>Gizmo {showViewportGizmos ? activeTool : "OFF"}</span>
            <span>Cursor {threeDCursor.map(formatTransformNumber).join("/")}</span>
            <span>F3 搜索命令</span>
            <span className="ml-auto">LMB 选择 · Shift 多选 · G/R/S 变换 · X/Y/Z 约束</span>
          </div>
        </div>
      </div>
      <aside className="flex w-72 shrink-0 flex-col border-l border-[#25272b] bg-[#252629] text-[10px] blender-right-sidebar">
        <section className="min-h-0 flex-[0.9] border-b border-[#1b1c1f]">
          <div className="flex h-7 items-center justify-between border-b border-[#1b1c1f] px-2 text-neutral-300">
            <span className="font-bold text-neutral-100">Scene Collection</span>
            <span className="text-neutral-500">{objects.length} objects</span>
          </div>
          <div className="border-b border-[#1b1c1f] p-1 outliner-search-filter">
            <input
              value={outlinerSearch}
              onChange={(event) => setOutlinerSearch(event.target.value)}
              placeholder="Search objects"
              className="h-6 w-full rounded border border-white/10 bg-[#1b1c1f] px-2 text-[10px] text-neutral-200 outline-none placeholder:text-neutral-600"
            />
          </div>
          <div className="max-h-full overflow-auto py-1">
            <div className="px-2 py-1 text-neutral-400">▾ Collection</div>
            {filteredOutlinerObjects.map((object) => (
              <div
                key={object.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectObject(object.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectObject(object.id);
                  }
                }}
                className={`flex w-full items-center gap-2 px-4 py-1 text-left hover:bg-white/[0.06] ${
                  object.id === selectedObjectId ? "bg-[#4772b3]/35 text-white" : "text-neutral-300"
                }`}
                title={`Select ${object.name}`}
              >
                <span className={typeColor[object.type]}>
                  {object.type === "网格" ? "▣" : object.type === "相机" ? "▱" : "✦"}
                </span>
                <span className="min-w-0 flex-1 truncate">{object.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onUpdateObject(object.id, { visible: object.visible === false });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onUpdateObject(object.id, { visible: object.visible === false });
                    }
                  }}
                  className={object.visible === false ? "text-neutral-600" : "text-neutral-300"}
                  title="Toggle viewport visibility"
                >
                  ◉
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onUpdateObject(object.id, { locked: object.locked !== true });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onUpdateObject(object.id, { locked: object.locked !== true });
                    }
                  }}
                  className={object.locked ? "text-amber-300" : "text-neutral-600"}
                  title="Toggle selectable/edit lock"
                >
                  ⌕
                </span>
              </div>
            ))}
            {filteredOutlinerObjects.length === 0 && (
              <div className="px-4 py-3 text-neutral-500">No matching objects</div>
            )}
          </div>
        </section>
        <section className="min-h-0 flex-1 overflow-auto">
          <div className="flex h-7 items-center gap-1 border-b border-[#1b1c1f] px-2">
            {propertiesTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPropertiesTab(tab)}
                className={`h-5 rounded px-1.5 ${
                  propertiesTab === tab ? "bg-[#4772b3] text-white" : "text-neutral-400 hover:bg-white/[0.06]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {selectedObject ? (
            <div className="space-y-2 p-2">
              {propertiesTab === "工具" && (
                <div className="rounded border border-white/10 bg-black/15 p-2 text-neutral-400 properties-tool-context-panel">
                  <div className="mb-1 font-bold text-neutral-100">Active Tool</div>
                  <div className="grid grid-cols-[72px_1fr] gap-y-1">
                    <span>Tool</span>
                    <span className="text-neutral-200">{activeTool}</span>
                    <span>Selection</span>
                    <span className="text-neutral-200">{selectionMode}</span>
                    <span>Axis</span>
                    <span className="text-neutral-200">{axisConstraint}</span>
                    <span>Proportional</span>
                    <span className="text-neutral-200">{proportionalEditing ? "Enabled" : "Disabled"}</span>
                  </div>
                  <div className="mt-2 border-t border-white/10 pt-2 three-d-cursor-properties">
                    <div className="mb-1 font-bold text-neutral-100">3D Cursor</div>
                    <div className="grid grid-cols-3 gap-1">
                      {(["X", "Y", "Z"] as const).map((axisLabel, axisIndex) => (
                        <label key={axisLabel} className="flex items-center gap-1 rounded bg-black/25 px-1">
                          <span
                            className={
                              axisLabel === "X"
                                ? "text-red-300"
                                : axisLabel === "Y"
                                  ? "text-green-300"
                                  : "text-blue-300"
                            }
                          >
                            {axisLabel}
                          </span>
                          <input
                            type="number"
                            step={0.1}
                            value={formatTransformNumber(threeDCursor[axisIndex])}
                            onChange={(event) => updateThreeDCursor(axisIndex as 0 | 1 | 2, Number(event.target.value))}
                            className="h-5 w-full bg-transparent text-right text-neutral-100 outline-none"
                          />
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setThreeDCursor(selectedObject.position)}
                      className="mt-2 w-full rounded bg-[#4772b3]/25 px-2 py-1 text-neutral-100 hover:bg-[#4772b3]/40"
                    >
                      Cursor to Selection
                    </button>
                  </div>
                </div>
              )}
              {(propertiesTab === "对象" || propertiesTab === "工具") && (
              <div className="rounded border border-white/10 bg-black/15">
                <button
                  type="button"
                  onClick={() => togglePropertySection("transform")}
                  className="flex w-full items-center justify-between border-b border-white/10 px-2 py-1.5 properties-collapsible-section"
                >
                  <span className="font-bold text-neutral-100">
                    {openPropertySections.transform ? "▾" : "▸"} Transform
                  </span>
                  <span className={typeColor[selectedObject.type]}>
                    {selectedObject.type} · {selectedObject.locked ? "Locked" : "Editable"}
                  </span>
                </button>
                {openPropertySections.transform && (
                <div className="space-y-1.5 p-2">
                  {transformRows.map((row) => {
                    const values = selectedObject[row.field];
                    return (
                      <div key={row.field} className="grid grid-cols-[58px_1fr] items-center gap-2">
                        <span className="text-neutral-400">{row.label}</span>
                        <div className="grid grid-cols-3 gap-1">
                          {(["X", "Y", "Z"] as const).map((axisLabel, axisIndex) => (
                            <label key={axisLabel} className="flex items-center gap-1 rounded bg-black/25 px-1">
                              <span
                                className={
                                  axisLabel === "X"
                                    ? "text-red-300"
                                    : axisLabel === "Y"
                                      ? "text-green-300"
                                      : "text-blue-300"
                                }
                              >
                                {axisLabel}
                              </span>
                              <input
                                type="number"
                                step={row.field === "rotation" ? 1 : 0.1}
                                value={formatTransformNumber(values[axisIndex])}
                                onChange={(event) =>
                                  updateSelectedVector(
                                    row.field,
                                    axisIndex as 0 | 1 | 2,
                                    Number(event.target.value),
                                  )
                                }
                                disabled={selectedObject.locked}
                                className="h-5 w-full bg-transparent text-right text-neutral-100 outline-none disabled:text-neutral-500"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-[58px_1fr] items-center gap-2 border-t border-white/10 pt-1.5">
                    <span className="text-neutral-400">Dimensions</span>
                    <span className="text-neutral-200">
                      {(selectedObject.boundsSize || [1, 1, 1])
                        .map((value, index) => formatTransformNumber(value * selectedObject.scale[index]))
                        .join(" x ")}
                    </span>
                  </div>
                </div>
                )}
              </div>
              )}
              {propertiesTab === "对象" && (
              <div className="rounded border border-white/10 bg-black/15">
                <button
                  type="button"
                  onClick={() => togglePropertySection("objectData")}
                  className="w-full border-b border-white/10 px-2 py-1.5 text-left font-bold text-neutral-100 properties-collapsible-section"
                >
                  {openPropertySections.objectData ? "▾" : "▸"} Object Data
                </button>
                {openPropertySections.objectData && (
                <div className="grid grid-cols-[72px_1fr] gap-y-1 p-2 text-neutral-400">
                  <span>Name</span>
                  <span className="truncate text-neutral-200">{selectedObject.name}</span>
                  <span>Backend</span>
                  <span className="truncate text-neutral-200">{selectedObject.importBackend || "native scene"}</span>
                  <span>Triangles</span>
                  <span className="text-neutral-200">{selectedObject.triangleCount ?? "proxy"}</span>
                  <span>Material</span>
                  <span className="text-neutral-200">{selectedObject.materialColor || selectedObject.color}</span>
                </div>
                )}
              </div>
              )}
              {propertiesTab === "材质" && (
              <div className="rounded border border-white/10 bg-black/15 material-properties-panel">
                <button
                  type="button"
                  onClick={() => togglePropertySection("material")}
                  className="w-full border-b border-white/10 px-2 py-1.5 text-left font-bold text-neutral-100 properties-collapsible-section"
                >
                  {openPropertySections.material ? "▾" : "▸"} Material
                </button>
                {openPropertySections.material && (
                  <div className="space-y-2 p-2 text-neutral-400">
                    <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                      <span>Base Color</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={normalizeHexColor(selectedObject.materialColor || selectedObject.color)}
                          onChange={(event) => updateSelectedMaterialColor(event.target.value)}
                          disabled={selectedObject.locked}
                          className="h-6 w-9 rounded border border-white/10 bg-black/20 disabled:opacity-40"
                        />
                        <span className="font-mono text-neutral-200">
                          {normalizeHexColor(selectedObject.materialColor || selectedObject.color)}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[72px_1fr] gap-y-1">
                      <span>Metallic</span>
                      <span className="text-neutral-200">{(selectedObject.metallicFactor ?? 0).toFixed(2)}</span>
                      <span>Roughness</span>
                      <span className="text-neutral-200">{(selectedObject.roughnessFactor ?? 0.5).toFixed(2)}</span>
                      <span>Textures</span>
                      <span className="text-neutral-200">
                        {selectedObject.hasBaseColorTexture ? "Base Color" : "No base color"} ·{" "}
                        {selectedObject.hasMetallicRoughnessTexture ? "Metal/Rough" : "No PBR map"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              )}
              {propertiesTab === "物理" && (
              <div className="rounded border border-white/10 bg-black/15 physics-properties-panel">
                <button
                  type="button"
                  onClick={() => togglePropertySection("physics")}
                  className="w-full border-b border-white/10 px-2 py-1.5 text-left font-bold text-neutral-100 properties-collapsible-section"
                >
                  {openPropertySections.physics ? "▾" : "▸"} Physics
                </button>
                {openPropertySections.physics && (
                  <div className="space-y-2 p-2 text-neutral-400">
                    {selectedObject.type === "网格" ? (
                      <>
                        <div className="grid grid-cols-[72px_1fr] gap-y-1">
                          <span>Rigid Body</span>
                          <span className="text-neutral-200">{selectedObject.locked ? "Static" : "Dynamic"}</span>
                          <span>Collider</span>
                          <span className="text-neutral-200">Box · {physicsHalfExtents(selectedObject).map(formatTransformNumber).join(" / ")}</span>
                          <span>Mass</span>
                          <span className="text-neutral-200">
                            {physicsBodyMass(physicsHalfExtents(selectedObject), selectedObject).toFixed(3)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={probePhysicsWorld}
                            disabled={pipelineBusy !== null}
                            className="rounded bg-sky-500/15 px-1.5 py-1 text-sky-100 hover:bg-sky-500/25 disabled:opacity-45"
                          >
                            World
                          </button>
                          <button
                            type="button"
                            onClick={probePhysicsStep}
                            disabled={pipelineBusy !== null}
                            className="rounded bg-sky-500/15 px-1.5 py-1 text-sky-100 hover:bg-sky-500/25 disabled:opacity-45"
                          >
                            Step
                          </button>
                          <button
                            type="button"
                            onClick={togglePhysicsPlayback}
                            disabled={pipelineBusy !== null}
                            className="rounded bg-sky-500/15 px-1.5 py-1 text-sky-100 hover:bg-sky-500/25 disabled:opacity-45"
                          >
                            {physicsPlaying ? "Pause" : "Play"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-neutral-500">Physics body applies to mesh objects.</div>
                    )}
                  </div>
                )}
              </div>
              )}
              {propertiesTab === "渲染" && (
              <div className="rounded border border-white/10 bg-black/15 render-properties-panel">
                <button
                  type="button"
                  onClick={() => togglePropertySection("render")}
                  className="w-full border-b border-white/10 px-2 py-1.5 text-left font-bold text-neutral-100 properties-collapsible-section"
                >
                  {openPropertySections.render ? "▾" : "▸"} Render
                </button>
                {openPropertySections.render && (
                  <div className="space-y-2 p-2 text-neutral-400">
                    <div className="grid grid-cols-[72px_1fr] gap-y-1">
                      <span>Engine</span>
                      <span className="text-neutral-200">Cycles/CL · {nativeStatus?.cyclesBackend || "bridge"}</span>
                      <span>Devices</span>
                      <span className="text-neutral-200">
                        {nativeStatus?.cyclesRenderDevices?.length ? nativeStatus.cyclesRenderDevices.join(" / ") : "CPU/CL pending"}
                      </span>
                      <span>Viewport</span>
                      <span className="text-neutral-200">{displayMode}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 render-shading-controls">
                      {displayModes.map((item) => (
                        <button
                          key={`properties-${item}`}
                          type="button"
                          onClick={() => setDisplayMode(item)}
                          className={`rounded px-1.5 py-1 ${
                            displayMode === item ? "bg-[#4772b3] text-white" : "bg-black/25 text-neutral-300 hover:bg-white/[0.08]"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={runArchitectureDiagnostics}
                        disabled={pipelineBusy !== null}
                        className="rounded bg-purple-500/15 px-1.5 py-1 text-purple-100 hover:bg-purple-500/25 disabled:opacity-45"
                      >
                        Render Check
                      </button>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          ) : (
            <div className="p-3 text-neutral-500">No object selected</div>
          )}
        </section>
      </aside>
      </div>
    </div>
  );
}
