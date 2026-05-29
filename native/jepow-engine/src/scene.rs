use anyhow::{Context, Result};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct SceneStats {
    pub path: String,
    pub mesh_count: usize,
    pub node_count: usize,
    pub material_count: usize,
    pub triangle_count: usize,
    pub extension: String,
}

pub fn load_scene_stats(path: &str) -> Result<SceneStats> {
    let p = Path::new(path);
    if !p.exists() {
        anyhow::bail!("scene file not found: {}", path);
    }

    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "glb" | "gltf" => load_gltf_stats(path, &ext),
        "fbx" => load_fbx_stats(path, &ext),
        "obj" | "stl" | "ply" => load_mesh_loader_stats(path, &ext),
        "blend" => anyhow::bail!("use .fbx/.glb export from Blender for now"),
        _ => anyhow::bail!("unsupported scene extension: .{}", ext),
    }
}

fn load_fbx_stats(path: &str, ext: &str) -> Result<SceneStats> {
    let scene = ufbx::load_file(path, ufbx::LoadOpts::default())
        .map_err(|e| anyhow::anyhow!("fbx load: {:?}", e))?;
    let mesh_count = scene.meshes.len();
    let mut triangle_count = 0_usize;
    for mesh in &scene.meshes {
        for face in &mesh.faces {
            if face.num_indices >= 3 {
                triangle_count += (face.num_indices - 2) as usize;
            }
        }
    }
    Ok(SceneStats {
        path: path.to_string(),
        mesh_count,
        node_count: scene.nodes.len(),
        material_count: scene.materials.len(),
        triangle_count,
        extension: ext.to_string(),
    })
}

fn load_mesh_loader_stats(path: &str, ext: &str) -> Result<SceneStats> {
    let mesh = crate::mesh_loader::load_meshes(path)?;
    Ok(SceneStats {
        path: path.to_string(),
        mesh_count: 1,
        node_count: 1,
        material_count: 0,
        triangle_count: mesh.indices.len() / 3,
        extension: ext.to_string(),
    })
}

fn load_gltf_stats(path: &str, ext: &str) -> Result<SceneStats> {
    let (doc, buffers, _images) =
        gltf::import(path).with_context(|| format!("failed to import glTF: {}", path))?;

    let mesh_count = doc.meshes().len();
    let node_count = doc.nodes().len();
    let material_count = doc.materials().len();
    let _ = buffers;

    let mut triangle_count = 0_usize;
    for mesh in doc.meshes() {
        for prim in mesh.primitives() {
            if prim.mode() == gltf::mesh::Mode::Triangles {
                let reader =
                    prim.reader(|buf| buffers.get(buf.index()).map(|data| data.0.as_slice()));
                let n = if let Some(indices) = reader.read_indices() {
                    indices.into_u32().count()
                } else if let Some(positions) = reader.read_positions() {
                    positions.count()
                } else {
                    0
                };
                triangle_count += n / 3;
            }
        }
    }

    Ok(SceneStats {
        path: path.to_string(),
        mesh_count,
        node_count,
        material_count,
        triangle_count,
        extension: ext.to_string(),
    })
}
