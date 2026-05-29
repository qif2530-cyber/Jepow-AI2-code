const ARCHITECTURE_CONTRACT = Object.freeze({
  version: 1,
  canonicalStack:
    'React/Electron UI + Rust/wgpu Core Viewport + Cycles/CL Render + Assimp/USD Import + Bullet/Jolt Physics',
  modules: Object.freeze({
    ui: Object.freeze({
      label: 'React/Electron UI',
      required: true,
      owner: 'renderer/electron',
    }),
    viewport: Object.freeze({
      label: 'JEP Renderer (Rust/wgpu Core Viewport)',
      required: true,
      owner: 'native/jepow-engine viewport-host',
    }),
    renderer: Object.freeze({
      label: 'Cycles/CL Render',
      required: true,
      owner: 'native/jepow-cycles bridge',
    }),
    importers: Object.freeze({
      label: 'Assimp/USD Import',
      required: true,
      owner: 'native/jepow-engine import_pipeline',
    }),
    physics: Object.freeze({
      label: 'Bullet/Jolt Physics',
      required: true,
      owner: 'native/jepow-engine physics_pipeline',
    }),
  }),
  phases: Object.freeze({
    skeleton: Object.freeze({
      label: '骨架完成',
      description: '模块边界、IPC、状态、自检和诊断链路已固定。',
    }),
    runtime: Object.freeze({
      label: 'Runtime 填充中',
      description: '把占位接口替换为真实导入器、渲染器和物理 runtime。',
    }),
    production: Object.freeze({
      label: '生产能力就绪',
      description: '核心 runtime 可用于真实项目并进入性能/稳定性优化。',
    }),
  }),
});

function buildArchitectureProgress(architecture) {
  const entries = Object.entries(architecture);
  const wiredCount = entries.filter(([, feature]) => feature.status).length;
  const runtimeCount = entries.filter(([, feature]) => feature.runtimeReady || feature.productionReady).length;
  const productionCount = entries.filter(([, feature]) => feature.productionReady).length;
  const total = entries.length || 1;
  const currentPhase =
    productionCount === total
      ? 'production'
      : wiredCount === total
        ? 'runtime'
        : 'skeleton';
  return {
    currentPhase,
    currentPhaseLabel: ARCHITECTURE_CONTRACT.phases[currentPhase].label,
    description: ARCHITECTURE_CONTRACT.phases[currentPhase].description,
    wiredCount,
    runtimeCount,
    productionCount,
    total,
    skeletonPercent: Math.round((wiredCount / total) * 100),
    runtimePercent: Math.round((runtimeCount / total) * 100),
    productionPercent: Math.round((productionCount / total) * 100),
    nextMilestone:
      currentPhase === 'production'
        ? '持续优化大型项目性能、稳定性和工具体验。'
        : currentPhase === 'runtime'
          ? '把 Assimp/USD 和 Bullet/Jolt 从占位 runtime 替换为真实 runtime。'
          : '补齐固定架构所有模块的命令、IPC、状态与诊断链路。',
  };
}

function buildArchitectureStatus({ nativeAvailable, cyclesAvailable, nativeArchitecture, cyclesStatus }) {
  const importersWired = !!nativeArchitecture?.importers?.architecture_wired;
  const importersReady = !!nativeArchitecture?.importers?.production_ready;
  const importersRuntimeReady = !!nativeArchitecture?.importers?.native_runtime_capabilities?.length;
  const physicsWired = !!nativeArchitecture?.physics?.architecture_wired;
  const physicsReady = !!nativeArchitecture?.physics?.production_ready;
  const physicsRuntimeReady = !!nativeArchitecture?.physics?.native_runtime_capabilities?.length;
  const rendererRuntimeReady = !!cyclesStatus?.runtimeCapabilities?.length || !!cyclesAvailable;
  return {
    ui: {
      ...ARCHITECTURE_CONTRACT.modules.ui,
      status: true,
      runtimeReady: true,
      productionReady: true,
      detail: 'renderer + Electron IPC 已接入',
    },
    viewport: {
      ...ARCHITECTURE_CONTRACT.modules.viewport,
      status: !!nativeAvailable,
      runtimeReady: !!nativeAvailable,
      productionReady: !!nativeAvailable,
      detail: nativeAvailable
        ? 'JEP Renderer native viewport-host 可用'
        : '等待 JEP Renderer / jepow-engine 编译',
    },
    renderer: {
      ...ARCHITECTURE_CONTRACT.modules.renderer,
      status: true,
      runtimeReady: rendererRuntimeReady,
      productionReady: !!cyclesStatus?.productionReady || !!cyclesAvailable,
      detail: cyclesStatus?.productionReady
        ? `Cycles/CL runtime 可用：${cyclesStatus.activeBackend || 'cycles'}，由独立画布渲染节点触发`
        : cyclesAvailable
        ? 'jepow-cycles 独立渲染进程可用，由独立画布渲染节点触发'
        : '架构桥接已接入，Cycles/CL 渲染进程未就绪',
    },
    importers: {
      ...ARCHITECTURE_CONTRACT.modules.importers,
      status: importersWired,
      runtimeReady: importersRuntimeReady,
      productionReady: importersReady,
      detail: importersWired
        ? '导入管线模块和状态协议已接入，Assimp/USD runtime 待填充'
        : '导入管线模块未就绪',
    },
    physics: {
      ...ARCHITECTURE_CONTRACT.modules.physics,
      status: physicsWired,
      runtimeReady: physicsRuntimeReady,
      productionReady: physicsReady,
      detail: physicsWired
        ? '物理管线模块和状态协议已接入，Bullet/Jolt runtime 待填充'
        : '物理管线模块未就绪',
    },
  };
}

module.exports = {
  ARCHITECTURE_CONTRACT,
  buildArchitectureProgress,
  buildArchitectureStatus,
};
