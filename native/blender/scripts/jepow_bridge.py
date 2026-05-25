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


def _clear_scene() -> None:
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)


def _import_scene_file(scene_path: str) -> None:
    import bpy

    if not os.path.isfile(scene_path):
        raise FileNotFoundError(f"Scene file not found: {scene_path}")

    ext = os.path.splitext(scene_path)[1].lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=scene_path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=scene_path)
    elif ext == ".obj":
        try:
            bpy.ops.wm.obj_import(filepath=scene_path)
        except Exception:
            bpy.ops.import_scene.obj(filepath=scene_path)
    elif ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=scene_path)
    else:
        raise ValueError(f"Unsupported scene extension: {ext}")


def _scene_counts() -> tuple[int, int, int]:
    import bpy

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    tris = 0
    for obj in meshes:
        data = obj.data
        if not data or not hasattr(data, "polygons"):
            continue
        for poly in data.polygons:
            n = len(poly.vertices)
            if n >= 3:
                tris += n - 2
    return len(meshes), len(bpy.data.objects), tris


def _world_bounds():
    import bpy
    from mathutils import Vector

    min_co = Vector((1e9, 1e9, 1e9))
    max_co = Vector((-1e9, -1e9, -1e9))
    found = False
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.data:
            continue
        found = True
        for corner in obj.bound_box:
            wc = obj.matrix_world @ Vector(corner)
            min_co.x = min(min_co.x, wc.x)
            min_co.y = min(min_co.y, wc.y)
            min_co.z = min(min_co.z, wc.z)
            max_co.x = max(max_co.x, wc.x)
            max_co.y = max(max_co.y, wc.y)
            max_co.z = max(max_co.z, wc.z)
    if not found:
        return Vector((0, 0, 0)), Vector((0, 0, 0)), False
    return min_co, max_co, True


def _apply_clay_materials() -> None:
    import bpy

    mat = bpy.data.materials.get("JepowClay")
    if not mat:
        mat = bpy.data.materials.new(name="JepowClay")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        bsdf = nodes.new("ShaderNodeBsdfDiffuse")
        bsdf.inputs["Color"].default_value = (0.82, 0.84, 0.88, 1.0)
        links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if not obj.data.materials:
            obj.data.materials.append(mat)
        else:
            for i in range(len(obj.data.materials)):
                obj.data.materials[i] = mat


def _ensure_camera(yaw: float, pitch: float, distance_scale: float) -> None:
    import bpy
    import math
    from mathutils import Vector

    min_co, max_co, found = _world_bounds()
    center = (min_co + max_co) * 0.5 if found else Vector((0.0, 0.0, 0.0))
    size = (max_co - min_co).length if found else 2.0
    base_dist = max(size * 1.75, 0.5)
    dist = base_dist * (distance_scale / 2.45)

    pitch = max(-1.2, min(1.2, pitch))
    eye = center + Vector(
        (
            dist * math.cos(pitch) * math.sin(yaw),
            dist * math.sin(pitch),
            dist * math.cos(pitch) * math.cos(yaw),
        )
    )

    cam = bpy.data.objects.get("JepowPreviewCamera")
    if not cam:
        cam_data = bpy.data.cameras.new("JepowPreviewCamera")
        cam = bpy.data.objects.new("JepowPreviewCamera", cam_data)
        bpy.context.collection.objects.link(cam)
    cam.location = eye
    direction = center - eye
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam


def cmd_open_scene(payload: dict) -> None:
    scene_path = payload.get("scenePath")
    if not scene_path:
        _emit({"ok": False, "error": "scenePath required"})
        return
    try:
        _clear_scene()
        _import_scene_file(scene_path)
        mesh_count, node_count, tris = _scene_counts()
        ext = os.path.splitext(scene_path)[1].lower().lstrip(".")
        _emit(
            {
                "ok": True,
                "scenePath": scene_path,
                "extension": ext or "fbx",
                "meshCount": mesh_count,
                "nodeCount": node_count,
                "triangleCount": tris,
                "renderer": "blender",
            }
        )
    except Exception as e:
        _emit({"ok": False, "error": str(e), "trace": traceback.format_exc()})


def cmd_render_scene(payload: dict) -> None:
    import bpy

    scene_path = payload.get("scenePath")
    output_path = payload.get("outputPath")
    if not output_path:
        _emit({"ok": False, "error": "outputPath required"})
        return

    try:
        if scene_path:
            _clear_scene()
            _import_scene_file(scene_path)

        _apply_clay_materials()
        _ensure_camera(
            float(payload.get("cameraYaw", 0.55)),
            float(payload.get("cameraPitch", 0.38)),
            float(payload.get("cameraDistance", 2.45)),
        )

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        scene = bpy.context.scene
        engine = _resolve_engine(payload.get("engine", "eevee"))
        try:
            scene.render.engine = engine
        except Exception:
            pass

        width = int(payload.get("width", 640))
        height = int(payload.get("height", 480))
        scene.render.resolution_x = width
        scene.render.resolution_y = height
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.filepath = output_path

        bpy.ops.render.render(write_still=True)

        _emit(
            {
                "ok": True,
                "imagePath": output_path,
                "engine": scene.render.engine,
                "width": width,
                "height": height,
                "renderer": "blender-clay",
            }
        )
    except Exception as e:
        _emit({"ok": False, "error": str(e), "trace": traceback.format_exc()})


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
        "open_scene": cmd_open_scene,
        "render_frame": cmd_render_frame,
        "render_scene": cmd_render_scene,
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
