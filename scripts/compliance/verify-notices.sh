#!/usr/bin/env bash
# Verify GPL/MIT compliance files exist before release.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

required=(
  LICENSE
  COPYING.GPL
  THIRD_PARTY_NOTICES.md
  SOURCE_CODE_OFFER.md
  native/COMPLIANCE.md
  native/RENDERERS.md
  native/jepow-cycles/COPYING
  native/jepow-cycles/COMPLIANCE.md
  native/jepow-cycles/NOTICE
  native/jepow-cycles/include/jepow_cycles.h
)

missing=0
for f in "${required[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "MISSING: $f"
    missing=1
  fi
done

if grep -q 'GPL-2.0-or-later' native/jepow-cycles/src/jepow_cycles_bridge.cpp 2>/dev/null; then
  :
else
  echo "WARN: jepow_cycles_bridge.cpp should contain GPL-2.0-or-later file header"
  missing=1
fi

if grep -R -l 'cycles' native/jepow-engine/Cargo.toml native/jepow-engine/src 2>/dev/null | grep -q .; then
  if grep -E 'blender|libcycles|jepow-cycles' native/jepow-engine/Cargo.toml 2>/dev/null; then
    echo "FAIL: jepow-engine must not depend on Cycles in Cargo.toml"
    missing=1
  fi
fi

if [[ "$missing" -ne 0 ]]; then
  echo "compliance:verify FAILED"
  exit 1
fi

echo "compliance:verify OK"
