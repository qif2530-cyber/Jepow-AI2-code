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
        active_backend: "native-minimal-runtime",
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

fn read_vec3(value: Option<&Value>, fallback: [f64; 3]) -> [f64; 3] {
    value
        .and_then(|value| value.as_array())
        .and_then(|values| {
            if values.len() >= 3 {
                Some([
                    values[0].as_f64().unwrap_or(fallback[0]),
                    values[1].as_f64().unwrap_or(fallback[1]),
                    values[2].as_f64().unwrap_or(fallback[2]),
                ])
            } else {
                None
            }
        })
        .unwrap_or(fallback)
}

fn default_body() -> Value {
    json!({
        "id": "body-0",
        "label": "Minimal Rigid Body",
        "dynamic": true,
        "position": [0.0, 2.0, 0.0],
        "velocity": [0.0, 0.0, 0.0],
        "halfExtents": [0.5, 0.5, 0.5],
        "mass": 1.0,
    })
}

fn read_world_snapshot(payload: &Value, backend: &str, gravity: [f64; 3]) -> Value {
    payload
        .get("worldSnapshot")
        .cloned()
        .unwrap_or_else(|| {
            json!({
                "worldId": payload
                    .get("worldId")
                    .and_then(|value| value.as_str())
                    .unwrap_or("physics-world-native-minimal"),
                "backend": backend,
                "gravity": gravity,
                "time": 0.0,
                "stepCount": 0,
                "bodies": [default_body()],
            })
        })
}

fn step_body(body: &Value, gravity: [f64; 3], delta_time: f64) -> Value {
    let dynamic = body
        .get("dynamic")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    let mut position = read_vec3(body.get("position"), [0.0, 0.0, 0.0]);
    let mut velocity = read_vec3(body.get("velocity"), [0.0, 0.0, 0.0]);
    let half_extents = read_vec3(body.get("halfExtents"), [0.5, 0.5, 0.5]);

    if dynamic {
        for axis in 0..3 {
            velocity[axis] += gravity[axis] * delta_time;
            position[axis] += velocity[axis] * delta_time;
        }
        let damping = (1.0 - delta_time * 0.08).clamp(0.0, 1.0);
        velocity[0] *= damping;
        velocity[2] *= damping;
        let floor_y = half_extents[1].max(0.0);
        if position[1] < floor_y {
            position[1] = floor_y;
            if velocity[1] < 0.0 {
                velocity[1] *= -0.22;
                if velocity[1].abs() < 0.05 {
                    velocity[1] = 0.0;
                }
            }
        }
    }

    json!({
        "id": body.get("id").and_then(|value| value.as_str()).unwrap_or("body"),
        "label": body.get("label").and_then(|value| value.as_str()).unwrap_or("Rigid Body"),
        "dynamic": dynamic,
        "position": position,
        "velocity": velocity,
        "halfExtents": half_extents,
        "mass": body.get("mass").and_then(|value| value.as_f64()).unwrap_or(1.0),
    })
}

fn body_dynamic(body: &Value) -> bool {
    body.get("dynamic")
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

fn body_vec3(body: &Value, key: &str, fallback: [f64; 3]) -> [f64; 3] {
    read_vec3(body.get(key), fallback)
}

fn write_body_vec3(body: &mut Value, key: &str, value: [f64; 3]) {
    if let Some(object) = body.as_object_mut() {
        object.insert(key.to_string(), json!(value));
    }
}

fn aabb_overlap(a_pos: [f64; 3], a_half: [f64; 3], b_pos: [f64; 3], b_half: [f64; 3]) -> Option<(usize, f64, f64)> {
    let mut best_axis = 0;
    let mut best_overlap = f64::MAX;
    let mut best_sign = 1.0;
    for axis in 0..3 {
        let delta = b_pos[axis] - a_pos[axis];
        let overlap = a_half[axis] + b_half[axis] - delta.abs();
        if overlap <= 0.0 {
            return None;
        }
        if overlap < best_overlap {
            best_axis = axis;
            best_overlap = overlap;
            best_sign = if delta >= 0.0 { 1.0 } else { -1.0 };
        }
    }
    Some((best_axis, best_overlap, best_sign))
}

fn resolve_body_collisions(bodies: &mut [Value]) -> usize {
    let mut contact_count = 0;
    for _ in 0..4 {
        let mut resolved_this_pass = 0;
        for i in 0..bodies.len() {
            for j in (i + 1)..bodies.len() {
                let a_dynamic = body_dynamic(&bodies[i]);
                let b_dynamic = body_dynamic(&bodies[j]);
                if !a_dynamic && !b_dynamic {
                    continue;
                }
                let a_pos = body_vec3(&bodies[i], "position", [0.0, 0.0, 0.0]);
                let b_pos = body_vec3(&bodies[j], "position", [0.0, 0.0, 0.0]);
                let a_half = body_vec3(&bodies[i], "halfExtents", [0.5, 0.5, 0.5]);
                let b_half = body_vec3(&bodies[j], "halfExtents", [0.5, 0.5, 0.5]);
                let Some((axis, overlap, sign)) = aabb_overlap(a_pos, a_half, b_pos, b_half) else {
                    continue;
                };

                let mut next_a = a_pos;
                let mut next_b = b_pos;
                if a_dynamic && b_dynamic {
                    next_a[axis] -= sign * overlap * 0.5;
                    next_b[axis] += sign * overlap * 0.5;
                } else if a_dynamic {
                    next_a[axis] -= sign * overlap;
                } else if b_dynamic {
                    next_b[axis] += sign * overlap;
                }

                if a_dynamic {
                    let mut velocity = body_vec3(&bodies[i], "velocity", [0.0, 0.0, 0.0]);
                    if velocity[axis] * sign > 0.0 {
                        velocity[axis] = 0.0;
                    }
                    write_body_vec3(&mut bodies[i], "position", next_a);
                    write_body_vec3(&mut bodies[i], "velocity", velocity);
                }
                if b_dynamic {
                    let mut velocity = body_vec3(&bodies[j], "velocity", [0.0, 0.0, 0.0]);
                    if velocity[axis] * sign < 0.0 {
                        velocity[axis] = 0.0;
                    }
                    write_body_vec3(&mut bodies[j], "position", next_b);
                    write_body_vec3(&mut bodies[j], "velocity", velocity);
                }
                resolved_this_pass += 1;
            }
        }
        contact_count += resolved_this_pass;
        if resolved_this_pass == 0 {
            break;
        }
    }
    contact_count
}

pub fn create_world(payload: &Value) -> Value {
    let backend = payload
        .get("backend")
        .and_then(|value| value.as_str())
        .unwrap_or("jolt");
    let gravity = read_vec3(payload.get("gravity"), [0.0, -9.81, 0.0]);
    let bodies = payload
        .get("bodies")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_else(|| vec![default_body()]);
    let world_snapshot = json!({
        "worldId": "physics-world-native-minimal",
        "backend": backend,
        "gravity": gravity,
        "time": 0.0,
        "stepCount": 0,
        "bodies": bodies,
    });
    json!({
        "pipeline": "physics",
        "command": "create_world",
        "architectureWired": true,
        "productionReady": false,
        "runtimeLinked": true,
        "backend": backend,
        "worldId": "physics-world-native-minimal",
        "gravity": gravity,
        "bodyCount": world_snapshot
            .get("bodies")
            .and_then(|value| value.as_array())
            .map(|values| values.len())
            .unwrap_or(0),
        "worldSnapshot": world_snapshot,
        "status": status(),
        "message": "最小 native 物理 runtime 已创建世界快照；后续会替换为 Jolt/Bullet 刚体世界。",
    })
}

pub fn step_world(payload: &Value) -> Value {
    let backend = payload
        .get("backend")
        .and_then(|value| value.as_str())
        .unwrap_or("native-minimal");
    let world_id = payload
        .get("worldId")
        .and_then(|value| value.as_str())
        .unwrap_or("physics-world-native-minimal");
    let delta_time = payload
        .get("deltaTime")
        .and_then(|value| value.as_f64())
        .unwrap_or(1.0 / 60.0);
    let substeps = payload
        .get("substeps")
        .and_then(|value| value.as_u64())
        .unwrap_or(4)
        .clamp(1, 8);
    let clamped_delta_time = delta_time.clamp(0.0, 0.25);
    let substep_delta_time = clamped_delta_time / substeps as f64;
    let world = read_world_snapshot(payload, backend, [0.0, -9.81, 0.0]);
    let gravity = read_vec3(world.get("gravity"), [0.0, -9.81, 0.0]);
    let mut next_bodies: Vec<Value> = world
        .get("bodies")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_else(|| vec![default_body()]);
    let mut contact_count = 0;
    for _ in 0..substeps {
        next_bodies = next_bodies
            .iter()
            .map(|body| step_body(body, gravity, substep_delta_time))
            .collect();
        contact_count += resolve_body_collisions(&mut next_bodies);
    }
    let time = world.get("time").and_then(|value| value.as_f64()).unwrap_or(0.0)
        + clamped_delta_time;
    let step_count = world
        .get("stepCount")
        .and_then(|value| value.as_u64())
        .unwrap_or(0)
        + 1;
    let next_world = json!({
        "worldId": world_id,
        "backend": backend,
        "gravity": gravity,
        "time": time,
        "stepCount": step_count,
        "bodies": next_bodies,
    });
    json!({
        "pipeline": "physics",
        "command": "step_world",
        "architectureWired": true,
        "productionReady": false,
        "runtimeLinked": true,
        "worldId": world_id,
        "deltaTime": delta_time,
        "substeps": substeps,
        "bodyCount": next_world
            .get("bodies")
            .and_then(|value| value.as_array())
            .map(|values| values.len())
            .unwrap_or(0),
        "time": time,
        "stepCount": step_count,
        "contactCount": contact_count,
        "worldSnapshot": next_world,
        "status": status(),
        "message": "最小 native 物理 runtime 已完成 substep 重力积分、阻尼、地面碰撞和 AABB 刚体碰撞步进。",
    })
}
