/*
 * jepow-cycles — part of Jepow AI (GPL-2.0-or-later)
 * Copyright (C) 2025 Jepow
 * See COPYING in this directory.
 *
 * Stable C ABI for Electron/Rust hosts. Implementations must live in the
 * GPL jepow-cycles binary only — do not link this from jepow-engine (MIT).
 */
#ifndef JEPOW_CYCLES_H
#define JEPOW_CYCLES_H

#ifdef __cplusplus
extern "C" {
#endif

#define JEPOW_CYCLES_API_VERSION 1

typedef struct JepowCyclesRenderRequest {
  const char *scene_path;
  int width;
  int height;
  int samples;
  const char *output_path;
} JepowCyclesRenderRequest;

typedef struct JepowCyclesRenderResult {
  int ok;
  const char *error_message;
  const char *output_path;
  double render_seconds;
} JepowCyclesRenderResult;

/** Returns non-zero when libcycles was linked at build time. */
int jepow_cycles_is_built(void);

/** Human-readable license line for --version / status JSON. */
const char *jepow_cycles_license_string(void);

/**
 * Offline frame render. Returns 0 on success.
 * When not built, sets error_message and returns -1.
 */
int jepow_cycles_render_frame(
    const JepowCyclesRenderRequest *req,
    JepowCyclesRenderResult *out);

#ifdef __cplusplus
}
#endif

#endif /* JEPOW_CYCLES_H */
