use anyhow::{Context, Result};
use glam::{Mat4, Quat, Vec3, Vec4, EulerRot};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::mesh_loader::{load_fbx_node_mesh, load_gltf_node_mesh, load_meshes, MeshData};
use crate::render::{camera_mvp, ViewCamera};
use crate::scene::{list_scene_objects, SceneObjectEntry};
use crate::viewport_session::{scene_fit_matrix, ObjectTransform};

#[derive(Clone)]
struct BoundsEntry {
    id: String,
    local_min: Vec3,
    local_max: Vec3,
}

struct PickSceneCache {
    path: PathBuf,
    stamp: String,
    fit: Mat4,
    objects: Vec<BoundsEntry>,
}

static PICK_CACHE: Mutex<Option<PickSceneCache>> = Mutex::new(None);

fn file_stamp(path: &str) -> String {
    let metadata = std::fs::metadata(path).ok();
    let modified = metadata
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let len = metadata.map(|m| m.len()).unwrap_or(0);
    format!("{modified}:{len}")
}

fn model_matrix(transform: &ObjectTransform, scene_fit: Mat4) -> Mat4 {
    let scale = if transform.scale > 0.01 {
        transform.scale
    } else {
        1.0
    };
    let rot = Quat::from_euler(
        EulerRot::XYZ,
        transform.rx.to_radians(),
        transform.ry.to_radians(),
        transform.rz.to_radians(),
    );
    Mat4::from_scale_rotation_translation(Vec3::splat(scale), rot, Vec3::new(transform.x, transform.y, transform.z))
        * scene_fit
}

fn ray_from_cursor(
    width: u32,
    height: u32,
    camera: ViewCamera,
    cursor_x: f32,
    cursor_y: f32,
) -> (Vec3, Vec3) {
    let w = width.max(1) as f32;
    let h = height.max(1) as f32;
    let ndc_x = (cursor_x / w) * 2.0 - 1.0;
    let ndc_y = 1.0 - (cursor_y / h) * 2.0;
    let vp = camera_mvp(width, height, camera);
    let inv_vp = vp.inverse();
    let near = inv_vp * Vec4::new(ndc_x, ndc_y, -1.0, 1.0);
    let far = inv_vp * Vec4::new(ndc_x, ndc_y, 1.0, 1.0);
    let origin = (near.truncate() / near.w).to_array();
    let ray_far = far.truncate() / far.w;
    let dir = (ray_far - Vec3::from_array(origin)).normalize_or_zero();
    (Vec3::from_array(origin), dir)
}

fn mesh_local_bounds(mesh: &MeshData) -> Option<(Vec3, Vec3)> {
    if mesh.vertices.is_empty() {
        return None;
    }
    let mut min = Vec3::splat(f32::MAX);
    let mut max = Vec3::splat(f32::MIN);
    for v in &mesh.vertices {
        let p = Vec3::new(v.pos[0], v.pos[1], v.pos[2]);
        min = min.min(p);
        max = max.max(p);
    }
    Some((min, max))
}

fn transform_bounds(min: Vec3, max: Vec3, model: Mat4) -> (Vec3, Vec3) {
    let corners = [
        Vec3::new(min.x, min.y, min.z),
        Vec3::new(min.x, min.y, max.z),
        Vec3::new(min.x, max.y, min.z),
        Vec3::new(min.x, max.y, max.z),
        Vec3::new(max.x, min.y, min.z),
        Vec3::new(max.x, min.y, max.z),
        Vec3::new(max.x, max.y, min.z),
        Vec3::new(max.x, max.y, max.z),
    ];
    let mut out_min = Vec3::splat(f32::MAX);
    let mut out_max = Vec3::splat(f32::MIN);
    for corner in corners {
        let p = model.transform_point3(corner);
        out_min = out_min.min(p);
        out_max = out_max.max(p);
    }
    (out_min, out_max)
}

fn ray_aabb_hit(origin: Vec3, direction: Vec3, min: Vec3, max: Vec3) -> Option<f32> {
    let mut tmin = f32::NEG_INFINITY;
    let mut tmax = f32::INFINITY;
    for i in 0..3 {
        let o = origin[i];
        let d = direction[i];
        if d.abs() < f32::EPSILON {
            if o < min[i] || o > max[i] {
                return None;
            }
            continue;
        }
        let inv = 1.0 / d;
        let mut t1 = (min[i] - o) * inv;
        let mut t2 = (max[i] - o) * inv;
        if t1 > t2 {
            std::mem::swap(&mut t1, &mut t2);
        }
        tmin = tmin.max(t1);
        tmax = tmax.min(t2);
        if tmax < tmin {
            return None;
        }
    }
    if tmax < 0.0 {
        return None;
    }
    let t = if tmin >= 0.0 { tmin } else { tmax };
    (t.is_finite() && t >= 0.0).then_some(t)
}

fn ray_triangle(
    origin: Vec3,
    direction: Vec3,
    v0: Vec3,
    v1: Vec3,
    v2: Vec3,
) -> Option<f32> {
    const EPS: f32 = 1e-7;
    let edge1 = v1 - v0;
    let edge2 = v2 - v0;
    let pvec = direction.cross(edge2);
    let det = edge1.dot(pvec);
    if det.abs() < EPS {
        return None;
    }
    let inv_det = 1.0 / det;
    let tvec = origin - v0;
    let u = tvec.dot(pvec) * inv_det;
    if !(0.0..=1.0).contains(&u) {
        return None;
    }
    let qvec = tvec.cross(edge1);
    let v = direction.dot(qvec) * inv_det;
    if v < 0.0 || u + v > 1.0 {
        return None;
    }
    let t = edge2.dot(qvec) * inv_det;
    (t > EPS).then_some(t)
}

fn raycast_mesh_triangles(
    origin: Vec3,
    direction: Vec3,
    model: Mat4,
    mesh: &MeshData,
) -> Option<f32> {
    let mut best: Option<f32> = None;
    let verts = &mesh.vertices;
    let idx = &mesh.indices;
    let mut i = 0;
    while i + 2 < idx.len() {
        let v0 = model.transform_point3(Vec3::new(
            verts[idx[i] as usize].pos[0],
            verts[idx[i] as usize].pos[1],
            verts[idx[i] as usize].pos[2],
        ));
        let v1 = model.transform_point3(Vec3::new(
            verts[idx[i + 1] as usize].pos[0],
            verts[idx[i + 1] as usize].pos[1],
            verts[idx[i + 1] as usize].pos[2],
        ));
        let v2 = model.transform_point3(Vec3::new(
            verts[idx[i + 2] as usize].pos[0],
            verts[idx[i + 2] as usize].pos[1],
            verts[idx[i + 2] as usize].pos[2],
        ));
        if let Some(t) = ray_triangle(origin, direction, v0, v1, v2) {
            if best.map(|b| t < b).unwrap_or(true) {
                best = Some(t);
            }
        }
        i += 3;
    }
    best
}

fn fbx_load_opts() -> ufbx::LoadOpts<'static> {
    ufbx::LoadOpts {
        target_axes: ufbx::CoordinateAxes::right_handed_y_up(),
        target_unit_meters: 1.0,
        space_conversion: ufbx::SpaceConversion::ModifyGeometry,
        geometry_transform_handling: ufbx::GeometryTransformHandling::ModifyGeometry,
        generate_missing_normals: true,
        ..Default::default()
    }
}

fn fbx_mesh_bounds(mesh: &ufbx::Mesh, world: &ufbx::Matrix) -> Option<(Vec3, Vec3)> {
    let pos_el = &mesh.vertex_position;
    if pos_el.indices.is_empty() {
        return None;
    }
    let mut min = Vec3::splat(f32::MAX);
    let mut max = Vec3::splat(f32::MIN);
    for corner in 0..pos_el.indices.len() {
        let p = ufbx::transform_position(world, pos_el[corner]);
        let v = Vec3::new(p.x as f32, p.y as f32, p.z as f32);
        min = min.min(v);
        max = max.max(v);
    }
    Some((min, max))
}

fn collect_fbx_bounds(path: &str, pickable: &[SceneObjectEntry]) -> Result<Vec<BoundsEntry>> {
    let scene = ufbx::load_file(path, fbx_load_opts())
        .map_err(|e| anyhow::anyhow!("fbx load: {:?}", e))?;
    let pick_ids: std::collections::HashSet<String> =
        pickable.iter().map(|e| e.id.clone()).collect();
    let mut out = Vec::new();
    for node in &scene.nodes {
        if node.is_geometry_transform_helper || node.is_scale_helper {
            continue;
        }
        let id = format!("fbx-{}", node.element.element_id);
        if !pick_ids.contains(&id) {
            continue;
        }
        let Some(mesh) = node.mesh.as_ref() else {
            continue;
        };
        let Some((local_min, local_max)) = fbx_mesh_bounds(mesh, &node.geometry_to_world) else {
            continue;
        };
        out.push(BoundsEntry {
            id,
            local_min,
            local_max,
        });
    }
    Ok(out)
}

fn gltf_local_matrix(node: gltf::Node<'_>) -> Mat4 {
    match node.transform() {
        gltf::scene::Transform::Decomposed {
            translation,
            rotation,
            scale,
        } => {
            let t = Vec3::from(translation);
            let r = Quat::from_xyzw(rotation[0], rotation[1], rotation[2], rotation[3]);
            let s = Vec3::from(scale);
            Mat4::from_scale_rotation_translation(s, r, t)
        }
        gltf::scene::Transform::Matrix { matrix } => Mat4::from_cols(
            glam::Vec4::from(matrix[0]),
            glam::Vec4::from(matrix[1]),
            glam::Vec4::from(matrix[2]),
            glam::Vec4::from(matrix[3]),
        ),
    }
}

fn collect_gltf_bounds(path: &str, pickable: &[SceneObjectEntry]) -> Result<Vec<BoundsEntry>> {
    let (doc, buffers, _) = gltf::import(path).with_context(|| format!("gltf import: {}", path))?;
    let mut parent_of: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
    for (idx, node) in doc.nodes().enumerate() {
        for child in node.children() {
            parent_of.insert(child.index(), idx);
        }
    }
    let mut world_cache: std::collections::HashMap<usize, Mat4> = std::collections::HashMap::new();
    let world_for = |idx: usize,
                     world_cache: &mut std::collections::HashMap<usize, Mat4>|
     -> Mat4 {
        if let Some(m) = world_cache.get(&idx) {
            return *m;
        }
        let mut chain = vec![idx];
        let mut cur = idx;
        while let Some(&p) = parent_of.get(&cur) {
            chain.push(p);
            cur = p;
        }
        chain.reverse();
        let mut world = Mat4::IDENTITY;
        for i in chain {
            let n = doc.nodes().nth(i).unwrap();
            world = world * gltf_local_matrix(n);
        }
        world_cache.insert(idx, world);
        world
    };

    let mut out = Vec::new();
    for entry in pickable {
        let Some(raw) = entry.id.strip_prefix("gltf-node-") else {
            continue;
        };
        let Ok(node_index) = raw.parse::<usize>() else {
            continue;
        };
        let Some(node) = doc.nodes().nth(node_index) else {
            continue;
        };
        let Some(mesh) = node.mesh() else {
            continue;
        };
        let world = world_for(node_index, &mut world_cache);
        let mut min = Vec3::splat(f32::MAX);
        let mut max = Vec3::splat(f32::MIN);
        let mut any = false;
        for prim in mesh.primitives() {
            if prim.mode() != gltf::mesh::Mode::Triangles {
                continue;
            }
            let reader = prim.reader(|buf| buffers.get(buf.index()).map(|data| data.0.as_slice()));
            let Some(positions) = reader.read_positions() else {
                continue;
            };
            for p in positions {
                let wp = world.transform_point3(Vec3::from(p));
                min = min.min(wp);
                max = max.max(wp);
                any = true;
            }
        }
        if any {
            out.push(BoundsEntry {
                id: entry.id.clone(),
                local_min: min,
                local_max: max,
            });
        }
    }
    Ok(out)
}

fn pickable_objects(entries: Vec<SceneObjectEntry>) -> Vec<SceneObjectEntry> {
    entries
        .into_iter()
        .filter(|e| e.object_kind == "mesh" && e.triangle_count.unwrap_or(0) > 0)
        .collect()
}

fn collect_scene_bounds(path: &str) -> Result<Vec<BoundsEntry>> {
    let pickable = pickable_objects(list_scene_objects(path)?);
    if pickable.is_empty() {
        return Ok(Vec::new());
    }
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "fbx" => collect_fbx_bounds(path, &pickable),
        "glb" | "gltf" => collect_gltf_bounds(path, &pickable),
        _ => {
            let mesh = load_meshes(path)?;
            let Some((local_min, local_max)) = mesh_local_bounds(&mesh) else {
                return Ok(Vec::new());
            };
            Ok(vec![BoundsEntry {
                id: "mesh-0".to_string(),
                local_min,
                local_max,
            }])
        }
    }
}

fn mesh_for_object_id(path: &str, object_id: &str) -> Result<MeshData> {
    if let Some(raw) = object_id.strip_prefix("fbx-") {
        if let Ok(element_id) = raw.parse::<u32>() {
            return load_fbx_node_mesh(path, element_id);
        }
    }
    if let Some(raw) = object_id.strip_prefix("gltf-node-") {
        if let Ok(node_index) = raw.parse::<usize>() {
            return load_gltf_node_mesh(path, node_index);
        }
    }
    if object_id == "mesh-0" {
        return load_meshes(path);
    }
    anyhow::bail!("unsupported pick id: {}", object_id)
}

fn fit_matrix_from_bounds(objects: &[BoundsEntry]) -> Mat4 {
    if objects.is_empty() {
        return Mat4::IDENTITY;
    }
    let mut min = Vec3::splat(f32::MAX);
    let mut max = Vec3::splat(f32::MIN);
    for obj in objects {
        min = min.min(obj.local_min);
        max = max.max(obj.local_max);
    }
    let center = (min + max) * 0.5;
    let size = max - min;
    let max_dim = size.x.max(size.y).max(size.z).max(1e-6);
    let scale = 1.6 / max_dim;
    Mat4::from_scale(Vec3::splat(scale)) * Mat4::from_translation(-center)
}

fn build_pick_cache(path: &str) -> Result<PickSceneCache> {
    let objects = collect_scene_bounds(path)?;
    let fit = if objects.is_empty() {
        let full_mesh = load_meshes(path)?;
        scene_fit_matrix(&full_mesh)
    } else {
        fit_matrix_from_bounds(&objects)
    };
    Ok(PickSceneCache {
        path: PathBuf::from(path),
        stamp: file_stamp(path),
        fit,
        objects,
    })
}

fn ensure_pick_cache(path: &str) -> Result<()> {
    let stamp = file_stamp(path);
    let mut guard = PICK_CACHE
        .lock()
        .map_err(|_| anyhow::anyhow!("pick cache lock"))?;
    let needs_rebuild = guard
        .as_ref()
        .map(|c| c.path.as_os_str() != Path::new(path).as_os_str() || c.stamp != stamp)
        .unwrap_or(true);
    if needs_rebuild {
        *guard = Some(build_pick_cache(path)?);
    }
    Ok(())
}

/// Pre-build bounds cache after scene import (call from UI when model loads).
pub fn warm_pick_cache(path: &str) -> Result<()> {
    ensure_pick_cache(path)
}

pub fn pick_scene_object(
    path: &str,
    cursor_x: f32,
    cursor_y: f32,
    width: u32,
    height: u32,
    camera: ViewCamera,
    transform: ObjectTransform,
) -> Result<Option<String>> {
    if !Path::new(path).exists() {
        anyhow::bail!("scene file not found: {}", path);
    }
    ensure_pick_cache(path)?;
    let guard = PICK_CACHE
        .lock()
        .map_err(|_| anyhow::anyhow!("pick cache lock"))?;
    let cache = guard
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("pick cache unavailable"))?;
    let model = model_matrix(&transform, cache.fit);
    let (origin, direction) = ray_from_cursor(width, height, camera, cursor_x, cursor_y);
    if direction.length_squared() <= f32::EPSILON {
        return Ok(None);
    }

    let mut aabb_hits: Vec<(f32, String)> = Vec::new();
    for obj in &cache.objects {
        let (wmin, wmax) = transform_bounds(obj.local_min, obj.local_max, model);
        if let Some(t) = ray_aabb_hit(origin, direction, wmin, wmax) {
            aabb_hits.push((t, obj.id.clone()));
        }
    }
    aabb_hits.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let Some((_, best_id)) = aabb_hits.first() else {
        return Ok(None);
    };

    // 只对最近候选做一次三角面精检（单个子网格），避免全场景三角遍历
    if let Ok(mesh) = mesh_for_object_id(path, best_id) {
        if let Some(_t) = raycast_mesh_triangles(origin, direction, model, &mesh) {
            return Ok(Some(best_id.clone()));
        }
    }
    // AABB 命中即返回（大场景足够用于大纲选中）
    Ok(Some(best_id.clone()))
}
