/** 将 3D 编辑器面板灯光参数映射为 Cycles standalone XML 用的 cyclesLight */
export function buildCyclesLightPayload(
  panelLights: {
    ambient?: number;
    directional?: number;
    yaw?: number;
    pitch?: number;
    environment?: number;
    exposure?: number;
  },
  connected: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const yaw = Number(connected?.yaw ?? panelLights.yaw ?? 45);
  const pitch = Number(connected?.pitch ?? panelLights.pitch ?? 35);
  const dirMul = Number(panelLights.directional ?? 2);
  const envMul = Number(panelLights.environment ?? 1);
  const ambientMul = Number(panelLights.ambient ?? 1);

  return {
    backgroundColor: (connected?.backgroundColor as string) || "#1c1e24",
    environmentStrength: Number(
      connected?.environmentStrength ?? Math.max(0.15, envMul * 0.85 + ambientMul * 0.15),
    ),
    keyStrength: Number(connected?.keyStrength ?? Math.max(80, dirMul * 325)),
    keySize: Number(connected?.keySize ?? 3),
    yaw,
    pitch,
    exposure: Number(connected?.exposure ?? panelLights.exposure ?? 1),
  };
}
