/*
 * jepow-cycles — part of Jepow AI (GPL-2.0-or-later)
 * Copyright (C) 2025 Jepow
 * See COPYING in this directory.
 *
 * Stub until third_party/blender is wired in CMake. Product IPC can call
 * jepow_cycles_is_built() / jepow_cycles_render_frame() without blender.exe.
 */

#include "../include/jepow_cycles.h"

#include <cstdio>
#include <cstring>

#ifndef JEPOW_CYCLES_WITH_LIBCYCLES
#define JEPOW_CYCLES_WITH_LIBCYCLES 0
#endif

static thread_local char g_last_error[512];

static void set_error(const char *msg) {
  std::snprintf(g_last_error, sizeof(g_last_error), "%s", msg ? msg : "unknown error");
}

extern "C" int jepow_cycles_is_built(void) {
  return JEPOW_CYCLES_WITH_LIBCYCLES ? 1 : 0;
}

extern "C" const char *jepow_cycles_license_string(void) {
  return "GPL-2.0-or-later (jepow-cycles + Blender Cycles when built)";
}

extern "C" int jepow_cycles_render_frame(
    const JepowCyclesRenderRequest *req,
    JepowCyclesRenderResult *out) {
  if (!out) {
    set_error("null result");
    return -1;
  }
  out->ok = 0;
  out->error_message = g_last_error;
  out->output_path = req ? req->output_path : nullptr;
  out->render_seconds = 0.0;

  if (!req || !req->scene_path || !req->output_path) {
    set_error("invalid request");
    return -1;
  }

#if !JEPOW_CYCLES_WITH_LIBCYCLES
  set_error(
      "jepow-cycles not built with libcycles. See native/jepow-cycles/README.md");
  return -1;
#else
  /* TODO: map scene_path → Cycles session, write output_path */
  set_error("libcycles integration not implemented yet");
  return -1;
#endif
}

int main(int argc, char **argv) {
  if (argc > 1 && std::strcmp(argv[1], "--version") == 0) {
    std::printf("jepow-cycles api=%d built=%d license=%s\n",
                JEPOW_CYCLES_API_VERSION,
                jepow_cycles_is_built(),
                jepow_cycles_license_string());
    return jepow_cycles_is_built() ? 0 : 2;
  }
  if (argc > 1 && std::strcmp(argv[1], "--stdio") == 0) {
    std::printf("{\"ok\":true,\"cmd\":\"ping\",\"built\":%d,\"license\":\"%s\"}\n",
                jepow_cycles_is_built(),
                jepow_cycles_license_string());
    return 0;
  }
  std::fprintf(stderr,
               "Usage: jepow-cycles --version | --stdio\n"
               "GPL-2.0-or-later — https://www.jepow.com (source offer: SOURCE_CODE_OFFER.md)\n");
  return 1;
}
