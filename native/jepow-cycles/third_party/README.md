# Third-party sources for jepow-cycles

Place the **exact** Blender tree used to build libcycles here:

```
third_party/blender/   # git submodule or extracted tarball
third_party/VERSION      # one line: blender commit hash or tag
```

This directory is **not** vendored in git by default (size). CI/release builds must record the hash in `dist/compliance/gpl-source/MANIFEST.txt`.

Official integration reference:

- https://developer.blender.org/docs/features/cycles/standalon/
- Cycles C++ API headers under `intern/cycles/` in the Blender tree

Do **not** copy `blender.exe` into the product; only build the `cycles` / libcycles targets needed by `jepow_cycles_bridge.cpp`.
