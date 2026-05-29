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
- React/Electron UI status must expose runtime capability flags so diagnostics can show workspace, IPC, undo/redo, panels, and pipeline console behavior as part of the fixed architecture.
- Cycles/CL render status must expose runtime capabilities and render devices so diagnostics can distinguish CPU-ready, Metal/CL-ready, and bridge-binary-ready states.
- Rust/wgpu viewport status must expose runtime capability flags so diagnostics can distinguish native host availability from concrete editor/rendering behavior.
- Native viewport UI integration must use bounds-first startup and normal window level by default so the wgpu host does not flash at fallback size or cover React panels as an always-on-top window.
- Runtime HUD overlays must stay compact and bounded so physics/architecture diagnostics do not obscure editing controls during normal 3D workspace use.
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
- Native viewport scene synchronization must acknowledge `setScene`, reject invalid hidden/missing selections, and report whether transform updates actually hit a host object so React/Electron can diagnose stale IPC state; these behaviors must be exposed as viewport runtime capabilities.
- Physics pipeline may use a minimal native runtime while Jolt/Bullet are being linked, but it must return a step-able `worldSnapshot` and deterministic gravity integration instead of placeholder-only responses.
- The 3D workspace physics probe must be able to build physics bodies from visible mesh scene objects and apply stepped `worldSnapshot` body positions back to scene objects.
- The 3D workspace must invalidate and rebuild the minimal physics world when collider topology changes (visible mesh set, lock state, scale, bounds), while preserving playback snapshots across pure position updates.
- The 3D workspace must support continuous physics play/pause during the minimal runtime phase and avoid recording every playback frame into undo history.
- The 3D workspace must expose physics reset and visible runtime stats so the minimal physics world can be rebuilt from the current scene and inspected while playing.
- Physics pipeline status must expose native minimal runtime capability flags so diagnostics can distinguish placeholder Jolt/Bullet wiring from the current step-able simulation runtime.
- Minimal physics runtime must report dynamic/static body counts and max collision penetration so playback stability can be diagnosed from the UI while Jolt/Bullet integration is pending.
- Minimal physics bodies must carry restitution/friction parameters and the runtime must use them for floor/body collision response instead of hard-coded material behavior.
- Minimal physics bodies must carry sleep threshold/state so low-speed settled bodies stop integrating and collision events can wake them again.
- Minimal physics bodies must carry rotation, angular velocity, and angular damping so the runtime snapshot can drive rigid body orientation before full Jolt/Bullet rotation solvers are linked.
- Minimal physics bodies must carry per-body gravity scale and linear damping so authors can diagnose object-specific falling and settling behavior before full Jolt/Bullet body parameters are linked.
- Minimal physics bodies must carry max linear/angular speed clamps and the runtime/HUD must report current max speeds so unstable simulations are bounded and diagnosable before full Jolt/Bullet solvers are linked.
- Minimal physics body-body collision must use body mass/inverse mass when separating dynamic overlaps so heavy bodies move less than light bodies before full Jolt/Bullet solvers are linked.
- Physics runtime and HUD must report sleeping body counts so simulation settling can be diagnosed during continuous playback.
- Physics runtime and HUD must report moving and rotating body counts so motion activity can be diagnosed separately from collision contact counts.
- Physics runtime and HUD must report grounded body counts and floor contact counts so settled-on-floor state can be diagnosed separately from body-body collision contacts and sleeping state.
- Physics runtime and HUD must report body contact pair counts, deepest body contact details, and collision wake counts so object-object collision stability can be diagnosed beyond aggregate contact totals.
- Physics runtime and HUD must report total dynamic mass so collider size and material-density heuristics can be diagnosed while authoring simulation scenes.
- Physics runtime and HUD must report dynamic center of mass and linear/angular kinetic energy so unstable simulations and drifting mass distributions can be diagnosed before full Jolt/Bullet solvers are linked.
- The minimal physics runtime must support deterministic AABB body-body collision resolution and report `contactCount` until Jolt/Bullet replaces it.
- The 3D workspace physics HUD and probe output must surface `contactCount` so body-body collision activity is visible during playback.
- Physics bodies generated from imported `assetPath` meshes must use the same bounds normalization target as native viewport imported mesh rendering, so visible mesh size and collider size stay aligned.
- The minimal physics runtime must support fixed substeps and damping during playback to reduce tunneling and jitter before Jolt/Bullet is linked.
- Native import runtime must support STL as a real mesh/stats path while broader Assimp coverage is being linked.
- Native import runtime must support PLY as a real mesh/stats path for ASCII, binary little-endian, and binary big-endian triangle meshes while broader Assimp coverage is being linked.
- Import pipeline status must expose native runtime capability flags for currently implemented format features so Electron diagnostics can distinguish wired architecture from real loader coverage.
- Binary PLY import must parse only the textual header before `end_header`, preserving the data offset without requiring the binary payload to be valid UTF-8.
- PLY import must preserve common per-vertex texture coordinates (`u/v`, `s/t`, `texture_u/texture_v`, `texcoord_u/texcoord_v`) when available.
- PLY import must preserve per-vertex colors from both normalized float and integer color ranges, using the declared property type to normalize low integer values correctly, and must read common alpha fields (`alpha`/`a`) without corrupting RGB tint.
- PLY import must parse face properties as an ordered property list, triangulate vertex-index lists, and skip non-index face scalar/list properties without desynchronizing binary data.
- Binary PLY scalar reads must be bounds-checked and return import errors for truncated/corrupt assets instead of panicking in the native viewport process.
- PLY face triangulation must validate vertex indices against the parsed vertex count and return a diagnostic import error for out-of-range geometry before GPU upload.
- Native import runtime must generate missing mesh normals from triangle topology so PLY/OBJ/glTF assets without normals still shade correctly in the wgpu viewport.

## Non-Negotiable Rules

- Do not replace the native `Rust/wgpu` viewport with Three.js as the primary 3D editor viewport.
- Do not link GPL Cycles code directly into the MIT `jepow-engine`; keep rendering isolated through the Cycles bridge/process boundary.
- Do not remove the Assimp/USD or Bullet/Jolt architecture slots, even while their runtime implementations are incomplete.
- Any new 3D feature must declare which layer owns it before implementation.
- `npm run architecture:verify` must pass after architecture-related changes.

## Status Semantics

- `可用`: the layer is wired and has usable runtime behavior.
- `Runtime`: the layer has real runtime behavior in the current branch, even if the final production backend is still being replaced or hardened.
- `骨架已接入`: the layer has stable module boundaries and status protocol, but runtime implementation is still being filled.
- `待接入`: the layer is not wired and should be treated as architecture debt.
- Architecture progress must expose skeleton, runtime, and production percentages so users can see real runtime fill-in progress separately from final production readiness.

## Progress Semantics

- `骨架完成`: module boundaries, IPC, status, self-test, and diagnostics are locked.
- `Runtime 填充中`: placeholder interfaces are being replaced by real render/import/physics runtime implementations.
- `生产能力就绪`: runtime behavior is ready for real projects and moves into performance/stability optimization.
