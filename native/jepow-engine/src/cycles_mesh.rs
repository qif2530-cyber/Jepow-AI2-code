use anyhow::Result;
use serde_json::json;
use std::path::Path;

use crate::mesh_loader::{self, MeshData};

const VIEWPORT_NORMALIZED_EXTENT: f32 = 1.6;

fn normalize_vec3(v: [f32; 3]) -> [f32; 3] {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if len > 1e-8 {
        [v[0] / len, v[1] / len, v[2] / len]
    } else {
        [0.0, 1.0, 0.0]
    }
}

fn scene_fit_matrix(coords: &[f32]) -> (usize, f32, [f32; 16]) {
    let mut min = [f32::MAX; 3];
    let mut max = [f32::MIN; 3];
    for p in coords.chunks_exact(3) {
        for i in 0..3 {
            min[i] = min[i].min(p[i]);
            max[i] = max[i].max(p[i]);
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
    let scale = VIEWPORT_NORMALIZED_EXTENT / extent;
    let matrix = [
        scale,
        0.0,
        0.0,
        0.0,
        0.0,
        scale,
        0.0,
        0.0,
        0.0,
        0.0,
        scale,
        0.0,
        -center[0] * scale,
        -center[1] * scale,
        -center[2] * scale,
        1.0,
    ];
    (coords.len() / 3, extent * scale, matrix)
}

fn mesh_payload_from_triangle_mesh(mesh: MeshData, source_topology: &str) -> Result<serde_json::Value> {
    let raw_tris = mesh.indices.len() / 3;
    if mesh.vertices.is_empty() || raw_tris == 0 {
        anyhow::bail!("no renderable triangles");
    }
    let mut coords: Vec<f32> = Vec::with_capacity(mesh.vertices.len() * 3);
    let mut normals: Vec<f32> = Vec::with_capacity(mesh.vertices.len() * 3);
    for v in &mesh.vertices {
        coords.extend_from_slice(&v.pos);
        normals.push(v.normal[0]);
        normals.push(v.normal[1]);
        normals.push(v.normal[2]);
    }
    let (vertex_count, normalized_extent, scene_fit_matrix) = scene_fit_matrix(&coords);
    let verts = mesh.indices;
    let nverts = vec![3_u32; raw_tris];
    let camera_distance = (normalized_extent * 0.85 + 2.8).max(3.5);

    Ok(json!({
        "coords": coords,
        "normals": normals,
        "verts": verts,
        "nverts": nverts,
        "sceneFitMatrix": scene_fit_matrix,
        "vertexCount": vertex_count,
        "triangleCount": raw_tris,
        "rawTriangleCount": raw_tris,
        "faceCount": raw_tris,
        "sourceTopology": source_topology,
        "welded": false,
        "decimated": false,
        "weldEpsilon": 0.0,
        "cameraDistance": camera_distance,
    }))
}

fn fbx_load_opts_for_cycles() -> ufbx::LoadOpts<'static> {
    ufbx::LoadOpts {
        target_axes: ufbx::CoordinateAxes::right_handed_y_up(),
        target_unit_meters: 1.0,
        space_conversion: ufbx::SpaceConversion::ModifyGeometry,
        geometry_transform_handling: ufbx::GeometryTransformHandling::ModifyGeometry,
        generate_missing_normals: true,
        ..Default::default()
    }
}

fn mesh_payload_from_fbx_faces(scene_path: &str) -> Result<serde_json::Value> {
    let scene = ufbx::load_file(scene_path, fbx_load_opts_for_cycles())
        .map_err(|e| anyhow::anyhow!("fbx load: {:?}", e))?;
    let mut coords: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut verts: Vec<u32> = Vec::new();
    let mut nverts: Vec<u32> = Vec::new();
    let mut face_count = 0_usize;
    let mut triangle_count = 0_usize;

    for node in &scene.nodes {
        if node.is_geometry_transform_helper || node.is_scale_helper {
            continue;
        }
        let Some(mesh) = node.mesh.as_ref() else {
            continue;
        };
        let normal_world = ufbx::matrix_for_normals(&node.geometry_to_world);
        let pos_el = &mesh.vertex_position;
        let normal_el = if mesh.vertex_normal.exists {
            Some(&mesh.vertex_normal)
        } else {
            None
        };

        for (face_ix, face) in mesh.faces.iter().enumerate() {
            if face.num_indices < 3 {
                continue;
            }
            if mesh.face_hole.get(face_ix).map(|h| *h).unwrap_or(false) {
                continue;
            }

            let begin = face.index_begin as usize;
            let count = face.num_indices as usize;
            if begin + count > pos_el.indices.len() {
                continue;
            }
            for corner in begin..begin + count {
                let p = ufbx::transform_position(&node.geometry_to_world, pos_el[corner]);
                let n_local = normal_el
                    .and_then(|el| {
                        if corner >= el.indices.len() {
                            None
                        } else {
                            Some(el[corner])
                        }
                    })
                    .unwrap_or(ufbx::Vec3 {
                        x: 0.0,
                        y: 1.0,
                        z: 0.0,
                    });
                let n_world = ufbx::transform_direction(&normal_world, n_local);
                let n = normalize_vec3([n_world.x as f32, n_world.y as f32, n_world.z as f32]);
                coords.push(p.x as f32);
                coords.push(p.y as f32);
                coords.push(p.z as f32);
                normals.extend_from_slice(&n);
                verts.push((verts.len()) as u32);
            }
            nverts.push(face.num_indices);
            face_count += 1;
            triangle_count += count.saturating_sub(2);
        }
    }

    if coords.is_empty() || verts.is_empty() || nverts.is_empty() {
        anyhow::bail!("no renderable faces in {}", scene_path);
    }
    let (vertex_count, normalized_extent, scene_fit_matrix) = scene_fit_matrix(&coords);
    let camera_distance = (normalized_extent * 0.85 + 2.8).max(3.5);
    Ok(json!({
        "coords": coords,
        "normals": normals,
        "verts": verts,
        "nverts": nverts,
        "sceneFitMatrix": scene_fit_matrix,
        "vertexCount": vertex_count,
        "triangleCount": triangle_count,
        "rawTriangleCount": triangle_count,
        "faceCount": face_count,
        "sourceTopology": "fbx-faces",
        "welded": false,
        "decimated": false,
        "weldEpsilon": 0.0,
        "cameraDistance": camera_distance,
    }))
}

/// Normalized mesh payload for Cycles Standalone XML, preserving source face topology where possible.
pub fn mesh_for_cycles(scene_path: &str) -> Result<serde_json::Value> {
    let ext = Path::new(scene_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext == "fbx" {
        return mesh_payload_from_fbx_faces(scene_path);
    }
    let mesh = mesh_loader::load_meshes(scene_path)?;
    mesh_payload_from_triangle_mesh(mesh, "triangulated-source")
}
