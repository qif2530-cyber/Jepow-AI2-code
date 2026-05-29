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

fn normalize_normal_or_zero(v: [f32; 3]) -> [f32; 3] {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if len > 1e-8 {
        [v[0] / len, v[1] / len, v[2] / len]
    } else {
        [0.0, 0.0, 0.0]
    }
}

fn normal_missing(normal: [f32; 3]) -> bool {
    normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2] <= 1e-8
}

fn generate_missing_normals(mesh: &mut MeshData) {
    if !mesh
        .vertices
        .iter()
        .any(|vertex| normal_missing(vertex.normal))
    {
        return;
    }

    let mut generated = vec![[0.0_f32; 3]; mesh.vertices.len()];
    for tri in mesh.indices.chunks(3) {
        if tri.len() != 3 {
            continue;
        }
        let Some(a) = mesh.vertices.get(tri[0] as usize) else {
            continue;
        };
        let Some(b) = mesh.vertices.get(tri[1] as usize) else {
            continue;
        };
        let Some(c) = mesh.vertices.get(tri[2] as usize) else {
            continue;
        };
        let ab = [
            b.pos[0] - a.pos[0],
            b.pos[1] - a.pos[1],
            b.pos[2] - a.pos[2],
        ];
        let ac = [
            c.pos[0] - a.pos[0],
            c.pos[1] - a.pos[1],
            c.pos[2] - a.pos[2],
        ];
        let face_normal = normalize_normal_or_zero([
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        ]);
        if normal_missing(face_normal) {
            continue;
        }
        for index in tri {
            if let Some(accum) = generated.get_mut(*index as usize) {
                accum[0] += face_normal[0];
                accum[1] += face_normal[1];
                accum[2] += face_normal[2];
            }
        }
    }

    for (index, vertex) in mesh.vertices.iter_mut().enumerate() {
        if normal_missing(vertex.normal) {
            vertex.normal = normalize_vec3(generated[index]);
        }
    }
}

fn clamp_color(color: [f32; 3]) -> [f32; 3] {
    [
        color[0].clamp(0.0, 1.0),
        color[1].clamp(0.0, 1.0),
        color[2].clamp(0.0, 1.0),
    ]
}

fn normalize_ply_color_component(value: f32, ty: &str) -> f32 {
    let is_integer = matches!(
        ty,
        "char" | "uchar" | "int8" | "uint8" | "short" | "ushort" | "int16" | "uint16" | "int"
            | "uint" | "int32" | "uint32"
    );
    if is_integer || value > 1.0 {
        (value / 255.0).clamp(0.0, 1.0)
    } else {
        value.clamp(0.0, 1.0)
    }
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

    let mut combined = match ext.as_str() {
        "glb" | "gltf" => load_gltf_mesh(path)?,
        "fbx" => load_fbx_mesh(path)?,
        "obj" => load_obj_mesh(path)?,
        "stl" => load_stl_mesh(path)?,
        "ply" => load_ply_mesh(path)?,
        _ => anyhow::bail!("unsupported extension: .{}", ext),
    };

    if combined.vertices.is_empty() || combined.indices.is_empty() {
        anyhow::bail!("no renderable triangles in {}", path);
    }
    generate_missing_normals(&mut combined);

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
                .unwrap_or_else(|| vec![[0.0, 0.0, 0.0]; positions.len()]);
            let texcoords: Vec<[f32; 2]> = reader
                .read_tex_coords(0)
                .map(|uv| uv.into_f32().collect())
                .unwrap_or_else(|| vec![[0.0, 0.0]; positions.len()]);

            for (i, p) in positions.iter().enumerate() {
                let n = normals.get(i).copied().unwrap_or([0.0, 1.0, 0.0]);
                let uv = texcoords.get(i).copied().unwrap_or([0.0, 0.0]);
                vertices.push(Vertex {
                    pos: *p,
                    normal: normalize_normal_or_zero(n),
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
                normal: normalize_normal_or_zero([nx, ny, nz]),
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

fn le_f32(bytes: &[u8], offset: usize) -> Result<f32> {
    let slice = bytes
        .get(offset..offset + 4)
        .context("stl float out of range")?;
    Ok(f32::from_le_bytes(slice.try_into().expect("4-byte slice")))
}

fn parse_ascii_stl(bytes: &[u8]) -> Result<Option<MeshData>> {
    let text = match std::str::from_utf8(bytes) {
        Ok(text) => text,
        Err(_) => return Ok(None),
    };
    if !text.trim_start().starts_with("solid") || !text.contains("facet") {
        return Ok(None);
    }

    let mut vertices = Vec::new();
    let mut indices = Vec::new();
    let mut current_normal = [0.0, 1.0, 0.0];
    let mut tri_positions: Vec<[f32; 3]> = Vec::with_capacity(3);

    for line in text.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 5 && parts[0] == "facet" && parts[1] == "normal" {
            current_normal = normalize_vec3([
                parts[2].parse().unwrap_or(0.0),
                parts[3].parse().unwrap_or(1.0),
                parts[4].parse().unwrap_or(0.0),
            ]);
        } else if parts.len() >= 4 && parts[0] == "vertex" {
            tri_positions.push([
                parts[1].parse().unwrap_or(0.0),
                parts[2].parse().unwrap_or(0.0),
                parts[3].parse().unwrap_or(0.0),
            ]);
            if tri_positions.len() == 3 {
                for position in tri_positions.drain(..) {
                    indices.push(vertices.len() as u32);
                    vertices.push(Vertex {
                        pos: position,
                        normal: current_normal,
                        uv: [0.0, 0.0],
                        material_tint: [1.0, 1.0, 1.0],
                    });
                }
            }
        }
    }

    if vertices.is_empty() {
        return Ok(None);
    }
    Ok(Some(MeshData {
        vertices,
        indices,
        material_color: Some([0.74, 0.76, 0.78]),
        metallic_factor: 0.0,
        roughness_factor: 0.68,
        base_color_texture: None,
        metallic_roughness_texture: None,
    }))
}

fn parse_binary_stl(bytes: &[u8]) -> Result<Option<MeshData>> {
    if bytes.len() < 84 {
        return Ok(None);
    }
    let tri_count = u32::from_le_bytes(bytes[80..84].try_into().expect("4-byte slice")) as usize;
    let expected_len = 84_usize.saturating_add(tri_count.saturating_mul(50));
    if expected_len > bytes.len() {
        return Ok(None);
    }

    let mut vertices = Vec::with_capacity(tri_count.saturating_mul(3));
    let mut indices = Vec::with_capacity(tri_count.saturating_mul(3));
    let mut offset = 84;
    for _ in 0..tri_count {
        let normal = normalize_vec3([
            le_f32(bytes, offset)?,
            le_f32(bytes, offset + 4)?,
            le_f32(bytes, offset + 8)?,
        ]);
        offset += 12;
        for _ in 0..3 {
            let position = [
                le_f32(bytes, offset)?,
                le_f32(bytes, offset + 4)?,
                le_f32(bytes, offset + 8)?,
            ];
            offset += 12;
            indices.push(vertices.len() as u32);
            vertices.push(Vertex {
                pos: position,
                normal,
                uv: [0.0, 0.0],
                material_tint: [1.0, 1.0, 1.0],
            });
        }
        offset += 2;
    }

    Ok(Some(MeshData {
        vertices,
        indices,
        material_color: Some([0.74, 0.76, 0.78]),
        metallic_factor: 0.0,
        roughness_factor: 0.68,
        base_color_texture: None,
        metallic_roughness_texture: None,
    }))
}

fn load_stl_mesh(path: &str) -> Result<MeshData> {
    let bytes = std::fs::read(path).with_context(|| format!("stl read: {}", path))?;
    if let Some(mesh) = parse_binary_stl(&bytes)? {
        return Ok(mesh);
    }
    if let Some(mesh) = parse_ascii_stl(&bytes)? {
        return Ok(mesh);
    }
    anyhow::bail!("unsupported or empty STL: {}", path)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PlyFormat {
    Ascii,
    BinaryLittleEndian,
    BinaryBigEndian,
}

struct PlyFaceProperty {
    name: String,
    count_ty: Option<String>,
    item_ty: String,
}

struct PlyHeader {
    format: PlyFormat,
    vertex_count: usize,
    face_count: usize,
    vertex_properties: Vec<String>,
    face_properties: Vec<PlyFaceProperty>,
    data_offset: usize,
}

fn find_ply_header_end(bytes: &[u8]) -> Result<usize> {
    let marker = b"end_header";
    let marker_start = bytes
        .windows(marker.len())
        .position(|window| window == marker)
        .context("ply missing end_header")?;
    let after_marker = marker_start + marker.len();
    for offset in after_marker..bytes.len() {
        if bytes[offset] == b'\n' {
            return Ok(offset + 1);
        }
    }
    Ok(after_marker)
}

fn parse_ply_header(bytes: &[u8]) -> Result<PlyHeader> {
    if !bytes.starts_with(b"ply") {
        anyhow::bail!("ply missing magic header");
    }
    let header_end = find_ply_header_end(bytes)?;
    let header = std::str::from_utf8(&bytes[..header_end]).context("ply header is not utf8")?;
    let mut format = None;
    let mut vertex_count = 0_usize;
    let mut face_count = 0_usize;
    let mut vertex_properties = Vec::new();
    let mut face_properties = Vec::new();
    let mut current_element = "";

    for line in header.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }
        match parts.as_slice() {
            ["format", "ascii", ..] => format = Some(PlyFormat::Ascii),
            ["format", "binary_little_endian", ..] => {
                format = Some(PlyFormat::BinaryLittleEndian)
            }
            ["format", "binary_big_endian", ..] => {
                format = Some(PlyFormat::BinaryBigEndian)
            }
            ["element", "vertex", count] => {
                current_element = "vertex";
                vertex_count = count.parse().unwrap_or(0);
            }
            ["element", "face", count] => {
                current_element = "face";
                face_count = count.parse().unwrap_or(0);
            }
            ["element", ..] => current_element = "",
            ["property", ty, name] if current_element == "vertex" => {
                vertex_properties.push(format!("{ty}:{name}"));
            }
            ["property", "list", count_ty, item_ty, name, ..] if current_element == "face" => {
                face_properties.push(PlyFaceProperty {
                    name: (*name).to_string(),
                    count_ty: Some((*count_ty).to_string()),
                    item_ty: (*item_ty).to_string(),
                });
            }
            ["property", ty, name] if current_element == "face" => {
                face_properties.push(PlyFaceProperty {
                    name: (*name).to_string(),
                    count_ty: None,
                    item_ty: (*ty).to_string(),
                });
            }
            _ => {}
        }
    }

    Ok(PlyHeader {
        format: format.context("ply missing format")?,
        vertex_count,
        face_count,
        vertex_properties,
        face_properties,
        data_offset: header_end,
    })
}

fn ply_scalar_size(ty: &str) -> Option<usize> {
    match ty {
        "char" | "uchar" | "int8" | "uint8" => Some(1),
        "short" | "ushort" | "int16" | "uint16" => Some(2),
        "int" | "uint" | "float" | "int32" | "uint32" | "float32" => Some(4),
        "double" | "float64" => Some(8),
        _ => None,
    }
}

fn read_ply_scalar_bytes<'a>(bytes: &'a [u8], offset: &mut usize, len: usize) -> Result<&'a [u8]> {
    let end = offset
        .checked_add(len)
        .context("ply scalar offset overflow")?;
    let raw = bytes
        .get(*offset..end)
        .context("ply scalar out of range")?;
    *offset = end;
    Ok(raw)
}

fn read_ply_scalar(bytes: &[u8], offset: &mut usize, ty: &str, big_endian: bool) -> Result<f64> {
    let value = match ty {
        "char" | "int8" => {
            let value = *bytes.get(*offset).context("ply i8 out of range")? as i8;
            *offset += 1;
            value as f64
        }
        "uchar" | "uint8" => {
            let value = *bytes.get(*offset).context("ply u8 out of range")?;
            *offset += 1;
            value as f64
        }
        "short" | "int16" => {
            let raw = read_ply_scalar_bytes(bytes, offset, 2)?.try_into()?;
            let value = if big_endian {
                i16::from_be_bytes(raw)
            } else {
                i16::from_le_bytes(raw)
            };
            value as f64
        }
        "ushort" | "uint16" => {
            let raw = read_ply_scalar_bytes(bytes, offset, 2)?.try_into()?;
            let value = if big_endian {
                u16::from_be_bytes(raw)
            } else {
                u16::from_le_bytes(raw)
            };
            value as f64
        }
        "int" | "int32" => {
            let raw = read_ply_scalar_bytes(bytes, offset, 4)?.try_into()?;
            let value = if big_endian {
                i32::from_be_bytes(raw)
            } else {
                i32::from_le_bytes(raw)
            };
            value as f64
        }
        "uint" | "uint32" => {
            let raw = read_ply_scalar_bytes(bytes, offset, 4)?.try_into()?;
            let value = if big_endian {
                u32::from_be_bytes(raw)
            } else {
                u32::from_le_bytes(raw)
            };
            value as f64
        }
        "float" | "float32" => {
            let raw = read_ply_scalar_bytes(bytes, offset, 4)?.try_into()?;
            let value = if big_endian {
                f32::from_be_bytes(raw)
            } else {
                f32::from_le_bytes(raw)
            };
            value as f64
        }
        "double" | "float64" => {
            let raw = read_ply_scalar_bytes(bytes, offset, 8)?.try_into()?;
            let value = if big_endian {
                f64::from_be_bytes(raw)
            } else {
                f64::from_le_bytes(raw)
            };
            value
        }
        _ => anyhow::bail!("unsupported PLY scalar type: {ty}"),
    };
    Ok(value)
}

fn finish_ply_mesh(vertices: Vec<Vertex>, indices: Vec<u32>) -> Result<MeshData> {
    if vertices.is_empty() || indices.is_empty() {
        anyhow::bail!("PLY has no renderable triangles");
    }
    Ok(MeshData {
        vertices,
        indices,
        material_color: Some([0.72, 0.74, 0.78]),
        metallic_factor: 0.0,
        roughness_factor: 0.7,
        base_color_texture: None,
        metallic_roughness_texture: None,
    })
}

fn apply_ply_vertex_property(
    ty: &str,
    name: &str,
    value: f32,
    pos: &mut [f32; 3],
    normal: &mut [f32; 3],
    color: &mut [f32; 3],
    alpha: &mut f32,
    uv: &mut [f32; 2],
) {
    match name {
        "x" => pos[0] = value,
        "y" => pos[1] = value,
        "z" => pos[2] = value,
        "nx" => normal[0] = value,
        "ny" => normal[1] = value,
        "nz" => normal[2] = value,
        "red" | "r" => color[0] = normalize_ply_color_component(value, ty),
        "green" | "g" => color[1] = normalize_ply_color_component(value, ty),
        "blue" | "b" => color[2] = normalize_ply_color_component(value, ty),
        "alpha" | "a" => *alpha = normalize_ply_color_component(value, ty),
        "u" | "s" | "texture_u" | "texcoord_u" | "texture_s" => uv[0] = value,
        "v" | "t" | "texture_v" | "texcoord_v" | "texture_t" => uv[1] = value,
        _ => {}
    }
}

fn is_ply_face_index_property(name: &str) -> bool {
    matches!(
        name,
        "vertex_indices" | "vertex_index" | "vertex_indexes" | "vertex_idx"
    )
}

fn append_triangulated_face(indices: &mut Vec<u32>, face: &[u32], vertex_count: usize) -> Result<()> {
    if face.len() < 3 {
        return Ok(());
    }
    for &index in face {
        if index as usize >= vertex_count {
            anyhow::bail!("PLY face index out of range: {index} >= {vertex_count}");
        }
    }
    for i in 1..(face.len() - 1) {
        indices.extend([face[0], face[i], face[i + 1]]);
    }
    Ok(())
}

fn parse_ascii_ply(bytes: &[u8], header: &PlyHeader) -> Result<MeshData> {
    let text = std::str::from_utf8(&bytes[header.data_offset..]).context("ply ascii data")?;
    let mut lines = text.lines();
    let mut vertices = Vec::with_capacity(header.vertex_count);
    let has_normals = header
        .vertex_properties
        .iter()
        .any(|property| property.ends_with(":nx"));
    for _ in 0..header.vertex_count {
        let line = lines.next().context("ply missing vertex line")?;
        let values: Vec<f32> = line
            .split_whitespace()
            .map(|value| value.parse().unwrap_or(0.0))
            .collect();
        let mut pos = [0.0, 0.0, 0.0];
        let mut normal = [0.0, 1.0, 0.0];
        let mut color = [1.0, 1.0, 1.0];
        let mut alpha = 1.0;
        let mut uv = [0.0, 0.0];
        for (i, property) in header.vertex_properties.iter().enumerate() {
            let mut parts = property.split(':');
            let ty = parts.next().unwrap_or("");
            let name = parts.next().unwrap_or("");
            let value = values.get(i).copied().unwrap_or(0.0);
            apply_ply_vertex_property(
                ty,
                name,
                value,
                &mut pos,
                &mut normal,
                &mut color,
                &mut alpha,
                &mut uv,
            );
        }
        let color = [
            color[0] * alpha,
            color[1] * alpha,
            color[2] * alpha,
        ];
        vertices.push(Vertex {
            pos,
            normal: if has_normals {
                normalize_normal_or_zero(normal)
            } else {
                [0.0, 0.0, 0.0]
            },
            uv,
            material_tint: clamp_color(color),
        });
    }

    let mut indices = Vec::new();
    for _ in 0..header.face_count {
        let line = lines.next().context("ply missing face line")?;
        let values: Vec<&str> = line.split_whitespace().collect();
        if header.face_properties.is_empty() {
            let count = values.first().and_then(|value| value.parse().ok()).unwrap_or(0);
            let face: Vec<u32> = values
                .iter()
                .skip(1)
                .take(count)
                .map(|value| value.parse().unwrap_or(0))
                .collect();
            append_triangulated_face(&mut indices, &face, header.vertex_count)?;
            continue;
        }

        let mut value_offset = 0;
        for property in &header.face_properties {
            if let Some(_count_ty) = &property.count_ty {
                let count = values
                    .get(value_offset)
                    .and_then(|value| value.parse().ok())
                    .unwrap_or(0);
                value_offset += 1;
                if is_ply_face_index_property(&property.name) {
                    let face: Vec<u32> = values
                        .iter()
                        .skip(value_offset)
                        .take(count)
                        .map(|value| value.parse().unwrap_or(0))
                        .collect();
                    append_triangulated_face(&mut indices, &face, header.vertex_count)?;
                }
                value_offset += count;
            } else {
                value_offset += 1;
            }
        }
    }
    finish_ply_mesh(vertices, indices)
}

fn parse_binary_ply(bytes: &[u8], header: &PlyHeader, big_endian: bool) -> Result<MeshData> {
    let mut offset = header.data_offset;
    let mut vertices = Vec::with_capacity(header.vertex_count);
    let has_normals = header
        .vertex_properties
        .iter()
        .any(|property| property.ends_with(":nx"));
    for _ in 0..header.vertex_count {
        let mut pos = [0.0, 0.0, 0.0];
        let mut normal = [0.0, 1.0, 0.0];
        let mut color = [1.0, 1.0, 1.0];
        let mut alpha = 1.0;
        let mut uv = [0.0, 0.0];
        for property in &header.vertex_properties {
            let mut parts = property.split(':');
            let ty = parts.next().unwrap_or("");
            let name = parts.next().unwrap_or("");
            let value = read_ply_scalar(bytes, &mut offset, ty, big_endian)? as f32;
            apply_ply_vertex_property(
                ty,
                name,
                value,
                &mut pos,
                &mut normal,
                &mut color,
                &mut alpha,
                &mut uv,
            );
        }
        let color = [
            color[0] * alpha,
            color[1] * alpha,
            color[2] * alpha,
        ];
        vertices.push(Vertex {
            pos,
            normal: if has_normals {
                normalize_normal_or_zero(normal)
            } else {
                [0.0, 0.0, 0.0]
            },
            uv,
            material_tint: clamp_color(color),
        });
    }

    let mut indices = Vec::new();
    for _ in 0..header.face_count {
        if header.face_properties.is_empty() {
            let count = read_ply_scalar(bytes, &mut offset, "uchar", big_endian)? as usize;
            let mut face = Vec::with_capacity(count);
            for _ in 0..count {
                face.push(read_ply_scalar(bytes, &mut offset, "int", big_endian)? as u32);
            }
            append_triangulated_face(&mut indices, &face, header.vertex_count)?;
            continue;
        }

        for property in &header.face_properties {
            if let Some(count_ty) = &property.count_ty {
                let count = read_ply_scalar(bytes, &mut offset, count_ty, big_endian)? as usize;
                if is_ply_face_index_property(&property.name) {
                    let mut face = Vec::with_capacity(count);
                    for _ in 0..count {
                        face.push(
                            read_ply_scalar(bytes, &mut offset, &property.item_ty, big_endian)?
                                as u32,
                        );
                    }
                    append_triangulated_face(&mut indices, &face, header.vertex_count)?;
                } else {
                    for _ in 0..count {
                        read_ply_scalar(bytes, &mut offset, &property.item_ty, big_endian)?;
                    }
                }
            } else {
                read_ply_scalar(bytes, &mut offset, &property.item_ty, big_endian)?;
            }
        }
    }
    finish_ply_mesh(vertices, indices)
}

fn parse_binary_little_ply(bytes: &[u8], header: &PlyHeader) -> Result<MeshData> {
    parse_binary_ply(bytes, header, false)
}

fn parse_binary_big_ply(bytes: &[u8], header: &PlyHeader) -> Result<MeshData> {
    parse_binary_ply(bytes, header, true)
}

fn load_ply_mesh(path: &str) -> Result<MeshData> {
    let bytes = std::fs::read(path).with_context(|| format!("ply read: {}", path))?;
    let header = parse_ply_header(&bytes)?;
    // Touch all declared binary scalar types early so unsupported files fail clearly.
    for property in &header.vertex_properties {
        let ty = property.split(':').next().unwrap_or("");
        if ply_scalar_size(ty).is_none() {
            anyhow::bail!("unsupported PLY vertex scalar type: {ty}");
        }
    }
    for property in &header.face_properties {
        if let Some(count_ty) = &property.count_ty {
            if ply_scalar_size(count_ty).is_none() {
                anyhow::bail!("unsupported PLY face list count type: {count_ty}");
            }
        }
        if ply_scalar_size(&property.item_ty).is_none() {
            anyhow::bail!("unsupported PLY face property type: {}", property.item_ty);
        }
    }
    match header.format {
        PlyFormat::Ascii => parse_ascii_ply(&bytes, &header),
        PlyFormat::BinaryLittleEndian => parse_binary_little_ply(&bytes, &header),
        PlyFormat::BinaryBigEndian => parse_binary_big_ply(&bytes, &header),
    }
}

