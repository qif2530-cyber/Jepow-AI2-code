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
from html import escape as _xml_escape


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


def _clamp(value, min_value, max_value, fallback):
    try:
        n = float(value)
    except Exception:
        return fallback
    return max(min_value, min(max_value, n))


def _hex_rgb(value, fallback=(0.8, 0.8, 0.8)):
    if not isinstance(value, str) or len(value) != 7 or not value.startswith("#"):
        return fallback
    try:
        return (
            int(value[1:3], 16) / 255.0,
            int(value[3:5], 16) / 255.0,
            int(value[5:7], 16) / 255.0,
        )
    except Exception:
        return fallback


def _vec3(values) -> str:
    return " ".join(f"{float(v):.6f}" for v in values)


def _principled_bsdf_xml_attrs(p: dict) -> str:
    """Cycles standalone principled_bsdf — 与 shader_nodes.cpp PrincipledBsdfNode SOCKET 一致."""
    base = _vec3(_hex_rgb(p.get("baseColor"), (0.8, 0.8, 0.8)))
    emission = _vec3(_hex_rgb(p.get("emissionColor"), (1.0, 1.0, 1.0)))
    coat_tint = _vec3(_hex_rgb(p.get("coatTint"), (1.0, 1.0, 1.0)))
    sheen_tint = _vec3(_hex_rgb(p.get("sheenTint"), (1.0, 1.0, 1.0)))
    spec_tint_level = _clamp(p.get("specularTint"), 0, 1, 0)
    specular_tint = _vec3((spec_tint_level, spec_tint_level, spec_tint_level))
    distribution = "ggx" if p.get("distribution") == "ggx" else "multi_ggx"
    return " ".join(
        [
            f'distribution="{distribution}"',
            f'base_color="{base}"',
            f'metallic="{_clamp(p.get("metallic"), 0, 1, 0)}"',
            f'roughness="{_clamp(p.get("roughness"), 0, 1, 0.5)}"',
            f'ior="{_clamp(p.get("ior"), 1, 3, 1.5)}"',
            f'alpha="{_clamp(p.get("alpha"), 0, 1, 1)}"',
            f'specular_ior_level="{_clamp(p.get("specularIorLevel"), 0, 1, 0.5)}"',
            f'specular_tint="{specular_tint}"',
            f'anisotropic="{_clamp(p.get("anisotropic"), 0, 1, 0)}"',
            f'anisotropic_rotation="{_clamp(p.get("anisotropicRotation"), 0, 1, 0)}"',
            f'transmission_weight="{_clamp(p.get("transmissionWeight"), 0, 1, 0)}"',
            f'sheen_weight="{_clamp(p.get("sheenWeight"), 0, 1, 0)}"',
            f'sheen_roughness="{_clamp(p.get("sheenRoughness"), 0, 1, 0.5)}"',
            f'sheen_tint="{sheen_tint}"',
            f'coat_weight="{_clamp(p.get("coatWeight"), 0, 1, 0)}"',
            f'coat_roughness="{_clamp(p.get("coatRoughness"), 0, 1, 0.03)}"',
            f'coat_ior="{_clamp(p.get("coatIor"), 1, 3, 1.5)}"',
            f'coat_tint="{coat_tint}"',
            f'emission_color="{emission}"',
            f'emission_strength="{_clamp(p.get("emissionStrength"), 0, 100, 0)}"',
            f'thin_film_thickness="{_clamp(p.get("thinFilmThickness"), 0, 2000, 0)}"',
            f'thin_film_ior="{_clamp(p.get("thinFilmIor"), 1, 3, 1.33)}"',
        ]
    )


def _xml_escape_attr(value: str) -> str:
    return _xml_escape(str(value), quote=True)


def _shader_node_xml_line(node: dict) -> str:
    name = node.get("name", "node")
    ntype = node.get("type", "")
    params = dict(node.get("params") or {})
    if ntype == "principled_bsdf":
        return f'    <principled_bsdf name="{_xml_escape_attr(name)}" {_principled_bsdf_xml_attrs(params)} />'
    parts = [f'name="{_xml_escape_attr(name)}"']
    for key, val in params.items():
        if val is None or val == "":
            continue
        if key in ("type", "version", "engine", "shader", "schemaVersion"):
            continue
        parts.append(f'{key}="{_xml_escape_attr(val)}"')
    return f"    <{ntype} {' '.join(parts)} />"


def _shader_graph_shader_lines(shader_graph: dict | None, material: dict) -> list[str]:
    has_surface = False
    if shader_graph:
        for link in shader_graph.get("links") or []:
            to = link.get("to") or []
            if len(to) == 2 and to[0] == "output" and str(to[1]).lower() == "surface":
                has_surface = True
                break
    if shader_graph and shader_graph.get("nodes") and has_surface:
        lines = ['  <shader name="jepow_material">']
        for node in shader_graph["nodes"]:
            lines.append(_shader_node_xml_line(node))
        for link in shader_graph.get("links") or []:
            fr = link.get("from") or []
            to = link.get("to") or []
            if len(fr) == 2 and len(to) == 2:
                lines.append(
                    f'    <connect from="{_xml_escape_attr(fr[0])} {_xml_escape_attr(fr[1])}" '
                    f'to="{_xml_escape_attr(to[0])} {_xml_escape_attr(to[1])}" />'
                )
        lines.append("  </shader>")
        return lines
    attrs = _principled_bsdf_xml_attrs(material)
    return [
        '  <shader name="jepow_material">',
        f'    <principled_bsdf name="principled" {attrs} />',
        '    <connect from="principled BSDF" to="output surface" />',
        "  </shader>",
    ]


def _cycles_background_block(strength: float, color: str) -> list[str]:
    return [
        "  <background>",
        f'    <background_shader name="jepow_bg" color="{color}" strength="{strength}" />',
        '    <connect from="jepow_bg Background" to="output surface" />',
        "  </background>",
    ]


def _cycles_camera_block(width: int, height: int, fov: float = 0.72, distance: float = 4.2) -> list[str]:
    return [
        f'  <transform matrix="1 0 0 0  0 1 0 0  0 0 1 0  0 0 {distance} 1">',
        f'    <camera width="{width}" height="{height}" type="perspective" fov="{fov}" />',
        "  </transform>",
    ]


def cmd_export_cycles_xml(payload: dict) -> None:
    import bpy
    import math
    from mathutils import Vector

    scene_path = payload.get("scenePath")
    output_path = payload.get("outputPath")
    if not scene_path:
        _emit({"ok": False, "error": "scenePath required"})
        return
    if not output_path:
        _emit({"ok": False, "error": "outputPath required"})
        return

    try:
        _clear_scene()
        _import_scene_file(scene_path)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        mesh_objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        if not mesh_objects:
            _emit({"ok": False, "error": "No mesh objects found"})
            return

        raw_meshes = []
        all_points = []
        triangle_count = 0
        for obj in mesh_objects:
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            try:
                mesh.calc_loop_triangles()
                points = [obj.matrix_world @ v.co for v in mesh.vertices]
                triangles = [
                    tuple(reversed(tuple(int(i) for i in tri.vertices)))
                    for tri in mesh.loop_triangles
                    if len(tri.vertices) == 3
                ]
                if points and triangles:
                    raw_meshes.append((obj.name, points, triangles))
                    all_points.extend(points)
                    triangle_count += len(triangles)
            finally:
                evaluated.to_mesh_clear()

        if not raw_meshes:
            _emit({"ok": False, "error": "No triangle mesh data found"})
            return

        min_co = Vector((min(p.x for p in all_points), min(p.y for p in all_points), min(p.z for p in all_points)))
        max_co = Vector((max(p.x for p in all_points), max(p.y for p in all_points), max(p.z for p in all_points)))
        center = (min_co + max_co) * 0.5
        max_extent = max((max_co - min_co).x, (max_co - min_co).y, (max_co - min_co).z, 0.001)
        scale = 2.0 / max_extent

        cycles_material = payload.get("cyclesMaterial") or payload.get("material") or {}
        material = (cycles_material.get("principled") if isinstance(cycles_material, dict) else {}) or {}
        shader_graph = cycles_material.get("shaderGraph") if isinstance(cycles_material, dict) else None
        light = payload.get("cyclesLight") or {}
        render_settings = payload.get("renderSettings") or {}

        background = _vec3(_hex_rgb(light.get("backgroundColor"), (0.11, 0.12, 0.14)))
        environment_strength = _clamp(light.get("environmentStrength"), 0, 8, 1.2)
        key_strength = _clamp(light.get("keyStrength"), 0, 5000, 800)
        key_size = _clamp(light.get("keySize"), 0.01, 20, 3)
        yaw = math.radians(_clamp(light.get("yaw"), 0, 360, 45))
        pitch = math.radians(_clamp(light.get("pitch"), -85, 85, 35))
        lx = math.cos(pitch) * math.sin(yaw) * 3.2
        ly = math.sin(pitch) * 3.2
        lz = math.cos(pitch) * math.cos(yaw) * 3.2
        bounces = int(_clamp(render_settings.get("bounces"), 1, 64, 8))
        width = int(_clamp(payload.get("width") or render_settings.get("width"), 64, 8192, 768))
        height = int(_clamp(payload.get("height") or render_settings.get("height"), 64, 8192, 512))

        lines = [
            '<?xml version="1.0"?>',
            "<cycles>",
            f'  <integrator use_adaptive_sampling="0" max_bounce="{bounces}" diffuse_bounces="4" glossy_bounces="4" transparent_max_bounce="8" />',
            *_cycles_camera_block(width, height),
            *_cycles_background_block(environment_strength, background),
            *_shader_graph_shader_lines(shader_graph, material),
            f'  <transform translate="{lx:.4f} {ly:.4f} {lz:.4f}">',
            f'    <light light_type="point" strength="{key_strength}" size="{key_size}" />',
            "  </transform>",
        ]

        for name, points, triangles in raw_meshes:
            coords = []
            for p in points:
                n = (p - center) * scale
                coords.extend([n.x, n.z, -n.y])
            p_attr = " ".join(f"{v:.6f}" for v in coords)
            verts_attr = " ".join(" ".join(str(i) for i in tri) for tri in triangles)
            nverts_attr = " ".join("3" for _ in triangles)
            lines.extend(
                [
                    '  <state shader="jepow_material" interpolation="smooth">',
                    f'    <mesh name="{_xml_escape(name, quote=True)}" P="{p_attr}" verts="{verts_attr}" nverts="{nverts_attr}" />',
                    "  </state>",
                ]
            )

        lines.append("</cycles>")
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

        _emit(
            {
                "ok": True,
                "xmlPath": output_path,
                "meshCount": len(raw_meshes),
                "triangleCount": triangle_count,
                "renderer": "cycles-xml-export",
            }
        )
    except Exception as e:
        _emit({"ok": False, "error": str(e), "trace": traceback.format_exc()})


def _rgba_to_hex(rgba) -> str:
    r, g, b = rgba[0], rgba[1], rgba[2]
    return f"#{int(max(0, min(1, r)) * 255):02x}{int(max(0, min(1, g)) * 255):02x}{int(max(0, min(1, b)) * 255):02x}"


def _input_float(node_input, default: float = 0.0) -> float:
    try:
        return float(node_input.default_value)
    except Exception:
        return default


def _input_color_hex(node_input, fallback: str = "#b8b8b8") -> str:
    try:
        val = node_input.default_value
        if hasattr(val, "__len__") and len(val) >= 3:
            return _rgba_to_hex(val)
    except Exception:
        pass
    return fallback


def _scene_bounds_center():
    import bpy
    from mathutils import Vector

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        return Vector((0.0, 0.0, 0.0))
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        try:
            for corner in obj.bound_box:
                world = obj.matrix_world @ Vector(corner)
                mins = Vector((min(mins[i], world[i]) for i in range(3)))
                maxs = Vector((max(maxs[i], world[i]) for i in range(3)))
        except Exception:
            continue
    return (mins + maxs) * 0.5


def _active_camera_object():
    import bpy

    cam = bpy.context.scene.camera
    if cam:
        return cam
    for obj in bpy.data.objects:
        if obj.type == "CAMERA":
            return obj
    return None


def _camera_viewport_params(cam_obj) -> dict:
    import math
    from mathutils import Vector

    center = _scene_bounds_center()
    loc = cam_obj.matrix_world.to_translation()
    delta = loc - center
    dist = max(0.1, float(delta.length))
    dx, dy, dz = float(delta.x), float(delta.y), float(delta.z)
    horiz = math.sqrt(dx * dx + dz * dz)
    pitch = math.degrees(math.atan2(dy, horiz)) if horiz > 1e-6 else 0.0
    yaw = math.degrees(math.atan2(dx, dz))
    cam_data = cam_obj.data
    fov = math.pi / 4
    if cam_data and cam_data.type == "PERSP":
        try:
            fov = float(cam_data.angle_y)
        except Exception:
            try:
                fov = float(cam_data.angle)
            except Exception:
                pass
    return {
        "yaw": yaw,
        "pitch": pitch,
        "distance": dist,
        "panX": 0.0,
        "panY": 0.0,
        "fov": fov,
    }


def _extract_cycles_camera(cam_obj) -> dict:
    import math

    cam_data = cam_obj.data if cam_obj else None
    fov = math.pi / 4
    cam_type = "perspective"
    aperturesize = 0.0
    focaldistance = 10.0
    if cam_data:
        cam_type = "perspective" if cam_data.type == "PERSP" else "orthographic"
        try:
            fov = float(cam_data.angle_y)
        except Exception:
            try:
                fov = float(cam_data.angle)
            except Exception:
                pass
        if getattr(cam_data, "dof", None):
            try:
                aperturesize = float(cam_data.dof.aperture_fstop)
            except Exception:
                pass
            try:
                focaldistance = float(cam_data.dof.focus_distance)
            except Exception:
                pass
    return {
        "type": cam_type,
        "fov": fov,
        "aperturesize": aperturesize,
        "focaldistance": focaldistance,
        "blades": 0,
        "bladesrotation": 0,
        "nearclip": 0.00001,
        "farclip": 100000,
    }


def _extract_principled_material() -> dict:
    import bpy

    for mat in bpy.data.materials:
        if not mat or not getattr(mat, "use_nodes", False) or not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            inp = node.inputs
            base = inp.get("Base Color")
            return {
                "materialName": mat.name,
                "tint": _input_color_hex(base) if base else "#b8b8b8",
                "roughness": _input_float(inp.get("Roughness"), 0.5),
                "metalness": _input_float(inp.get("Metallic"), 0.0),
                "specular": _input_float(inp.get("Specular IOR Level", inp.get("Specular")), 0.5),
                "transmission": _input_float(inp.get("Transmission Weight", inp.get("Transmission")), 0.0),
                "ior": _input_float(inp.get("IOR"), 1.5),
                "clearcoat": _input_float(inp.get("Coat Weight", inp.get("Clearcoat")), 0.0),
                "emissionStrength": _input_float(
                    inp.get("Emission Strength", inp.get("Emission")),
                    0.0,
                ),
                "alpha": _input_float(inp.get("Alpha"), 1.0),
            }
    return {}


def _extract_light_rig() -> dict:
    import bpy
    import math

    env_strength = 0.75
    bg_color = "#08090a"
    key_strength = 650.0
    key_size = 3.0
    key_yaw = 45.0
    key_pitch = 35.0

    world = bpy.context.scene.world
    if world and getattr(world, "use_nodes", False) and world.node_tree:
        for node in world.node_tree.nodes:
            if node.type != "BACKGROUND":
                continue
            strength_in = node.inputs.get("Strength") or node.inputs.get("强度")
            color_in = node.inputs.get("Color") or node.inputs.get("颜色")
            if strength_in:
                env_strength = _input_float(strength_in, env_strength)
            if color_in:
                bg_color = _input_color_hex(color_in, bg_color)
            break

    for obj in bpy.data.objects:
        if obj.type != "LIGHT":
            continue
        ld = obj.data
        energy = float(getattr(ld, "energy", 1.0))
        if ld.type == "SUN":
            key_strength = max(50.0, energy * 120.0)
        elif ld.type == "AREA":
            key_strength = max(50.0, energy * 80.0)
            key_size = float(getattr(ld, "size", key_size))
        else:
            key_strength = max(50.0, energy * 100.0)
        rot = obj.matrix_world.to_euler("XYZ")
        key_yaw = math.degrees(rot.z)
        key_pitch = math.degrees(rot.x)
        break

    return {
        "environmentStrength": env_strength,
        "keyStrength": key_strength,
        "keySize": key_size,
        "yaw": key_yaw,
        "pitch": key_pitch,
        "backgroundColor": bg_color,
    }


def _extract_render_settings(scene) -> dict:
    samples = 128
    device = "CPU"
    if scene.render.engine == "CYCLES" and hasattr(scene, "cycles"):
        samples = int(getattr(scene.cycles, "samples", samples))
        try:
            device = str(scene.cycles.device)
        except Exception:
            pass
    return {
        "type": "cycles_render_settings",
        "samples": samples,
        "bounces": int(getattr(scene.cycles, "max_bounces", 8)) if hasattr(scene, "cycles") else 8,
        "width": int(scene.render.resolution_x),
        "height": int(scene.render.resolution_y),
        "device": device,
        "denoise": bool(getattr(scene.cycles, "use_denoising", True)) if hasattr(scene, "cycles") else True,
    }


def cmd_import_blend_project(payload: dict) -> None:
    import bpy
    import math

    blend_path = payload.get("blendPath")
    output_glb = payload.get("outputGlbPath") or payload.get("outputPath")
    if not blend_path:
        _emit({"ok": False, "error": "blendPath required"})
        return
    if not os.path.isfile(blend_path):
        _emit({"ok": False, "error": f"Blend file not found: {blend_path}"})
        return
    if not output_glb:
        _emit({"ok": False, "error": "outputGlbPath required"})
        return

    bpy.ops.wm.open_mainfile(filepath=blend_path)
    os.makedirs(os.path.dirname(os.path.abspath(output_glb)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output_glb,
        export_format="GLB",
        export_apply=True,
    )

    scene = bpy.context.scene
    principled = _extract_principled_material()
    light_rig = _extract_light_rig()
    cam_obj = _active_camera_object()
    viewport_cam = _camera_viewport_params(cam_obj) if cam_obj else {
        "yaw": 45.0,
        "pitch": 35.0,
        "distance": 2.45,
        "panX": 0.0,
        "panY": 0.0,
        "fov": math.pi / 4,
    }
    cycles_cam = _extract_cycles_camera(cam_obj) if cam_obj else {
        "type": "perspective",
        "fov": math.pi / 4,
        "aperturesize": 0,
        "focaldistance": 10,
        "blades": 0,
        "bladesrotation": 0,
        "nearclip": 0.00001,
        "farclip": 100000,
    }
    render_settings = _extract_render_settings(scene)

    _emit(
        {
            "ok": True,
            "blendPath": blend_path,
            "glbPath": output_glb,
            "sceneName": scene.name,
            "blendFileName": os.path.basename(blend_path),
            "principled": principled,
            "cyclesLight": {"type": "cycles_light_rig", **light_rig},
            "cyclesCamera": cycles_cam,
            "viewportCamera": viewport_cam,
            "cyclesRenderSettings": render_settings,
            "renderEngine": scene.render.engine,
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
        "open_scene": cmd_open_scene,
        "render_frame": cmd_render_frame,
        "render_scene": cmd_render_scene,
        "export_cycles_xml": cmd_export_cycles_xml,
        "export_glb": cmd_export_glb,
        "import_blend_project": cmd_import_blend_project,
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
