import type { Node } from "@xyflow/react";
import { Settings2 } from "lucide-react";
import type { SceneObjectEntry } from "../lib/scene-object-list";
import type { SceneObjectMaterialOption } from "../lib/scene-object-materials";

type Props = {
  parentNode: Node;
  object: SceneObjectEntry;
  materialOptions: SceneObjectMaterialOption[];
  assignedMaterialNodeId?: string | null;
  onAssignMaterial: (materialNodeId: string | null) => void;
};

const kindLabels: Record<string, string> = {
  mesh: "网格",
  empty: "空对象",
  node: "节点",
};

function MaterialSwatch({ tint }: { tint: string }) {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-full border border-white/20 shadow-inner"
      style={{ background: tint }}
      aria-hidden
    />
  );
}

export function SceneObjectPropertiesPanel({
  parentNode,
  object,
  materialOptions,
  assignedMaterialNodeId,
  onAssignMaterial,
}: Props) {
  const parentData = parentNode.data as {
    label?: string;
    modelName?: string;
    nativeScenePath?: string;
  };
  const modelFile =
    parentData.modelName ||
    parentData.nativeScenePath?.split(/[/\\]/).pop() ||
    "—";
  const assigned = materialOptions.find(
    (m) => m.materialNodeId === assignedMaterialNodeId,
  );

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-neutral-200">
          <Settings2 className="h-3.5 w-3.5 text-purple-300" />
          对象属性
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-neutral-500">
              材质
            </span>
            <div className="flex items-center gap-2">
              {assigned ? <MaterialSwatch tint={assigned.tint} /> : null}
              <select
                value={assignedMaterialNodeId || ""}
                onChange={(e) =>
                  onAssignMaterial(e.target.value ? e.target.value : null)
                }
                className="h-8 min-w-0 flex-1 rounded-md border border-white/[0.08] bg-black/30 px-2 text-[10px] text-neutral-200 outline-none focus:border-sky-400/50"
              >
                <option value="">未指定（默认）</option>
                {materialOptions.map((opt) => (
                  <option key={opt.materialNodeId} value={opt.materialNodeId}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {materialOptions.length === 0 ? (
              <p className="mt-1 text-[9px] text-neutral-500">
                请先将材质节点连线到 3D 场景编辑器的材质端口。
              </p>
            ) : null}
            {object.kind === "empty" || (object.triangleCount ?? 0) === 0 ? (
              <p className="mt-1 text-[9px] text-amber-400/90">
                该对象没有可绘制的三角网格，视口无法单独上色。请在场景树中选择带网格的子对象（对象 ID 以 fbx- 开头且三角面数大于 0）。
              </p>
            ) : null}
          </label>

          {[
            { label: "名称", value: object.name },
            { label: "对象 ID", value: object.id },
            {
              label: "类型",
              value: kindLabels[object.kind] || object.kind,
            },
            { label: "父对象 ID", value: object.parentId || "—" },
            { label: "所属模型文件", value: modelFile },
          ].map((row) => (
            <label key={row.label} className="block">
              <span className="mb-1 block text-[9px] font-bold uppercase tracking-wide text-neutral-500">
                {row.label}
              </span>
              <input
                type="text"
                readOnly
                value={row.value}
                className="h-8 w-full cursor-default rounded-md border border-white/[0.08] bg-black/30 px-2 font-mono text-[10px] text-neutral-200 outline-none"
              />
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
