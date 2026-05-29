const fs = require('fs');
const path = require('path');
const {
  ARCHITECTURE_CONTRACT,
} = require('../electron/native-architecture-contract.cjs');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'ARCHITECTURE_CONTRACT.md',
  'electron/native-architecture-contract.cjs',
  'electron/viewport-ipc.cjs',
  'electron/native-engine-bridge.cjs',
  'electron/preload.cjs',
  'electron/jepow-cycles-bridge.cjs',
  'native/jepow-engine/src/main.rs',
  'native/jepow-engine/src/daemon.rs',
  'native/jepow-engine/src/viewport_host.rs',
  'native/jepow-engine/src/import_pipeline.rs',
  'native/jepow-engine/src/physics_pipeline.rs',
  'package.json',
  'src/lib/runtime.ts',
  'src/components/ThreeDWorkspace.tsx',
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const relativePath of requiredFiles) {
  assert(fs.existsSync(path.join(root, relativePath)), `Missing required architecture file: ${relativePath}`);
}

const contractDoc = read('ARCHITECTURE_CONTRACT.md');
assert(
  contractDoc.includes(ARCHITECTURE_CONTRACT.canonicalStack),
  'Architecture contract doc must include the canonical stack string.',
);

for (const [key, moduleDef] of Object.entries(ARCHITECTURE_CONTRACT.modules)) {
  assert(moduleDef.required === true, `Architecture module must stay required: ${key}`);
  assert(contractDoc.includes(moduleDef.label), `Contract doc missing module label: ${moduleDef.label}`);
}

const viewportIpc = read('electron/viewport-ipc.cjs');
assert(
  viewportIpc.includes("require('./native-architecture-contract.cjs')"),
  'viewport-ipc must source architecture status from native-architecture-contract.cjs.',
);
assert(viewportIpc.includes('architectureProgress'), 'viewport-ipc must expose architecture progress.');
assert(
  viewportIpc.includes('getArchitectureDiagnostics'),
  'viewport-ipc must expose architecture diagnostics.',
);
assert(viewportIpc.includes('UI_RUNTIME_CAPABILITIES'), 'viewport-ipc must expose UI runtime capabilities.');
assert(viewportIpc.includes('uiRuntimeCapabilities'), 'viewport-ipc must include UI runtime capabilities in status.');
for (const expected of ['compact-runtime-hud', 'bounds-first-native-viewport-start', 'docked-commercial-viewport-default', 'manual-runtime-diagnostics-overlay']) {
  assert(viewportIpc.includes(expected), `viewport-ipc missing UI stability capability: ${expected}`);
}
assert(viewportIpc.includes('VIEWPORT_RUNTIME_CAPABILITIES'), 'viewport-ipc must expose viewport runtime capabilities.');
assert(viewportIpc.includes('viewportRuntimeCapabilities'), 'viewport-ipc must include viewport runtime capabilities in status.');
for (const expected of ['scene-sync-acknowledgement', 'selection-validation', 'transform-hit-diagnostics', 'normal-window-level-viewport', 'explicit-native-popout-debug-mode']) {
  assert(viewportIpc.includes(expected), `viewport-ipc missing viewport sync runtime capability: ${expected}`);
}
assert(viewportIpc.includes('cyclesRuntimeCapabilities'), 'viewport-ipc must expose cycles runtime capabilities.');
assert(viewportIpc.includes('importRuntimeCapabilities'), 'viewport-ipc must expose import runtime capabilities.');
assert(viewportIpc.includes('physicsRuntimeCapabilities'), 'viewport-ipc must expose physics runtime capabilities.');

const archContract = read('electron/native-architecture-contract.cjs');
for (const expected of ['cyclesStatus', 'Cycles/CL runtime 可用', 'cyclesStatus.activeBackend', 'runtimeReady', 'runtimePercent', 'runtimeCount']) {
  assert(archContract.includes(expected), `native architecture contract missing renderer status hook: ${expected}`);
}

const cyclesBridge = read('electron/jepow-cycles-bridge.cjs');
for (const expected of ['buildCyclesRuntimeCapabilities', 'runtimeCapabilities', 'renderDevices', 'cycles-xml-scene-export', 'resident-daemon-session-api', 'empty-frame-detection', 'metal-render-device-ready']) {
  assert(cyclesBridge.includes(expected), `jepow-cycles bridge missing renderer capability: ${expected}`);
}

const mainRs = read('native/jepow-engine/src/main.rs');
for (const expected of [
  'mod import_pipeline;',
  'mod physics_pipeline;',
  '"architecture_status"',
  '"architecture_self_test"',
  '"import_pipeline_status"',
  '"import_scene_pipeline"',
  '"physics_pipeline_status"',
  '"physics_create_world"',
  '"physics_step_world"',
  '"architecture": engine_architecture_status()',
]) {
  assert(mainRs.includes(expected), `jepow-engine main.rs missing architecture hook: ${expected}`);
}

const importPipeline = read('native/jepow-engine/src/import_pipeline.rs');
for (const expected of ['Assimp Import', 'USD Import', 'architecture_wired', 'import_scene', 'native_existing_import', 'load_scene_stats', 'load_meshes', 'boundsMin', 'boundsMax', 'boundsSize', 'materialColor', 'hasBaseColorTexture', 'hasMetallicRoughnessTexture', 'metallicFactor', 'roughnessFactor', 'stl', 'ply', 'native_runtime_capabilities', 'ply-ascii-binary-little-endian-binary-big-endian', 'ply-uv-color-alpha', 'ply-ordered-face-properties', 'ply-bounds-checked-scalars', 'ply-index-range-validation']) {
  assert(importPipeline.includes(expected), `import_pipeline missing required contract text: ${expected}`);
}

const meshLoader = read('native/jepow-engine/src/mesh_loader.rs');
for (const expected of ['material_color', 'material_tint', 'metallic_factor', 'roughness_factor', 'base_color_texture', 'metallic_roughness_texture', 'read_tex_coords', 'diffuse_texture', 'gltf_image_to_rgba', 'generate_missing_normals', 'normalize_normal_or_zero', 'load_stl_mesh', 'parse_binary_stl', 'parse_ascii_stl', 'load_ply_mesh', 'find_ply_header_end', 'parse_ascii_ply', 'parse_binary_little_ply', 'parse_binary_big_ply', 'from_be_bytes', 'apply_ply_vertex_property', 'texture_u', 'texcoord_v', 'normalize_ply_color_component', 'let is_integer = matches!', '"alpha" | "a"', 'PlyFaceProperty', 'face_properties', 'is_ply_face_index_property', 'append_triangulated_face', 'read_ply_scalar_bytes', 'ply scalar out of range', 'PLY face index out of range']) {
  assert(meshLoader.includes(expected), `mesh_loader missing imported material extraction: ${expected}`);
}

const physicsPipeline = read('native/jepow-engine/src/physics_pipeline.rs');
for (const expected of ['Jolt Physics', 'Bullet Physics', 'architecture_wired', 'create_world', 'step_world', 'native-minimal-runtime', 'worldSnapshot', 'step_body', 'resolve_body_collisions', 'aabb_overlap', 'contactCount', 'substeps', 'damping', 'native_runtime_capabilities', 'world-snapshot-create-step', 'aabb-body-body-collision', 'viewport-playback-sync', 'static-dynamic-collision-resolution', 'collision-penetration-diagnostics', 'body-restitution-friction', 'body-sleep-threshold', 'angular-velocity-integration', 'angular-damping', 'rotation-snapshot-sync', 'moving-rotating-body-diagnostics', 'mass-weighted-collision-resolution', 'dynamic-mass-diagnostics', 'center-of-mass-diagnostics', 'kinetic-energy-diagnostics', 'per-body-gravity-scale', 'per-body-linear-damping', 'velocity-clamp-stability', 'max-speed-diagnostics', 'grounded-body-diagnostics', 'floor-contact-counting', 'contact-pair-diagnostics', 'deepest-contact-diagnostics', 'collision-wake-counting', 'write_body_bool', 'body_restitution', 'body_mass', 'body_inverse_mass', 'total_dynamic_mass', 'dynamic_center_of_mass', 'total_kinetic_energy', 'total_angular_energy', 'approximate_angular_energy', 'max_body_speed', 'clamp_vec3_magnitude', 'body_grounded', 'body_sleeping', 'body_id', 'axis_label', 'count_grounded_bodies', 'count_sleeping_bodies', 'count_moving_bodies', 'count_rotating_bodies', 'sleepingBodyCount', 'groundedBodyCount', 'floorContactCount', 'bodyContactCount', 'contactPairs', 'deepestContact', 'wokenBodyCount', 'movingBodyCount', 'rotatingBodyCount', 'totalDynamicMass', 'centerOfMass', 'kineticEnergy', 'angularEnergy', 'gravityScale', 'linearDamping', 'maxLinearSpeed', 'maxAngularSpeed', 'grounded', 'sleepThreshold', 'sleeping', 'restitution', 'friction', 'angularVelocity', 'angularDamping', 'rotation', 'mass', 'maxPenetration', 'dynamicBodyCount', 'staticBodyCount']) {
  assert(physicsPipeline.includes(expected), `physics_pipeline missing required contract text: ${expected}`);
}

const daemonRs = read('native/jepow-engine/src/daemon.rs');
assert(daemonRs.includes('crate::import_pipeline::status()'), 'daemon ping must expose import pipeline status.');
assert(daemonRs.includes('crate::physics_pipeline::status()'), 'daemon ping must expose physics pipeline status.');

const bridge = read('electron/native-engine-bridge.cjs');
for (const expected of [
  'getImportPipelineStatus',
  'runArchitectureSelfTest',
  'importScenePipeline',
  'getPhysicsPipelineStatus',
  'createPhysicsWorld',
  'stepPhysicsWorld',
]) {
  assert(bridge.includes(expected), `native-engine-bridge missing architecture API: ${expected}`);
}

const preload = read('electron/preload.cjs');
for (const expected of [
  'viewport:getArchitectureDiagnostics',
  'viewport:getImportPipelineStatus',
  'viewport:runArchitectureSelfTest',
  'viewport:importScenePipeline',
  'viewport:getPhysicsPipelineStatus',
  'viewport:createPhysicsWorld',
  'viewport:stepPhysicsWorld',
]) {
  assert(preload.includes(expected), `preload missing architecture IPC exposure: ${expected}`);
}

const runtime = read('src/lib/runtime.ts');
assert(runtime.includes('getArchitectureDiagnostics'), 'runtime types must expose architecture diagnostics API.');
assert(runtime.includes('runArchitectureSelfTest'), 'runtime types must expose architecture self-test API.');
assert(runtime.includes('importScenePipeline'), 'runtime types must expose import pipeline API.');
assert(runtime.includes('createPhysicsWorld'), 'runtime types must expose physics pipeline API.');

const workspace = read('src/components/ThreeDWorkspace.tsx');
for (const expected of [
  'ArchitectureProgress',
  'architectureProgress',
  'currentPhaseLabel',
  'skeletonPercent',
  'runtimePercent',
  'productionPercent',
  'probeImportPipeline',
  'pickSceneFile',
  'onImportObject',
  'assetPath',
  'triangleCount',
  'boundsSize',
  'runArchitectureDiagnostics',
  'probeArchitectureSelfTest',
  'probePhysicsWorld',
  'probePhysicsStep',
  'physicsWorldRef',
  'physicsColliderSignature',
  'physicsColliderSignatureRef',
  'hostSceneReadyRef',
  'hostSceneEpochRef',
  'physicsPlaying',
  'physicsStats',
  'contactCount',
  'maxPenetration',
  'dynamicBodyCount',
  'staticBodyCount',
  'sleepingBodyCount',
  'groundedBodyCount',
  'floorContactCount',
  'bodyContactCount',
  'contactPairCount',
  'deepestContactLabel',
  'wokenBodyCount',
  'physicsContactLabel',
  'readHostBounds',
  'alwaysOnTop: false',
  'nativeViewportPopout',
  'setNativeViewportPopout',
  'showRuntimeOverlay',
  'setShowRuntimeOverlay',
  '停靠式商业视图',
  '弹出原生',
  '收回原生',
  '停靠预览',
  'max-h-[34vh]',
  'max-w-[min(680px,calc(100%-24px))]',
  'movingBodyCount',
  'rotatingBodyCount',
  'totalDynamicMass',
  'centerOfMass',
  'kineticEnergy',
  'angularEnergy',
  'maxLinearSpeed',
  'maxAngularSpeed',
  'physicsBodyMass',
  'physicsHalfExtents',
  'restitution',
  'friction',
  'sleepThreshold',
  'sleeping',
  'angularVelocity',
  'gravityScale',
  'linearDamping',
  'angularDamping',
  'rotations',
  'Math.log10(triangles) * 0.22 + 1.45',
  'resetPhysicsWorld',
  'togglePhysicsPlayback',
  'cycleDisplayMode',
  'isolateSelection',
  'revealAllObjects',
  'selectAdjacentVisibleObject',
  'nudgeSelectedObject',
  'rotateSelectedObject',
  'scaleSelectedObject',
  'toggleSelectedObjectLock',
  'unlockAllObjects',
  'Ctrl+L 锁定',
  '方向键微移',
  'Alt+方向旋转',
  '[/] 缩放',
  'Tab 切对象',
  'Shift+A/C/L',
  'Ctrl+1/3/7',
  'Alt+Z',
  'H/Alt+H',
  '/ 隔离',
  'toPhysicsBodies',
  'applyPhysicsSnapshotToScene',
  '物理播放',
  '物理重置',
  '物理 runtime',
  'uiRuntimeCapabilities',
  'uiCapabilityBadges',
  'UI runtime',
  'viewportRuntimeCapabilities',
  'viewportCapabilityBadges',
  'Viewport runtime',
  'importRuntimeCapabilities',
  'importCapabilityBadges',
  'Import runtime',
  'cyclesRuntimeCapabilities',
  'cyclesCapabilityBadges',
  'Cycles/CL runtime',
  'physicsRuntimeCapabilities',
  'physicsCapabilityBadges',
  'Physics runtime',
  '架构管线控制台',
  '架构诊断报告',
  '架构自检',
]) {
  assert(workspace.includes(expected), `3D workspace missing architecture pipeline UI: ${expected}`);
}

const app = read('src/App.tsx');
for (const expected of ['importThreeDObject', 'onImportObject', 'onApplyPhysicsObjects', 'applyPhysicsThreeDObjects', '导入资产', 'assetPath', 'triangleCount', 'boundsSize']) {
  assert(app.includes(expected), `App missing imported object scene integration: ${expected}`);
}

const viewportHost = read('native/jepow-engine/src/viewport_host.rs');
for (const expected of [
  'asset_path',
  'import_backend',
  'triangle_count',
  'vertex_count',
  'bounds_min',
  'bounds_max',
  'bounds_size',
  'is_imported_asset',
  'imported_asset_proxy_scale',
  'ImportedGpuMesh',
  'ImportedHostVertex',
  'imported_meshes',
  'imported_mesh_for',
  'source_stamp',
  'imported_asset_source_stamp',
  'imported_mesh_edges',
  'ray_object_hit',
  'ray_aabb_hit',
  'object_display_radius',
  'edge_vertex_buffer',
  'imported_pipeline',
  'base_color_texture',
  'metallic_roughness_texture',
  'imported_mesh_model_matrix',
  'material_color',
  'material_tint',
  'material_params',
  'metallic_factor',
  'roughness_factor',
  'draw_indexed(0..imported_mesh.index_count',
  'selectedObjectId',
  'selectionAccepted',
  'transformApplied',
  'WindowLevel::Normal',
]) {
  assert(viewportHost.includes(expected), `viewport host missing imported asset metadata: ${expected}`);
}

console.log(`Architecture contract locked: ${ARCHITECTURE_CONTRACT.canonicalStack}`);
