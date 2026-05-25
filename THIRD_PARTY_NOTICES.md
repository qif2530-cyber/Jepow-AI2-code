# Third-Party Notices — Jepow AI

This file lists licenses for components shipped with or optionally built into Jepow AI.
For the full GPL text, see `COPYING.GPL`.

## Shipped by default (desktop viewport)

| Component | License | Copyright / source |
|-----------|---------|-------------------|
| **jepow-engine** | MIT | This repository, `native/jepow-engine/` |
| **ufbx** | MIT | https://github.com/ufbx/ufbx |
| **wgpu** | MIT OR Apache-2.0 | https://github.com/gfx-rs/wgpu |
| **Rayon, serde, glam, …** | MIT / Apache-2.0 | See `native/jepow-engine/Cargo.lock` |
| **Electron** | MIT | https://github.com/electron/electron |
| **React, Vite, Three.js** | MIT | See `package-lock.json` |

## Optional — only when `jepow-cycles` is built and bundled

| Component | License | Copyright / source |
|-----------|---------|-------------------|
| **jepow-cycles** (Jepow bridge) | GPL-2.0-or-later | `native/jepow-cycles/` |
| **Blender Cycles** (libcycles) | GPL-2.0-or-later | Copyright © Blender Foundation — https://www.blender.org |
| **OpenImageIO, OpenShadingLanguage, …** | Various (mostly Apache-2.0 / BSD) | As required by your Cycles build; list exact versions in `dist/compliance/gpl-source/MANIFEST.txt` after `package-gpl-source.sh` |

## Debug-only (not for production builds)

| Component | License | Note |
|-----------|---------|------|
| **blender.exe** + `jepow_bridge.py` | GPL-2.0-or-later | `native/blender/scripts/` — `JEPOW_USE_BLENDER_VIEWPORT=1` only |

## FBX import alignment

FBX mesh import in `jepow-engine` follows rules compatible with Blender `io_scene_fbx`; **no** Blender runtime is invoked in the default path.

## Updates

When you add or upgrade a native dependency, update this file and run:

```bash
npm run compliance:verify
```
