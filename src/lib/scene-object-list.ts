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

export {
  sceneObjectForest,
  type SceneObjectParentOverrides,
} from "./scene-object-hierarchy";
