export type SceneObjectEntry = {
  id: string;
  name: string;
  kind: string;
  parentId?: string;
  triangleCount?: number;
};

export async function fetchSceneObjectList(
  scenePath: string,
): Promise<SceneObjectEntry[]> {
  const path = scenePath?.trim();
  if (!path) return [];
  const api = window.jepowDesktop?.viewport;
  if (!api?.listSceneObjects) return [];
  try {
    const res = (await api.listSceneObjects(path)) as {
      ok?: boolean;
      objects?: SceneObjectEntry[];
      error?: string;
    };
    if (res?.ok === false) return [];
    return Array.isArray(res.objects) ? res.objects : [];
  } catch {
    return [];
  }
}

export type SceneObjectTreeNode = SceneObjectEntry & { children: SceneObjectTreeNode[] };

/** 将扁平对象列表整理为树形（仅包含可挂到父节点下的子项） */
export function sceneObjectForest(objects: SceneObjectEntry[]): SceneObjectTreeNode[] {
  const byId = new Map<string, SceneObjectTreeNode>();
  for (const obj of objects) {
    byId.set(obj.id, { ...obj, children: [] });
  }
  const roots: SceneObjectTreeNode[] = [];
  for (const obj of objects) {
    const row = byId.get(obj.id)!;
    if (obj.parentId && byId.has(obj.parentId)) {
      byId.get(obj.parentId)!.children.push(row);
    } else {
      roots.push(row);
    }
  }
  return roots;
}
