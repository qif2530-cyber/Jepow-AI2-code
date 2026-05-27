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
#include <iostream>
#include <sstream>
#include <string>

#ifndef JEPOW_CYCLES_WITH_LIBCYCLES
#define JEPOW_CYCLES_WITH_LIBCYCLES 0
#endif

static thread_local char g_last_error[512];

static void set_error(const char *msg) {
  std::snprintf(g_last_error, sizeof(g_last_error), "%s", msg ? msg : "unknown error");
}

static std::string json_escape(const std::string &s) {
  std::string out;
  out.reserve(s.size() + 8);
  for (char c : s) {
    switch (c) {
      case '\\': out += "\\\\"; break;
      case '"': out += "\\\""; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default: out += c; break;
    }
  }
  return out;
}

static std::string json_string_field(const std::string &line, const char *field) {
  const std::string key = std::string("\"") + field + "\"";
  size_t pos = line.find(key);
  if (pos == std::string::npos) return "";
  pos = line.find(':', pos + key.size());
  if (pos == std::string::npos) return "";
  pos = line.find('"', pos + 1);
  if (pos == std::string::npos) return "";
  std::string out;
  bool esc = false;
  for (size_t i = pos + 1; i < line.size(); ++i) {
    const char c = line[i];
    if (esc) {
      out += c;
      esc = false;
      continue;
    }
    if (c == '\\') {
      esc = true;
      continue;
    }
    if (c == '"') break;
    out += c;
  }
  return out;
}

static int json_int_field(const std::string &line, const char *field, int fallback) {
  const std::string key = std::string("\"") + field + "\"";
  size_t pos = line.find(key);
  if (pos == std::string::npos) return fallback;
  pos = line.find(':', pos + key.size());
  if (pos == std::string::npos) return fallback;
  std::stringstream ss(line.substr(pos + 1));
  int value = fallback;
  ss >> value;
  return value;
}

static void emit_json(const std::string &payload) {
  std::cout << payload << std::endl;
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
  /*
   * TODO: map scene_path -> Cycles session, create a Blender 4 Principled BSDF
   * shader graph from req->material_json, then apply req->render_settings_json
   * to samples, bounces, denoise and color management before writing output_path.
   */
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
    emit_json(std::string("{\"ok\":true,\"cmd\":\"ready\",\"api\":") +
              std::to_string(JEPOW_CYCLES_API_VERSION) +
              ",\"built\":" + std::to_string(jepow_cycles_is_built()) +
              ",\"license\":\"" + json_escape(jepow_cycles_license_string()) + "\"}");

    std::string line;
    int session_counter = 0;
    std::string active_session;
    std::string active_scene;
    while (std::getline(std::cin, line)) {
      const std::string cmd = json_string_field(line, "cmd");
      const int id = json_int_field(line, "id", 0);
      if (cmd == "ping" || cmd == "status") {
        emit_json("{\"ok\":true,\"id\":" + std::to_string(id) +
                  ",\"cmd\":\"" + cmd + "\",\"built\":" +
                  std::to_string(jepow_cycles_is_built()) + "}");
      }
      else if (cmd == "init_session") {
        active_session = "cycles-session-" + std::to_string(++session_counter);
        emit_json("{\"ok\":true,\"id\":" + std::to_string(id) +
                  ",\"sessionId\":\"" + active_session +
                  "\",\"built\":" + std::to_string(jepow_cycles_is_built()) + "}");
      }
      else if (cmd == "load_scene") {
        active_scene = json_string_field(line, "scenePath");
        if (active_session.empty()) {
          active_session = "cycles-session-" + std::to_string(++session_counter);
        }
        emit_json("{\"ok\":true,\"id\":" + std::to_string(id) +
                  ",\"sessionId\":\"" + active_session +
                  "\",\"scenePath\":\"" + json_escape(active_scene) +
                  "\",\"resident\":true}");
      }
      else if (cmd == "update_camera" || cmd == "update_material" ||
               cmd == "update_light" || cmd == "start_render" ||
               cmd == "stop_render") {
        emit_json("{\"ok\":true,\"id\":" + std::to_string(id) +
                  ",\"cmd\":\"" + cmd + "\",\"sessionId\":\"" +
                  json_escape(active_session) + "\"}");
      }
      else if (cmd == "read_frame") {
#if !JEPOW_CYCLES_WITH_LIBCYCLES
        emit_json("{\"ok\":false,\"id\":" + std::to_string(id) +
                  ",\"error\":\"libcycles Session API not linked yet; Electron fallback renderer is active\"}");
#else
        emit_json("{\"ok\":false,\"id\":" + std::to_string(id) +
                  ",\"error\":\"read_frame not implemented\"}");
#endif
      }
      else if (cmd == "shutdown") {
        emit_json("{\"ok\":true,\"id\":" + std::to_string(id) + ",\"cmd\":\"shutdown\"}");
        return 0;
      }
      else {
        emit_json("{\"ok\":false,\"id\":" + std::to_string(id) +
                  ",\"error\":\"unknown command\"}");
      }
    }
    return 0;
  }
  std::fprintf(stderr,
               "Usage: jepow-cycles --version | --stdio\n"
               "GPL-2.0-or-later — https://www.jepow.com (source offer: SOURCE_CODE_OFFER.md)\n");
  return 1;
}
