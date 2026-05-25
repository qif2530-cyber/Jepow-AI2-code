use crate::mesh_loader::{load_meshes_cached, MeshData, Vertex};
use anyhow::{Context, Result};
use glam::{EulerRot, Mat4, Quat, Vec3};
use image::{ImageBuffer, Rgba};
use std::path::Path;
use wgpu::util::DeviceExt;

use crate::render::{
    build_uniforms, camera_mvp, Uniforms, ViewCamera, ViewLight, ViewMaterial, VIEWPORT_WGSL,
};

fn demo_mesh() -> MeshData {
    MeshData {
        vertices: vec![
            Vertex {
                pos: [0.0, 0.55, 0.0],
                normal: [0.2, 0.9, 0.3],
            },
            Vertex {
                pos: [-0.55, -0.35, 0.0],
                normal: [-0.6, 0.5, 0.2],
            },
            Vertex {
                pos: [0.55, -0.35, 0.0],
                normal: [0.6, 0.5, 0.2],
            },
        ],
        indices: vec![0, 1, 2],
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

/// Blender-style persistent viewport: GPU + mesh stay loaded; frames only update uniforms.
pub struct ViewportSession {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::RenderPipeline,
    bind_group: wgpu::BindGroup,
    uniform_buffer: wgpu::Buffer,
    vertex_buffer: wgpu::Buffer,
    index_buffer: wgpu::Buffer,
    index_count: u32,
    scene_path: Option<String>,
    camera: ViewCamera,
    light: ViewLight,
    material: ViewMaterial,
    transform: ObjectTransform,
    shading: ShadingMode,
    frame_w: u32,
    frame_h: u32,
    color_texture: wgpu::Texture,
    color_view: wgpu::TextureView,
    depth_texture: wgpu::Texture,
    depth_view: wgpu::TextureView,
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
                depth_compare: wgpu::CompareFunction::Less,
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let (vertex_buffer, index_buffer, index_count) =
            Self::upload_mesh(&device, &demo_mesh())?;

        let (frame_w, frame_h) = (640u32, 480u32);
        let (color_texture, color_view, depth_texture, depth_view) =
            Self::create_frame_targets(&device, frame_w, frame_h);

        Ok(Self {
            device,
            queue,
            pipeline,
            bind_group,
            uniform_buffer,
            vertex_buffer,
            index_buffer,
            index_count,
            scene_path: None,
            camera: ViewCamera::default(),
            light: ViewLight::default(),
            material: ViewMaterial::default(),
            transform: ObjectTransform {
                scale: 1.0,
                ..Default::default()
            },
            shading: ShadingMode::Clay,
            frame_w,
            frame_h,
            color_texture,
            color_view,
            depth_texture,
            depth_view,
        })
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

    pub fn load_scene(&mut self, path: &str) -> Result<serde_json::Value> {
        let mesh = load_meshes_cached(path)?;
        let (vb, ib, count) = Self::upload_mesh(&self.device, mesh.as_ref())?;
        self.vertex_buffer = vb;
        self.index_buffer = ib;
        self.index_count = count;
        self.scene_path = Some(path.to_string());
        Ok(serde_json::json!({
            "scenePath": path,
            "triangleCount": count / 3,
            "vertexCount": mesh.vertices.len(),
            "session": true,
        }))
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
        match self.shading {
            ShadingMode::Clay => ViewMaterial::default(),
            ShadingMode::Render => self.material,
        }
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
    }

    pub fn draw_frame(&mut self, output_path: &str, width: u32, height: u32) -> Result<u64> {
        let started = std::time::Instant::now();
        let width = width.clamp(64, 2560);
        let height = height.clamp(64, 1536);
        self.ensure_frame_size(width, height);

        let view = camera_mvp(width, height, self.camera);
        let mvp = view * self.model_matrix();
        let uniforms = build_uniforms(mvp, self.effective_light(), self.effective_material());
        self.queue.write_buffer(
            &self.uniform_buffer,
            0,
            bytemuck::bytes_of(&uniforms),
        );

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

pub fn parse_object_transform(payload: &serde_json::Value) -> ObjectTransform {
    let mut t = ObjectTransform {
        scale: 1.0,
        ..Default::default()
    };
    if let Some(v) = payload.get("x").and_then(|v| v.as_f64()) {
        t.x = v as f32;
    }
    if let Some(v) = payload.get("y").and_then(|v| v.as_f64()) {
        t.y = v as f32;
    }
    if let Some(v) = payload.get("z").and_then(|v| v.as_f64()) {
        t.z = v as f32;
    }
    if let Some(v) = payload.get("rx").and_then(|v| v.as_f64()) {
        t.rx = v as f32;
    }
    if let Some(v) = payload.get("ry").and_then(|v| v.as_f64()) {
        t.ry = v as f32;
    }
    if let Some(v) = payload.get("rz").and_then(|v| v.as_f64()) {
        t.rz = v as f32;
    }
    if let Some(v) = payload.get("scale").and_then(|v| v.as_f64()) {
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
