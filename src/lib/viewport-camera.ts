import type { ViewportCamera } from "./viewport-engine/types";

/** 当前 orbit 姿态下的相机右、上方向（世界空间，用于屏幕空间平移） */
export function cameraPanBasis(yaw: number, pitch: number) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const vx = -cp * sy;
  const vy = -sp;
  const vz = -cp * cy;
  let rx = vz;
  let ry = 0;
  let rz = -vx;
  let len = Math.hypot(rx, ry, rz);
  if (len < 1e-6) {
    rx = 1;
    ry = 0;
    rz = 0;
    len = 1;
  }
  rx /= len;
  ry /= len;
  rz /= len;
  const ux = vy * rz - vz * ry;
  const uy = vz * rx - vx * rz;
  const uz = vx * ry - vy * rx;
  return { right: [rx, ry, rz] as const, up: [ux, uy, uz] as const };
}

/** 沿摄像机 XY 平面平移目标点（累积世界空间 panX/Y/Z） */
export function panCameraByScreenDelta(
  base: ViewportCamera,
  dx: number,
  dy: number,
  sens = 0.0032,
): ViewportCamera {
  const { right, up } = cameraPanBasis(base.yaw ?? 0, base.pitch ?? 0);
  const dist = base.distance ?? 2.45;
  const scale = Math.max(0.35, dist * sens);
  const mx = -dx * scale;
  const my = dy * scale;
  return {
    ...base,
    distance: dist,
    fov: base.fov ?? Math.PI / 4,
    panX: (base.panX ?? 0) + right[0] * mx + up[0] * my,
    panY: (base.panY ?? 0) + right[1] * mx + up[1] * my,
    panZ: (base.panZ ?? 0) + right[2] * mx + up[2] * my,
  };
}
