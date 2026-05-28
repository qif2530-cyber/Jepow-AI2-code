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

const mainRs = read('native/jepow-engine/src/main.rs');
for (const expected of [
  'mod import_pipeline;',
  'mod physics_pipeline;',
  '"architecture_status"',
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
for (const expected of ['Assimp Import', 'USD Import', 'architecture_wired', 'import_scene']) {
  assert(importPipeline.includes(expected), `import_pipeline missing required contract text: ${expected}`);
}

const physicsPipeline = read('native/jepow-engine/src/physics_pipeline.rs');
for (const expected of ['Jolt Physics', 'Bullet Physics', 'architecture_wired', 'create_world', 'step_world']) {
  assert(physicsPipeline.includes(expected), `physics_pipeline missing required contract text: ${expected}`);
}

const daemonRs = read('native/jepow-engine/src/daemon.rs');
assert(daemonRs.includes('crate::import_pipeline::status()'), 'daemon ping must expose import pipeline status.');
assert(daemonRs.includes('crate::physics_pipeline::status()'), 'daemon ping must expose physics pipeline status.');

const bridge = read('electron/native-engine-bridge.cjs');
for (const expected of [
  'getImportPipelineStatus',
  'importScenePipeline',
  'getPhysicsPipelineStatus',
  'createPhysicsWorld',
  'stepPhysicsWorld',
]) {
  assert(bridge.includes(expected), `native-engine-bridge missing architecture API: ${expected}`);
}

const preload = read('electron/preload.cjs');
for (const expected of [
  'viewport:getImportPipelineStatus',
  'viewport:importScenePipeline',
  'viewport:getPhysicsPipelineStatus',
  'viewport:createPhysicsWorld',
  'viewport:stepPhysicsWorld',
]) {
  assert(preload.includes(expected), `preload missing architecture IPC exposure: ${expected}`);
}

const runtime = read('src/lib/runtime.ts');
assert(runtime.includes('importScenePipeline'), 'runtime types must expose import pipeline API.');
assert(runtime.includes('createPhysicsWorld'), 'runtime types must expose physics pipeline API.');

console.log(`Architecture contract locked: ${ARCHITECTURE_CONTRACT.canonicalStack}`);
