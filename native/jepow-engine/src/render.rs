use crate::viewport_session::ViewportSession;
use anyhow::Result;
use glam::{Mat4, Vec3};
use serde_json::json;

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct Uniforms {
    pub mvp: [f32; 16],
    pub light_dir_ambient: [f32; 4],
    pub diffuse_base: [f32; 4],
    pub material_params: [f32; 4],
    pub render_params: [f32; 4],
}

#[derive(Clone, Copy, Debug)]
pub struct ViewLight {
    pub yaw_deg: f32,
    pub pitch_deg: f32,
    pub ambient: f32,
    pub diffuse: f32,
    pub exposure: f32,
    pub environment: f32,
}

impl Default for ViewLight {
    fn default() -> Self {
        Self {
            yaw_deg: 45.0,
            pitch_deg: 35.0,
            ambient: 0.48,
            diffuse: 0.88,
            exposure: 1.0,
            environment: 1.0,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ViewMaterial {
    pub base_color: [f32; 3],
    pub roughness: f32,
    pub metalness: f32,
    pub specular: f32,
    pub clearcoat: f32,
    pub transmission: f32,
    pub emission_strength: f32,
}

impl Default for ViewMaterial {
    fn default() -> Self {
        Self {
            base_color: [0.76, 0.79, 0.84],
            roughness: 0.55,
            metalness: 0.0,
            specular: 0.5,
            clearcoat: 0.0,
            transmission: 0.0,
            emission_strength: 0.0,
        }
    }
}

pub fn light_direction_world(light: ViewLight) -> Vec3 {
    let yaw = light.yaw_deg.to_radians();
    let pitch = light.pitch_deg.to_radians();
    Vec3::new(
        pitch.cos() * yaw.sin(),
        pitch.sin().max(0.05),
        pitch.cos() * yaw.cos(),
    )
    .normalize()
}

pub fn build_uniforms(mvp: Mat4, light: ViewLight, material: ViewMaterial) -> Uniforms {
    let dir = light_direction_world(light);
    Uniforms {
        mvp: mvp.to_cols_array(),
        light_dir_ambient: [dir.x, dir.y, dir.z, light.ambient],
        diffuse_base: [
            light.diffuse,
            material.base_color[0],
            material.base_color[1],
            material.base_color[2],
        ],
        material_params: [
            material.roughness.clamp(0.02, 1.0),
            material.metalness.clamp(0.0, 1.0),
            material.specular.clamp(0.0, 1.0),
            material.clearcoat.clamp(0.0, 1.0),
        ],
        render_params: [
            light.exposure.clamp(0.05, 6.0),
            light.environment.clamp(0.0, 4.0),
            material.transmission.clamp(0.0, 1.0),
            material.emission_strength.clamp(0.0, 8.0),
        ],
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ViewCamera {
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
    pub pan_x: f32,
    pub pan_y: f32,
    pub pan_z: f32,
    pub fov: f32,
}

impl Default for ViewCamera {
    fn default() -> Self {
        Self {
            yaw: 0.55,
            pitch: 0.38,
            distance: 2.45,
            pan_x: 0.0,
            pan_y: 0.0,
            pan_z: 0.0,
            fov: 45.0_f32.to_radians(),
        }
    }
}

pub fn camera_mvp(width: u32, height: u32, cam: ViewCamera) -> Mat4 {
    let aspect = width as f32 / height.max(1) as f32;
    let fov = cam.fov.clamp(0.05, 3.13);
    let proj = Mat4::perspective_rh_gl(fov, aspect, 0.05, 100.0);
    let pitch = cam.pitch.clamp(-1.2, 1.2);
    let dist = cam.distance.clamp(0.35, 48.0);
    let center = Vec3::new(cam.pan_x, cam.pan_y, cam.pan_z);
    let eye = center
        + Vec3::new(
            dist * pitch.cos() * cam.yaw.sin(),
            dist * pitch.sin(),
            dist * pitch.cos() * cam.yaw.cos(),
        );
    let view = Mat4::look_at_rh(eye, center, Vec3::Y);
    proj * view
}

pub const VIEWPORT_WGSL: &str = r#"
struct Uniforms {
  mvp: mat4x4<f32>,
  light_dir: vec3<f32>,
  ambient: f32,
  diffuse_base: vec4<f32>,
  material_params: vec4<f32>,
  render_params: vec4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) pos: vec3<f32>,
  @location(1) normal: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) normal: vec3<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.pos = uniforms.mvp * vec4<f32>(input.pos, 1.0);
  out.normal = input.normal;
  return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let n = normalize(input.normal);
  let l = normalize(uniforms.light_dir);
  let ndotl = max(dot(n, l), 0.0);
  let diffuse = uniforms.diffuse_base.x;
  let base = uniforms.diffuse_base.yzw;
  let roughness = uniforms.material_params.x;
  let metalness = uniforms.material_params.y;
  let specular = uniforms.material_params.z;
  let clearcoat = uniforms.material_params.w;
  let exposure = uniforms.render_params.x;
  let environment = uniforms.render_params.y;
  let transmission = uniforms.render_params.z;
  let emission = uniforms.render_params.w;
  let env_fill = vec3<f32>(0.55, 0.62, 0.70) * environment * (0.12 + roughness * 0.18);
  let shade = clamp(uniforms.ambient + diffuse * ndotl, 0.05, 1.35);
  let view_dir = normalize(vec3<f32>(0.0, 0.0, 1.0));
  let half_dir = normalize(l + view_dir);
  let spec_power = mix(12.0, 180.0, 1.0 - roughness);
  let spec = pow(max(dot(n, half_dir), 0.0), spec_power) * (0.08 + specular * 0.45 + metalness * 0.45);
  let coat = pow(max(dot(n, half_dir), 0.0), 220.0) * clearcoat * 0.8;
  let fresnel = pow(1.0 - max(dot(n, view_dir), 0.0), 5.0);
  let rim = vec3<f32>(0.08, 0.10, 0.12) * fresnel * (1.0 + clearcoat);
  let diffuse_color = mix(base, vec3<f32>(0.78, 0.86, 0.95), transmission * 0.38);
  let lit = diffuse_color * shade + env_fill + rim + vec3<f32>(spec + coat) + base * emission;
  return vec4<f32>(clamp(lit * exposure, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
"#;

pub fn render_viewport_frame_from_payload(
    output_path: &str,
    width: u32,
    height: u32,
    scene_path: Option<&str>,
    camera: ViewCamera,
    light: ViewLight,
    material: ViewMaterial,
    highlight_object_id: Option<&str>,
    highlight_submesh_material: Option<ViewMaterial>,
    payload: &serde_json::Value,
) -> Result<()> {
    let mut session = ViewportSession::new()?;
    if let Some(path) = scene_path.filter(|p| !p.is_empty()) {
        session.load_scene(path)?;
    }
    session.set_camera(camera);
    session.set_light(light);
    session.set_material(material);
    session.set_highlight_object_id(highlight_object_id);
    session.set_highlight_submesh_material(highlight_submesh_material);
    session.set_assigned_submesh_materials(parse_assigned_submesh_materials(payload));
    session.draw_frame(output_path, width, height)?;
    Ok(())
}

fn parse_hex_color(raw: &str) -> Option<[f32; 3]> {
    let normalized = normalize_hex_tint(raw)?;
    let s = normalized.trim_start_matches('#');
    let r = u8::from_str_radix(&s[0..2], 16).ok()? as f32 / 255.0;
    let g = u8::from_str_radix(&s[2..4], 16).ok()? as f32 / 255.0;
    let b = u8::from_str_radix(&s[4..6], 16).ok()? as f32 / 255.0;
    Some([r, g, b])
}

pub fn parse_material(payload: &serde_json::Value) -> ViewMaterial {
    let mut material = ViewMaterial::default();
    if let Some(raw) = payload.get("materialTint").and_then(|v| v.as_str()) {
        if let Some(color) = parse_hex_color(raw) {
            material.base_color = color;
        }
    }
    if let Some(v) = payload.get("materialRoughness").and_then(|v| v.as_f64()) {
        material.roughness = v as f32;
    }
    if let Some(v) = payload.get("materialMetalness").and_then(|v| v.as_f64()) {
        material.metalness = v as f32;
    }
    if let Some(v) = payload.get("materialSpecular").and_then(|v| v.as_f64()) {
        material.specular = v as f32;
    }
    if let Some(v) = payload.get("materialClearcoat").and_then(|v| v.as_f64()) {
        material.clearcoat = v as f32;
    }
    if let Some(v) = payload.get("materialTransmission").and_then(|v| v.as_f64()) {
        material.transmission = v as f32;
    }
    if let Some(v) = payload
        .get("materialEmissionStrength")
        .and_then(|v| v.as_f64())
    {
        material.emission_strength = v as f32;
    }
    material
}

pub fn parse_light(payload: &serde_json::Value) -> ViewLight {
    let mut light = ViewLight::default();
    if let Some(v) = payload.get("lightYaw").and_then(|v| v.as_f64()) {
        light.yaw_deg = v as f32;
    }
    if let Some(v) = payload.get("lightPitch").and_then(|v| v.as_f64()) {
        light.pitch_deg = v as f32;
    }
    if let Some(v) = payload.get("lightAmbient").and_then(|v| v.as_f64()) {
        light.ambient = v as f32;
    }
    if let Some(v) = payload.get("lightDiffuse").and_then(|v| v.as_f64()) {
        light.diffuse = v as f32;
    }
    if let Some(v) = payload.get("lightExposure").and_then(|v| v.as_f64()) {
        light.exposure = v as f32;
    }
    if let Some(v) = payload.get("environmentIntensity").and_then(|v| v.as_f64()) {
        light.environment = v as f32;
    }
    light
}

pub fn parse_highlight_submesh_material(payload: &serde_json::Value) -> Option<ViewMaterial> {
    let tint = payload
        .get("highlightSubmeshMaterialTint")
        .and_then(|v| v.as_str())?;
    let mut mapped = serde_json::json!({ "materialTint": tint });
    if let Some(v) = payload
        .get("highlightSubmeshMaterialRoughness")
        .and_then(|v| v.as_f64())
    {
        mapped["materialRoughness"] = json!(v);
    }
    if let Some(v) = payload
        .get("highlightSubmeshMaterialMetalness")
        .and_then(|v| v.as_f64())
    {
        mapped["materialMetalness"] = json!(v);
    }
    if let Some(v) = payload
        .get("highlightSubmeshMaterialSpecular")
        .and_then(|v| v.as_f64())
    {
        mapped["materialSpecular"] = json!(v);
    }
    if let Some(v) = payload
        .get("highlightSubmeshMaterialClearcoat")
        .and_then(|v| v.as_f64())
    {
        mapped["materialClearcoat"] = json!(v);
    }
    if let Some(v) = payload
        .get("highlightSubmeshMaterialTransmission")
        .and_then(|v| v.as_f64())
    {
        mapped["materialTransmission"] = json!(v);
    }
    if let Some(v) = payload
        .get("highlightSubmeshMaterialEmissionStrength")
        .and_then(|v| v.as_f64())
    {
        mapped["materialEmissionStrength"] = json!(v);
    }
    Some(parse_material(&mapped))
}

#[derive(Clone, Debug)]
pub struct AssignedSubmeshMaterialEntry {
    pub object_id: String,
    pub material: ViewMaterial,
}

fn normalize_hex_tint(raw: &str) -> Option<String> {
    let s = raw.trim().trim_start_matches('#');
    if s.len() == 6 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        return Some(format!("#{}", s));
    }
    if s.len() == 3 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        let expanded: String = s.chars().flat_map(|c| [c, c]).collect();
        return Some(format!("#{}", expanded));
    }
    None
}

fn parse_submesh_material_from_value(obj: &serde_json::Value) -> Option<ViewMaterial> {
    if let Some(mat) = parse_material_fields_from_object(obj) {
        return Some(mat);
    }
    let mut mapped = serde_json::json!({});
    if let Some(tint) = obj
        .get("highlightSubmeshMaterialTint")
        .and_then(|v| v.as_str())
    {
        mapped["materialTint"] = json!(tint);
    }
    for (src, dst) in [
        ("highlightSubmeshMaterialRoughness", "materialRoughness"),
        ("highlightSubmeshMaterialMetalness", "materialMetalness"),
        ("highlightSubmeshMaterialSpecular", "materialSpecular"),
        ("highlightSubmeshMaterialClearcoat", "materialClearcoat"),
        ("highlightSubmeshMaterialTransmission", "materialTransmission"),
        ("highlightSubmeshMaterialEmissionStrength", "materialEmissionStrength"),
    ] {
        if let Some(v) = obj.get(src).and_then(|v| v.as_f64()) {
            mapped[dst] = json!(v);
        }
    }
    if mapped.get("materialTint").is_some() {
        return Some(parse_material(&mapped));
    }
    None
}

fn parse_material_fields_from_object(obj: &serde_json::Value) -> Option<ViewMaterial> {
    let tint_raw = obj
        .get("materialTint")
        .or_else(|| obj.get("tint"))
        .and_then(|v| v.as_str())
        .unwrap_or("#cccccc");
    let tint = normalize_hex_tint(tint_raw).unwrap_or_else(|| "#cccccc".to_string());
    let mut mapped = serde_json::json!({ "materialTint": tint });
    for (src, dst) in [
        ("materialRoughness", "materialRoughness"),
        ("roughness", "materialRoughness"),
        ("materialMetalness", "materialMetalness"),
        ("metalness", "materialMetalness"),
        ("materialSpecular", "materialSpecular"),
        ("specular", "materialSpecular"),
        ("materialClearcoat", "materialClearcoat"),
        ("clearcoat", "materialClearcoat"),
        ("materialTransmission", "materialTransmission"),
        ("transmission", "materialTransmission"),
        ("materialEmissionStrength", "materialEmissionStrength"),
        ("emissionStrength", "materialEmissionStrength"),
    ] {
        if let Some(v) = obj.get(src).and_then(|v| v.as_f64()) {
            mapped[dst] = json!(v);
        }
    }
    Some(parse_material(&mapped))
}

pub fn parse_assigned_submesh_materials(
    payload: &serde_json::Value,
) -> Vec<AssignedSubmeshMaterialEntry> {
    let Some(items) = payload
        .get("assignedSubmeshMaterials")
        .and_then(|v| v.as_array())
    else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for item in items {
        let object_id = item
            .get("objectId")
            .or_else(|| item.get("object_id"))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let Some(object_id) = object_id else {
            continue;
        };
        let material = parse_submesh_material_from_value(item).unwrap_or(ViewMaterial {
            base_color: [0.8, 0.2, 0.2],
            ..ViewMaterial::default()
        });
        out.push(AssignedSubmeshMaterialEntry {
            object_id: object_id.to_string(),
            material,
        });
    }
    out
}

pub fn find_submesh_index_range<'a>(
    submeshes: &'a [crate::mesh_loader::SubmeshRange],
    object_id: &str,
) -> Option<&'a crate::mesh_loader::SubmeshRange> {
    let needle = object_id.trim();
    submeshes
        .iter()
        .find(|r| r.object_id == needle)
        .or_else(|| {
            submeshes
                .iter()
                .find(|r| r.object_id.eq_ignore_ascii_case(needle))
        })
}

pub fn parse_camera(payload: &serde_json::Value) -> ViewCamera {
    let mut cam = ViewCamera::default();
    if let Some(v) = payload.get("cameraYaw").and_then(|v| v.as_f64()) {
        cam.yaw = v as f32;
    }
    if let Some(v) = payload.get("cameraPitch").and_then(|v| v.as_f64()) {
        cam.pitch = v as f32;
    }
    if let Some(v) = payload.get("cameraDistance").and_then(|v| v.as_f64()) {
        cam.distance = v as f32;
    }
    if let Some(v) = payload.get("cameraFov").and_then(|v| v.as_f64()) {
        cam.fov = v as f32;
    }
    if let Some(v) = payload.get("panX").and_then(|v| v.as_f64()) {
        cam.pan_x = v as f32;
    }
    if let Some(v) = payload.get("panY").and_then(|v| v.as_f64()) {
        cam.pan_y = v as f32;
    }
    if let Some(v) = payload.get("panZ").and_then(|v| v.as_f64()) {
        cam.pan_z = v as f32;
    }
    cam
}
