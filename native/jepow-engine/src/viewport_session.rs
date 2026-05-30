use crate::mesh_loader::{load_meshes_cached, MeshData, SubmeshRange, Vertex};
use anyhow::{Context, Result};
use glam::{EulerRot, Mat4, Quat, Vec3};
use image::{ImageBuffer, Rgba};
use std::path::Path;
use wgpu::util::DeviceExt;

use crate::render::{
    build_uniforms, camera_mvp, AssignedSubmeshMaterialEntry, Uniforms, ViewCamera, ViewLight,
    ViewMaterial, VIEWPORT_WGSL,
};

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct PickUniforms {
    mvp: [f32; 16],
}

const PICK_WGSL: &str = r#"
struct PickUniforms {
  mvp: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: PickUniforms;

struct VertexInput {
  @location(0) pos: vec3<f32>,
  @location(1) pick_id: f32,
};

struct VertexOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) pick_id: f32,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.pos = uniforms.mvp * vec4<f32>(input.pos, 1.0);
  out.pick_id = input.pick_id;
  return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let id = u32(input.pick_id + 0.5);
  let r = f32(id & 255u) / 255.0;
  let g = f32((id >> 8u) & 255u) / 255.0;
  let b = f32((id >> 16u) & 255u) / 255.0;
  return vec4<f32>(r, g, b, 1.0);
}
"#;

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct HighlightFillUniforms {
    mvp: [f32; 16],
    color: [f32; 4],
}

const HIGHLIGHT_FILL_WGSL: &str = r#"
struct HighlightFillUniforms {
  mvp: mat4x4<f32>,
  color: vec4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: HighlightFillUniforms;

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
  let l = normalize(vec3<f32>(0.25, 0.9, 0.45));
  let shade = 0.62 + 0.38 * max(dot(n, l), 0.0);
  return vec4(uniforms.color.rgb * shade, uniforms.color.a);
}
"#;

const DEFAULT_SELECTION_HIGHLIGHT_RGBA: [f32; 4] = [0.22, 0.68, 0.98, 0.42];

fn demo_mesh() -> MeshData {
    MeshData {
        vertices: vec![
            Vertex {
                pos: [0.0, 0.55, 0.0],
                normal: [0.2, 0.9, 0.3],
                uv: [0.5, 0.0],
                material_tint: [1.0, 1.0, 1.0],
                pick_id: 1.0,
            },
            Vertex {
                pos: [-0.55, -0.35, 0.0],
                normal: [-0.6, 0.5, 0.2],
                uv: [0.0, 1.0],
                material_tint: [1.0, 1.0, 1.0],
                pick_id: 1.0,
            },
            Vertex {
                pos: [0.55, -0.35, 0.0],
                normal: [0.6, 0.5, 0.2],
                uv: [1.0, 1.0],
                material_tint: [1.0, 1.0, 1.0],
                pick_id: 1.0,
            },
        ],
        indices: vec![0, 1, 2],
        submeshes: vec![SubmeshRange {
            object_id: "mesh-0".to_string(),
            index_start: 0,
            index_count: 3,
            pick_id: 1,
        }],
        material_color: Some([0.35, 0.78, 0.62]),
        metallic_factor: 0.0,
        roughness_factor: 0.65,
        base_color_texture: None,
        metallic_roughness_texture: None,
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ObjectTransform {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub rx: f32,
    pub ry: f32,
    pub rz: f32,
    pub scale: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ShadingMode {
    Clay,
    Render,
}

pub fn scene_fit_matrix(mesh: &MeshData) -> Mat4 {
    if mesh.vertices.is_empty() {
        return Mat4::IDENTITY;
    }
    let mut min = Vec3::splat(f32::MAX);
    let mut max = Vec3::splat(f32::MIN);
    for v in &mesh.vertices {
        let p = Vec3::new(v.pos[0], v.pos[1], v.pos[2]);
        min = min.min(p);
        max = max.max(p);
    }
    let center = (min + max) * 0.5;
    let size = max - min;
    let max_dim = size.x.max(size.y).max(size.z).max(1e-6);
    let scale = 1.6 / max_dim;
    Mat4::from_scale(Vec3::splat(scale)) * Mat4::from_translation(-center)
}

/// Blender-style persistent viewport: GPU + mesh stay loaded; frames only update uniforms.
pub struct ViewportSession {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::RenderPipeline,
    pick_pipeline: wgpu::RenderPipeline,
    bind_group: wgpu::BindGroup,
    fill_bind_group: wgpu::BindGroup,
    highlight_fill_pipeline: wgpu::RenderPipeline,
    highlight_fill_bind_group: wgpu::BindGroup,
    pick_bind_group: wgpu::BindGroup,
    uniform_buffer: wgpu::Buffer,
    fill_uniform_buffer: wgpu::Buffer,
    highlight_fill_uniform_buffer: wgpu::Buffer,
    pick_uniform_buffer: wgpu::Buffer,
    vertex_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,
    index_count: u32,
    submesh_ranges: Vec<SubmeshRange>,
    pick_object_ids: Vec<String>,
    scene_path: Option<String>,
    camera: ViewCamera,
    light: ViewLight,
    material: ViewMaterial,
    transform: ObjectTransform,
    scene_fit: Mat4,
    shading: ShadingMode,
    frame_w: u32,
    frame_h: u32,
    color_texture: wgpu::Texture,
    color_view: wgpu::TextureView,
    depth_texture: wgpu::Texture,
    depth_view: wgpu::TextureView,
    pick_texture: wgpu::Texture,
    pick_view: wgpu::TextureView,
    pick_depth_texture: wgpu::Texture,
    pick_depth_view: wgpu::TextureView,
    highlight_object_id: Option<String>,
    highlight_index_range: Option<(u32, u32)>,
    highlight_submesh_material: Option<ViewMaterial>,
    assigned_submesh_materials: Vec<AssignedSubmeshMaterialEntry>,
}

impl ViewportSession {
    pub fn new() -> Result<Self> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });

        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        }))
        .context("no GPU adapter")?;

        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("jepow-viewport-session"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::Performance,
            },
            None,
        ))?;

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("jepow-viewport-shader"),
            source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(VIEWPORT_WGSL)),
        });

        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("jepow-uniforms"),
            size: std::mem::size_of::<Uniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let fill_uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("jepow-submesh-fill-uniforms"),
            size: std::mem::size_of::<Uniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let highlight_fill_uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("jepow-highlight-fill-uniforms"),
            size: std::mem::size_of::<HighlightFillUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let pick_uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("jepow-pick-uniforms"),
            size: std::mem::size_of::<PickUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("jepow-uniform-layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("jepow-uniform-bind"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });
        let fill_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("jepow-submesh-fill-bind"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: fill_uniform_buffer.as_entire_binding(),
            }],
        });
        let highlight_fill_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("jepow-highlight-fill-uniform-bind"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: highlight_fill_uniform_buffer.as_entire_binding(),
            }],
        });
        let pick_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("jepow-pick-uniform-bind"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: pick_uniform_buffer.as_entire_binding(),
            }],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("jepow-pipeline-layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("jepow-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        wgpu::VertexAttribute {
                            offset: 0,
                            shader_location: 0,
                            format: wgpu::VertexFormat::Float32x3,
                        },
                        wgpu::VertexAttribute {
                            offset: 12,
                            shader_location: 1,
                            format: wgpu::VertexFormat::Float32x3,
                        },
                    ],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8UnormSrgb,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::LessEqual,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });
        let pick_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("jepow-pick-shader"),
            source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(PICK_WGSL)),
        });
        let pick_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("jepow-pick-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &pick_shader,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        wgpu::VertexAttribute {
                            offset: 0,
                            shader_location: 0,
                            format: wgpu::VertexFormat::Float32x3,
                        },
                        wgpu::VertexAttribute {
                            offset: 44,
                            shader_location: 1,
                            format: wgpu::VertexFormat::Float32,
                        },
                    ],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &pick_shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: true,
                depth_compare: wgpu::CompareFunction::Less,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let highlight_fill_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("jepow-highlight-fill-shader"),
            source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(HIGHLIGHT_FILL_WGSL)),
        });
        let highlight_fill_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("jepow-highlight-fill-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &highlight_fill_shader,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &[
                        wgpu::VertexAttribute {
                            offset: 0,
                            shader_location: 0,
                            format: wgpu::VertexFormat::Float32x3,
                        },
                        wgpu::VertexAttribute {
                            offset: 12,
                            shader_location: 1,
                            format: wgpu::VertexFormat::Float32x3,
                        },
                    ],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &highlight_fill_shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8UnormSrgb,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::LessEqual,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let (vertex_buffer, index_buffer, index_count) = Self::upload_mesh(&device, &demo_mesh())?;

        let (frame_w, frame_h) = (640u32, 480u32);
        let (color_texture, color_view, depth_texture, depth_view) =
            Self::create_frame_targets(&device, frame_w, frame_h);
        let (pick_texture, pick_view, pick_depth_texture, pick_depth_view) =
            Self::create_pick_targets(&device, frame_w, frame_h);

        Ok(Self {
            device,
            queue,
            pipeline,
            pick_pipeline,
            bind_group,
            fill_bind_group,
            highlight_fill_pipeline,
            highlight_fill_bind_group,
            pick_bind_group,
            uniform_buffer,
            fill_uniform_buffer,
            highlight_fill_uniform_buffer,
            pick_uniform_buffer,
            vertex_buffer,
            index_buffer,
            index_count,
            submesh_ranges: demo_mesh().submeshes,
            pick_object_ids: vec!["mesh-0".to_string()],
            scene_path: None,
            camera: ViewCamera::default(),
            light: ViewLight::default(),
            material: ViewMaterial::default(),
            transform: ObjectTransform {
                scale: 1.0,
                ..Default::default()
            },
            scene_fit: Mat4::IDENTITY,
            shading: ShadingMode::Clay,
            frame_w,
            frame_h,
            color_texture,
            color_view,
            depth_texture,
            depth_view,
            pick_texture,
            pick_view,
            pick_depth_texture,
            pick_depth_view,
            highlight_object_id: None,
            highlight_index_range: None,
            highlight_submesh_material: None,
            assigned_submesh_materials: Vec::new(),
        })
    }

    pub fn set_assigned_submesh_materials(&mut self, materials: Vec<AssignedSubmeshMaterialEntry>) {
        self.assigned_submesh_materials = materials;
    }

    pub fn set_highlight_submesh_material(&mut self, material: Option<ViewMaterial>) {
        self.highlight_submesh_material = material;
    }

    pub fn set_highlight_object_id(&mut self, object_id: Option<&str>) {
        let next_id = object_id.map(|s| s.trim()).filter(|s| !s.is_empty());
        if next_id == self.highlight_object_id.as_deref() {
            return;
        }
        self.highlight_object_id = next_id.map(|s| s.to_string());
        self.highlight_index_range = None;

        let Some(oid) = self.highlight_object_id.as_deref() else {
            return;
        };
        self.highlight_index_range = self
            .find_submesh_range(oid)
            .map(|range| (range.index_start, range.index_count));
    }

    fn upload_mesh(
        device: &wgpu::Device,
        mesh: &MeshData,
    ) -> Result<(wgpu::Buffer, wgpu::Buffer, u32)> {
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("jepow-vertex-buffer"),
            contents: bytemuck::cast_slice(&mesh.vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("jepow-index-buffer"),
            contents: bytemuck::cast_slice(&mesh.indices),
            usage: wgpu::BufferUsages::INDEX,
        });
        Ok((vertex_buffer, index_buffer, mesh.indices.len() as u32))
    }

    fn create_frame_targets(
        device: &wgpu::Device,
        width: u32,
        height: u32,
    ) -> (
        wgpu::Texture,
        wgpu::TextureView,
        wgpu::Texture,
        wgpu::TextureView,
    ) {
        let color_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("jepow-color"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let color_view = color_texture.create_view(&Default::default());
        let depth_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("jepow-depth"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let depth_view = depth_texture.create_view(&Default::default());
        (color_texture, color_view, depth_texture, depth_view)
    }

    fn create_pick_targets(
        device: &wgpu::Device,
        width: u32,
        height: u32,
    ) -> (
        wgpu::Texture,
        wgpu::TextureView,
        wgpu::Texture,
        wgpu::TextureView,
    ) {
        let pick_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("jepow-pick-id"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let pick_view = pick_texture.create_view(&Default::default());
        let pick_depth_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("jepow-pick-depth"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let pick_depth_view = pick_depth_texture.create_view(&Default::default());
        (pick_texture, pick_view, pick_depth_texture, pick_depth_view)
    }

    pub fn load_scene(&mut self, path: &str) -> Result<serde_json::Value> {
        let mesh = load_meshes_cached(path)?;
        let (vb, ib, count) = Self::upload_mesh(&self.device, mesh.as_ref())?;
        self.vertex_buffer = vb;
        self.index_buffer = ib;
        self.index_count = count;
        self.submesh_ranges = mesh.submeshes.clone();
        self.pick_object_ids = Self::pick_object_ids(&mesh.submeshes);
        self.scene_fit = scene_fit_matrix(mesh.as_ref());
        self.scene_path = Some(path.to_string());
        Ok(serde_json::json!({
            "scenePath": path,
            "triangleCount": count / 3,
            "vertexCount": mesh.vertices.len(),
            "session": true,
        }))
    }

    fn pick_object_ids(submeshes: &[SubmeshRange]) -> Vec<String> {
        let mut ids = Vec::new();
        for submesh in submeshes {
            if submesh.pick_id == 0 || submesh.index_count == 0 {
                continue;
            }
            let _range = submesh.index_start..submesh.index_start + submesh.index_count;
            let index = (submesh.pick_id - 1) as usize;
            if ids.len() <= index {
                ids.resize(index + 1, String::new());
            }
            ids[index] = submesh.object_id.clone();
        }
        ids
    }

    pub fn set_camera(&mut self, camera: ViewCamera) {
        self.camera = camera;
    }

    pub fn set_light(&mut self, light: ViewLight) {
        self.light = light;
    }

    pub fn set_material(&mut self, material: ViewMaterial) {
        self.material = material;
    }

    pub fn set_transform(&mut self, transform: ObjectTransform) {
        self.transform = transform;
    }

    pub fn set_shading(&mut self, mode: ShadingMode) {
        self.shading = mode;
    }

    fn model_matrix(&self) -> Mat4 {
        let t = &self.transform;
        let scale = if t.scale > 0.01 { t.scale } else { 1.0 };
        let rot = Quat::from_euler(
            EulerRot::XYZ,
            t.rx.to_radians(),
            t.ry.to_radians(),
            t.rz.to_radians(),
        );
        Mat4::from_scale_rotation_translation(Vec3::splat(scale), rot, Vec3::new(t.x, t.y, t.z))
            * self.scene_fit
    }

    fn effective_light(&self) -> ViewLight {
        let mut light = self.light;
        if self.shading == ShadingMode::Render {
            light.ambient *= 0.82;
            light.diffuse *= 1.35;
            light.environment *= 1.15;
        } else {
            light.exposure = 1.0;
            light.environment = 0.65;
        }
        light
    }

    fn effective_material(&self) -> ViewMaterial {
        if !self.assigned_submesh_materials.is_empty() {
            return ViewMaterial::default();
        }
        match self.shading {
            ShadingMode::Clay => ViewMaterial::default(),
            ShadingMode::Render => self.material,
        }
    }

    fn selection_highlight_rgba(&self) -> [f32; 4] {
        if let Some(mat) = self.highlight_submesh_material {
            return [
                mat.base_color[0],
                mat.base_color[1],
                mat.base_color[2],
                DEFAULT_SELECTION_HIGHLIGHT_RGBA[3],
            ];
        }
        DEFAULT_SELECTION_HIGHLIGHT_RGBA
    }

    /// Selection feedback: semi-transparent fill over the picked sub-mesh indices.
    fn draw_highlight_fill(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        mvp: Mat4,
        index_range: std::ops::Range<u32>,
    ) {
        if index_range.is_empty() {
            return;
        }
        let uniforms = HighlightFillUniforms {
            mvp: mvp.to_cols_array(),
            color: self.selection_highlight_rgba(),
        };
        self.queue.write_buffer(
            &self.highlight_fill_uniform_buffer,
            0,
            bytemuck::bytes_of(&uniforms),
        );
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("jepow-highlight-fill-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &self.color_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &self.depth_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            occlusion_query_set: None,
            timestamp_writes: None,
        });
        pass.set_pipeline(&self.highlight_fill_pipeline);
        pass.set_bind_group(0, &self.highlight_fill_bind_group, &[]);
        pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
        pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
        pass.draw_indexed(index_range, 0, 0..1);
    }

    fn draw_submesh_fill(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        mvp: Mat4,
        index_range: std::ops::Range<u32>,
        material: ViewMaterial,
    ) {
        if index_range.is_empty() {
            return;
        }
        let fill_uniforms = build_uniforms(mvp, self.effective_light(), material);
        self.queue.write_buffer(
            &self.fill_uniform_buffer,
            0,
            bytemuck::bytes_of(&fill_uniforms),
        );
        let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("jepow-submesh-fill-pass"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &self.color_view,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &self.depth_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            occlusion_query_set: None,
            timestamp_writes: None,
        });
        pass.set_pipeline(&self.pipeline);
        pass.set_bind_group(0, &self.fill_bind_group, &[]);
        pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
        pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
        pass.draw_indexed(index_range, 0, 0..1);
    }

    fn find_submesh_range(&self, object_id: &str) -> Option<&SubmeshRange> {
        crate::render::find_submesh_index_range(&self.submesh_ranges, object_id)
    }

    fn ensure_frame_size(&mut self, width: u32, height: u32) {
        if width == self.frame_w && height == self.frame_h {
            return;
        }
        self.frame_w = width;
        self.frame_h = height;
        let (c, cv, d, dv) = Self::create_frame_targets(&self.device, width, height);
        self.color_texture = c;
        self.color_view = cv;
        self.depth_texture = d;
        self.depth_view = dv;
        let (p, pv, pd, pdv) = Self::create_pick_targets(&self.device, width, height);
        self.pick_texture = p;
        self.pick_view = pv;
        self.pick_depth_texture = pd;
        self.pick_depth_view = pdv;
    }

    fn render_pick_ids(&mut self, width: u32, height: u32) {
        self.ensure_frame_size(width, height);
        let mvp = camera_mvp(width, height, self.camera) * self.model_matrix();
        let uniforms = PickUniforms {
            mvp: mvp.to_cols_array(),
        };
        self.queue
            .write_buffer(&self.pick_uniform_buffer, 0, bytemuck::bytes_of(&uniforms));

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("jepow-pick-encoder"),
            });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("jepow-pick-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.pick_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.pick_depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pick_pipeline);
            pass.set_bind_group(0, &self.pick_bind_group, &[]);
            pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
            pass.draw_indexed(0..self.index_count, 0, 0..1);
        }
        self.queue.submit(Some(encoder.finish()));
    }

    pub fn pick_scene_object(
        &mut self,
        cursor_x: f32,
        cursor_y: f32,
        width: u32,
        height: u32,
    ) -> Result<Option<String>> {
        let width = width.clamp(1, 4096);
        let height = height.clamp(1, 4096);
        self.render_pick_ids(width, height);
        let x = cursor_x.floor().clamp(0.0, (width - 1) as f32) as u32;
        let y = cursor_y.floor().clamp(0.0, (height - 1) as f32) as u32;
        let id = readback_pick_id(
            &self.device,
            &self.queue,
            &self.pick_texture,
            x,
            y,
            width,
            height,
            8,
        )?;
        if id == 0 {
            return Ok(None);
        }
        Ok(self
            .pick_object_ids
            .get((id - 1) as usize)
            .and_then(|s| (!s.is_empty()).then(|| s.clone())))
    }

    pub fn draw_frame(&mut self, output_path: &str, width: u32, height: u32) -> Result<u64> {
        let started = std::time::Instant::now();
        let width = width.clamp(64, 4096);
        let height = height.clamp(64, 4096);
        self.ensure_frame_size(width, height);

        let view = camera_mvp(width, height, self.camera);
        let mvp = view * self.model_matrix();
        let uniforms = build_uniforms(mvp, self.effective_light(), self.effective_material());
        self.queue
            .write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&uniforms));

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("jepow-viewport-encoder"),
            });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("jepow-viewport-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.color_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.04,
                            g: 0.05,
                            b: 0.06,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind_group, &[]);
            pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            pass.set_index_buffer(self.index_buffer.slice(..), wgpu::IndexFormat::Uint32);
            pass.draw_indexed(0..self.index_count, 0, 0..1);
        }

        for assigned in &self.assigned_submesh_materials {
            let Some(range) = self.find_submesh_range(&assigned.object_id) else {
                continue;
            };
            if range.index_count == 0 {
                continue;
            }
            let index_range = range.index_start..range.index_start + range.index_count;
            self.draw_submesh_fill(
                &mut encoder,
                mvp,
                index_range,
                assigned.material,
            );
        }

        if let Some((start, count)) = self.highlight_index_range {
            if count > 0 {
                let range = start..start + count;
                self.draw_highlight_fill(&mut encoder, mvp, range);
            }
        }

        self.queue.submit(Some(encoder.finish()));
        readback_png(
            &self.device,
            &self.queue,
            &self.color_texture,
            output_path,
            width,
            height,
        )?;
        Ok(started.elapsed().as_millis() as u64)
    }
}

fn readback_png(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    texture: &wgpu::Texture,
    output_path: &str,
    width: u32,
    height: u32,
) -> Result<()> {
    let bytes_per_row = (width * 4).div_ceil(256) * 256;
    let buffer_size = bytes_per_row as u64 * height as u64;
    let readback = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("jepow-readback"),
        size: buffer_size,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut copy_encoder = device.create_command_encoder(&Default::default());
    copy_encoder.copy_texture_to_buffer(
        texture.as_image_copy(),
        wgpu::ImageCopyBuffer {
            buffer: &readback,
            layout: wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(bytes_per_row),
                rows_per_image: Some(height),
            },
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
    queue.submit(Some(copy_encoder.finish()));

    let slice = readback.slice(..);
    slice.map_async(wgpu::MapMode::Read, |_| {});
    device.poll(wgpu::Maintain::Wait);
    let data = slice.get_mapped_range();

    let mut pixels = Vec::with_capacity((width * height * 4) as usize);
    for y in 0..height {
        let start = (y * bytes_per_row) as usize;
        let row = &data[start..start + (width * 4) as usize];
        pixels.extend_from_slice(row);
    }
    drop(data);
    readback.unmap();

    if let Some(parent) = Path::new(output_path).parent() {
        std::fs::create_dir_all(parent)?;
    }

    let img: ImageBuffer<Rgba<u8>, Vec<u8>> =
        ImageBuffer::from_raw(width, height, pixels).ok_or_else(|| anyhow::anyhow!("bad frame"))?;
    img.save(output_path)?;
    Ok(())
}

fn readback_pick_id(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    texture: &wgpu::Texture,
    x: u32,
    y: u32,
    texture_width: u32,
    texture_height: u32,
    radius: u32,
) -> Result<u32> {
    let min_x = x.saturating_sub(radius);
    let min_y = y.saturating_sub(radius);
    let max_x = (x + radius).min(texture_width.saturating_sub(1));
    let max_y = (y + radius).min(texture_height.saturating_sub(1));
    let sample_w = (max_x - min_x + 1).max(1);
    let sample_h = (max_y - min_y + 1).max(1);
    let bytes_per_row = (sample_w * 4).div_ceil(256) * 256;
    let readback = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("jepow-pick-region-readback"),
        size: bytes_per_row as u64 * sample_h as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("jepow-pick-readback-encoder"),
    });
    encoder.copy_texture_to_buffer(
        wgpu::ImageCopyTexture {
            texture,
            mip_level: 0,
            origin: wgpu::Origin3d {
                x: min_x,
                y: min_y,
                z: 0,
            },
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::ImageCopyBuffer {
            buffer: &readback,
            layout: wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(bytes_per_row),
                rows_per_image: Some(sample_h),
            },
        },
        wgpu::Extent3d {
            width: sample_w,
            height: sample_h,
            depth_or_array_layers: 1,
        },
    );
    queue.submit(Some(encoder.finish()));
    let slice = readback.slice(..);
    slice.map_async(wgpu::MapMode::Read, |_| {});
    device.poll(wgpu::Maintain::Wait);
    let data = slice.get_mapped_range();
    let center_x = x - min_x;
    let center_y = y - min_y;
    let mut best: Option<(u32, u32)> = None;
    for sy in 0..sample_h {
        let row_start = (sy * bytes_per_row) as usize;
        for sx in 0..sample_w {
            let offset = row_start + (sx * 4) as usize;
            let id = data[offset] as u32
                | ((data[offset + 1] as u32) << 8)
                | ((data[offset + 2] as u32) << 16);
            if id == 0 {
                continue;
            }
            let dx = sx.abs_diff(center_x);
            let dy = sy.abs_diff(center_y);
            let dist2 = dx * dx + dy * dy;
            if best.map(|(_, best_dist)| dist2 < best_dist).unwrap_or(true) {
                best = Some((id, dist2));
            }
        }
    }
    let id = best.map(|(id, _)| id).unwrap_or(0);
    drop(data);
    readback.unmap();
    Ok(id)
}

pub fn parse_object_transform(payload: &serde_json::Value) -> ObjectTransform {
    let t_val = payload.get("transform").unwrap_or(payload);
    let mut t = ObjectTransform {
        scale: 1.0,
        ..Default::default()
    };
    if let Some(v) = t_val.get("x").and_then(|v| v.as_f64()) {
        t.x = v as f32;
    }
    if let Some(v) = t_val.get("y").and_then(|v| v.as_f64()) {
        t.y = v as f32;
    }
    if let Some(v) = t_val.get("z").and_then(|v| v.as_f64()) {
        t.z = v as f32;
    }
    if let Some(v) = t_val.get("rx").and_then(|v| v.as_f64()) {
        t.rx = v as f32;
    }
    if let Some(v) = t_val.get("ry").and_then(|v| v.as_f64()) {
        t.ry = v as f32;
    }
    if let Some(v) = t_val.get("rz").and_then(|v| v.as_f64()) {
        t.rz = v as f32;
    }
    if let Some(v) = t_val.get("scale").and_then(|v| v.as_f64()) {
        t.scale = v as f32;
    }
    t
}

pub fn parse_shading(payload: &serde_json::Value) -> ShadingMode {
    match payload
        .get("shading")
        .or_else(|| payload.get("shadingMode"))
        .and_then(|v| v.as_str())
    {
        Some("render") | Some("rendered") => ShadingMode::Render,
        _ => ShadingMode::Clay,
    }
}
