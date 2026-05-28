# Jepow Native 3D Architecture Contract

This repository is anchored to one fixed product architecture:

`React/Electron UI + Rust/wgpu Core Viewport + Cycles/CL Render + Assimp/USD Import + Bullet/Jolt Physics`

This is not a temporary implementation detail. Future changes must optimize within this architecture rather than replacing it with a different foundation.

## Required Layers

- `React/Electron UI`: owns panels, commands, state, and desktop IPC.
- `Rust/wgpu Core Viewport`: owns the interactive native viewport, selection, transforms, camera, and viewport rendering.
- `Cycles/CL Render`: owns offline/final rendering through an isolated render process or bridge.
- `Assimp/USD Import`: owns broad DCC import and scene interchange. Runtime support can be incremental, but the architecture slot must remain.
- `Bullet/Jolt Physics`: owns simulation, collision, rigid bodies, and debug draw. Runtime support can be incremental, but the architecture slot must remain.

## Required IPC/Command Surface

- Rust engine commands: `architecture_status`, `import_pipeline_status`, `import_scene_pipeline`, `physics_pipeline_status`, `physics_create_world`, `physics_step_world`.
- Electron viewport APIs: `getImportPipelineStatus`, `importScenePipeline`, `getPhysicsPipelineStatus`, `createPhysicsWorld`, `stepPhysicsWorld`.
- Runtime APIs must stay exposed through `window.jepowDesktop.viewport`.

## Non-Negotiable Rules

- Do not replace the native `Rust/wgpu` viewport with Three.js as the primary 3D editor viewport.
- Do not link GPL Cycles code directly into the MIT `jepow-engine`; keep rendering isolated through the Cycles bridge/process boundary.
- Do not remove the Assimp/USD or Bullet/Jolt architecture slots, even while their runtime implementations are incomplete.
- Any new 3D feature must declare which layer owns it before implementation.
- `npm run architecture:verify` must pass after architecture-related changes.

## Status Semantics

- `可用`: the layer is wired and has usable runtime behavior.
- `骨架已接入`: the layer has stable module boundaries and status protocol, but runtime implementation is still being filled.
- `待接入`: the layer is not wired and should be treated as architecture debt.
