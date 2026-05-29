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
    pub native_runtime_capabilities: &'static [&'static str],
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
        native_runtime_capabilities: &[
            "world-snapshot-create-step",
            "deterministic-gravity-integration",
            "floor-collision-response",
            "aabb-body-body-collision",
            "static-dynamic-collision-resolution",
            "collision-penetration-diagnostics",
            "body-restitution-friction",
            "body-sleep-threshold",
            "angular-velocity-integration",
            "angular-damping",
            "rotation-snapshot-sync",
            "moving-rotating-body-diagnostics",
            "mass-weighted-collision-resolution",
            "dynamic-mass-diagnostics",
            "center-of-mass-diagnostics",
            "kinetic-energy-diagnostics",
            "per-body-gravity-scale",
            "per-body-linear-damping",
            "velocity-clamp-stability",
            "max-speed-diagnostics",
            "grounded-body-diagnostics",
            "floor-contact-counting",
            "contact-pair-diagnostics",
            "deepest-contact-diagnostics",
            "collision-wake-counting",
            "fixed-substeps",
            "velocity-damping",
            "contact-count-reporting",
            "viewport-playback-sync",
            "imported-mesh-collider-scale",
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
        "rotation": [0.0, 0.0, 0.0],
        "velocity": [0.0, 0.0, 0.0],
        "angularVelocity": [0.0, 0.35, 0.0],
        "gravityScale": 1.0,
        "linearDamping": 0.015,
        "angularDamping": 0.18,
        "maxLinearSpeed": 35.0,
        "maxAngularSpeed": 18.0,
        "grounded": false,
        "halfExtents": [0.5, 0.5, 0.5],
        "mass": 1.0,
        "restitution": 0.22,
        "friction": 0.08,
        "sleepThreshold": 0.035,
        "sleeping": false,
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

fn clamp_vec3_magnitude(vector: &mut [f64; 3], max_length: f64) {
    if max_length <= 0.0 {
        vector[0] = 0.0;
        vector[1] = 0.0;
        vector[2] = 0.0;
        return;
    }
    let length_sq = vector.iter().map(|value| value * value).sum::<f64>();
    let max_sq = max_length * max_length;
    if length_sq <= max_sq || length_sq <= f64::EPSILON {
        return;
    }
    let scale = max_length / length_sq.sqrt();
    vector[0] *= scale;
    vector[1] *= scale;
    vector[2] *= scale;
}

fn step_body(body: &Value, gravity: [f64; 3], delta_time: f64) -> Value {
    let dynamic = body
        .get("dynamic")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    let mut position = read_vec3(body.get("position"), [0.0, 0.0, 0.0]);
    let mut rotation = read_vec3(body.get("rotation"), [0.0, 0.0, 0.0]);
    let mut velocity = read_vec3(body.get("velocity"), [0.0, 0.0, 0.0]);
    let mut angular_velocity = read_vec3(body.get("angularVelocity"), [0.0, 0.0, 0.0]);
    let half_extents = read_vec3(body.get("halfExtents"), [0.5, 0.5, 0.5]);
    let gravity_scale = body
        .get("gravityScale")
        .and_then(|value| value.as_f64())
        .unwrap_or(1.0)
        .clamp(-4.0, 4.0);
    let linear_damping = body
        .get("linearDamping")
        .and_then(|value| value.as_f64())
        .unwrap_or(0.015)
        .clamp(0.0, 8.0);
    let restitution = body
        .get("restitution")
        .and_then(|value| value.as_f64())
        .unwrap_or(0.22)
        .clamp(0.0, 1.0);
    let friction = body
        .get("friction")
        .and_then(|value| value.as_f64())
        .unwrap_or(0.08)
        .clamp(0.0, 1.0);
    let sleep_threshold = body
        .get("sleepThreshold")
        .and_then(|value| value.as_f64())
        .unwrap_or(0.035)
        .clamp(0.0, 1.0);
    let angular_damping = body
        .get("angularDamping")
        .and_then(|value| value.as_f64())
        .unwrap_or(0.18)
        .clamp(0.0, 8.0);
    let max_linear_speed = body
        .get("maxLinearSpeed")
        .and_then(|value| value.as_f64())
        .unwrap_or(35.0)
        .clamp(0.0, 10000.0);
    let max_angular_speed = body
        .get("maxAngularSpeed")
        .and_then(|value| value.as_f64())
        .unwrap_or(18.0)
        .clamp(0.0, 10000.0);
    let mut sleeping = body
        .get("sleeping")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let mut grounded = false;

    if dynamic && !sleeping {
        for axis in 0..3 {
            velocity[axis] += gravity[axis] * gravity_scale * delta_time;
            position[axis] += velocity[axis] * delta_time;
            rotation[axis] += angular_velocity[axis] * delta_time;
        }
        let damping = (1.0 - delta_time * friction).clamp(0.0, 1.0);
        let linear_velocity_damping = (1.0 - delta_time * linear_damping).clamp(0.0, 1.0);
        let spin_damping = (1.0 - delta_time * angular_damping).clamp(0.0, 1.0);
        velocity[0] *= linear_velocity_damping;
        velocity[1] *= linear_velocity_damping;
        velocity[2] *= linear_velocity_damping;
        velocity[0] *= damping;
        velocity[2] *= damping;
        angular_velocity[0] *= spin_damping;
        angular_velocity[1] *= spin_damping;
        angular_velocity[2] *= spin_damping;
        clamp_vec3_magnitude(&mut velocity, max_linear_speed);
        clamp_vec3_magnitude(&mut angular_velocity, max_angular_speed);
        let floor_y = half_extents[1].max(0.0);
        if position[1] < floor_y {
            position[1] = floor_y;
            grounded = true;
            if velocity[1] < 0.0 {
                velocity[1] *= -restitution;
                if velocity[1].abs() < 0.05 {
                    velocity[1] = 0.0;
                }
            }
            angular_velocity[0] += velocity[2] * friction * 0.08;
            angular_velocity[2] -= velocity[0] * friction * 0.08;
        }
        grounded = grounded || position[1] <= floor_y + 1e-6;
        let speed_sq = velocity.iter().map(|value| value * value).sum::<f64>();
        let angular_speed_sq = angular_velocity.iter().map(|value| value * value).sum::<f64>();
        if position[1] <= floor_y + 1e-6
            && speed_sq + angular_speed_sq < sleep_threshold * sleep_threshold
        {
            sleeping = true;
            velocity = [0.0, 0.0, 0.0];
            angular_velocity = [0.0, 0.0, 0.0];
        }
    }

    json!({
        "id": body.get("id").and_then(|value| value.as_str()).unwrap_or("body"),
        "label": body.get("label").and_then(|value| value.as_str()).unwrap_or("Rigid Body"),
        "dynamic": dynamic,
        "position": position,
        "rotation": rotation,
        "velocity": velocity,
        "angularVelocity": angular_velocity,
        "gravityScale": gravity_scale,
        "linearDamping": linear_damping,
        "angularDamping": angular_damping,
        "maxLinearSpeed": max_linear_speed,
        "maxAngularSpeed": max_angular_speed,
        "halfExtents": half_extents,
        "mass": body.get("mass").and_then(|value| value.as_f64()).unwrap_or(1.0),
        "restitution": restitution,
        "friction": friction,
        "sleepThreshold": sleep_threshold,
        "sleeping": sleeping,
        "grounded": grounded,
    })
}

fn body_dynamic(body: &Value) -> bool {
    body.get("dynamic")
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
}

fn body_sleeping(body: &Value) -> bool {
    body.get("sleeping")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

fn body_id(body: &Value, fallback: String) -> String {
    body.get("id")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(&fallback)
        .to_string()
}

fn axis_label(axis: usize) -> &'static str {
    match axis {
        0 => "x",
        1 => "y",
        _ => "z",
    }
}

fn body_vec3(body: &Value, key: &str, fallback: [f64; 3]) -> [f64; 3] {
    read_vec3(body.get(key), fallback)
}

fn write_body_vec3(body: &mut Value, key: &str, value: [f64; 3]) {
    if let Some(object) = body.as_object_mut() {
        object.insert(key.to_string(), json!(value));
    }
}

fn write_body_bool(body: &mut Value, key: &str, value: bool) {
    if let Some(object) = body.as_object_mut() {
        object.insert(key.to_string(), json!(value));
    }
}

fn count_dynamic_bodies(bodies: &[Value]) -> usize {
    bodies.iter().filter(|body| body_dynamic(body)).count()
}

fn count_static_bodies(bodies: &[Value]) -> usize {
    bodies.len().saturating_sub(count_dynamic_bodies(bodies))
}

fn count_sleeping_bodies(bodies: &[Value]) -> usize {
    bodies
        .iter()
        .filter(|body| {
            body.get("sleeping")
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
        })
        .count()
}

fn body_grounded(body: &Value) -> bool {
    if body
        .get("grounded")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
    {
        return true;
    }
    let position = body_vec3(body, "position", [0.0, 0.0, 0.0]);
    let half_extents = body_vec3(body, "halfExtents", [0.5, 0.5, 0.5]);
    position[1] <= half_extents[1].max(0.0) + 1e-6
}

fn count_grounded_bodies(bodies: &[Value]) -> usize {
    bodies
        .iter()
        .filter(|body| body_dynamic(body) && body_grounded(body))
        .count()
}

fn body_speed_sq(body: &Value, key: &str) -> f64 {
    body_vec3(body, key, [0.0, 0.0, 0.0])
        .iter()
        .map(|value| value * value)
        .sum::<f64>()
}

fn count_moving_bodies(bodies: &[Value]) -> usize {
    bodies
        .iter()
        .filter(|body| body_dynamic(body) && body_speed_sq(body, "velocity") > 1e-6)
        .count()
}

fn count_rotating_bodies(bodies: &[Value]) -> usize {
    bodies
        .iter()
        .filter(|body| body_dynamic(body) && body_speed_sq(body, "angularVelocity") > 1e-6)
        .count()
}

fn body_mass(body: &Value) -> f64 {
    body.get("mass")
        .and_then(|value| value.as_f64())
        .unwrap_or(1.0)
        .clamp(0.001, 1000000.0)
}

fn body_inverse_mass(body: &Value) -> f64 {
    if body_dynamic(body) {
        1.0 / body_mass(body)
    } else {
        0.0
    }
}

fn total_dynamic_mass(bodies: &[Value]) -> f64 {
    bodies
        .iter()
        .filter(|body| body_dynamic(body))
        .map(body_mass)
        .sum::<f64>()
}

fn dynamic_center_of_mass(bodies: &[Value]) -> [f64; 3] {
    let total_mass = total_dynamic_mass(bodies);
    if total_mass <= 0.0 {
        return [0.0, 0.0, 0.0];
    }
    let mut weighted = [0.0, 0.0, 0.0];
    for body in bodies.iter().filter(|body| body_dynamic(body)) {
        let mass = body_mass(body);
        let position = body_vec3(body, "position", [0.0, 0.0, 0.0]);
        for axis in 0..3 {
            weighted[axis] += position[axis] * mass;
        }
    }
    [
        weighted[0] / total_mass,
        weighted[1] / total_mass,
        weighted[2] / total_mass,
    ]
}

fn total_kinetic_energy(bodies: &[Value]) -> f64 {
    bodies
        .iter()
        .filter(|body| body_dynamic(body))
        .map(|body| 0.5 * body_mass(body) * body_speed_sq(body, "velocity"))
        .sum::<f64>()
}

fn approximate_angular_energy(body: &Value) -> f64 {
    let mass = body_mass(body);
    let half_extents = body_vec3(body, "halfExtents", [0.5, 0.5, 0.5]);
    let angular_velocity = body_vec3(body, "angularVelocity", [0.0, 0.0, 0.0]);
    let size = [
        half_extents[0] * 2.0,
        half_extents[1] * 2.0,
        half_extents[2] * 2.0,
    ];
    let inertia = [
        mass * (size[1] * size[1] + size[2] * size[2]) / 12.0,
        mass * (size[0] * size[0] + size[2] * size[2]) / 12.0,
        mass * (size[0] * size[0] + size[1] * size[1]) / 12.0,
    ];
    0.5
        * (inertia[0] * angular_velocity[0] * angular_velocity[0]
            + inertia[1] * angular_velocity[1] * angular_velocity[1]
            + inertia[2] * angular_velocity[2] * angular_velocity[2])
}

fn total_angular_energy(bodies: &[Value]) -> f64 {
    bodies
        .iter()
        .filter(|body| body_dynamic(body))
        .map(approximate_angular_energy)
        .sum::<f64>()
}

fn max_body_speed(bodies: &[Value], key: &str) -> f64 {
    bodies
        .iter()
        .filter(|body| body_dynamic(body))
        .map(|body| body_speed_sq(body, key).sqrt())
        .fold(0.0_f64, f64::max)
}

fn body_restitution(body: &Value) -> f64 {
    body.get("restitution")
        .and_then(|value| value.as_f64())
        .unwrap_or(0.22)
        .clamp(0.0, 1.0)
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

fn resolve_body_collisions(bodies: &mut [Value]) -> (usize, f64, Vec<Value>, Value, usize) {
    let mut contact_count = 0;
    let mut max_penetration = 0.0_f64;
    let mut contact_pairs: Vec<Value> = Vec::new();
    let mut contact_pair_keys: Vec<String> = Vec::new();
    let mut deepest_contact = Value::Null;
    let mut woken_body_count = 0;
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
                let a_id = body_id(&bodies[i], format!("body-{}", i));
                let b_id = body_id(&bodies[j], format!("body-{}", j));
                let pair_key = format!("{}|{}", a_id, b_id);
                if !contact_pair_keys.iter().any(|key| key == &pair_key) {
                    contact_pair_keys.push(pair_key);
                    contact_pairs.push(json!({
                        "a": a_id.clone(),
                        "b": b_id.clone(),
                        "axis": axis_label(axis),
                        "penetration": overlap,
                    }));
                }
                if overlap >= max_penetration {
                    deepest_contact = json!({
                        "a": a_id.clone(),
                        "b": b_id.clone(),
                        "axis": axis_label(axis),
                        "penetration": overlap,
                    });
                }
                max_penetration = max_penetration.max(overlap);
                let a_was_sleeping = a_dynamic && body_sleeping(&bodies[i]);
                let b_was_sleeping = b_dynamic && body_sleeping(&bodies[j]);

                let mut next_a = a_pos;
                let mut next_b = b_pos;
                let a_inverse_mass = body_inverse_mass(&bodies[i]);
                let b_inverse_mass = body_inverse_mass(&bodies[j]);
                let inverse_mass_sum = a_inverse_mass + b_inverse_mass;
                if a_dynamic && b_dynamic {
                    let a_share = if inverse_mass_sum > 0.0 {
                        a_inverse_mass / inverse_mass_sum
                    } else {
                        0.5
                    };
                    let b_share = if inverse_mass_sum > 0.0 {
                        b_inverse_mass / inverse_mass_sum
                    } else {
                        0.5
                    };
                    next_a[axis] -= sign * overlap * a_share;
                    next_b[axis] += sign * overlap * b_share;
                } else if a_dynamic {
                    next_a[axis] -= sign * overlap;
                } else if b_dynamic {
                    next_b[axis] += sign * overlap;
                }

                if a_dynamic {
                    let mut velocity = body_vec3(&bodies[i], "velocity", [0.0, 0.0, 0.0]);
                    let mut angular_velocity =
                        body_vec3(&bodies[i], "angularVelocity", [0.0, 0.0, 0.0]);
                    if velocity[axis] * sign > 0.0 {
                        velocity[axis] *= -body_restitution(&bodies[i]);
                        angular_velocity[(axis + 1) % 3] += velocity[axis] * sign * 0.12;
                        if velocity[axis].abs() < 0.03 {
                            velocity[axis] = 0.0;
                        }
                    }
                    write_body_vec3(&mut bodies[i], "position", next_a);
                    write_body_vec3(&mut bodies[i], "velocity", velocity);
                    write_body_vec3(&mut bodies[i], "angularVelocity", angular_velocity);
                    write_body_bool(&mut bodies[i], "sleeping", false);
                    if a_was_sleeping {
                        woken_body_count += 1;
                    }
                }
                if b_dynamic {
                    let mut velocity = body_vec3(&bodies[j], "velocity", [0.0, 0.0, 0.0]);
                    let mut angular_velocity =
                        body_vec3(&bodies[j], "angularVelocity", [0.0, 0.0, 0.0]);
                    if velocity[axis] * sign < 0.0 {
                        velocity[axis] *= -body_restitution(&bodies[j]);
                        angular_velocity[(axis + 1) % 3] -= velocity[axis] * sign * 0.12;
                        if velocity[axis].abs() < 0.03 {
                            velocity[axis] = 0.0;
                        }
                    }
                    write_body_vec3(&mut bodies[j], "position", next_b);
                    write_body_vec3(&mut bodies[j], "velocity", velocity);
                    write_body_vec3(&mut bodies[j], "angularVelocity", angular_velocity);
                    write_body_bool(&mut bodies[j], "sleeping", false);
                    if b_was_sleeping {
                        woken_body_count += 1;
                    }
                }
                resolved_this_pass += 1;
            }
        }
        contact_count += resolved_this_pass;
        if resolved_this_pass == 0 {
            break;
        }
    }
    (
        contact_count,
        max_penetration,
        contact_pairs,
        deepest_contact,
        woken_body_count,
    )
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
    let body_values = world_snapshot
        .get("bodies")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    json!({
        "pipeline": "physics",
        "command": "create_world",
        "architectureWired": true,
        "productionReady": false,
        "runtimeLinked": true,
        "backend": backend,
        "worldId": "physics-world-native-minimal",
        "gravity": gravity,
        "bodyCount": body_values.len(),
        "dynamicBodyCount": count_dynamic_bodies(&body_values),
        "staticBodyCount": count_static_bodies(&body_values),
        "sleepingBodyCount": count_sleeping_bodies(&body_values),
        "groundedBodyCount": count_grounded_bodies(&body_values),
        "floorContactCount": count_grounded_bodies(&body_values),
        "movingBodyCount": count_moving_bodies(&body_values),
        "rotatingBodyCount": count_rotating_bodies(&body_values),
        "totalDynamicMass": total_dynamic_mass(&body_values),
        "centerOfMass": dynamic_center_of_mass(&body_values),
        "kineticEnergy": total_kinetic_energy(&body_values),
        "angularEnergy": total_angular_energy(&body_values),
        "maxLinearSpeed": max_body_speed(&body_values, "velocity"),
        "maxAngularSpeed": max_body_speed(&body_values, "angularVelocity"),
        "bodyContactCount": 0,
        "contactPairs": [],
        "deepestContact": Value::Null,
        "wokenBodyCount": 0,
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
    let mut contact_pairs: Vec<Value> = Vec::new();
    let mut contact_pair_keys: Vec<String> = Vec::new();
    let mut deepest_contact = Value::Null;
    let mut woken_body_count = 0;
    let mut floor_contact_count = 0;
    let mut max_penetration = 0.0_f64;
    for _ in 0..substeps {
        next_bodies = next_bodies
            .iter()
            .map(|body| step_body(body, gravity, substep_delta_time))
            .collect();
        let (contacts, penetration, pairs, deepest, woken) =
            resolve_body_collisions(&mut next_bodies);
        contact_count += contacts;
        woken_body_count += woken;
        for pair in pairs {
            let a = pair.get("a").and_then(|value| value.as_str()).unwrap_or("");
            let b = pair.get("b").and_then(|value| value.as_str()).unwrap_or("");
            let key = format!("{}|{}", a, b);
            if !contact_pair_keys.iter().any(|existing| existing == &key) {
                contact_pair_keys.push(key);
                contact_pairs.push(pair);
            }
        }
        if deepest
            .get("penetration")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0)
            >= max_penetration
        {
            deepest_contact = deepest;
        }
        floor_contact_count += count_grounded_bodies(&next_bodies);
        max_penetration = max_penetration.max(penetration);
    }
    let time = world.get("time").and_then(|value| value.as_f64()).unwrap_or(0.0)
        + clamped_delta_time;
    let step_count = world
        .get("stepCount")
        .and_then(|value| value.as_u64())
        .unwrap_or(0)
        + 1;
    let body_count = next_bodies.len();
    let dynamic_body_count = count_dynamic_bodies(&next_bodies);
    let static_body_count = count_static_bodies(&next_bodies);
    let sleeping_body_count = count_sleeping_bodies(&next_bodies);
    let grounded_body_count = count_grounded_bodies(&next_bodies);
    let moving_body_count = count_moving_bodies(&next_bodies);
    let rotating_body_count = count_rotating_bodies(&next_bodies);
    let total_dynamic_mass = total_dynamic_mass(&next_bodies);
    let center_of_mass = dynamic_center_of_mass(&next_bodies);
    let kinetic_energy = total_kinetic_energy(&next_bodies);
    let angular_energy = total_angular_energy(&next_bodies);
    let max_linear_speed = max_body_speed(&next_bodies, "velocity");
    let max_angular_speed = max_body_speed(&next_bodies, "angularVelocity");
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
        "bodyCount": body_count,
        "dynamicBodyCount": dynamic_body_count,
        "staticBodyCount": static_body_count,
        "sleepingBodyCount": sleeping_body_count,
        "groundedBodyCount": grounded_body_count,
        "floorContactCount": floor_contact_count,
        "movingBodyCount": moving_body_count,
        "rotatingBodyCount": rotating_body_count,
        "totalDynamicMass": total_dynamic_mass,
        "centerOfMass": center_of_mass,
        "kineticEnergy": kinetic_energy,
        "angularEnergy": angular_energy,
        "maxLinearSpeed": max_linear_speed,
        "maxAngularSpeed": max_angular_speed,
        "time": time,
        "stepCount": step_count,
        "contactCount": contact_count,
        "bodyContactCount": contact_count,
        "contactPairs": contact_pairs,
        "deepestContact": deepest_contact,
        "wokenBodyCount": woken_body_count,
        "maxPenetration": max_penetration,
        "substepDeltaTime": substep_delta_time,
        "worldSnapshot": next_world,
        "status": status(),
        "message": "最小 native 物理 runtime 已完成 substep 重力积分、阻尼、地面碰撞和 AABB 刚体碰撞步进。",
    })
}
