#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOL_DIR="$ROOT_DIR/native/jepow-cycles/.venv-build/bin"

if [ -d "$TOOL_DIR" ]; then
  export PATH="$TOOL_DIR:$PATH"
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake not found. Run:" >&2
  echo "  python3 -m venv native/jepow-cycles/.venv-build" >&2
  echo "  native/jepow-cycles/.venv-build/bin/python -m pip install cmake ninja" >&2
  exit 1
fi

GENERATOR="${CMAKE_GENERATOR:-Ninja}"
BUILD_DIR="$ROOT_DIR/native/jepow-cycles/build"

cmake -S "$ROOT_DIR/native/jepow-cycles" \
  -B "$BUILD_DIR" \
  -G "$GENERATOR" \
  -DCMAKE_BUILD_TYPE=Release

cmake --build "$BUILD_DIR"
