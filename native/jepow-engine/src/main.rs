mod gpu;
mod jobs;
mod mesh_loader;
mod render;
mod scene;

use std::env;

fn emit(mut value: serde_json::Value) {
    if let Some(obj) = value.as_object_mut() {
        obj.insert("ok".to_string(), serde_json::json!(true));
    }
    println!("{}", value);
}

fn emit_err(message: impl ToString) {
    println!(
        "{}",
        serde_json::json!({ "ok": false, "error": message.to_string() })
    );
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str()).unwrap_or("ping");
    let payload: serde_json::Value = args
        .get(2)
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(serde_json::json!({}));

    match cmd {
        "ping" => cmd_ping(),
        "gpu_info" => cmd_gpu_info(),
        "open_scene" | "scene_info" => cmd_open_scene(&payload),
        "render_frame" => cmd_render_frame(&payload),
        _ => emit_err(format!("unknown command: {}", cmd)),
    }
}

fn cmd_ping() {
    let gpu = gpu::probe_gpu().ok();
    emit(serde_json::json!({
        "engine": "jepow-engine",
        "version": env!("CARGO_PKG_VERSION"),
        "cpuJobs": jobs::parallel_job_count(),
        "gpu": gpu,
    }));
}

fn cmd_gpu_info() {
    match gpu::probe_gpu() {
        Ok(info) => emit(serde_json::to_value(info).unwrap()),
        Err(e) => emit_err(e),
    }
}

fn cmd_open_scene(payload: &serde_json::Value) {
    let scene_path = match payload.get("scenePath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return emit_err("scenePath required"),
    };

    match scene::load_scene_stats(scene_path) {
        Ok(stats) => emit(serde_json::json!({
            "scenePath": stats.path,
            "extension": stats.extension,
            "meshCount": stats.mesh_count,
            "nodeCount": stats.node_count,
            "materialCount": stats.material_count,
            "triangleCount": stats.triangle_count,
            "cpuJobs": jobs::parallel_job_count(),
        })),
        Err(e) => emit_err(e),
    }
}

fn parse_camera(payload: &serde_json::Value) -> render::ViewCamera {
    let mut cam = render::ViewCamera::default();
    if let Some(v) = payload.get("cameraYaw").and_then(|v| v.as_f64()) {
        cam.yaw = v as f32;
    }
    if let Some(v) = payload.get("cameraPitch").and_then(|v| v.as_f64()) {
        cam.pitch = v as f32;
    }
    if let Some(v) = payload.get("cameraDistance").and_then(|v| v.as_f64()) {
        cam.distance = v as f32;
    }
    if let Some(v) = payload.get("panX").and_then(|v| v.as_f64()) {
        cam.pan_x = v as f32;
    }
    if let Some(v) = payload.get("panY").and_then(|v| v.as_f64()) {
        cam.pan_y = v as f32;
    }
    cam
}

fn cmd_render_frame(payload: &serde_json::Value) {
    let output_path = match payload.get("outputPath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return emit_err("outputPath required"),
    };
    let width = payload.get("width").and_then(|v| v.as_u64()).unwrap_or(640) as u32;
    let height = payload.get("height").and_then(|v| v.as_u64()).unwrap_or(480) as u32;

    let scene_path = payload.get("scenePath").and_then(|v| v.as_str());

    let camera = parse_camera(payload);
    match render::render_viewport_frame(output_path, width, height, scene_path, camera) {
        Ok(()) => emit(serde_json::json!({
            "imagePath": output_path,
            "width": width,
            "height": height,
            "renderer": "jepow-wgpu",
        })),
        Err(e) => emit_err(e),
    }
}
