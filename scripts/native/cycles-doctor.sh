#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BLENDER_DIR="$ROOT_DIR/native/jepow-cycles/third_party/blender"
VERSION_FILE="$ROOT_DIR/native/jepow-cycles/third_party/VERSION"
BUILD_DIR="$ROOT_DIR/native/jepow-cycles/build"

echo "jepow-cycles doctor"
echo "root: $ROOT_DIR"
echo ""

if [ -d "$BLENDER_DIR/intern/cycles" ]; then
  echo "source: OK ($BLENDER_DIR)"
  if [ -f "$VERSION_FILE" ]; then
    echo "version: $(cat "$VERSION_FILE")"
  else
    echo "version: MISSING native/jepow-cycles/third_party/VERSION"
  fi
else
  echo "source: MISSING (run npm run native:cycles:download)"
fi

if command -v cmake >/dev/null 2>&1; then
  echo "cmake: $(cmake --version | sed -n '1p')"
else
  echo "cmake: MISSING"
fi

if command -v ninja >/dev/null 2>&1; then
  echo "ninja: $(ninja --version)"
else
  echo "ninja: MISSING (Make can be used, Ninja is preferred)"
fi

if command -v git-lfs >/dev/null 2>&1; then
  echo "git-lfs: $(git-lfs --version)"
elif [ -x "$ROOT_DIR/native/jepow-cycles/.tools/git-lfs/git-lfs-3.7.1/git-lfs" ]; then
  echo "git-lfs: $("$ROOT_DIR/native/jepow-cycles/.tools/git-lfs/git-lfs-3.7.1/git-lfs" version) (local)"
else
  echo "git-lfs: MISSING (download script disables LFS smudge for source checkout)"
fi

if [ -d "$BLENDER_DIR/lib/macos_arm64" ] && [ "$(ls -A "$BLENDER_DIR/lib/macos_arm64" 2>/dev/null | wc -l | tr -d ' ')" != "0" ]; then
  echo "macos_arm64 libs: PRESENT"
else
  echo "macos_arm64 libs: MISSING (needed for Cycles standalone on Apple Silicon)"
fi

if [ -x "$BUILD_DIR/jepow-cycles" ] || [ -x "$BUILD_DIR/jepow-cycles.exe" ]; then
  echo "binary: OK ($BUILD_DIR)"
else
  echo "binary: MISSING (run npm run native:cycles:build:libcycles after installing build deps)"
fi

CORE_BUILD_DIR="$ROOT_DIR/native/jepow-cycles/build-cycles-standalone"
CORE_LIB_COUNT="$(ls "$CORE_BUILD_DIR"/lib/libcycles_*.a 2>/dev/null | wc -l | tr -d ' ')"
STANDALONE_BIN="$CORE_BUILD_DIR/intern/cycles/app/Blender.app/Contents/MacOS/cycles"
if [ "$CORE_LIB_COUNT" != "0" ]; then
  echo "cycles core libs: OK ($CORE_LIB_COUNT static libs)"
else
  echo "cycles core libs: MISSING (run npm run native:cycles:build:libcycles)"
fi
if [ -x "$STANDALONE_BIN" ]; then
  echo "cycles standalone: OK ($STANDALONE_BIN)"
else
  echo "cycles standalone: MISSING"
fi
