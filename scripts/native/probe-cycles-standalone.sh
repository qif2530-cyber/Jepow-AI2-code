#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOL_DIR="$ROOT_DIR/native/jepow-cycles/.venv-build/bin"
BLENDER_DIR="$ROOT_DIR/native/jepow-cycles/third_party/blender"
BUILD_DIR="$ROOT_DIR/native/jepow-cycles/build-cycles-standalone"

if [ -d "$TOOL_DIR" ]; then
  export PATH="$TOOL_DIR:$PATH"
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake missing. Run npm run native:cycles:doctor for setup status." >&2
  exit 1
fi

if [ ! -d "$BLENDER_DIR/intern/cycles" ]; then
  echo "Blender/Cycles source missing. Run npm run native:cycles:download." >&2
  exit 1
fi

cmake -C "$BLENDER_DIR/build_files/cmake/config/cycles_standalone.cmake" \
  -S "$BLENDER_DIR" \
  -B "$BUILD_DIR" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release
