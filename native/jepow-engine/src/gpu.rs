use anyhow::Result;
use serde::Serialize;

#[derive(Serialize)]
pub struct GpuInfo {
    pub adapter_name: String,
    pub backend: String,
    pub device_type: String,
    pub max_texture_dimension_2d: u32,
}

pub fn probe_gpu() -> Result<GpuInfo> {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::all(),
        ..Default::default()
    });

    let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        compatible_surface: None,
        force_fallback_adapter: false,
    }))
    .ok_or_else(|| anyhow::anyhow!("no GPU adapter available"))?;

    let info = adapter.get_info();
    let limits = adapter.limits();

    Ok(GpuInfo {
        adapter_name: info.name,
        backend: format!("{:?}", info.backend),
        device_type: format!("{:?}", info.device_type),
        max_texture_dimension_2d: limits.max_texture_dimension_2d,
    })
}
