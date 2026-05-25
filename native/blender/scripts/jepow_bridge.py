"""
Jepow ↔ Blender headless bridge.
Invoked as:
  blender --background --python jepow_bridge.py -- <command> '<json_args>'

Stdout: single JSON line (last line). Stderr: logs only.
Does not touch Jepow AI / LLM APIs.
"""
from __future__ import annotations

import json
import os
import sys
import traceback


def _emit(obj: dict) -> None:
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def _args() -> tuple[str, dict]:
    if "--" not in sys.argv:
        return "ping", {}
    rest = sys.argv[sys.argv.index("--") + 1 :]
    cmd = rest[0] if rest else "ping"
    payload: dict = {}
    if len(rest) > 1:
        try:
            payload = json.loads(rest[1])
        except json.JSONDecodeError:
            payload = {}
    return cmd, payload


def _resolve_engine(name: str) -> str:
    import bpy

    aliases = {
        "eevee": "BLENDER_EEVEE",
        "eevee_next": "BLENDER_EEVEE_NEXT",
        "cycles": "CYCLES",
        "workbench": "BLENDER_WORKBENCH",
    }
    key = (name or "eevee").lower().replace("-", "_")
    target = aliases.get(key, name.upper() if name else "BLENDER_EEVEE")
    candidates = [target, "BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "CYCLES", "BLENDER_WORKBENCH"]
    seen = set()
    for eng in candidates:
        if eng in seen:
            continue
        seen.add(eng)
        try:
            bpy.context.scene.render.engine = eng
            return eng
        except Exception:
            continue
    return bpy.context.scene.render.engine


def cmd_ping(_: dict) -> None:
    import bpy

    _emit(
        {
            "ok": True,
            "blender_version": bpy.app.version_string,
            "executable": bpy.app.binary_path,
        }
    )


def cmd_scene_info(payload: dict) -> None:
    import bpy

    blend_path = payload.get("blendPath")
    if blend_path:
        if not os.path.isfile(blend_path):
            _emit({"ok": False, "error": f"Blend file not found: {blend_path}"})
            return
        bpy.ops.wm.open_mainfile(filepath=blend_path)

    objects = list(bpy.data.objects)
    meshes = [o for o in objects if o.type == "MESH"]
    lights = [o for o in objects if o.type == "LIGHT"]
    cameras = [o for o in objects if o.type == "CAMERA"]

    _emit(
        {
            "ok": True,
            "scene": bpy.context.scene.name,
            "objectCount": len(objects),
            "meshCount": len(meshes),
            "lightCount": len(lights),
            "cameraCount": len(cameras),
            "frameStart": bpy.context.scene.frame_start,
            "frameEnd": bpy.context.scene.frame_end,
            "renderEngine": bpy.context.scene.render.engine,
        }
    )


def cmd_open_blend(payload: dict) -> None:
    cmd_scene_info(payload)


def cmd_render_frame(payload: dict) -> None:
    import bpy

    blend_path = payload.get("blendPath")
    output_path = payload.get("outputPath")
    if not output_path:
        _emit({"ok": False, "error": "outputPath required"})
        return

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    if blend_path:
        if not os.path.isfile(blend_path):
            _emit({"ok": False, "error": f"Blend file not found: {blend_path}"})
            return
        bpy.ops.wm.open_mainfile(filepath=blend_path)

    scene = bpy.context.scene
    engine = _resolve_engine(payload.get("engine", "eevee"))
    try:
        scene.render.engine = engine
    except Exception:
        pass

    if engine == "CYCLES" and hasattr(scene, "cycles"):
        scene.cycles.samples = int(payload.get("samples", 16))
        if payload.get("useGpu", True) and hasattr(scene.cycles, "device"):
            try:
                scene.cycles.device = "GPU"
            except Exception:
                pass

    width = int(payload.get("width", 640))
    height = int(payload.get("height", 480))
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output_path

    frame = int(payload.get("frame", scene.frame_current))
    scene.frame_set(frame)

    bpy.ops.render.render(write_still=True)

    _emit(
        {
            "ok": True,
            "imagePath": output_path,
            "engine": scene.render.engine,
            "width": width,
            "height": height,
            "frame": frame,
        }
    )


def cmd_export_glb(payload: dict) -> None:
    import bpy

    blend_path = payload.get("blendPath")
    output_path = payload.get("outputPath")
    if not output_path:
        _emit({"ok": False, "error": "outputPath required"})
        return

    if blend_path:
        if not os.path.isfile(blend_path):
            _emit({"ok": False, "error": f"Blend file not found: {blend_path}"})
            return
        bpy.ops.wm.open_mainfile(filepath=blend_path)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_apply=True,
    )

    _emit({"ok": True, "glbPath": output_path})


def main() -> None:
    cmd, payload = _args()
    handlers = {
        "ping": cmd_ping,
        "scene_info": cmd_scene_info,
        "open_blend": cmd_open_blend,
        "render_frame": cmd_render_frame,
        "export_glb": cmd_export_glb,
    }
    fn = handlers.get(cmd)
    if not fn:
        _emit({"ok": False, "error": f"Unknown command: {cmd}"})
        return
    try:
        fn(payload)
    except Exception as e:
        _emit(
            {
                "ok": False,
                "error": str(e),
                "trace": traceback.format_exc(),
            }
        )


if __name__ == "__main__":
    main()
