use anyhow::{Context, Result};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct SceneObjectEntry {
    pub id: String,
    pub name: String,
    #[serde(rename = "kind")]
    pub object_kind: String,
    #[serde(rename = "parentId", skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(rename = "triangleCount", skip_serializing_if = "Option::is_none")]
    pub triangle_count: Option<usize>,
}

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
    let scene = ufbx::load_file(path, crate::mesh_loader::fbx_load_opts_blender_style())
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

pub fn list_scene_objects(path: &str) -> Result<Vec<SceneObjectEntry>> {
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
        "glb" | "gltf" => list_gltf_objects(path),
        "fbx" => list_fbx_objects(path),
        "obj" | "stl" | "ply" => list_single_mesh_object(path, &ext),
        _ => anyhow::bail!("unsupported scene extension for object list: .{}", ext),
    }
}

fn list_single_mesh_object(path: &str, _ext: &str) -> Result<Vec<SceneObjectEntry>> {
    let mesh = crate::mesh_loader::load_meshes(path)?;
    let file_stem = Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Mesh");
    Ok(vec![SceneObjectEntry {
        id: "mesh-0".to_string(),
        name: file_stem.to_string(),
        object_kind: "mesh".to_string(),
        parent_id: None,
        triangle_count: Some(mesh.indices.len() / 3),
    }])
}

fn list_fbx_objects(path: &str) -> Result<Vec<SceneObjectEntry>> {
    let scene = ufbx::load_file(path, crate::mesh_loader::fbx_load_opts_blender_style())
        .map_err(|e| anyhow::anyhow!("fbx load: {:?}", e))?;
    let mut out = Vec::new();
    for node in &scene.nodes {
        if node.is_geometry_transform_helper || node.is_scale_helper {
            continue;
        }
        let id = format!("fbx-{}", node.element.element_id);
        let raw_name = node.element.name.to_string();
        let name = if raw_name.trim().is_empty() {
            if node.mesh.is_some() {
                format!("Mesh_{}", node.element.element_id)
            } else {
                format!("Object_{}", node.element.element_id)
            }
        } else {
            raw_name.to_string()
        };
        let parent_id = node
            .parent
            .as_ref()
            .map(|p| format!("fbx-{}", p.element.element_id));
        let mut triangle_count = None;
        if let Some(mesh) = node.mesh.as_ref() {
            let mut tris = 0_usize;
            for face in &mesh.faces {
                if face.num_indices >= 3 {
                    tris += (face.num_indices - 2) as usize;
                }
            }
            triangle_count = Some(tris);
        }
        let object_kind = if node.mesh.is_some() {
            "mesh"
        } else {
            "empty"
        };
        out.push(SceneObjectEntry {
            id,
            name,
            object_kind: object_kind.to_string(),
            parent_id,
            triangle_count,
        });
    }
    if out.is_empty() {
        for (idx, mesh) in scene.meshes.iter().enumerate() {
            let mut tris = 0_usize;
            for face in &mesh.faces {
                if face.num_indices >= 3 {
                    tris += (face.num_indices - 2) as usize;
                }
            }
            out.push(SceneObjectEntry {
                id: format!("fbx-mesh-{}", idx),
                name: format!("Mesh_{}", idx + 1),
                object_kind: "mesh".to_string(),
                parent_id: None,
                triangle_count: Some(tris),
            });
        }
    }
    Ok(out)
}

fn gltf_primitive_triangles(
    prim: gltf::Primitive,
    buffers: &[gltf::buffer::Data],
) -> usize {
    if prim.mode() != gltf::mesh::Mode::Triangles {
        return 0;
    }
    let reader = prim.reader(|buf| buffers.get(buf.index()).map(|data| data.0.as_slice()));
    let n = if let Some(indices) = reader.read_indices() {
        indices.into_u32().count()
    } else if let Some(positions) = reader.read_positions() {
        positions.count()
    } else {
        0
    };
    n / 3
}

fn list_gltf_objects(path: &str) -> Result<Vec<SceneObjectEntry>> {
    let (doc, buffers, _images) =
        gltf::import(path).with_context(|| format!("failed to import glTF: {}", path))?;
    let mut parent_of: std::collections::HashMap<usize, usize> = std::collections::HashMap::new();
    for (idx, node) in doc.nodes().enumerate() {
        for child in node.children() {
            parent_of.insert(child.index(), idx);
        }
    }
    let mut out = Vec::new();
    for (idx, node) in doc.nodes().enumerate() {
        let id = format!("gltf-node-{}", idx);
        let name = node
            .name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("Node_{}", idx + 1));
        let parent_id = parent_of
            .get(&idx)
            .map(|p| format!("gltf-node-{}", p));
        let mut triangle_count = None;
        let object_kind = if let Some(mesh) = node.mesh() {
            let mut tris = 0_usize;
            for prim in mesh.primitives() {
                tris += gltf_primitive_triangles(prim, &buffers);
            }
            triangle_count = Some(tris);
            "mesh"
        } else {
            "empty"
        };
        out.push(SceneObjectEntry {
            id,
            name,
            object_kind: object_kind.to_string(),
            parent_id,
            triangle_count,
        });
    }
    if out.is_empty() {
        for (idx, mesh) in doc.meshes().enumerate() {
            let mut tris = 0_usize;
            for prim in mesh.primitives() {
                tris += gltf_primitive_triangles(prim, &buffers);
            }
            out.push(SceneObjectEntry {
                id: format!("gltf-mesh-{}", idx),
                name: mesh
                    .name()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("Mesh_{}", idx + 1)),
                object_kind: "mesh".to_string(),
                parent_id: None,
                triangle_count: Some(tris),
            });
        }
    }
    Ok(out)
}
