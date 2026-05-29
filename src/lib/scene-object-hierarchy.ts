import type { SceneObjectEntry, SceneObjectTreeNode } from "./scene-object-list";

export type SceneObjectParentOverrides = Record<string, string | null>;

export function effectiveParentId(
  objectId: string,
  objects: SceneObjectEntry[],
  overrides?: SceneObjectParentOverrides,
): string | null | undefined {
  if (overrides && objectId in overrides) {
    return overrides[objectId];
  }
  return objects.find((o) => o.id === objectId)?.parentId;
}

/** 树形大纲；支持用户拖拽覆盖的父级（C4D 式，可挂到任意对象下） */
export function sceneObjectForest(
  objects: SceneObjectEntry[],
  overrides?: SceneObjectParentOverrides,
): SceneObjectTreeNode[] {
  const byId = new Map<string, SceneObjectTreeNode>();
  for (const obj of objects) {
    byId.set(obj.id, { ...obj, children: [] });
  }
  const roots: SceneObjectTreeNode[] = [];
  for (const obj of objects) {
    const row = byId.get(obj.id)!;
    const parentId = effectiveParentId(obj.id, objects, overrides);
    if (parentId && byId.has(parentId) && parentId !== obj.id) {
      byId.get(parentId)!.children.push(row);
    } else {
      roots.push(row);
    }
  }
  const sortByName = (list: SceneObjectTreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    for (const row of list) sortByName(row.children);
  };
  sortByName(roots);
  return roots;
}

export function isDescendantOf(
  objectId: string,
  maybeAncestorId: string,
  objects: SceneObjectEntry[],
  overrides?: SceneObjectParentOverrides,
): boolean {
  let current: string | null | undefined = objectId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === maybeAncestorId) return true;
    seen.add(current);
    current = effectiveParentId(current, objects, overrides);
  }
  return false;
}
