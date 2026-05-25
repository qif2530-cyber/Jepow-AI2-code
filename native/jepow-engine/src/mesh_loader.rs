use anyhow::{Context, Result};
use std::path::Path;

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct Vertex {
    pub pos: [f32; 3],
    pub color: [f32; 3],
}

pub struct MeshData {
    pub vertices: Vec<Vertex>,
    pub indices: Vec<u32>,
}

/// 白膜灰度（法线明暗）
fn clay_vertex_color(ny: f32) -> [f32; 3] {
    let shade = (ny * 0.5 + 0.5).clamp(0.22, 1.0);
    [shade, shade, shade]
}

pub fn load_meshes(path: &str) -> Result<MeshData> {
    let p = Path::new(path);
    if !p.exists() {
        anyhow::bail!("scene file not found: {}", path);
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut combined = match ext.as_str() {
        "glb" | "gltf" => load_gltf_mesh(path)?,
        "fbx" => load_fbx_mesh(path)?,
        "obj" => load_obj_mesh(path)?,
        _ => anyhow::bail!("unsupported extension: .{}", ext),
    };

    if combined.vertices.is_empty() || combined.indices.is_empty() {
        anyhow::bail!("no renderable triangles in {}", path);
    }

    normalize_mesh(&mut combined);
    Ok(combined)
}

fn load_gltf_mesh(path: &str) -> Result<MeshData> {
    let (doc, buffers, _) = gltf::import(path).context("gltf import")?;
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut base: u32 = 0;

    for mesh in doc.meshes() {
        for prim in mesh.primitives() {
            if prim.mode() != gltf::mesh::Mode::Triangles {
                continue;
            }
            let reader = prim.reader(|buf| {
                buffers
                    .get(buf.index())
                    .map(|data| data.0.as_slice())
            });
            let positions: Vec<[f32; 3]> = reader
                .read_positions()
                .context("missing positions")?
                .collect();
            let normals: Vec<[f32; 3]> = reader
                .read_normals()
                .map(|n| n.collect())
                .unwrap_or_else(|| vec![[0.0, 1.0, 0.0]; positions.len()]);

            for (i, p) in positions.iter().enumerate() {
                let n = normals.get(i).copied().unwrap_or([0.0, 1.0, 0.0]);
                vertices.push(Vertex {
                    pos: *p,
                    color: clay_vertex_color(n[1]),
                });
            }

            if let Some(iter) = reader.read_indices() {
                for idx in iter.into_u32() {
                    indices.push(base + idx);
                }
            } else {
                for i in 0..positions.len() as u32 {
                    indices.push(base + i);
                }
            }
            base = vertices.len() as u32;
        }
    }
    Ok(MeshData { vertices, indices })
}

fn vec3_f32(v: ufbx::Vec3) -> [f32; 3] {
    [v.x as f32, v.y as f32, v.z as f32]
}

/// Merge one FBX mesh instance with node world transform (position + normal).
fn append_fbx_mesh_triangles(
    vertices: &mut Vec<Vertex>,
    indices: &mut Vec<u32>,
    mesh: &ufbx::Mesh,
    world: &ufbx::Matrix,
) {
    let normal_world = ufbx::matrix_for_normals(world);
    let pos_el = &mesh.vertex_position;
    let normal_el = if mesh.vertex_normal.exists {
        Some(&mesh.vertex_normal)
    } else {
        None
    };

    for face in &mesh.faces {
        if face.num_indices < 3 {
            continue;
        }
        let mut tri_corners = Vec::new();
        let num_tris = ufbx::triangulate_face_vec(&mut tri_corners, mesh, *face);
        if num_tris == 0 {
            for t in 0..(face.num_indices.saturating_sub(2)) {
                tri_corners.push(0);
                tri_corners.push(t + 1);
                tri_corners.push(t + 2);
            }
            for c in &mut tri_corners {
                *c = face.index_begin + *c;
            }
        }

        for tri in tri_corners.chunks(3) {
            if tri.len() < 3 {
                continue;
            }
            let mut tri_idx = Vec::with_capacity(3);
            for &mesh_ix in tri {
                let corner = mesh_ix as usize;
                if corner >= pos_el.indices.len() {
                    continue;
                }
                let vi = pos_el.indices[corner] as usize;
                if vi >= pos_el.values.len() {
                    continue;
                }
                let p = ufbx::transform_position(world, pos_el[vi]);
                let n_local = normal_el
                    .and_then(|el| {
                        if corner >= el.indices.len() {
                            return None;
                        }
                        let ni = el.indices[corner] as usize;
                        if ni >= el.values.len() {
                            return None;
                        }
                        Some(el[ni])
                    })
                    .unwrap_or(ufbx::Vec3 {
                        x: 0.0,
                        y: 1.0,
                        z: 0.0,
                    });
                let n = ufbx::transform_direction(&normal_world, n_local);
                tri_idx.push(vertices.len() as u32);
                vertices.push(Vertex {
                    pos: vec3_f32(p),
                    color: clay_vertex_color(n.y as f32),
                });
            }
            if tri_idx.len() == 3 {
                indices.extend(tri_idx);
            }
        }
    }
}

fn load_fbx_mesh(path: &str) -> Result<MeshData> {
    let opts = ufbx::LoadOpts {
        geometry_transform_handling: ufbx::GeometryTransformHandling::ModifyGeometry,
        ..Default::default()
    };
    let scene = ufbx::load_file(path, opts)
        .map_err(|e| anyhow::anyhow!("fbx load: {:?}", e))?;
    let mut vertices = Vec::new();
    let mut indices = Vec::new();

    // FBX meshes live on scene nodes; must apply each node's world matrix.
    for node in &scene.nodes {
        if node.is_geometry_transform_helper || !node.visible {
            continue;
        }
        let Some(mesh) = node.mesh.as_ref() else {
            continue;
        };
        append_fbx_mesh_triangles(&mut vertices, &mut indices, mesh, &node.geometry_to_world);
    }

    Ok(MeshData { vertices, indices })
}

fn load_obj_mesh(path: &str) -> Result<MeshData> {
    let (models, _) = tobj::load_obj(path, &tobj::LoadOptions::default()).context("obj load")?;
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut base: u32 = 0;

    for model in models {
        let mesh = model.mesh;
        for i in 0..mesh.positions.len() / 3 {
            let px = mesh.positions[i * 3];
            let py = mesh.positions[i * 3 + 1];
            let pz = mesh.positions[i * 3 + 2];
            let ny = if mesh.normals.len() >= i * 3 + 2 {
                mesh.normals[i * 3 + 1]
            } else {
                1.0
            };
            vertices.push(Vertex {
                pos: [px, py, pz],
                color: clay_vertex_color(ny),
            });
        }
        for idx in &mesh.indices {
            indices.push(base + *idx as u32);
        }
        base = vertices.len() as u32;
    }
    Ok(MeshData { vertices, indices })
}

fn normalize_mesh(mesh: &mut MeshData) {
    let mut min = [f32::MAX; 3];
    let mut max = [f32::MIN; 3];
    for v in &mesh.vertices {
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
    let size = [
        max[0] - min[0],
        max[1] - min[1],
        max[2] - min[2],
    ];
    let max_dim = size[0].max(size[1]).max(size[2]).max(1e-6);
    let scale = 1.6 / max_dim;

    for v in &mut mesh.vertices {
        v.pos[0] = (v.pos[0] - center[0]) * scale;
        v.pos[1] = (v.pos[1] - center[1]) * scale;
        v.pos[2] = (v.pos[2] - center[2]) * scale;
    }
}
