import type { SceneObjectEntry } from "./scene-object-list";

export const SCENE_OBJECT_SELECTION_EVENT = "jepow:scene-object-selection";

export type SceneObjectSelectionDetail = {
  nodeId: string;
  object: SceneObjectEntry | null;
};

export function dispatchSceneObjectSelection(detail: SceneObjectSelectionDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SceneObjectSelectionDetail>(SCENE_OBJECT_SELECTION_EVENT, {
      detail,
    }),
  );
}
