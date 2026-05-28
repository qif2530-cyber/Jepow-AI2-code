use serde::Serialize;
use serde_json::{json, Value};

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
    json!({
        "pipeline": "import",
        "architectureWired": true,
        "productionReady": false,
        "scenePath": scene_path,
        "extension": extension,
        "requestedBackend": requested_backend,
        "plannedBackend": planned_backend,
        "status": status(),
        "message": "Assimp/USD 导入管线命令已接入；当前返回架构占位结果，后续替换为真实 runtime importer。",
    })
}
