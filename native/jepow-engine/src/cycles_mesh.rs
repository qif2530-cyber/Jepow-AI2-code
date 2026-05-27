use anyhow::Result;
use serde_json::json;
use std::collections::HashMap;

use crate::mesh_loader::{self, MeshData, Vertex};

/// Cycles standalone 稳定三角面目标（过大易出黑场/空 buffer）。
const TARGET_CYCLES_TRIANGLES: usize = 120_000;
const HARD_MAX_CYCLES_TRIANGLES: usize = 500_000;

fn bbox_extent(mesh: &MeshData) -> f32 {
    let mut min = [f32::MAX; 3];
    let mut max = [f32::MIN; 3];
    for v in &mesh.vertices {
        for i in 0..3 {
            min[i] = min[i].min(v.pos[i]);
            max[i] = max[i].max(v.pos[i]);
        }
    }
    let dx = max[0] - min[0];
    let dy = max[1] - min[1];
    let dz = max[2] - min[2];
    (dx * dx + dy * dy + dz * dz).sqrt().max(1e-4)
}

/// 按世界空间容差焊接（FBX 硬边会拆成大量同位置不同索引角点）。
fn weld_mesh_eps(mesh: &MeshData, eps: f32) -> MeshData {
    let eps = eps.max(1e-9);
    let mut index_map: HashMap<(i64, i64, i64), u32> = HashMap::new();
    let mut vertices: Vec<Vertex> = Vec::new();
    let mut indices: Vec<u32> = Vec::with_capacity(mesh.indices.len());

    let quant = |v: f32| -> i64 { (f64::from(v / eps)).round() as i64 };

    for tri in mesh.indices.chunks_exact(3) {
        let mut out = [0u32; 3];
        for (slot, &vi) in tri.iter().enumerate() {
            let Some(v) = mesh.vertices.get(vi as usize) else {
                out[slot] = 0;
                continue;
            };
            let key = (quant(v.pos[0]), quant(v.pos[1]), quant(v.pos[2]));
            let idx = *index_map.entry(key).or_insert_with(|| {
                let idx = vertices.len() as u32;
                vertices.push(v.clone());
                idx
            });
            out[slot] = idx;
        }
        if out[0] != out[1] && out[1] != out[2] && out[0] != out[2] {
            indices.extend_from_slice(&out);
        }
    }

    MeshData { vertices, indices }
}

/// 均匀抽稀三角面（按步长取样，避免连续区块被整块删掉）。
fn decimate_to_target(mesh: &mut MeshData, target_tris: usize) {
    let tri_count = mesh.indices.len() / 3;
    if tri_count <= target_tris {
        return;
    }
    let step = ((tri_count + target_tris - 1) / target_tris).max(2);
    let mut new_indices = Vec::with_capacity(target_tris * 3);
    let mut t = 0;
    while t < tri_count {
        new_indices.extend_from_slice(&mesh.indices[t * 3..t * 3 + 3]);
        t += step;
    }
    mesh.indices = new_indices;
}

fn prepare_mesh_for_cycles(mesh: MeshData) -> (MeshData, f32, bool) {
    let extent = bbox_extent(&mesh);
    let eps_factors = [1e-6_f32, 1e-5, 1e-4, 1e-3, 5e-3, 1e-2, 2e-2, 5e-2];
    let mut best = weld_mesh_eps(&mesh, extent * eps_factors[0]);
    let mut used_eps = extent * eps_factors[0];

    for &factor in &eps_factors[1..] {
        let eps = extent * factor;
        let candidate = weld_mesh_eps(&mesh, eps);
        let tri = candidate.indices.len() / 3;
        if tri < best.indices.len() / 3 || best.indices.len() / 3 > TARGET_CYCLES_TRIANGLES {
            best = candidate;
            used_eps = eps;
        }
        if tri <= TARGET_CYCLES_TRIANGLES {
            break;
        }
    }

    let mut decimated = false;
    if best.indices.len() / 3 > TARGET_CYCLES_TRIANGLES {
        decimate_to_target(&mut best, TARGET_CYCLES_TRIANGLES);
        decimated = true;
    }

    (best, used_eps, decimated)
}

/// Normalized mesh payload for Cycles Standalone XML.
pub fn mesh_for_cycles(scene_path: &str) -> Result<serde_json::Value> {
    let raw = mesh_loader::load_meshes(scene_path)?;
    let raw_tris = raw.indices.len() / 3;
    let (prepared, weld_eps, welded_decimated) = prepare_mesh_for_cycles(raw);
    let vertex_count = prepared.vertices.len();
    let triangle_count = prepared.indices.len() / 3;
    let decimated = welded_decimated || raw_tris > triangle_count;

    if prepared.vertices.is_empty() || triangle_count == 0 {
        anyhow::bail!("no renderable triangles in {}", scene_path);
    }

    if triangle_count > HARD_MAX_CYCLES_TRIANGLES {
        anyhow::bail!(
            "too many triangles for Cycles export: {} (max {}). Simplify the mesh in your DCC.",
            triangle_count,
            HARD_MAX_CYCLES_TRIANGLES
        );
    }

    let mut min = [f32::MAX; 3];
    let mut max = [f32::MIN; 3];
    for v in &prepared.vertices {
        for i in 0..3 {
            min[i] = min[i].min(v.pos[i]);
            max[i] = max[i].max(v.pos[i]);
        }
    }
    let center = [
        (min[0] + max[0]) * 0.5,
        (min[1] + max[1]) * 0.5,
        (min[2] + max[2]) * 0.5,
    ];
    let extent = (max[0] - min[0])
        .max(max[1] - min[1])
        .max(max[2] - min[2])
        .max(0.001);
    let scale = 1.6 / extent;

    let mut coords: Vec<f32> = Vec::with_capacity(prepared.vertices.len() * 3);
    for v in &prepared.vertices {
        let n = [
            (v.pos[0] - center[0]) * scale,
            (v.pos[1] - center[1]) * scale,
            (v.pos[2] - center[2]) * scale,
        ];
        coords.push(n[0]);
        coords.push(n[1]);
        coords.push(n[2]);
    }

    let mut verts: Vec<u32> = Vec::with_capacity(triangle_count * 3);
    for tri in prepared.indices.chunks_exact(3) {
        verts.push(tri[0]);
        verts.push(tri[1]);
        verts.push(tri[2]);
    }

    let camera_distance = (extent * scale * 0.85 + 2.8).max(3.5);

    Ok(json!({
        "coords": coords,
        "verts": verts,
        "vertexCount": vertex_count,
        "triangleCount": triangle_count,
        "rawTriangleCount": raw_tris,
        "welded": true,
        "decimated": decimated,
        "weldEpsilon": weld_eps,
        "cameraDistance": camera_distance,
    }))
}
