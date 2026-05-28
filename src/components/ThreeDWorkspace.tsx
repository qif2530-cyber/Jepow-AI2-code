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
};

interface ThreeDWorkspaceProps {
  objects: ThreeDObject[];
  selectedObjectId: string;
  onSelectObject: (id: string) => void;
  onUpdateObject: (id: string, patch: Partial<ThreeDObject>) => void;
  onSyncObjects?: (objects: ThreeDObject[]) => void;
  onAddObject?: (type: ThreeDObject["type"]) => void;
  onDuplicateObject?: () => void;
  onDeleteObject?: () => void;
  onResetObject?: () => void;
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
  }));

const toVec3 = (value: unknown, fallback: [number, number, number]) => {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0] as [
    number,
    number,
    number,
  ];
};

export function ThreeDWorkspace({
  objects,
  selectedObjectId,
  onSelectObject,
  onUpdateObject,
  onSyncObjects,
  onAddObject,
  onDuplicateObject,
  onDeleteObject,
  onResetObject,
}: ThreeDWorkspaceProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState("选择");
  const [displayMode, setDisplayMode] = useState("CL");
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapStep, setSnapStep] = useState(0.5);
  const [hostReady, setHostReady] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId) || objects[0],
    [objects, selectedObjectId],
  );

  useEffect(() => {
    const host = window.jepowDesktop?.viewportHost;
    if (!host) {
      setHostReady(false);
      setHostError("当前环境没有原生 viewport host，桌面端编译后可用。");
      return;
    }

    let stopped = false;
    const updateBounds = () => {
      const rect = mountRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 4 || rect.height <= 4) return;
      const chromeX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
      const chromeY = Math.max(0, window.outerHeight - window.innerHeight - chromeX);
      const bounds = {
        x: Math.round(window.screenX + chromeX + rect.left),
        y: Math.round(window.screenY + chromeY + rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        scaleFactor: window.devicePixelRatio || 1,
        alwaysOnTop: true,
      };
      host.setBounds(bounds).catch(() => undefined);
    };

    host
      .start({ visible: true })
      .then((result) => {
        if (stopped) return;
        if (!result.ok) {
          setHostError(String(result.error || "原生视窗启动失败"));
          return;
        }
        setHostReady(true);
        setHostError(null);
        updateBounds();
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
    window.jepowDesktop?.viewportHost?.setScene({ objects: toHostObjects(objects) });
  }, [objects]);

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
    window.jepowDesktop?.viewportHost?.setSelection(selectedObjectId || "");
  }, [selectedObjectId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "w" || event.key === "W") setActiveTool("移动");
      if (event.key === "e" || event.key === "E") setActiveTool("旋转");
      if (event.key === "r" || event.key === "R") setActiveTool("缩放");
      if (event.key === "v" || event.key === "V") setActiveTool("选择");
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
      if (event.altKey && event.key.toLowerCase() === "r" && onResetObject) {
        event.preventDefault();
        onResetObject();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDeleteObject, onDuplicateObject, onResetObject]);

  useEffect(() => {
    if (!selectedObject) return;
    window.jepowDesktop?.viewportHost?.setObjectTransform(selectedObject.id, {
      position: selectedObject.position,
      rotation: selectedObject.rotation,
      scale: selectedObject.scale,
    });
  }, [selectedObject]);

  useEffect(() => {
    const host = window.jepowDesktop?.viewportHost;
    if (!host || !onSyncObjects) return;
    const timer = window.setInterval(async () => {
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
        } as ThreeDObject;
      });
      onSyncObjects(synced);
      if (typeof state.selectedObjectId === "string") {
        onSelectObject(state.selectedObjectId);
      }
    }, 280);
    return () => window.clearInterval(timer);
  }, [onSelectObject, onSyncObjects]);

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
            {["线框", "实体", "材质", "CL"].map((item) => (
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
          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/35 px-2 py-1 text-[10px] text-neutral-300 backdrop-blur">
            W/E/R 变换 · Shift+S 吸附 · F 聚焦 · Alt+R 重置
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
