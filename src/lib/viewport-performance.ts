import { getViewportCapabilities, getViewportEngine } from "./viewport-engine";

export type ViewportPerfProfile = "high" | "low";

let cachedProfile: ViewportPerfProfile | null = null;
let detectPromise: Promise<ViewportPerfProfile> | null = null;

const HEAVY_TRIANGLE_THRESHOLD = 80_000;
/** 单帧 viewport_frame 低于此值视为性能足够开启动态视口 */
const HIGH_PERF_FRAME_MS = 120;

/**
 * 探测本机是否适合全程动态视口（2K + 实时/转台）。
 * 结果进程内缓存，避免重复压测。
 */
export async function detectViewportPerformance(
  scenePath?: string,
): Promise<ViewportPerfProfile> {
  if (cachedProfile && !scenePath) return cachedProfile;
  if (detectPromise && !scenePath) return detectPromise;

  const run = async (): Promise<ViewportPerfProfile> => {
    const caps = await getViewportCapabilities();
    if (!caps.nativeAvailable) {
      cachedProfile = "low";
      return "low";
    }

    if (!scenePath) {
      cachedProfile = "high";
      return "high";
    }

    try {
      const eng = getViewportEngine();
      const info = await eng.openScene(scenePath);
      if (!info.ok) {
        cachedProfile = "low";
        return "low";
      }

      const tris = info.triangleCount ?? 0;
      if (tris === 0) {
        cachedProfile = "low";
        return "low";
      }

      const bench = await eng.renderPreview({
        scenePath,
        width: 640,
        height: 480,
        liveRender: true,
        previewQuality: "final",
      });

      const frameMs = (bench as { frameMs?: number }).frameMs;
      const heavy = tris > HEAVY_TRIANGLE_THRESHOLD;

      if (typeof frameMs === "number") {
        const limit = heavy ? HIGH_PERF_FRAME_MS * 1.8 : HIGH_PERF_FRAME_MS;
        cachedProfile = frameMs <= limit ? "high" : "low";
        return cachedProfile;
      }

      cachedProfile = heavy ? "low" : "high";
      return cachedProfile;
    } catch {
      cachedProfile = "low";
      return "low";
    }
  };

  if (scenePath) {
    return run();
  }

  detectPromise = run().finally(() => {
    detectPromise = null;
  });
  return detectPromise;
}

export function invalidateViewportPerformance() {
  cachedProfile = null;
  detectPromise = null;
}

export function isHighPerformanceProfile(
  profile: ViewportPerfProfile | "unknown",
): boolean {
  return profile === "high";
}
