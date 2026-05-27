#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOL_DIR="$ROOT_DIR/native/jepow-cycles/.venv-build/bin"
BUILD_DIR="$ROOT_DIR/native/jepow-cycles/build-cycles-standalone"

if [ -d "$TOOL_DIR" ]; then
  export PATH="$TOOL_DIR:$PATH"
fi

if [ ! -f "$BUILD_DIR/build.ninja" ]; then
  bash "$ROOT_DIR/scripts/native/probe-cycles-standalone.sh"
fi

cmake --build "$BUILD_DIR" --target cycles
cmake --build "$BUILD_DIR" --target jepow-cycles-daemon

if [[ "$(uname -s)" == "Darwin" ]]; then
  APP_RESOURCES="$BUILD_DIR/intern/cycles/app/Blender.app/Contents/Resources"
  mkdir -p "$APP_RESOURCES"
  rm -rf "$APP_RESOURCES/kernel"
  cp -R "$ROOT_DIR/native/jepow-cycles/third_party/blender/intern/cycles/kernel" \
    "$APP_RESOURCES/kernel"
  cat > "$BUILD_DIR/intern/cycles/app/Blender.app/Contents/Resources/cycles-kernel-path.txt" <<EOF
$ROOT_DIR/native/jepow-cycles/third_party/blender/intern/cycles
EOF
fi
