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
      label: 'Rust/wgpu Core Viewport',
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
});

function buildArchitectureStatus({ nativeAvailable, cyclesAvailable, nativeArchitecture }) {
  const importersWired = !!nativeArchitecture?.importers?.architecture_wired;
  const importersReady = !!nativeArchitecture?.importers?.production_ready;
  const physicsWired = !!nativeArchitecture?.physics?.architecture_wired;
  const physicsReady = !!nativeArchitecture?.physics?.production_ready;
  return {
    ui: {
      ...ARCHITECTURE_CONTRACT.modules.ui,
      status: true,
      productionReady: true,
      detail: 'renderer + Electron IPC 已接入',
    },
    viewport: {
      ...ARCHITECTURE_CONTRACT.modules.viewport,
      status: !!nativeAvailable,
      productionReady: !!nativeAvailable,
      detail: nativeAvailable ? 'native viewport-host 可用' : '等待 jepow-engine 编译',
    },
    renderer: {
      ...ARCHITECTURE_CONTRACT.modules.renderer,
      status: true,
      productionReady: !!cyclesAvailable,
      detail: cyclesAvailable
        ? 'jepow-cycles 独立渲染进程可用'
        : '架构桥接已接入，Cycles/CL 渲染进程未就绪',
    },
    importers: {
      ...ARCHITECTURE_CONTRACT.modules.importers,
      status: importersWired,
      productionReady: importersReady,
      detail: importersWired
        ? '导入管线模块和状态协议已接入，Assimp/USD runtime 待填充'
        : '导入管线模块未就绪',
    },
    physics: {
      ...ARCHITECTURE_CONTRACT.modules.physics,
      status: physicsWired,
      productionReady: physicsReady,
      detail: physicsWired
        ? '物理管线模块和状态协议已接入，Bullet/Jolt runtime 待填充'
        : '物理管线模块未就绪',
    },
  };
}

module.exports = {
  ARCHITECTURE_CONTRACT,
  buildArchitectureStatus,
};
