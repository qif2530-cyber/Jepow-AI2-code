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
