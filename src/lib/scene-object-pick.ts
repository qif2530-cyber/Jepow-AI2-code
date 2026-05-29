import { clientToRenderPixels } from "./viewport-pick-coords";
import type {
  ViewportCamera,
  ViewportObjectTransform,
} from "./viewport-engine/types";

export async function pickSceneObjectAtCursor(opts: {
  clientX: number;
  clientY: number;
  containerRect: DOMRect;
  scenePath: string;
  width: number;
  height: number;
  camera?: ViewportCamera;
  transform?: ViewportObjectTransform;
}): Promise<string | null> {
  const path = opts.scenePath?.trim();
  if (!path) return null;
  const api = window.jepowDesktop?.viewport;
  if (!api?.pickSceneObject) return null;
  const mapped = clientToRenderPixels(
    opts.clientX,
    opts.clientY,
    opts.containerRect,
    opts.width,
    opts.height,
  );
  if (!mapped) return null;
  try {
    const cam = opts.camera ?? {};
    const tr = opts.transform ?? {};
    const res = (await api.pickSceneObject({
      scenePath: path,
      cursorX: mapped.cursorX,
      cursorY: mapped.cursorY,
      width: opts.width,
      height: opts.height,
      cameraYaw: cam.yaw,
      cameraPitch: cam.pitch,
      cameraDistance: cam.distance,
      cameraFov: cam.fov,
      panX: cam.panX,
      panY: cam.panY,
      panZ: cam.panZ,
      x: tr.x,
      y: tr.y,
      z: tr.z,
      rx: tr.rx,
      ry: tr.ry,
      rz: tr.rz,
      scale: tr.scale,
    })) as { ok?: boolean; objectId?: string | null; picked?: boolean };
    if (res?.ok === false) return null;
    const id = res.objectId?.trim();
    return id || null;
  } catch {
    return null;
  }
}
