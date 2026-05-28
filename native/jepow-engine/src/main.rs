mod cycles_mesh;
mod daemon;
mod gpu;
mod jobs;
mod mesh_loader;
mod render;
mod scene;
mod viewport_host;
mod viewport_session;

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
    if args.get(1).map(|s| s.as_str()) == Some("daemon") {
        daemon::run_daemon_loop();
        return;
    }
    if args.get(1).map(|s| s.as_str()) == Some("viewport-host") {
        viewport_host::run_viewport_host();
        return;
    }
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
        "mesh_stats" => cmd_mesh_stats(&payload),
        "mesh_for_cycles" => cmd_mesh_for_cycles(&payload),
        "mesh_cache_for_cycles" => cmd_mesh_cache_for_cycles(&payload),
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

fn cmd_mesh_stats(payload: &serde_json::Value) {
    let scene_path = match payload.get("scenePath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return emit_err("scenePath required"),
    };
    match mesh_loader::load_meshes(scene_path) {
        Ok(mesh) => {
            let mut min = [f32::MAX; 3];
            let mut max = [f32::MIN; 3];
            for v in &mesh.vertices {
                for i in 0..3 {
                    min[i] = min[i].min(v.pos[i]);
                    max[i] = max[i].max(v.pos[i]);
                }
            }
            emit(serde_json::json!({
                "vertexCount": mesh.vertices.len(),
                "indexCount": mesh.indices.len(),
                "triangleCount": mesh.indices.len() / 3,
                "boundsMin": min,
                "boundsMax": max,
            }));
        }
        Err(e) => emit_err(e.to_string()),
    }
}

fn cmd_mesh_for_cycles(payload: &serde_json::Value) {
    let scene_path = match payload.get("scenePath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return emit_err("scenePath required"),
    };
    match cycles_mesh::mesh_for_cycles(scene_path) {
        Ok(data) => emit(data),
        Err(e) => emit_err(e.to_string()),
    }
}

fn cmd_mesh_cache_for_cycles(payload: &serde_json::Value) {
    let scene_path = match payload.get("scenePath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return emit_err("scenePath required"),
    };
    let output_path = match payload.get("outputPath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return emit_err("outputPath required"),
    };
    match cycles_mesh::write_mesh_cache_for_cycles(scene_path, output_path) {
        Ok(data) => emit(data),
        Err(e) => emit_err(e.to_string()),
    }
}

fn cmd_render_frame(payload: &serde_json::Value) {
    let output_path = match payload.get("outputPath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return emit_err("outputPath required"),
    };
    let width = payload.get("width").and_then(|v| v.as_u64()).unwrap_or(640) as u32;
    let height = payload
        .get("height")
        .and_then(|v| v.as_u64())
        .unwrap_or(480) as u32;

    let scene_path = payload.get("scenePath").and_then(|v| v.as_str());

    let camera = render::parse_camera(payload);
    let light = render::parse_light(payload);
    let material = render::parse_material(payload);
    match render::render_viewport_frame(
        output_path,
        width,
        height,
        scene_path,
        camera,
        light,
        material,
    ) {
        Ok(()) => emit(serde_json::json!({
            "imagePath": output_path,
            "width": width,
            "height": height,
            "renderer": "jepow-wgpu",
        })),
        Err(e) => emit_err(e),
    }
}
