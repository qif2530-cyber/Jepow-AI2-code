use serde::Serialize;
use serde_json::{json, Value};
use std::path::Path;

fn color_to_hex(color: [f32; 3]) -> String {
    let r = (color[0].clamp(0.0, 1.0) * 255.0).round() as u8;
    let g = (color[1].clamp(0.0, 1.0) * 255.0).round() as u8;
    let b = (color[2].clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{r:02x}{g:02x}{b:02x}")
}

#[derive(Debug, Serialize)]
pub struct ImportBackendStatus {
    pub id: &'static str,
    pub label: &'static str,
    pub architecture_wired: bool,
    pub runtime_linked: bool,
    pub formats: &'static [&'static str],
    pub note: &'static str,
}

#[derive(Debug, Serialize)]
pub struct ImportPipelineStatus {
    pub architecture_wired: bool,
    pub production_ready: bool,
    pub active_backend: &'static str,
    pub existing_native_formats: &'static [&'static str],
    pub backends: &'static [ImportBackendStatus],
}

const ASSIMP_USD_BACKENDS: &[ImportBackendStatus] = &[
    ImportBackendStatus {
        id: "assimp",
        label: "Assimp Import",
        architecture_wired: true,
        runtime_linked: false,
        formats: &["fbx", "obj", "dae", "3ds", "ply", "stl"],
        note: "模块边界与状态协议已接入，后续接 native Assimp loader。",
    },
    ImportBackendStatus {
        id: "usd",
        label: "USD Import",
        architecture_wired: true,
        runtime_linked: false,
        formats: &["usd", "usda", "usdc", "usdz"],
        note: "模块边界与状态协议已接入，后续接 OpenUSD scene bridge。",
    },
];

fn native_existing_import(scene_path: &str, extension: &str, requested_backend: &str) -> Value {
    match crate::scene::load_scene_stats(scene_path) {
        Ok(stats) => {
            let mesh_result = crate::mesh_loader::load_meshes(scene_path);
            let (
                mesh_runtime_ready,
                vertex_count,
                index_count,
                bounds_min,
                bounds_max,
                bounds_size,
                material_color,
                metallic_factor,
                roughness_factor,
                has_base_color_texture,
                has_metallic_roughness_texture,
                mesh_error,
            ) = match mesh_result {
                Ok(mesh) => {
                    let mut min = [f32::MAX; 3];
                    let mut max = [f32::MIN; 3];
                    for vertex in &mesh.vertices {
                        for axis in 0..3 {
                            min[axis] = min[axis].min(vertex.pos[axis]);
                            max[axis] = max[axis].max(vertex.pos[axis]);
                        }
                    }
                    let size = [
                        (max[0] - min[0]).max(0.0),
                        (max[1] - min[1]).max(0.0),
                        (max[2] - min[2]).max(0.0),
                    ];
                    (
                        true,
                        mesh.vertices.len(),
                        mesh.indices.len(),
                        Some(min),
                        Some(max),
                        Some(size),
                        mesh.material_color.map(color_to_hex),
                        mesh.metallic_factor,
                        mesh.roughness_factor,
                        mesh.base_color_texture.is_some(),
                        mesh.metallic_roughness_texture.is_some(),
                        None,
                    )
                }
                Err(error) => (false, 0, 0, None, None, None, None, 0.0, 0.65, false, false, Some(error.to_string())),
            };
            json!({
                "pipeline": "import",
                "architectureWired": true,
                "productionReady": mesh_runtime_ready,
                "runtimeLinked": true,
                "scenePath": scene_path,
                "extension": extension,
                "requestedBackend": requested_backend,
                "plannedBackend": "native-existing",
                "activeBackend": "native-gltf-ufbx-tobj",
                "meshCount": stats.mesh_count,
                "nodeCount": stats.node_count,
                "materialCount": stats.material_count,
                "triangleCount": stats.triangle_count,
                "vertexCount": vertex_count,
                "indexCount": index_count,
                "boundsMin": bounds_min,
                "boundsMax": bounds_max,
                "boundsSize": bounds_size,
                "materialColor": material_color,
                "metallicFactor": metallic_factor,
                "roughnessFactor": roughness_factor,
                "hasBaseColorTexture": has_base_color_texture,
                "hasMetallicRoughnessTexture": has_metallic_roughness_texture,
                "meshRuntimeReady": mesh_runtime_ready,
                "meshError": mesh_error,
                "status": status(),
                "message": "现有 native glTF/FBX/OBJ 导入 runtime 已执行，可用于后续转换为 viewport scene objects。",
            })
        }
        Err(error) => json!({
            "pipeline": "import",
            "architectureWired": true,
            "productionReady": false,
            "runtimeLinked": true,
            "scenePath": scene_path,
            "extension": extension,
            "requestedBackend": requested_backend,
            "plannedBackend": "native-existing",
            "activeBackend": "native-gltf-ufbx-tobj",
            "status": status(),
            "error": error.to_string(),
            "message": "native 导入 runtime 已接入，但该文件读取失败。",
        }),
    }
}

pub fn status() -> ImportPipelineStatus {
    ImportPipelineStatus {
        architecture_wired: true,
        production_ready: false,
        active_backend: "native-gltf-ufbx-tobj",
        existing_native_formats: &["gltf", "glb", "fbx", "obj"],
        backends: ASSIMP_USD_BACKENDS,
    }
}

pub fn import_scene(payload: &Value) -> Value {
    let scene_path = payload
        .get("scenePath")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let extension = scene_path
        .rsplit('.')
        .next()
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let requested_backend = payload
        .get("backend")
        .and_then(|value| value.as_str())
        .unwrap_or("auto");
    let planned_backend = match extension.as_str() {
        "usd" | "usda" | "usdc" | "usdz" => "usd",
        "dae" | "3ds" | "ply" | "stl" => "assimp",
        "fbx" | "obj" | "gltf" | "glb" => "native-existing",
        _ => "auto",
    };
    if scene_path.is_empty() {
        return json!({
            "pipeline": "import",
            "architectureWired": true,
            "productionReady": false,
            "requestedBackend": requested_backend,
            "plannedBackend": planned_backend,
            "status": status(),
            "message": "scenePath 为空；请选择资产文件后再调用导入 runtime。",
        });
    }
    if !Path::new(scene_path).exists() {
        return json!({
            "pipeline": "import",
            "architectureWired": true,
            "productionReady": false,
            "scenePath": scene_path,
            "extension": extension,
            "requestedBackend": requested_backend,
            "plannedBackend": planned_backend,
            "status": status(),
            "message": "导入文件不存在，runtime 未执行。",
        });
    }
    if planned_backend == "native-existing" {
        return native_existing_import(scene_path, &extension, requested_backend);
    }
    json!({
        "pipeline": "import",
        "architectureWired": true,
        "productionReady": false,
        "runtimeLinked": false,
        "scenePath": scene_path,
        "extension": extension,
        "requestedBackend": requested_backend,
        "plannedBackend": planned_backend,
        "status": status(),
        "message": "Assimp/USD 导入管线命令已接入；该格式 runtime 尚未链接，等待接入 Assimp/OpenUSD。",
    })
}
