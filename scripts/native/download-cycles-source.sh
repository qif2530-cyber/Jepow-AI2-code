#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
THIRD_PARTY_DIR="$ROOT_DIR/native/jepow-cycles/third_party"
BLENDER_DIR="$THIRD_PARTY_DIR/blender"
VERSION_FILE="$THIRD_PARTY_DIR/VERSION"

BLENDER_REPO="${BLENDER_REPO:-https://projects.blender.org/blender/blender.git}"
BLENDER_REF="${BLENDER_REF:-main}"

mkdir -p "$THIRD_PARTY_DIR"

if [ -d "$BLENDER_DIR/.git" ]; then
  echo "[jepow-cycles] Blender source already exists: $BLENDER_DIR"
  git -C "$BLENDER_DIR" -c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false fetch --depth 1 origin "$BLENDER_REF"
  git -C "$BLENDER_DIR" -c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false checkout FETCH_HEAD
  git -C "$BLENDER_DIR" -c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false restore --source=HEAD :/
else
  if [ -e "$BLENDER_DIR" ]; then
    echo "[jepow-cycles] Refusing to overwrite non-git path: $BLENDER_DIR" >&2
    exit 1
  fi
  git -c filter.lfs.smudge= -c filter.lfs.process= -c filter.lfs.required=false clone --depth 1 --filter=blob:none --branch "$BLENDER_REF" "$BLENDER_REPO" "$BLENDER_DIR"
fi

COMMIT="$(git -C "$BLENDER_DIR" rev-parse HEAD)"
printf '%s\n' "$COMMIT" > "$VERSION_FILE"

echo "[jepow-cycles] Blender/Cycles source ready"
echo "[jepow-cycles] ref=$BLENDER_REF commit=$COMMIT"
echo "[jepow-cycles] version file: $VERSION_FILE"
