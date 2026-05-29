use glam::{EulerRot, Mat4, Quat, Vec3, Vec4};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::time::Instant;
use wgpu::util::DeviceExt;
use winit::application::ApplicationHandler;
use winit::dpi::{PhysicalPosition, PhysicalSize};
use winit::event::{ElementState, MouseButton, MouseScrollDelta, WindowEvent};
use winit::event_loop::{ActiveEventLoop, ControlFlow, EventLoop};
use winit::window::{Window, WindowAttributes, WindowId, WindowLevel};

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct HostVertex {
    pos: [f32; 3],
    normal: [f32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct ImportedHostVertex {
    pos: [f32; 3],
    normal: [f32; 3],
    uv: [f32; 2],
    material_tint: [f32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
struct HostUniforms {
    mvp: [f32; 16],
    normal: [f32; 16],
    color_selected: [f32; 4],
    light_dir: [f32; 4],
    material_params: [f32; 4],
}

struct ImportedGpuMesh {
    source_stamp: String,
    vertex_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,
    index_count: u32,
    edge_vertex_buffer: wgpu::Buffer,
    edge_vertex_count: u32,
    material_color: Option<[f32; 3]>,
    metallic_factor: f32,
    roughness_factor: f32,
    _base_color_texture: Option<wgpu::Texture>,
    _metallic_roughness_texture: Option<wgpu::Texture>,
    texture_bind_group: Arc<wgpu::BindGroup>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum HostTool {
    Select,
    Translate,
    Rotate,
    Scale,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum HostDisplayMode {
    Wireframe,
    Solid,
    Material,
    Cl,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum HostProjection {
    Perspective,
    Orthographic,
}

impl Default for HostDisplayMode {
    fn default() -> Self {
        Self::Cl
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GizmoAxis {
    X,
    Y,
    Z,
}

impl Default for HostTool {
    fn default() -> Self {
        Self::Select
    }
}

#[derive(Clone, Debug, Deserialize)]
struct HostTransform {
    #[serde(default)]
    position: [f32; 3],
    #[serde(default)]
    rotation: [f32; 3],
    #[serde(default = "unit_scale")]
    scale: [f32; 3],
}

fn unit_scale() -> [f32; 3] {
    [1.0, 1.0, 1.0]
}

impl Default for HostTransform {
    fn default() -> Self {
        Self {
            position: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0],
            scale: unit_scale(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
struct HostObject {
    id: String,
    name: String,
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    transform: HostTransform,
    #[serde(default = "default_visible")]
    visible: bool,
    #[serde(default)]
    locked: bool,
    #[serde(default, alias = "materialColor")]
    material_color: Option<String>,
    #[serde(default, alias = "assetPath")]
    asset_path: Option<String>,
    #[serde(default, alias = "importBackend")]
    import_backend: Option<String>,
    #[serde(default, alias = "triangleCount")]
    triangle_count: Option<u64>,
    #[serde(default, alias = "vertexCount")]
    vertex_count: Option<u64>,
    #[serde(default, alias = "boundsMin")]
    bounds_min: Option<[f32; 3]>,
    #[serde(default, alias = "boundsMax")]
    bounds_max: Option<[f32; 3]>,
    #[serde(default, alias = "boundsSize")]
    bounds_size: Option<[f32; 3]>,
    #[serde(default, alias = "hasBaseColorTexture")]
    has_base_color_texture: bool,
    #[serde(default, alias = "hasMetallicRoughnessTexture")]
    has_metallic_roughness_texture: bool,
    #[serde(default, alias = "metallicFactor")]
    metallic_factor: Option<f32>,
    #[serde(default, alias = "roughnessFactor")]
    roughness_factor: Option<f32>,
}

fn default_visible() -> bool {
    true
}

impl Default for HostObject {
    fn default() -> Self {
        Self {
            id: "cube".to_string(),
            name: "Cube".to_string(),
            kind: "mesh".to_string(),
            transform: HostTransform::default(),
            visible: true,
            locked: false,
            material_color: Some("#b9bdc5".to_string()),
            asset_path: None,
            import_backend: None,
            triangle_count: None,
            vertex_count: None,
            bounds_min: None,
            bounds_max: None,
            bounds_size: None,
            has_base_color_texture: false,
            has_metallic_roughness_texture: false,
            metallic_factor: None,
            roughness_factor: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
struct HostBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    #[serde(default = "one", alias = "scaleFactor")]
    scale_factor: f64,
    #[serde(default, alias = "alwaysOnTop")]
    always_on_top: bool,
}

impl HostBounds {
    fn physical_size(self) -> PhysicalSize<u32> {
        PhysicalSize::new(
            (self.width as f64 * self.scale_factor).round().max(1.0) as u32,
            (self.height as f64 * self.scale_factor).round().max(1.0) as u32,
        )
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
struct HostCamera {
    #[serde(default)]
    yaw: Option<f32>,
    #[serde(default)]
    pitch: Option<f32>,
    #[serde(default)]
    distance: Option<f32>,
    #[serde(default)]
    projection: Option<HostProjection>,
    #[serde(default = "one_f32")]
    speed: f32,
}

#[derive(Clone, Copy, Debug, Deserialize)]
struct HostSnap {
    #[serde(default)]
    enabled: bool,
    #[serde(default = "default_snap_increment")]
    increment: f32,
}

fn default_snap_increment() -> f32 {
    0.5
}

fn one() -> f64 {
    1.0
}

fn one_f32() -> f32 {
    1.0
}

#[derive(Debug)]
struct HostRequest {
    id: Option<u64>,
    cmd: String,
    payload: Value,
}

struct GpuState {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    pipeline: wgpu::RenderPipeline,
    line_pipeline: wgpu::RenderPipeline,
    imported_pipeline: wgpu::RenderPipeline,
    uniform_buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    texture_bind_group_layout: wgpu::BindGroupLayout,
    texture_sampler: wgpu::Sampler,
    _default_texture: wgpu::Texture,
    _default_metallic_roughness_texture: wgpu::Texture,
    default_texture_bind_group: Arc<wgpu::BindGroup>,
    vertex_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,
    index_count: u32,
    edge_vertex_buffer: wgpu::Buffer,
    edge_vertex_count: u32,
    grid_vertex_buffer: wgpu::Buffer,
    grid_vertex_count: u32,
    gizmo_vertex_buffer: wgpu::Buffer,
    imported_meshes: HashMap<String, ImportedGpuMesh>,
    depth_texture: wgpu::Texture,
    depth_view: wgpu::TextureView,
}

impl GpuState {
    fn new(window: Arc<Window>, width: u32, height: u32) -> anyhow::Result<Self> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });
        let surface = instance.create_surface(window.clone())?;
        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
        }))
        .ok_or_else(|| anyhow::anyhow!("no GPU adapter for native viewport surface"))?;
        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("jepow-native-viewport-host"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::Performance,
            },
            None,
        ))?;
        let caps = surface.get_capabilities(&adapter);
        let format = caps
            .formats
            .iter()
            .copied()
            .find(|f| f.is_srgb())
            .unwrap_or(caps.formats[0]);
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: width.max(1),
            height: height.max(1),
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &config);

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("jepow-host-shader"),
            source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(HOST_WGSL)),
        });
        let imported_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("jepow-host-imported-shader"),
            source: wgpu::ShaderSource::Wgsl(std::borrow::Cow::Borrowed(IMPORTED_HOST_WGSL)),
        });
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("jepow-host-uniforms"),
            size: std::mem::size_of::<HostUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("jepow-host-uniform-layout"),
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
            label: Some("jepow-host-uniform-bind"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });
        let texture_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("jepow-host-imported-texture-layout"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            multisampled: false,
                            view_dimension: wgpu::TextureViewDimension::D2,
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            multisampled: false,
                            view_dimension: wgpu::TextureViewDimension::D2,
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        },
                        count: None,
                    },
                ],
            });
        let texture_sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("jepow-host-imported-texture-sampler"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            address_mode_w: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        let default_mr_pixel = [255, 255, 255, 255];
        let (default_texture, default_mr_texture, default_texture_bind_group_raw) =
            create_imported_texture_bind_group(
            &device,
            &queue,
            &texture_bind_group_layout,
            &texture_sampler,
            "jepow-host-white-texture",
            1,
            1,
            &[255, 255, 255, 255],
            1,
            1,
            &default_mr_pixel,
        );
        let default_texture_bind_group = Arc::new(default_texture_bind_group_raw);
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("jepow-host-pipeline-layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });
        let imported_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("jepow-host-imported-pipeline-layout"),
                bind_group_layouts: &[&bind_group_layout, &texture_bind_group_layout],
                push_constant_ranges: &[],
            });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("jepow-host-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<HostVertex>() as wgpu::BufferAddress,
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
                    format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                cull_mode: Some(wgpu::Face::Back),
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
        let line_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("jepow-host-line-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<HostVertex>() as wgpu::BufferAddress,
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
                    format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::LineList,
                cull_mode: None,
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: false,
                depth_compare: wgpu::CompareFunction::Always,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });
        let imported_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("jepow-host-imported-pipeline"),
            layout: Some(&imported_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &imported_shader,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<ImportedHostVertex>() as wgpu::BufferAddress,
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
                        wgpu::VertexAttribute {
                            offset: 24,
                            shader_location: 2,
                            format: wgpu::VertexFormat::Float32x2,
                        },
                        wgpu::VertexAttribute {
                            offset: 32,
                            shader_location: 3,
                            format: wgpu::VertexFormat::Float32x3,
                        },
                    ],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &imported_shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                cull_mode: Some(wgpu::Face::Back),
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
        let (vertices, indices) = cube_mesh();
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("jepow-host-cube-vb"),
            contents: bytemuck::cast_slice(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let index_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("jepow-host-cube-ib"),
            contents: bytemuck::cast_slice(&indices),
            usage: wgpu::BufferUsages::INDEX,
        });
        let edge_vertices = cube_edges();
        let edge_vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("jepow-host-cube-edges-vb"),
            contents: bytemuck::cast_slice(&edge_vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let grid_vertices = grid_mesh();
        let grid_vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("jepow-host-grid-vb"),
            contents: bytemuck::cast_slice(&grid_vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let gizmo_vertices = gizmo_mesh();
        let gizmo_vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("jepow-host-gizmo-vb"),
            contents: bytemuck::cast_slice(&gizmo_vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let (depth_texture, depth_view) = create_depth(&device, config.width, config.height);

        Ok(Self {
            surface,
            device,
            queue,
            config,
            pipeline,
            line_pipeline,
            imported_pipeline,
            uniform_buffer,
            bind_group,
            texture_bind_group_layout,
            texture_sampler,
            _default_texture: default_texture,
            _default_metallic_roughness_texture: default_mr_texture,
            default_texture_bind_group,
            vertex_buffer,
            index_buffer,
            index_count: indices.len() as u32,
            edge_vertex_buffer,
            edge_vertex_count: edge_vertices.len() as u32,
            grid_vertex_buffer,
            grid_vertex_count: grid_vertices.len() as u32,
            gizmo_vertex_buffer,
            imported_meshes: HashMap::new(),
            depth_texture,
            depth_view,
        })
    }

    fn resize(&mut self, width: u32, height: u32) {
        let width = width.max(1);
        let height = height.max(1);
        if self.config.width == width && self.config.height == height {
            return;
        }
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
        let (depth_texture, depth_view) = create_depth(&self.device, width, height);
        self.depth_texture = depth_texture;
        self.depth_view = depth_view;
    }

    fn imported_mesh_for(&mut self, asset_path: &str) -> Option<&ImportedGpuMesh> {
        let source_stamp = imported_asset_source_stamp(asset_path);
        let should_reload = self
            .imported_meshes
            .get(asset_path)
            .is_none_or(|mesh| mesh.source_stamp != source_stamp);
        if should_reload {
            let mesh = crate::mesh_loader::load_meshes(asset_path).ok()?;
            if mesh.indices.len() > u32::MAX as usize {
                return None;
            }
            let vertices: Vec<ImportedHostVertex> = mesh
                .vertices
                .iter()
                .map(|vertex| ImportedHostVertex {
                    pos: vertex.pos,
                    normal: vertex.normal,
                    uv: vertex.uv,
                    material_tint: vertex.material_tint,
                })
                .collect();
            let edge_vertices = imported_mesh_edges(&mesh);
            let texture_resources = if mesh.base_color_texture.is_some()
                || mesh.metallic_roughness_texture.is_some()
            {
                let white = [255, 255, 255, 255];
                let fallback_mr = [255, 255, 255, 255];
                let base_texture = mesh.base_color_texture.as_ref();
                let mr_texture = mesh.metallic_roughness_texture.as_ref();
                Some(
                create_imported_texture_bind_group(
                    &self.device,
                    &self.queue,
                    &self.texture_bind_group_layout,
                    &self.texture_sampler,
                    "jepow-host-imported-base-color-texture",
                    base_texture.map(|texture| texture.width).unwrap_or(1),
                    base_texture.map(|texture| texture.height).unwrap_or(1),
                    base_texture.map(|texture| texture.rgba.as_slice()).unwrap_or(&white),
                    mr_texture.map(|texture| texture.width).unwrap_or(1),
                    mr_texture.map(|texture| texture.height).unwrap_or(1),
                    mr_texture.map(|texture| texture.rgba.as_slice()).unwrap_or(&fallback_mr),
                )
                )
            } else {
                None
            };
            let (base_color_texture, metallic_roughness_texture, texture_bind_group) =
                match texture_resources {
                Some((base_texture, mr_texture, bind_group)) => {
                    (Some(base_texture), Some(mr_texture), Arc::new(bind_group))
                }
                None => (None, None, self.default_texture_bind_group.clone()),
            };
            let index_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("jepow-host-imported-mesh-ib"),
                contents: bytemuck::cast_slice(&mesh.indices),
                usage: wgpu::BufferUsages::INDEX,
            });
            let vertex_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("jepow-host-imported-mesh-vb"),
                contents: bytemuck::cast_slice(&vertices),
                usage: wgpu::BufferUsages::VERTEX,
            });
            let edge_vertex_buffer =
                self.device
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("jepow-host-imported-mesh-edges-vb"),
                        contents: bytemuck::cast_slice(&edge_vertices),
                        usage: wgpu::BufferUsages::VERTEX,
                    });
            self.imported_meshes.insert(
                asset_path.to_string(),
                ImportedGpuMesh {
                    source_stamp,
                    vertex_buffer,
                    index_buffer,
                    index_count: mesh.indices.len() as u32,
                    edge_vertex_buffer,
                    edge_vertex_count: edge_vertices.len() as u32,
                    material_color: mesh.material_color,
                    metallic_factor: mesh.metallic_factor,
                    roughness_factor: mesh.roughness_factor,
                    _base_color_texture: base_color_texture,
                    _metallic_roughness_texture: metallic_roughness_texture,
                    texture_bind_group,
                },
            );
        }
        self.imported_meshes.get(asset_path)
    }
}

struct HostApp {
    rx: Receiver<HostRequest>,
    window: Option<Arc<Window>>,
    gpu: Option<GpuState>,
    objects: Vec<HostObject>,
    selected_id: String,
    tool: HostTool,
    display_mode: HostDisplayMode,
    snap_enabled: bool,
    snap_increment: f32,
    visible: bool,
    bounds: Option<HostBounds>,
    camera_yaw: f32,
    camera_pitch: f32,
    camera_distance: f32,
    camera_projection: HostProjection,
    camera_speed: f32,
    camera_pan: [f32; 2],
    last_cursor: Option<(f64, f64)>,
    pressed_button: Option<MouseButton>,
    active_axis: Option<GizmoAxis>,
    started_at: Instant,
}

impl HostApp {
    fn new(rx: Receiver<HostRequest>) -> Self {
        Self {
            rx,
            window: None,
            gpu: None,
            objects: default_objects(),
            selected_id: "cube".to_string(),
            tool: HostTool::Select,
            display_mode: HostDisplayMode::Cl,
            snap_enabled: false,
            snap_increment: default_snap_increment(),
            visible: false,
            bounds: None,
            camera_yaw: 0.72,
            camera_pitch: 0.52,
            camera_distance: 7.0,
            camera_projection: HostProjection::Perspective,
            camera_speed: 1.0,
            camera_pan: [0.0, 0.0],
            last_cursor: None,
            pressed_button: None,
            active_axis: None,
            started_at: Instant::now(),
        }
    }

    fn handle_request(&mut self, event_loop: &ActiveEventLoop, req: HostRequest) {
        let id = req.id;
        let response = match req.cmd.as_str() {
            "ping" => json!({
                "ok": true,
                "id": id,
                "engine": "jepow-engine",
                "mode": "viewport-host",
                "uptimeMs": self.started_at.elapsed().as_millis(),
            }),
            "set_bounds" => {
                match serde_json::from_value::<HostBounds>(req.payload.clone()) {
                    Ok(bounds) => {
                        self.bounds = Some(bounds);
                        self.ensure_window(event_loop);
                        self.apply_bounds(bounds);
                        json!({ "ok": true, "id": id, "bounds": req.payload })
                    }
                    Err(e) => json!({ "ok": false, "id": id, "error": e.to_string() }),
                }
            }
            "set_visible" => {
                self.visible = req.payload.get("visible").and_then(|v| v.as_bool()).unwrap_or(true);
                if self.visible {
                    self.ensure_window(event_loop);
                }
                if let Some(window) = &self.window {
                    window.set_visible(self.visible);
                }
                json!({ "ok": true, "id": id, "visible": self.visible })
            }
            "set_scene" => {
                if let Some(objects) = req.payload.get("objects") {
                    match serde_json::from_value::<Vec<HostObject>>(objects.clone()) {
                        Ok(objects) => {
                            self.objects = objects;
                            if !self
                                .objects
                                .iter()
                                .any(|object| object.id == self.selected_id && object.visible)
                            {
                                self.selected_id = self
                                    .objects
                                    .iter()
                                    .find(|object| object.visible)
                                    .map(|object| object.id.clone())
                                    .unwrap_or_default();
                            }
                        }
                        Err(e) => return write_response(json!({ "ok": false, "id": id, "error": e.to_string() })),
                    }
                }
                json!({
                    "ok": true,
                    "id": id,
                    "objectCount": self.objects.len(),
                    "selectedObjectId": self.selected_id,
                })
            }
            "set_tool" => {
                if let Ok(tool) = serde_json::from_value::<HostTool>(req.payload.get("tool").cloned().unwrap_or(Value::Null)) {
                    self.tool = tool;
                }
                json!({ "ok": true, "id": id, "tool": format!("{:?}", self.tool).to_lowercase() })
            }
            "set_display_mode" => {
                if let Ok(mode) = serde_json::from_value::<HostDisplayMode>(
                    req.payload.get("mode").cloned().unwrap_or(Value::Null),
                ) {
                    self.display_mode = mode;
                }
                json!({
                    "ok": true,
                    "id": id,
                    "displayMode": format!("{:?}", self.display_mode).to_lowercase(),
                })
            }
            "set_snap" => {
                match serde_json::from_value::<HostSnap>(req.payload.clone()) {
                    Ok(snap) => {
                        self.snap_enabled = snap.enabled;
                        self.snap_increment = snap.increment.clamp(0.01, 100.0);
                        json!({
                            "ok": true,
                            "id": id,
                            "snap": {
                                "enabled": self.snap_enabled,
                                "increment": self.snap_increment,
                            },
                        })
                    }
                    Err(e) => json!({ "ok": false, "id": id, "error": e.to_string() }),
                }
            }
            "focus_selection" => {
                self.focus_selection();
                json!({
                    "ok": true,
                    "id": id,
                    "selectedObjectId": self.selected_id,
                    "camera": {
                        "yaw": self.camera_yaw,
                        "pitch": self.camera_pitch,
                        "distance": self.camera_distance,
                        "projection": format!("{:?}", self.camera_projection).to_lowercase(),
                        "pan": self.camera_pan,
                    },
                })
            }
            "set_camera" => {
                match serde_json::from_value::<HostCamera>(req.payload.clone()) {
                    Ok(camera) => {
                        if let Some(yaw) = camera.yaw {
                            self.camera_yaw = yaw;
                        }
                        if let Some(pitch) = camera.pitch {
                            self.camera_pitch = pitch.clamp(-1.52, 1.52);
                        }
                        if let Some(distance) = camera.distance {
                            self.camera_distance = distance.clamp(1.2, 80.0);
                        }
                        if let Some(projection) = camera.projection {
                            self.camera_projection = projection;
                        }
                        self.camera_speed = camera.speed.clamp(0.1, 5.0);
                        json!({ "ok": true, "id": id })
                    }
                    Err(e) => json!({ "ok": false, "id": id, "error": e.to_string() }),
                }
            }
            "set_selection" => {
                let requested_id = req.payload.get("objectId").and_then(|v| v.as_str()).unwrap_or("");
                let selection_accepted = if requested_id.is_empty() {
                    self.selected_id.clear();
                    true
                } else if self
                    .objects
                    .iter()
                    .any(|object| object.id == requested_id && object.visible)
                {
                    self.selected_id = requested_id.to_string();
                    true
                } else {
                    false
                };
                json!({
                    "ok": true,
                    "id": id,
                    "objectId": self.selected_id,
                    "requestedObjectId": requested_id,
                    "selectionAccepted": selection_accepted,
                })
            }
            "set_object_transform" => {
                let mut transform_applied = false;
                if let (Some(object_id), Some(transform)) = (
                    req.payload.get("objectId").and_then(|v| v.as_str()),
                    req.payload.get("transform"),
                ) {
                    if let Ok(transform) = serde_json::from_value::<HostTransform>(transform.clone()) {
                        if let Some(object) = self.objects.iter_mut().find(|o| o.id == object_id) {
                            object.transform = transform;
                            transform_applied = true;
                        }
                    }
                }
                json!({ "ok": true, "id": id, "transformApplied": transform_applied })
            }
            "get_state" => json!({
                "ok": true,
                "id": id,
                "selectedObjectId": self.selected_id,
                "displayMode": format!("{:?}", self.display_mode).to_lowercase(),
                "snap": {
                    "enabled": self.snap_enabled,
                    "increment": self.snap_increment,
                },
                "camera": {
                    "yaw": self.camera_yaw,
                    "pitch": self.camera_pitch,
                    "distance": self.camera_distance,
                    "projection": format!("{:?}", self.camera_projection).to_lowercase(),
                    "pan": self.camera_pan,
                },
                "objects": self.objects.iter().map(|object| {
                    json!({
                        "id": object.id,
                        "name": object.name,
                        "type": object.kind,
                        "visible": object.visible,
                        "locked": object.locked,
                        "materialColor": object.material_color,
                        "assetPath": object.asset_path,
                        "importBackend": object.import_backend,
                        "triangleCount": object.triangle_count,
                        "vertexCount": object.vertex_count,
                        "boundsMin": object.bounds_min,
                        "boundsMax": object.bounds_max,
                        "boundsSize": object.bounds_size,
                        "hasBaseColorTexture": object.has_base_color_texture,
                        "hasMetallicRoughnessTexture": object.has_metallic_roughness_texture,
                        "metallicFactor": object.metallic_factor,
                        "roughnessFactor": object.roughness_factor,
                        "transform": {
                            "position": object.transform.position,
                            "rotation": object.transform.rotation,
                            "scale": object.transform.scale,
                        }
                    })
                }).collect::<Vec<_>>(),
            }),
            "shutdown" => {
                write_response(json!({ "ok": true, "id": id, "shutdown": true }));
                event_loop.exit();
                return;
            }
            other => json!({ "ok": false, "id": id, "error": format!("unknown viewport-host cmd: {}", other) }),
        };
        write_response(response);
        if let Some(window) = &self.window {
            window.request_redraw();
        }
    }

    fn ensure_window(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        let size = self
            .bounds
            .map(|b| b.physical_size())
            .unwrap_or_else(|| PhysicalSize::new(960, 640));
        let attrs = WindowAttributes::default()
            .with_title("Jepow Native Viewport")
            .with_decorations(false)
            .with_visible(self.visible)
            .with_resizable(false)
            .with_window_level(WindowLevel::AlwaysOnTop)
            .with_inner_size(size);
        let window = match event_loop.create_window(attrs) {
            Ok(window) => Arc::new(window),
            Err(e) => {
                write_response(json!({ "ok": false, "error": format!("create viewport window: {}", e) }));
                return;
            }
        };
        if let Some(bounds) = self.bounds {
            window.set_outer_position(PhysicalPosition::new(bounds.x, bounds.y));
        }
        match GpuState::new(window.clone(), size.width, size.height) {
            Ok(gpu) => {
                self.gpu = Some(gpu);
                self.window = Some(window);
            }
            Err(e) => {
                write_response(json!({ "ok": false, "error": format!("create viewport gpu: {}", e) }));
            }
        }
    }

    fn apply_bounds(&mut self, bounds: HostBounds) {
        let physical_width = (bounds.width as f64 * bounds.scale_factor).round().max(1.0) as u32;
        let physical_height = (bounds.height as f64 * bounds.scale_factor).round().max(1.0) as u32;
        if let Some(window) = &self.window {
            window.set_outer_position(PhysicalPosition::new(bounds.x, bounds.y));
            window.set_window_level(if bounds.always_on_top {
                WindowLevel::AlwaysOnTop
            } else {
                WindowLevel::Normal
            });
            let _ = window.request_inner_size(PhysicalSize::new(physical_width, physical_height));
        }
        if let Some(gpu) = &mut self.gpu {
            gpu.resize(physical_width, physical_height);
        }
    }

    fn render(&mut self) {
        let camera_yaw = self.camera_yaw;
        let camera_pitch = self.camera_pitch;
        let camera_distance = self.camera_distance;
        let camera_projection = self.camera_projection;
        let camera_pan = self.camera_pan;
        let display_mode = self.display_mode;
        let Some(gpu) = &mut self.gpu else { return };
        let output = match gpu.surface.get_current_texture() {
            Ok(frame) => frame,
            Err(wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated) => {
                gpu.surface.configure(&gpu.device, &gpu.config);
                return;
            }
            Err(wgpu::SurfaceError::Timeout) => return,
            Err(wgpu::SurfaceError::OutOfMemory) => return,
        };
        let view = output.texture.create_view(&Default::default());
        let mut encoder = gpu
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("jepow-host-frame"),
            });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("jepow-host-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(display_background(display_mode)),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &gpu.depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                occlusion_query_set: None,
                timestamp_writes: None,
            });
            let aspect = gpu.config.width as f32 / gpu.config.height.max(1) as f32;
            let (_, _, vp) = build_camera_matrices(
                camera_yaw,
                camera_pitch,
                camera_distance,
                camera_projection,
                camera_pan,
                aspect,
            );

            pass.set_bind_group(0, &gpu.bind_group, &[]);

            let grid_uniforms = HostUniforms {
                mvp: vp.to_cols_array(),
                normal: Mat4::IDENTITY.to_cols_array(),
                color_selected: [0.33, 0.38, 0.44, 0.0],
                light_dir: [0.0, 1.0, 0.0, 1.0],
                material_params: [0.0, 0.9, 0.0, 0.0],
            };
            gpu.queue
                .write_buffer(&gpu.uniform_buffer, 0, bytemuck::bytes_of(&grid_uniforms));
            pass.set_pipeline(&gpu.line_pipeline);
            pass.set_vertex_buffer(0, gpu.grid_vertex_buffer.slice(..));
            pass.draw(0..gpu.grid_vertex_count, 0..1);

            for object in self.objects.iter().filter(|object| object.visible) {
                let mut model = object_model_matrix(object);
                let mut loaded_imported_mesh = false;
                let mut imported_material_color = None;
                let mut imported_metallic = 0.0;
                let mut imported_roughness = 0.65;
                if let Some(asset_path) = object.asset_path.as_deref() {
                    if let Some(imported_mesh) = gpu.imported_mesh_for(asset_path) {
                        model = imported_mesh_model_matrix(object);
                        loaded_imported_mesh = true;
                        imported_material_color = imported_mesh.material_color;
                        imported_metallic = imported_mesh.metallic_factor;
                        imported_roughness = imported_mesh.roughness_factor;
                    }
                }
                let mut base_color = display_object_color(display_mode, object);
                if loaded_imported_mesh && imported_material_color.is_some() {
                    base_color = [1.0, 1.0, 1.0];
                } else if object.material_color.is_none()
                    && matches!(display_mode, HostDisplayMode::Material | HostDisplayMode::Cl)
                {
                    base_color = imported_material_color.unwrap_or(base_color);
                }
                let object_color = if object.locked {
                    [base_color[0] * 0.48, base_color[1] * 0.48, base_color[2] * 0.48]
                } else {
                    base_color
                };
                let uniforms = HostUniforms {
                    mvp: (vp * model).to_cols_array(),
                    normal: model.inverse().transpose().to_cols_array(),
                    color_selected: [
                        object_color[0],
                        object_color[1],
                        object_color[2],
                        if object.id == self.selected_id && !object.locked { 1.0 } else { 0.0 },
                    ],
                    light_dir: [0.35, 0.78, 0.52, 1.0],
                    material_params: [
                        object
                            .metallic_factor
                            .unwrap_or(imported_metallic)
                            .clamp(0.0, 1.0),
                        object
                            .roughness_factor
                            .unwrap_or(imported_roughness)
                            .clamp(0.04, 1.0),
                        if loaded_imported_mesh { 1.0 } else { 0.0 },
                        0.0,
                    ],
                };
                gpu.queue
                    .write_buffer(&gpu.uniform_buffer, 0, bytemuck::bytes_of(&uniforms));
                if matches!(display_mode, HostDisplayMode::Wireframe) {
                    pass.set_pipeline(&gpu.line_pipeline);
                    if loaded_imported_mesh {
                        if let Some(asset_path) = object.asset_path.as_deref() {
                            let imported_mesh = gpu
                                .imported_mesh_for(asset_path)
                                .expect("imported mesh was loaded before uniforms");
                            pass.set_vertex_buffer(0, imported_mesh.edge_vertex_buffer.slice(..));
                            pass.draw(0..imported_mesh.edge_vertex_count, 0..1);
                        }
                    } else {
                        pass.set_vertex_buffer(0, gpu.edge_vertex_buffer.slice(..));
                        pass.draw(0..gpu.edge_vertex_count, 0..1);
                    }
                } else if let Some(asset_path) = object.asset_path.as_deref() {
                    if loaded_imported_mesh {
                        pass.set_pipeline(&gpu.imported_pipeline);
                        let imported_mesh = gpu
                            .imported_mesh_for(asset_path)
                            .expect("imported mesh was loaded before uniforms");
                        pass.set_bind_group(1, imported_mesh.texture_bind_group.as_ref(), &[]);
                        pass.set_vertex_buffer(0, imported_mesh.vertex_buffer.slice(..));
                        pass.set_index_buffer(
                            imported_mesh.index_buffer.slice(..),
                            wgpu::IndexFormat::Uint32,
                        );
                        pass.draw_indexed(0..imported_mesh.index_count, 0, 0..1);
                    } else {
                        pass.set_pipeline(&gpu.pipeline);
                        pass.set_vertex_buffer(0, gpu.vertex_buffer.slice(..));
                        pass.set_index_buffer(gpu.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
                        pass.draw_indexed(0..gpu.index_count, 0, 0..1);
                    }
                } else {
                    pass.set_pipeline(&gpu.pipeline);
                    pass.set_vertex_buffer(0, gpu.vertex_buffer.slice(..));
                    pass.set_index_buffer(gpu.index_buffer.slice(..), wgpu::IndexFormat::Uint16);
                    pass.draw_indexed(0..gpu.index_count, 0, 0..1);
                }
            }

            if let Some(selected) = self
                .objects
                .iter()
                .find(|object| object.id == self.selected_id && object.visible && !object.locked)
            {
                let origin = Vec3::from_array(selected.transform.position);
                let gizmo_model = Mat4::from_scale_rotation_translation(
                    Vec3::splat(1.85),
                    Quat::IDENTITY,
                    origin,
                );
                pass.set_pipeline(&gpu.line_pipeline);
                pass.set_vertex_buffer(0, gpu.gizmo_vertex_buffer.slice(..));
                for (axis, range) in [
                    (GizmoAxis::X, 0..2),
                    (GizmoAxis::Y, 2..4),
                    (GizmoAxis::Z, 4..6),
                ] {
                    let color = axis_color(axis);
                    let uniforms = HostUniforms {
                        mvp: (vp * gizmo_model).to_cols_array(),
                        normal: Mat4::IDENTITY.to_cols_array(),
                        color_selected: [color[0], color[1], color[2], 0.0],
                        light_dir: [0.0, 1.0, 0.0, 1.0],
                        material_params: [0.0, 0.9, 0.0, 0.0],
                    };
                    gpu.queue.write_buffer(
                        &gpu.uniform_buffer,
                        0,
                        bytemuck::bytes_of(&uniforms),
                    );
                    pass.draw(range, 0..1);
                }
            }
        }

        gpu.queue.submit(Some(encoder.finish()));
        output.present();
    }

    fn camera_matrices(&self, aspect: f32) -> (Mat4, Mat4, Mat4) {
        build_camera_matrices(
            self.camera_yaw,
            self.camera_pitch,
            self.camera_distance,
            self.camera_projection,
            self.camera_pan,
            aspect,
        )
    }

    fn focus_selection(&mut self) {
        if let Some(object) = self
            .objects
            .iter()
            .find(|object| object.id == self.selected_id && object.visible)
        {
            self.camera_pan = [
                object.transform.position[0],
                object.transform.position[1],
            ];
            self.camera_distance = (3.4 + object_display_radius(object) * 2.4).clamp(2.0, 80.0);
        }
    }

    fn pick_object(&self, cursor: (f64, f64)) -> Option<String> {
        let gpu = self.gpu.as_ref()?;
        let width = gpu.config.width.max(1) as f32;
        let height = gpu.config.height.max(1) as f32;
        let ndc_x = (cursor.0 as f32 / width) * 2.0 - 1.0;
        let ndc_y = 1.0 - (cursor.1 as f32 / height) * 2.0;
        let aspect = width / height.max(1.0);
        let (_, _, vp) = self.camera_matrices(aspect);
        let inv_vp = vp.inverse();
        let near = inv_vp * Vec4::new(ndc_x, ndc_y, -1.0, 1.0);
        let far = inv_vp * Vec4::new(ndc_x, ndc_y, 1.0, 1.0);
        let ray_origin = (near.truncate() / near.w).to_array();
        let ray_far = far.truncate() / far.w;
        let ray_dir = (ray_far - Vec3::from_array(ray_origin)).normalize_or_zero();
        if ray_dir.length_squared() <= f32::EPSILON {
            return None;
        }

        self.objects
            .iter()
            .filter(|object| object.visible && !object.locked)
            .filter_map(|object| {
                ray_object_hit(object, Vec3::from_array(ray_origin), ray_dir)
                    .map(|t| (t, object.id.clone()))
            })
            .min_by(|(a, _), (b, _)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(_, id)| id)
    }

    fn pick_gizmo_axis(&self, cursor: (f64, f64)) -> Option<GizmoAxis> {
        if matches!(self.tool, HostTool::Select) {
            return None;
        }
        let gpu = self.gpu.as_ref()?;
        let selected = self
            .objects
            .iter()
            .find(|object| object.id == self.selected_id && object.visible && !object.locked)?;
        let aspect = gpu.config.width as f32 / gpu.config.height.max(1) as f32;
        let (_, _, vp) = self.camera_matrices(aspect);
        let origin = Vec3::from_array(selected.transform.position);
        [GizmoAxis::X, GizmoAxis::Y, GizmoAxis::Z]
            .into_iter()
            .filter_map(|axis| {
                let a = project_world_to_screen(origin, vp, gpu.config.width, gpu.config.height)?;
                let b = project_world_to_screen(
                    origin + axis_vector(axis) * 1.85,
                    vp,
                    gpu.config.width,
                    gpu.config.height,
                )?;
                let distance = distance_to_screen_segment((cursor.0 as f32, cursor.1 as f32), a, b);
                (distance < 14.0).then_some((distance, axis))
            })
            .min_by(|(a, _), (b, _)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(_, axis)| axis)
    }

    fn axis_screen_direction(&self, axis: GizmoAxis) -> Option<(f32, f32)> {
        let gpu = self.gpu.as_ref()?;
        let selected = self
            .objects
            .iter()
            .find(|object| object.id == self.selected_id && object.visible && !object.locked)?;
        let aspect = gpu.config.width as f32 / gpu.config.height.max(1) as f32;
        let (_, _, vp) = self.camera_matrices(aspect);
        let origin = Vec3::from_array(selected.transform.position);
        let a = project_world_to_screen(origin, vp, gpu.config.width, gpu.config.height)?;
        let b = project_world_to_screen(
            origin + axis_vector(axis) * 1.85,
            vp,
            gpu.config.width,
            gpu.config.height,
        )?;
        let dir = (b.0 - a.0, b.1 - a.1);
        let len = (dir.0 * dir.0 + dir.1 * dir.1).sqrt();
        (len > 0.001).then_some((dir.0 / len, dir.1 / len))
    }

    fn update_axis_drag(&mut self, axis: GizmoAxis, dx: f64, dy: f64) {
        let Some(screen_dir) = self.axis_screen_direction(axis) else {
            return;
        };
        let amount = (dx as f32 * screen_dir.0 + dy as f32 * screen_dir.1) * self.camera_speed;
        let axis_vec = axis_vector(axis);
        let snap_enabled = self.snap_enabled;
        let snap_increment = self.snap_increment;
        let Some(object) = self
            .objects
            .iter_mut()
            .find(|object| object.id == self.selected_id && object.visible && !object.locked)
        else {
            return;
        };

        match self.tool {
            HostTool::Translate => {
                let delta = axis_vec * amount * 0.018;
                for i in 0..3 {
                    object.transform.position[i] += delta[i];
                }
                apply_position_snap(&mut object.transform.position, snap_enabled, snap_increment);
            }
            HostTool::Rotate => {
                let index = axis_index(axis);
                object.transform.rotation[index] += amount * 0.65;
            }
            HostTool::Scale => {
                let index = axis_index(axis);
                object.transform.scale[index] =
                    (object.transform.scale[index] + amount * 0.008).clamp(0.05, 100.0);
            }
            HostTool::Select => {}
        }
    }

    fn update_drag(&mut self, dx: f64, dy: f64) {
        let snap_enabled = self.snap_enabled;
        let snap_increment = self.snap_increment;
        match self.pressed_button {
            Some(MouseButton::Left) => match self.tool {
                HostTool::Translate => {
                    if let Some(axis) = self.active_axis {
                        self.update_axis_drag(axis, dx, dy);
                        return;
                    }
                    if let Some(object) = self
                        .objects
                        .iter_mut()
                        .find(|object| object.id == self.selected_id && object.visible && !object.locked)
                    {
                        object.transform.position[0] += dx as f32 * 0.012 * self.camera_speed;
                        object.transform.position[1] -= dy as f32 * 0.012 * self.camera_speed;
                        apply_position_snap(&mut object.transform.position, snap_enabled, snap_increment);
                    }
                }
                HostTool::Rotate => {
                    if let Some(axis) = self.active_axis {
                        self.update_axis_drag(axis, dx, dy);
                        return;
                    }
                    if let Some(object) = self
                        .objects
                        .iter_mut()
                        .find(|object| object.id == self.selected_id && object.visible && !object.locked)
                    {
                        object.transform.rotation[1] += dx as f32 * 0.45 * self.camera_speed;
                        object.transform.rotation[0] += dy as f32 * 0.45 * self.camera_speed;
                    }
                }
                HostTool::Scale => {
                    if let Some(axis) = self.active_axis {
                        self.update_axis_drag(axis, dx, dy);
                        return;
                    }
                    if let Some(object) = self
                        .objects
                        .iter_mut()
                        .find(|object| object.id == self.selected_id && object.visible && !object.locked)
                    {
                        let delta = 1.0 + (dx - dy) as f32 * 0.004 * self.camera_speed;
                        for axis in &mut object.transform.scale {
                            *axis = (*axis * delta).clamp(0.05, 100.0);
                        }
                    }
                }
                HostTool::Select => {
                    self.camera_yaw += dx as f32 * 0.008 * self.camera_speed;
                    self.camera_pitch = (self.camera_pitch + dy as f32 * 0.006 * self.camera_speed).clamp(-1.52, 1.52);
                }
            },
            Some(MouseButton::Right) | Some(MouseButton::Middle) => {
                self.camera_pan[0] -= dx as f32 * 0.01;
                self.camera_pan[1] += dy as f32 * 0.01;
            }
            _ => {}
        }
    }
}

impl ApplicationHandler for HostApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        self.ensure_window(event_loop);
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        while let Ok(req) = self.rx.try_recv() {
            self.handle_request(event_loop, req);
        }
        if let Some(window) = &self.window {
            window.request_redraw();
        }
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        event: WindowEvent,
    ) {
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::Resized(size) => {
                if let Some(gpu) = &mut self.gpu {
                    gpu.resize(size.width, size.height);
                }
            }
            WindowEvent::RedrawRequested => self.render(),
            WindowEvent::CursorMoved { position, .. } => {
                if let Some((x, y)) = self.last_cursor {
                    if self.pressed_button.is_some() {
                        self.update_drag(position.x - x, position.y - y);
                        if let Some(window) = &self.window {
                            window.request_redraw();
                        }
                    }
                }
                self.last_cursor = Some((position.x, position.y));
            }
            WindowEvent::MouseInput { state, button, .. } => {
                self.pressed_button = if state == ElementState::Pressed {
                    if button == MouseButton::Left {
                        self.active_axis = None;
                        if let Some(cursor) = self.last_cursor {
                            if let Some(axis) = self.pick_gizmo_axis(cursor) {
                                self.active_axis = Some(axis);
                            } else if let Some(object_id) = self.pick_object(cursor) {
                                self.selected_id = object_id;
                            }
                        }
                    }
                    Some(button)
                } else {
                    if button == MouseButton::Left {
                        self.active_axis = None;
                    }
                    None
                };
            }
            WindowEvent::MouseWheel { delta, .. } => {
                let scroll = match delta {
                    MouseScrollDelta::LineDelta(_, y) => y,
                    MouseScrollDelta::PixelDelta(p) => p.y as f32 / 40.0,
                };
                self.camera_distance = (self.camera_distance * (1.0 - scroll * 0.08)).clamp(1.2, 80.0);
            }
            _ => {}
        }
    }
}

pub fn run_viewport_host() {
    let (tx, rx) = mpsc::channel::<HostRequest>();
    spawn_stdin_reader(tx);

    let event_loop = match EventLoop::new() {
        Ok(event_loop) => event_loop,
        Err(e) => {
            write_response(json!({ "ok": false, "error": e.to_string() }));
            return;
        }
    };
    event_loop.set_control_flow(ControlFlow::Poll);
    let mut app = HostApp::new(rx);
    if let Err(e) = event_loop.run_app(&mut app) {
        write_response(json!({ "ok": false, "error": e.to_string() }));
    }
}

fn spawn_stdin_reader(tx: Sender<HostRequest>) {
    std::thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            let Ok(line) = line else { break };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
                write_response(json!({ "ok": false, "error": "bad json" }));
                continue;
            };
            let cmd = value
                .get("cmd")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let id = value.get("id").and_then(|v| v.as_u64());
            if tx
                .send(HostRequest {
                    id,
                    cmd,
                    payload: value,
                })
                .is_err()
            {
                break;
            }
        }
    });
}

fn write_response(value: Value) {
    let mut stdout = io::stdout();
    let _ = writeln!(stdout, "{}", value);
    let _ = stdout.flush();
}

fn create_depth(
    device: &wgpu::Device,
    width: u32,
    height: u32,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("jepow-host-depth"),
        size: wgpu::Extent3d {
            width: width.max(1),
            height: height.max(1),
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth32Float,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let view = texture.create_view(&Default::default());
    (texture, view)
}

fn create_uploaded_rgba_texture(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    label: &str,
    width: u32,
    height: u32,
    rgba: &[u8],
) -> wgpu::Texture {
    let width = width.max(1);
    let height = height.max(1);
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(label),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        wgpu::ImageCopyTexture {
            texture: &texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        rgba,
        wgpu::ImageDataLayout {
            offset: 0,
            bytes_per_row: Some(4 * width),
            rows_per_image: Some(height),
        },
        wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
    );
    texture
}

fn create_imported_texture_bind_group(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    layout: &wgpu::BindGroupLayout,
    sampler: &wgpu::Sampler,
    label: &str,
    base_width: u32,
    base_height: u32,
    base_rgba: &[u8],
    mr_width: u32,
    mr_height: u32,
    mr_rgba: &[u8],
) -> (wgpu::Texture, wgpu::Texture, wgpu::BindGroup) {
    let base_texture =
        create_uploaded_rgba_texture(device, queue, label, base_width, base_height, base_rgba);
    let mr_texture = create_uploaded_rgba_texture(
        device,
        queue,
        "jepow-host-imported-metallic-roughness-texture",
        mr_width,
        mr_height,
        mr_rgba,
    );
    let base_view = base_texture.create_view(&Default::default());
    let mr_view = mr_texture.create_view(&Default::default());
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("jepow-host-imported-texture-bind"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&base_view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(sampler),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::TextureView(&mr_view),
            },
        ],
    });
    (base_texture, mr_texture, bind_group)
}

fn imported_mesh_edges(mesh: &crate::mesh_loader::MeshData) -> Vec<HostVertex> {
    let mut edges = Vec::with_capacity(mesh.indices.len().saturating_mul(2));
    for tri in mesh.indices.chunks(3) {
        if tri.len() != 3 {
            continue;
        }
        for (a, b) in [(tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])] {
            let Some(a) = mesh.vertices.get(a as usize) else {
                continue;
            };
            let Some(b) = mesh.vertices.get(b as usize) else {
                continue;
            };
            edges.push(HostVertex {
                pos: a.pos,
                normal: a.normal,
            });
            edges.push(HostVertex {
                pos: b.pos,
                normal: b.normal,
            });
        }
    }
    edges
}

fn imported_asset_source_stamp(asset_path: &str) -> String {
    let metadata = std::fs::metadata(asset_path).ok();
    let modified = metadata
        .as_ref()
        .and_then(|value| value.modified().ok())
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let size = metadata.map(|value| value.len()).unwrap_or(0);
    format!("{modified}:{size}")
}

fn is_imported_asset(object: &HostObject) -> bool {
    object.asset_path.as_deref().is_some_and(|path| !path.is_empty())
}

fn object_kind_scale(object: &HostObject) -> Vec3 {
    if is_imported_asset(object) {
        return imported_asset_proxy_scale(object);
    }
    match object.kind.as_str() {
        "camera" | "相机" => Vec3::new(1.3, 0.75, 0.55),
        "light" | "灯光" => Vec3::splat(0.32),
        _ => Vec3::splat(1.25),
    }
}

fn imported_asset_proxy_scale(object: &HostObject) -> Vec3 {
    if let Some(size) = object.bounds_size {
        let raw = Vec3::new(size[0].abs(), size[1].abs(), size[2].abs());
        if raw.max_element() > 1e-4 {
            let normalized = raw / raw.max_element();
            let triangles = object.triangle_count.unwrap_or(0).max(1) as f32;
            let footprint = (triangles.log10() * 0.22 + 1.45).clamp(1.35, 4.5);
            return Vec3::new(
                normalized.x.max(0.18) * footprint,
                normalized.y.max(0.18) * footprint,
                normalized.z.max(0.18) * footprint,
            );
        }
    }
    let triangles = object.triangle_count.unwrap_or(0).max(1) as f32;
    let footprint = (triangles.log10() * 0.34 + 1.15).clamp(1.35, 4.2);
    Vec3::new(footprint, (footprint * 0.62).max(0.85), footprint)
}

fn imported_mesh_target_size(object: &HostObject) -> f32 {
    let triangles = object.triangle_count.unwrap_or(0).max(1) as f32;
    (triangles.log10() * 0.22 + 1.45).clamp(1.35, 4.5)
}

fn object_display_radius(object: &HostObject) -> f32 {
    let user_scale = object
        .transform
        .scale
        .iter()
        .fold(1.0_f32, |acc, value| acc.max(value.abs()));
    if is_imported_asset(object) && object.bounds_min.is_some() && object.bounds_max.is_some() {
        return imported_mesh_target_size(object) * user_scale.max(0.01) * 0.75;
    }
    object_kind_scale(object).max_element() * user_scale.max(0.01)
}

fn object_kind_color(kind: &str) -> [f32; 3] {
    match kind {
        "camera" | "相机" => [0.25, 0.88, 0.62],
        "light" | "灯光" => [1.0, 0.86, 0.35],
        _ => [0.72, 0.75, 0.82],
    }
}

fn display_background(mode: HostDisplayMode) -> wgpu::Color {
    match mode {
        HostDisplayMode::Wireframe => wgpu::Color { r: 0.075, g: 0.08, b: 0.09, a: 1.0 },
        HostDisplayMode::Solid => wgpu::Color { r: 0.12, g: 0.13, b: 0.15, a: 1.0 },
        HostDisplayMode::Material => wgpu::Color { r: 0.105, g: 0.11, b: 0.125, a: 1.0 },
        HostDisplayMode::Cl => wgpu::Color { r: 0.095, g: 0.105, b: 0.12, a: 1.0 },
    }
}

fn display_object_color(mode: HostDisplayMode, object: &HostObject) -> [f32; 3] {
    let imported_fallback = || {
        if is_imported_asset(object) {
            [0.48, 0.62, 1.0]
        } else {
            object_kind_color(&object.kind)
        }
    };
    match mode {
        HostDisplayMode::Wireframe => {
            if is_imported_asset(object) {
                [0.55, 0.70, 1.0]
            } else {
                [0.82, 0.88, 0.96]
            }
        }
        HostDisplayMode::Solid => {
            if is_imported_asset(object) {
                [0.42, 0.52, 0.78]
            } else {
                [0.68, 0.70, 0.74]
            }
        }
        HostDisplayMode::Material => object
            .material_color
            .as_deref()
            .and_then(parse_hex_color)
            .unwrap_or_else(imported_fallback),
        HostDisplayMode::Cl => object
            .material_color
            .as_deref()
            .and_then(parse_hex_color)
            .map(|color| [
                (color[0] * 0.9 + 0.08).min(1.0),
                (color[1] * 0.9 + 0.08).min(1.0),
                (color[2] * 0.9 + 0.08).min(1.0),
            ])
            .unwrap_or_else(|| match object.kind.as_str() {
                "camera" | "相机" => [0.20, 0.72, 0.52],
                "light" | "灯光" => [0.92, 0.78, 0.30],
                    _ if is_imported_asset(object) => [0.46, 0.58, 0.95],
                    _ => [0.74, 0.77, 0.83],
            }),
    }
}

fn parse_hex_color(value: &str) -> Option<[f32; 3]> {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()? as f32 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()? as f32 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()? as f32 / 255.0;
    Some([r, g, b])
}

fn axis_vector(axis: GizmoAxis) -> Vec3 {
    match axis {
        GizmoAxis::X => Vec3::X,
        GizmoAxis::Y => Vec3::Y,
        GizmoAxis::Z => Vec3::Z,
    }
}

fn axis_index(axis: GizmoAxis) -> usize {
    match axis {
        GizmoAxis::X => 0,
        GizmoAxis::Y => 1,
        GizmoAxis::Z => 2,
    }
}

fn axis_color(axis: GizmoAxis) -> [f32; 3] {
    match axis {
        GizmoAxis::X => [0.96, 0.22, 0.22],
        GizmoAxis::Y => [0.30, 0.86, 0.36],
        GizmoAxis::Z => [0.28, 0.48, 1.0],
    }
}

fn object_model_matrix(object: &HostObject) -> Mat4 {
    let transform = &object.transform;
    let rot = Quat::from_euler(
        EulerRot::XYZ,
        transform.rotation[0].to_radians(),
        transform.rotation[1].to_radians(),
        transform.rotation[2].to_radians(),
    );
    let scale = Vec3::new(
        transform.scale[0].max(0.01),
        transform.scale[1].max(0.01),
        transform.scale[2].max(0.01),
    ) * object_kind_scale(object);
    Mat4::from_scale_rotation_translation(
        scale,
        rot,
        Vec3::from_array(transform.position),
    )
}

fn imported_mesh_model_matrix(object: &HostObject) -> Mat4 {
    let transform = &object.transform;
    let rot = Quat::from_euler(
        EulerRot::XYZ,
        transform.rotation[0].to_radians(),
        transform.rotation[1].to_radians(),
        transform.rotation[2].to_radians(),
    );
    let user_scale = Vec3::new(
        transform.scale[0].max(0.01),
        transform.scale[1].max(0.01),
        transform.scale[2].max(0.01),
    );
    let Some(min) = object.bounds_min else {
        return object_model_matrix(object);
    };
    let Some(max) = object.bounds_max else {
        return object_model_matrix(object);
    };
    let min = Vec3::from_array(min);
    let max = Vec3::from_array(max);
    let center = (min + max) * 0.5;
    let size = (max - min).abs();
    let max_extent = size.max_element();
    if max_extent <= 1e-5 {
        return object_model_matrix(object);
    }
    let target = imported_mesh_target_size(object);
    let normalize = target / max_extent;
    Mat4::from_translation(Vec3::from_array(transform.position))
        * Mat4::from_quat(rot)
        * Mat4::from_scale(user_scale * Vec3::splat(normalize))
        * Mat4::from_translation(-center)
}

fn build_camera_matrices(
    yaw: f32,
    pitch: f32,
    distance: f32,
    projection: HostProjection,
    pan: [f32; 2],
    aspect: f32,
) -> (Mat4, Mat4, Mat4) {
    let proj = match projection {
        HostProjection::Perspective => Mat4::perspective_rh_gl(45.0_f32.to_radians(), aspect, 0.05, 200.0),
        HostProjection::Orthographic => {
            let half_height = (distance * 0.42).clamp(1.0, 80.0);
            let half_width = half_height * aspect.max(0.01);
            Mat4::orthographic_rh_gl(-half_width, half_width, -half_height, half_height, -200.0, 200.0)
        }
    };
    let pitch = pitch.clamp(-1.52, 1.52);
    let center = Vec3::new(pan[0], pan[1], 0.0);
    let eye = center
        + Vec3::new(
            distance * pitch.cos() * yaw.sin(),
            distance * pitch.sin(),
            distance * pitch.cos() * yaw.cos(),
        );
    let view = Mat4::look_at_rh(eye, center, Vec3::Y);
    (proj, view, proj * view)
}

fn project_world_to_screen(
    point: Vec3,
    view_projection: Mat4,
    width: u32,
    height: u32,
) -> Option<(f32, f32)> {
    let clip = view_projection * point.extend(1.0);
    if clip.w.abs() < 1e-6 {
        return None;
    }
    let ndc = clip.truncate() / clip.w;
    if ndc.z < -1.0 || ndc.z > 1.0 {
        return None;
    }
    Some((
        (ndc.x + 1.0) * 0.5 * width as f32,
        (1.0 - ndc.y) * 0.5 * height as f32,
    ))
}

fn apply_position_snap(position: &mut [f32; 3], enabled: bool, increment: f32) {
    if !enabled {
        return;
    }
    let step = increment.max(0.01);
    for value in position {
        *value = (*value / step).round() * step;
    }
}

fn distance_to_screen_segment(point: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let ab = (b.0 - a.0, b.1 - a.1);
    let ap = (point.0 - a.0, point.1 - a.1);
    let denom = ab.0 * ab.0 + ab.1 * ab.1;
    if denom <= f32::EPSILON {
        let dx = point.0 - a.0;
        let dy = point.1 - a.1;
        return (dx * dx + dy * dy).sqrt();
    }
    let t = ((ap.0 * ab.0 + ap.1 * ab.1) / denom).clamp(0.0, 1.0);
    let closest = (a.0 + ab.0 * t, a.1 + ab.1 * t);
    let dx = point.0 - closest.0;
    let dy = point.1 - closest.1;
    (dx * dx + dy * dy).sqrt()
}

fn ray_unit_box_hit(origin: Vec3, direction: Vec3) -> Option<f32> {
    ray_aabb_hit(origin, direction, Vec3::splat(-0.5), Vec3::splat(0.5))
}

fn ray_object_hit(object: &HostObject, ray_origin: Vec3, ray_dir: Vec3) -> Option<f32> {
    if is_imported_asset(object) {
        if let (Some(min), Some(max)) = (object.bounds_min, object.bounds_max) {
            let inv_model = imported_mesh_model_matrix(object).inverse();
            let local_origin = inv_model.transform_point3(ray_origin);
            let local_dir = inv_model.transform_vector3(ray_dir).normalize_or_zero();
            return ray_aabb_hit(local_origin, local_dir, Vec3::from_array(min), Vec3::from_array(max));
        }
    }
    let inv_model = object_model_matrix(object).inverse();
    let local_origin = inv_model.transform_point3(ray_origin);
    let local_dir = inv_model.transform_vector3(ray_dir).normalize_or_zero();
    ray_unit_box_hit(local_origin, local_dir)
}

fn ray_aabb_hit(origin: Vec3, direction: Vec3, min: Vec3, max: Vec3) -> Option<f32> {
    let mut t_min = 0.0_f32;
    let mut t_max = f32::MAX;

    for axis in 0..3 {
        let o = origin[axis];
        let d = direction[axis];
        if d.abs() < 1e-6 {
            if o < min[axis] || o > max[axis] {
                return None;
            }
            continue;
        }
        let inv_d = 1.0 / d;
        let mut t0 = (min[axis] - o) * inv_d;
        let mut t1 = (max[axis] - o) * inv_d;
        if t0 > t1 {
            std::mem::swap(&mut t0, &mut t1);
        }
        t_min = t_min.max(t0);
        t_max = t_max.min(t1);
        if t_max < t_min {
            return None;
        }
    }

    Some(t_min.max(0.0))
}

fn default_objects() -> Vec<HostObject> {
    vec![
        HostObject {
            id: "camera".to_string(),
            name: "Camera".to_string(),
            kind: "camera".to_string(),
            visible: true,
            locked: false,
            material_color: Some("#33b884".to_string()),
            asset_path: None,
            import_backend: None,
            triangle_count: None,
            vertex_count: None,
            bounds_min: None,
            bounds_max: None,
            bounds_size: None,
            has_base_color_texture: false,
            has_metallic_roughness_texture: false,
            metallic_factor: None,
            roughness_factor: None,
            transform: HostTransform {
                position: [-2.6, 0.6, 0.0],
                scale: [1.0, 1.0, 1.0],
                ..Default::default()
            },
        },
        HostObject::default(),
        HostObject {
            id: "light".to_string(),
            name: "Light".to_string(),
            kind: "light".to_string(),
            visible: true,
            locked: false,
            material_color: Some("#f2c94c".to_string()),
            asset_path: None,
            import_backend: None,
            triangle_count: None,
            vertex_count: None,
            bounds_min: None,
            bounds_max: None,
            bounds_size: None,
            has_base_color_texture: false,
            has_metallic_roughness_texture: false,
            metallic_factor: None,
            roughness_factor: None,
            transform: HostTransform {
                position: [2.2, 1.8, 0.0],
                scale: [1.0, 1.0, 1.0],
                ..Default::default()
            },
        },
    ]
}

fn cube_mesh() -> (Vec<HostVertex>, Vec<u16>) {
    let vertices = vec![
        HostVertex { pos: [-0.5, -0.5, 0.5], normal: [0.0, 0.0, 1.0] },
        HostVertex { pos: [0.5, -0.5, 0.5], normal: [0.0, 0.0, 1.0] },
        HostVertex { pos: [0.5, 0.5, 0.5], normal: [0.0, 0.0, 1.0] },
        HostVertex { pos: [-0.5, 0.5, 0.5], normal: [0.0, 0.0, 1.0] },
        HostVertex { pos: [-0.5, -0.5, -0.5], normal: [0.0, 0.0, -1.0] },
        HostVertex { pos: [-0.5, 0.5, -0.5], normal: [0.0, 0.0, -1.0] },
        HostVertex { pos: [0.5, 0.5, -0.5], normal: [0.0, 0.0, -1.0] },
        HostVertex { pos: [0.5, -0.5, -0.5], normal: [0.0, 0.0, -1.0] },
        HostVertex { pos: [-0.5, 0.5, -0.5], normal: [0.0, 1.0, 0.0] },
        HostVertex { pos: [-0.5, 0.5, 0.5], normal: [0.0, 1.0, 0.0] },
        HostVertex { pos: [0.5, 0.5, 0.5], normal: [0.0, 1.0, 0.0] },
        HostVertex { pos: [0.5, 0.5, -0.5], normal: [0.0, 1.0, 0.0] },
        HostVertex { pos: [-0.5, -0.5, -0.5], normal: [0.0, -1.0, 0.0] },
        HostVertex { pos: [0.5, -0.5, -0.5], normal: [0.0, -1.0, 0.0] },
        HostVertex { pos: [0.5, -0.5, 0.5], normal: [0.0, -1.0, 0.0] },
        HostVertex { pos: [-0.5, -0.5, 0.5], normal: [0.0, -1.0, 0.0] },
        HostVertex { pos: [0.5, -0.5, -0.5], normal: [1.0, 0.0, 0.0] },
        HostVertex { pos: [0.5, 0.5, -0.5], normal: [1.0, 0.0, 0.0] },
        HostVertex { pos: [0.5, 0.5, 0.5], normal: [1.0, 0.0, 0.0] },
        HostVertex { pos: [0.5, -0.5, 0.5], normal: [1.0, 0.0, 0.0] },
        HostVertex { pos: [-0.5, -0.5, -0.5], normal: [-1.0, 0.0, 0.0] },
        HostVertex { pos: [-0.5, -0.5, 0.5], normal: [-1.0, 0.0, 0.0] },
        HostVertex { pos: [-0.5, 0.5, 0.5], normal: [-1.0, 0.0, 0.0] },
        HostVertex { pos: [-0.5, 0.5, -0.5], normal: [-1.0, 0.0, 0.0] },
    ];
    let indices = vec![
        0, 1, 2, 0, 2, 3,
        4, 5, 6, 4, 6, 7,
        8, 9, 10, 8, 10, 11,
        12, 13, 14, 12, 14, 15,
        16, 17, 18, 16, 18, 19,
        20, 21, 22, 20, 22, 23,
    ];
    (vertices, indices)
}

fn cube_edges() -> Vec<HostVertex> {
    let n = [0.0, 1.0, 0.0];
    let p = [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, 0.5, -0.5],
        [-0.5, 0.5, -0.5],
        [-0.5, -0.5, 0.5],
        [0.5, -0.5, 0.5],
        [0.5, 0.5, 0.5],
        [-0.5, 0.5, 0.5],
    ];
    [
        (0, 1), (1, 2), (2, 3), (3, 0),
        (4, 5), (5, 6), (6, 7), (7, 4),
        (0, 4), (1, 5), (2, 6), (3, 7),
    ]
    .into_iter()
    .flat_map(|(a, b)| {
        [
            HostVertex { pos: p[a], normal: n },
            HostVertex { pos: p[b], normal: n },
        ]
    })
    .collect()
}

fn grid_mesh() -> Vec<HostVertex> {
    let mut vertices = Vec::new();
    let extent = 24_i32;
    for i in -extent..=extent {
        let c = i as f32;
        let axis_normal = if i == 0 { [0.0, 1.0, 0.0] } else { [0.0, 0.55, 0.0] };
        vertices.push(HostVertex {
            pos: [c, 0.0, -extent as f32],
            normal: axis_normal,
        });
        vertices.push(HostVertex {
            pos: [c, 0.0, extent as f32],
            normal: axis_normal,
        });
        vertices.push(HostVertex {
            pos: [-extent as f32, 0.0, c],
            normal: axis_normal,
        });
        vertices.push(HostVertex {
            pos: [extent as f32, 0.0, c],
            normal: axis_normal,
        });
    }
    vertices
}

fn gizmo_mesh() -> Vec<HostVertex> {
    let n = [0.0, 1.0, 0.0];
    vec![
        HostVertex { pos: [0.0, 0.0, 0.0], normal: n },
        HostVertex { pos: [1.0, 0.0, 0.0], normal: n },
        HostVertex { pos: [0.0, 0.0, 0.0], normal: n },
        HostVertex { pos: [0.0, 1.0, 0.0], normal: n },
        HostVertex { pos: [0.0, 0.0, 0.0], normal: n },
        HostVertex { pos: [0.0, 0.0, 1.0], normal: n },
    ]
}

const HOST_WGSL: &str = r#"
struct Uniforms {
  mvp: mat4x4<f32>,
  normal_matrix: mat4x4<f32>,
  color_selected: vec4<f32>,
  light_dir: vec4<f32>,
  material_params: vec4<f32>,
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
  out.normal = normalize((uniforms.normal_matrix * vec4<f32>(input.normal, 0.0)).xyz);
  return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let n = normalize(input.normal);
  let l = normalize(uniforms.light_dir.xyz);
  let ndotl = max(dot(n, l), 0.0);
  let base = uniforms.color_selected.xyz;
  let selected = uniforms.color_selected.w;
  let glow = vec3<f32>(0.24, 0.45, 0.85) * selected * 0.28;
  let color = base * (0.34 + ndotl * 0.78) + glow;
  return vec4<f32>(color, 1.0);
}
"#;

const IMPORTED_HOST_WGSL: &str = r#"
struct Uniforms {
  mvp: mat4x4<f32>,
  normal_matrix: mat4x4<f32>,
  color_selected: vec4<f32>,
  light_dir: vec4<f32>,
  material_params: vec4<f32>,
}
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(1) @binding(0) var base_color_texture: texture_2d<f32>;
@group(1) @binding(1) var base_color_sampler: sampler;
@group(1) @binding(2) var metallic_roughness_texture: texture_2d<f32>;

struct VertexInput {
  @location(0) pos: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) material_tint: vec3<f32>,
};

struct VertexOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) material_tint: vec3<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.pos = uniforms.mvp * vec4<f32>(input.pos, 1.0);
  out.normal = normalize((uniforms.normal_matrix * vec4<f32>(input.normal, 0.0)).xyz);
  out.uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
  out.material_tint = input.material_tint;
  return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let n = normalize(input.normal);
  let l = normalize(uniforms.light_dir.xyz);
  let v = vec3<f32>(0.0, 0.0, 1.0);
  let h = normalize(l + v);
  let ndotl = max(dot(n, l), 0.0);
  let ndoth = max(dot(n, h), 0.0);
  let sampled = textureSample(base_color_texture, base_color_sampler, input.uv).rgb;
  let mr_sample = textureSample(metallic_roughness_texture, base_color_sampler, input.uv).rgb;
  let metallic = clamp(uniforms.material_params.x * mr_sample.b, 0.0, 1.0);
  let roughness = clamp(uniforms.material_params.y * mr_sample.g, 0.04, 1.0);
  let base = uniforms.color_selected.xyz * input.material_tint * sampled;
  let selected = uniforms.color_selected.w;
  let dielectric = vec3<f32>(0.04, 0.04, 0.04);
  let f0 = dielectric * (1.0 - metallic) + base * metallic;
  let spec_power = mix(96.0, 8.0, roughness);
  let specular = f0 * pow(ndoth, spec_power) * (1.0 - roughness * 0.55);
  let diffuse = base * (1.0 - metallic * 0.75);
  let glow = vec3<f32>(0.24, 0.45, 0.85) * selected * 0.28;
  let color = diffuse * (0.28 + ndotl * 0.74) + specular + glow;
  return vec4<f32>(color, 1.0);
}
"#;
