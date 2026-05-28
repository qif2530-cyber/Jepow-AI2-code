use anyhow::{Context, Result};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct Vertex {
    pub pos: [f32; 3],
    /// World/object normal for clay shading (normalized where possible).
    pub normal: [f32; 3],
    pub uv: [f32; 2],
    pub material_tint: [f32; 3],
}

#[derive(Clone)]
pub struct MeshData {
    pub vertices: Vec<Vertex>,
    pub indices: Vec<u32>,
    pub material_color: Option<[f32; 3]>,
    pub metallic_factor: f32,
    pub roughness_factor: f32,
    pub base_color_texture: Option<TextureData>,
    pub metallic_roughness_texture: Option<TextureData>,
}

#[derive(Clone)]
pub struct TextureData {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

static MESH_CACHE: OnceLock<Mutex<HashMap<String, Arc<MeshData>>>> = OnceLock::new();

fn mesh_cache_key(path: &str) -> String {
    let base = std::fs::canonicalize(path)
        .unwrap_or_else(|_| PathBuf::from(path))
        .to_string_lossy()
        .into_owned();
    let meta = std::fs::metadata(path).ok();
    let modified = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let size = meta.map(|m| m.len()).unwrap_or(0);
    format!("v9-per-vertex-material-tint:{base}:{modified}:{size}")
}

/// Cached mesh load (parse FBX once per path per process).
pub fn load_meshes_cached(path: &str) -> Result<Arc<MeshData>> {
    let key = mesh_cache_key(path);
    let cache = MESH_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = cache.lock().expect("mesh cache");
    if let Some(hit) = guard.get(&key) {
        return Ok(Arc::clone(hit));
    }
    let mesh = Arc::new(load_meshes_uncached(path)?);
    guard.insert(key, Arc::clone(&mesh));
    Ok(mesh)
}

fn normalize_vec3(v: [f32; 3]) -> [f32; 3] {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if len > 1e-8 {
        [v[0] / len, v[1] / len, v[2] / len]
    } else {
        [0.0, 1.0, 0.0]
    }
}

fn clamp_color(color: [f32; 3]) -> [f32; 3] {
    [
        color[0].clamp(0.0, 1.0),
        color[1].clamp(0.0, 1.0),
        color[2].clamp(0.0, 1.0),
    ]
}

fn gltf_image_to_rgba(image: &gltf::image::Data) -> Option<TextureData> {
    if image.width == 0 || image.height == 0 {
        return None;
    }
    let rgba = match image.format {
        gltf::image::Format::R8G8B8A8 => image.pixels.clone(),
        gltf::image::Format::R8G8B8 => image
            .pixels
            .chunks_exact(3)
            .flat_map(|rgb| [rgb[0], rgb[1], rgb[2], 255])
            .collect(),
        gltf::image::Format::R8G8 => image
            .pixels
            .chunks_exact(2)
            .flat_map(|rg| [rg[0], rg[0], rg[0], rg[1]])
            .collect(),
        gltf::image::Format::R8 => image
            .pixels
            .iter()
            .flat_map(|v| [*v, *v, *v, 255])
            .collect(),
        _ => return None,
    };
    Some(TextureData {
        width: image.width,
        height: image.height,
        rgba,
    })
}

fn load_image_texture(path: &Path) -> Option<TextureData> {
    let image = image::open(path).ok()?.to_rgba8();
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return None;
    }
    Some(TextureData {
        width,
        height,
        rgba: image.into_raw(),
    })
}

pub fn load_meshes(path: &str) -> Result<MeshData> {
    Ok((*load_meshes_cached(path)?).clone())
}

fn load_meshes_uncached(path: &str) -> Result<MeshData> {
    let p = Path::new(path);
    if !p.exists() {
        anyhow::bail!("scene file not found: {}", path);
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let combined = match ext.as_str() {
        "glb" | "gltf" => load_gltf_mesh(path)?,
        "fbx" => load_fbx_mesh(path)?,
        "obj" => load_obj_mesh(path)?,
        _ => anyhow::bail!("unsupported extension: .{}", ext),
    };

    if combined.vertices.is_empty() || combined.indices.is_empty() {
        anyhow::bail!("no renderable triangles in {}", path);
    }

    Ok(combined)
}

fn load_gltf_mesh(path: &str) -> Result<MeshData> {
    let (doc, buffers, images) = gltf::import(path).context("gltf import")?;
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut material_color = None;
    let mut metallic_factor = 0.0;
    let mut roughness_factor = 0.65;
    let mut base_color_texture = None;
    let mut metallic_roughness_texture = None;
    let mut base: u32 = 0;

    for mesh in doc.meshes() {
        for prim in mesh.primitives() {
            if prim.mode() != gltf::mesh::Mode::Triangles {
                continue;
            }
            let material = prim.material();
            let pbr = material.pbr_metallic_roughness();
            let base_color = pbr.base_color_factor();
            let material_tint = clamp_color([base_color[0], base_color[1], base_color[2]]);
            if material_color.is_none() {
                material_color = Some(material_tint);
                metallic_factor = pbr.metallic_factor().clamp(0.0, 1.0);
                roughness_factor = pbr.roughness_factor().clamp(0.04, 1.0);
                base_color_texture = pbr
                    .base_color_texture()
                    .and_then(|info| images.get(info.texture().source().index()))
                    .and_then(gltf_image_to_rgba);
                metallic_roughness_texture = pbr
                    .metallic_roughness_texture()
                    .and_then(|info| images.get(info.texture().source().index()))
                    .and_then(gltf_image_to_rgba);
            }
            let reader = prim.reader(|buf| buffers.get(buf.index()).map(|data| data.0.as_slice()));
            let positions: Vec<[f32; 3]> = reader
                .read_positions()
                .context("missing positions")?
                .collect();
            let normals: Vec<[f32; 3]> = reader
                .read_normals()
                .map(|n| n.collect())
                .unwrap_or_else(|| vec![[0.0, 1.0, 0.0]; positions.len()]);
            let texcoords: Vec<[f32; 2]> = reader
                .read_tex_coords(0)
                .map(|uv| uv.into_f32().collect())
                .unwrap_or_else(|| vec![[0.0, 0.0]; positions.len()]);

            for (i, p) in positions.iter().enumerate() {
                let n = normals.get(i).copied().unwrap_or([0.0, 1.0, 0.0]);
                let uv = texcoords.get(i).copied().unwrap_or([0.0, 0.0]);
                vertices.push(Vertex {
                    pos: *p,
                    normal: normalize_vec3(n),
                    uv,
                    material_tint,
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
    Ok(MeshData {
        vertices,
        indices,
        material_color,
        metallic_factor,
        roughness_factor,
        base_color_texture,
        metallic_roughness_texture,
    })
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

    for (face_ix, face) in mesh.faces.iter().enumerate() {
        if face.num_indices < 3 {
            continue;
        }
        if mesh.face_hole.get(face_ix).map(|h| *h).unwrap_or(false) {
            continue;
        }
        let mut tri_corners = Vec::new();
        let num_tris = ufbx::triangulate_face_vec(&mut tri_corners, mesh, *face);
        // Do not fan-triangulate concave ngons — causes shredded faces on C4D FBX.
        if num_tris == 0 {
            continue;
        }

        for tri in tri_corners.chunks(3) {
            if tri.len() < 3 {
                continue;
            }
            let mut tri_idx = Vec::with_capacity(3);
            for &corner_ix in tri {
                let corner = corner_ix as usize;
                if corner >= pos_el.indices.len() {
                    continue;
                }
                // ufbx Index: mesh corner index → values[indices[corner]]
                let p = ufbx::transform_position(world, pos_el[corner]);
                let n_local = normal_el
                    .and_then(|el| {
                        if corner >= el.indices.len() {
                            return None;
                        }
                        Some(el[corner])
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
                    normal: normalize_vec3(vec3_f32(n)),
                    uv: [0.0, 0.0],
                    material_tint: [1.0, 1.0, 1.0],
                });
            }
            if tri_idx.len() == 3 {
                indices.extend(tri_idx);
            }
        }
    }
}

/// FBX load options aligned with Blender `io_scene_fbx` defaults:
/// - Y-up right-handed (`axis_up=Y`, `axis_forward=-Z`)
/// - apply object + geometry transforms to vertices (not spawning Blender)
fn fbx_load_opts_blender_style() -> ufbx::LoadOpts<'static> {
    ufbx::LoadOpts {
        target_axes: ufbx::CoordinateAxes::right_handed_y_up(),
        target_unit_meters: 1.0,
        space_conversion: ufbx::SpaceConversion::ModifyGeometry,
        geometry_transform_handling: ufbx::GeometryTransformHandling::ModifyGeometry,
        generate_missing_normals: true,
        ..Default::default()
    }
}

fn load_fbx_mesh(path: &str) -> Result<MeshData> {
    let scene = ufbx::load_file(path, fbx_load_opts_blender_style())
        .map_err(|e| anyhow::anyhow!("fbx load: {:?}", e))?;
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut seen_instances = HashMap::<(u32, u32), ()>::new();

    // Blender: one evaluated mesh per object node (world matrix = geometry_to_world).
    for node in &scene.nodes {
        if node.is_geometry_transform_helper || node.is_scale_helper {
            continue;
        }
        let Some(mesh) = node.mesh.as_ref() else {
            continue;
        };
        let key = (mesh.element.element_id, node.element.element_id);
        if seen_instances.contains_key(&key) {
            continue;
        }
        seen_instances.insert(key, ());
        append_fbx_mesh_triangles(&mut vertices, &mut indices, mesh, &node.geometry_to_world);
    }

    Ok(MeshData {
        vertices,
        indices,
        material_color: None,
        metallic_factor: 0.0,
        roughness_factor: 0.65,
        base_color_texture: None,
        metallic_roughness_texture: None,
    })
}

fn load_obj_mesh(path: &str) -> Result<MeshData> {
    let (models, materials) =
        tobj::load_obj(path, &tobj::LoadOptions::default()).context("obj load")?;
    let materials = materials.unwrap_or_default();
    let material_color = models.iter().find_map(|model| {
        model
            .mesh
            .material_id
            .and_then(|id| materials.get(id))
            .and_then(|material| material.diffuse)
            .map(clamp_color)
    });
    let base_dir = Path::new(path).parent().unwrap_or_else(|| Path::new("."));
    let base_color_texture = models.iter().find_map(|model| {
        model
            .mesh
            .material_id
            .and_then(|id| materials.get(id))
            .and_then(|material| material.diffuse_texture.as_deref())
            .and_then(|texture| load_image_texture(&base_dir.join(texture)))
    });
    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut base: u32 = 0;

    for model in models {
        let mesh = model.mesh;
        let material_tint = mesh
            .material_id
            .and_then(|id| materials.get(id))
            .and_then(|material| material.diffuse)
            .map(clamp_color)
            .unwrap_or([1.0, 1.0, 1.0]);
        for i in 0..mesh.positions.len() / 3 {
            let px = mesh.positions[i * 3];
            let py = mesh.positions[i * 3 + 1];
            let pz = mesh.positions[i * 3 + 2];
            let nx = mesh.normals.get(i * 3).copied().unwrap_or(0.0);
            let ny = mesh.normals.get(i * 3 + 1).copied().unwrap_or(1.0);
            let nz = mesh.normals.get(i * 3 + 2).copied().unwrap_or(0.0);
            let uv = [
                mesh.texcoords.get(i * 2).copied().unwrap_or(0.0),
                mesh.texcoords.get(i * 2 + 1).copied().unwrap_or(0.0),
            ];
            vertices.push(Vertex {
                pos: [px, py, pz],
                normal: normalize_vec3([nx, ny, nz]),
                uv,
                material_tint,
            });
        }
        for idx in &mesh.indices {
            indices.push(base + *idx as u32);
        }
        base = vertices.len() as u32;
    }
    Ok(MeshData {
        vertices,
        indices,
        material_color,
        metallic_factor: 0.0,
        roughness_factor: 0.72,
        base_color_texture,
        metallic_roughness_texture: None,
    })
}

