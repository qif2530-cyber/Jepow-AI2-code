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

- Rust engine commands: `architecture_status`, `architecture_self_test`, `import_pipeline_status`, `import_scene_pipeline`, `physics_pipeline_status`, `physics_create_world`, `physics_step_world`.
- Electron viewport APIs: `getArchitectureDiagnostics`, `runArchitectureSelfTest`, `getImportPipelineStatus`, `importScenePipeline`, `getPhysicsPipelineStatus`, `createPhysicsWorld`, `stepPhysicsWorld`.
- Runtime APIs must stay exposed through `window.jepowDesktop.viewport`.
- The 3D workspace must keep UI probes for import pipeline, physics world creation, and physics stepping until those controls are replaced by full production panels.
- The 3D workspace must keep a diagnostics UI for the fixed architecture until replaced by a full production diagnostics panel.
- The import pipeline must keep native runtime bridging for existing `gltf/glb/fbx/obj` loaders while Assimp/USD runtime support is filled in.
- Successful native imports must create a 3D scene object with asset metadata (`assetPath`, backend, triangle/vertex counts) until replaced by full mesh scene instancing.
- Imported scene objects must stay visible in the native viewport through an asset proxy until full imported mesh rendering is implemented.
- Native import runtime must preserve mesh bounds metadata (`boundsMin`, `boundsMax`, `boundsSize`) so viewport proxies can reflect real asset proportions.
- Native viewport must prefer real imported mesh GPU buffers for `assetPath` objects and only fall back to the proxy body when loading fails.
- Real imported mesh rendering must use bounds-based centering/normalization so asset origin and authoring scale do not break viewport usability.
- Native import runtime must surface basic imported material color (`materialColor`) and keep it connected to viewport material display.
- Native import runtime must preserve imported UVs and base-color texture availability (`hasBaseColorTexture`) and connect sampled base-color textures to native viewport imported mesh rendering.
- Native import runtime must surface glTF metallic/roughness (`metallicFactor`, `roughnessFactor`) and connect those PBR parameters to native viewport imported mesh shading.
- Native import runtime must preserve glTF metallic-roughness texture availability (`hasMetallicRoughnessTexture`) and sample it in native viewport imported mesh shading.
- Native import runtime must preserve per-primitive/model material tint so multi-material glTF/OBJ assets do not collapse to a single viewport color.
- Native viewport wireframe mode must draw real imported mesh triangle edges for `assetPath` objects instead of falling back to the proxy cube edges.
- Native viewport picking and focus must use real imported mesh bounds for `assetPath` objects instead of proxy/unit-cube interaction bounds.
- Native imported GPU mesh cache must track source file modification metadata and rebuild GPU buffers when the imported asset changes on disk.
- Physics pipeline may use a minimal native runtime while Jolt/Bullet are being linked, but it must return a step-able `worldSnapshot` and deterministic gravity integration instead of placeholder-only responses.
- The 3D workspace physics probe must be able to build physics bodies from visible mesh scene objects and apply stepped `worldSnapshot` body positions back to scene objects.
- The 3D workspace must support continuous physics play/pause during the minimal runtime phase and avoid recording every playback frame into undo history.
- The 3D workspace must expose physics reset and visible runtime stats so the minimal physics world can be rebuilt from the current scene and inspected while playing.
- The minimal physics runtime must support deterministic AABB body-body collision resolution and report `contactCount` until Jolt/Bullet replaces it.
- The 3D workspace physics HUD and probe output must surface `contactCount` so body-body collision activity is visible during playback.
- Physics bodies generated from imported `assetPath` meshes must use the same bounds normalization target as native viewport imported mesh rendering, so visible mesh size and collider size stay aligned.
- The minimal physics runtime must support fixed substeps and damping during playback to reduce tunneling and jitter before Jolt/Bullet is linked.

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

## Progress Semantics

- `骨架完成`: module boundaries, IPC, status, self-test, and diagnostics are locked.
- `Runtime 填充中`: placeholder interfaces are being replaced by real render/import/physics runtime implementations.
- `生产能力就绪`: runtime behavior is ready for real projects and moves into performance/stability optimization.
