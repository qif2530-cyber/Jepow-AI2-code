#!/usr/bin/env bash
# Build a manifest for GPL corresponding source (jepow-cycles + pinned Blender tree).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/dist/compliance/gpl-source"
mkdir -p "$OUT"

MANIFEST="$OUT/MANIFEST.txt"
{
  echo "# Jepow GPL corresponding source manifest"
  echo "# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
  echo "## jepow-cycles (required)"
  find "$ROOT/native/jepow-cycles" -type f \
    ! -path '*/build/*' \
    ! -path '*/third_party/blender/*' \
    2>/dev/null | sort
  echo ""
  echo "## Blender tree (required when jepow-cycles is distributed)"
  if [[ -f "$ROOT/native/jepow-cycles/third_party/VERSION" ]]; then
    echo "Pinned version: $(cat "$ROOT/native/jepow-cycles/third_party/VERSION")"
  else
    echo "MISSING: native/jepow-cycles/third_party/VERSION — record blender commit before release"
  fi
  if [[ -d "$ROOT/native/jepow-cycles/third_party/blender" ]]; then
    echo "Blender path present: native/jepow-cycles/third_party/blender"
  else
    echo "Blender path not in workspace — attach tarball used at build time to this archive"
  fi
  echo ""
  echo "## Legal files to ship with binary"
  echo "COPYING.GPL"
  echo "THIRD_PARTY_NOTICES.md"
  echo "SOURCE_CODE_OFFER.md"
} > "$MANIFEST"

echo "Wrote $MANIFEST"
echo "Next: tar czf dist/compliance/jepow-gpl-source-\$(git describe --tags --always).tar.xz -T $MANIFEST"
