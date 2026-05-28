use serde::Serialize;
use serde_json::{json, Value};

#[derive(Debug, Serialize)]
pub struct PhysicsBackendStatus {
    pub id: &'static str,
    pub label: &'static str,
    pub architecture_wired: bool,
    pub runtime_linked: bool,
    pub role: &'static str,
    pub note: &'static str,
}

#[derive(Debug, Serialize)]
pub struct PhysicsPipelineStatus {
    pub architecture_wired: bool,
    pub production_ready: bool,
    pub active_backend: &'static str,
    pub planned_features: &'static [&'static str],
    pub backends: &'static [PhysicsBackendStatus],
}

const PHYSICS_BACKENDS: &[PhysicsBackendStatus] = &[
    PhysicsBackendStatus {
        id: "jolt",
        label: "Jolt Physics",
        architecture_wired: true,
        runtime_linked: false,
        role: "interactive viewport simulation",
        note: "模块边界与状态协议已接入，后续接刚体世界、碰撞体和步进器。",
    },
    PhysicsBackendStatus {
        id: "bullet",
        label: "Bullet Physics",
        architecture_wired: true,
        runtime_linked: false,
        role: "compatibility and import bridge",
        note: "预留 Bullet 兼容层，用于资产/仿真互操作。",
    },
];

pub fn status() -> PhysicsPipelineStatus {
    PhysicsPipelineStatus {
        architecture_wired: true,
        production_ready: false,
        active_backend: "none",
        planned_features: &[
            "rigid bodies",
            "colliders",
            "gravity",
            "simulation stepping",
            "viewport debug draw",
        ],
        backends: PHYSICS_BACKENDS,
    }
}

pub fn create_world(payload: &Value) -> Value {
    let backend = payload
        .get("backend")
        .and_then(|value| value.as_str())
        .unwrap_or("jolt");
    let gravity = payload
        .get("gravity")
        .and_then(|value| value.as_array())
        .and_then(|values| {
            if values.len() >= 3 {
                Some([
                    values[0].as_f64().unwrap_or(0.0),
                    values[1].as_f64().unwrap_or(-9.81),
                    values[2].as_f64().unwrap_or(0.0),
                ])
            } else {
                None
            }
        })
        .unwrap_or([0.0, -9.81, 0.0]);
    json!({
        "pipeline": "physics",
        "command": "create_world",
        "architectureWired": true,
        "productionReady": false,
        "backend": backend,
        "worldId": "physics-world-placeholder",
        "gravity": gravity,
        "status": status(),
        "message": "Bullet/Jolt 物理世界命令已接入；当前返回架构占位结果，后续替换为真实 physics runtime。",
    })
}

pub fn step_world(payload: &Value) -> Value {
    let world_id = payload
        .get("worldId")
        .and_then(|value| value.as_str())
        .unwrap_or("physics-world-placeholder");
    let delta_time = payload
        .get("deltaTime")
        .and_then(|value| value.as_f64())
        .unwrap_or(1.0 / 60.0);
    json!({
        "pipeline": "physics",
        "command": "step_world",
        "architectureWired": true,
        "productionReady": false,
        "worldId": world_id,
        "deltaTime": delta_time,
        "bodyCount": 0,
        "status": status(),
        "message": "Bullet/Jolt 物理步进命令已接入；当前还未运行真实刚体求解。",
    })
}
