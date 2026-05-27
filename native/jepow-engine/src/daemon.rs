use crate::jobs;
use crate::render::{parse_camera, parse_light, parse_material};
use crate::scene;
use crate::viewport_session::{
    parse_object_transform, parse_shading, ShadingMode, ViewportSession,
};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

fn ok_response(id: Option<u64>, body: Value) -> Value {
    let mut obj = match body {
        Value::Object(map) => map,
        other => {
            let mut map = serde_json::Map::new();
            map.insert("data".to_string(), other);
            map
        }
    };
    obj.insert("ok".to_string(), json!(true));
    if let Some(req_id) = id {
        obj.insert("id".to_string(), json!(req_id));
    }
    Value::Object(obj)
}

fn err_response(id: Option<u64>, message: impl ToString) -> Value {
    let mut obj = serde_json::Map::new();
    obj.insert("ok".to_string(), json!(false));
    obj.insert("error".to_string(), json!(message.to_string()));
    if let Some(req_id) = id {
        obj.insert("id".to_string(), json!(req_id));
    }
    Value::Object(obj)
}

fn request_id(req: &Value) -> Option<u64> {
    req.get("id").and_then(|v| v.as_u64())
}

fn handle_viewport_frame(
    session: &mut Option<ViewportSession>,
    loaded_path: &mut Option<String>,
    id: Option<u64>,
    req: &Value,
) -> Value {
    let Some(output_path) = req.get("outputPath").and_then(|v| v.as_str()) else {
        return err_response(id, "outputPath required");
    };
    let width = req.get("width").and_then(|v| v.as_u64()).unwrap_or(640) as u32;
    let height = req.get("height").and_then(|v| v.as_u64()).unwrap_or(480) as u32;

    if let Some(path) = req.get("scenePath").and_then(|v| v.as_str()) {
        if loaded_path.as_deref() != Some(path) {
            let sess = match ensure_session(session, id) {
                Ok(s) => s,
                Err(v) => return v,
            };
            if let Err(e) = sess.load_scene(path) {
                return err_response(id, e.to_string());
            }
            *loaded_path = Some(path.to_string());
        }
    } else if loaded_path.is_none() {
        return err_response(id, "no scene loaded; call load_scene first");
    }

    let sess = match ensure_session(session, id) {
        Ok(s) => s,
        Err(v) => return v,
    };
    sess.set_camera(parse_camera(req));
    sess.set_light(parse_light(req));
    sess.set_material(parse_material(req));
    sess.set_transform(parse_object_transform(req));
    let shading = parse_shading(req);
    sess.set_shading(shading);

    match sess.draw_frame(output_path, width, height) {
        Ok(ms) => ok_response(
            id,
            json!({
                "imagePath": output_path,
                "width": width,
                "height": height,
                "frameMs": ms,
                "shading": match shading {
                    ShadingMode::Clay => "clay",
                    ShadingMode::Render => "render",
                },
                "renderer": "jepow-wgpu-session",
            }),
        ),
        Err(e) => err_response(id, e.to_string()),
    }
}

fn ensure_session<'a>(
    session: &'a mut Option<ViewportSession>,
    id: Option<u64>,
) -> Result<&'a mut ViewportSession, Value> {
    if session.is_none() {
        match ViewportSession::new() {
            Ok(s) => *session = Some(s),
            Err(e) => return Err(err_response(id, e)),
        }
    }
    Ok(session.as_mut().unwrap())
}

pub fn run_daemon_loop() {
    let mut stdout = io::stdout();
    let stdin = io::stdin();
    let mut session: Option<ViewportSession> = None;
    let mut loaded_path: Option<String> = None;

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                let _ = writeln!(stdout, "{}", err_response(None, format!("stdin: {}", e)));
                let _ = stdout.flush();
                break;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let req: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                let _ = writeln!(stdout, "{}", err_response(None, format!("bad json: {}", e)));
                let _ = stdout.flush();
                continue;
            }
        };

        let cmd = req.get("cmd").and_then(|v| v.as_str()).unwrap_or("");
        let id = request_id(&req);

        let resp = match cmd {
            "ping" => ok_response(
                id,
                json!({
                    "engine": "jepow-engine",
                    "mode": "daemon",
                    "version": env!("CARGO_PKG_VERSION"),
                    "cpuJobs": jobs::parallel_job_count(),
                }),
            ),
            "shutdown" => {
                let out = ok_response(id, json!({ "shutdown": true }));
                let _ = writeln!(stdout, "{}", out);
                let _ = stdout.flush();
                return;
            }
            "load_scene" => match req.get("scenePath").and_then(|v| v.as_str()) {
                None => err_response(id, "scenePath required"),
                Some(path) => match scene::load_scene_stats(path) {
                    Err(e) => err_response(id, e.to_string()),
                    Ok(stats) => match ensure_session(&mut session, id) {
                        Err(v) => v,
                        Ok(sess) => match sess.load_scene(path) {
                            Err(e) => err_response(id, e.to_string()),
                            Ok(_) => {
                                loaded_path = Some(path.to_string());
                                ok_response(
                                    id,
                                    json!({
                                        "scenePath": stats.path,
                                        "extension": stats.extension,
                                        "meshCount": stats.mesh_count,
                                        "nodeCount": stats.node_count,
                                        "materialCount": stats.material_count,
                                        "triangleCount": stats.triangle_count,
                                        "session": true,
                                    }),
                                )
                            }
                        },
                    },
                },
            },
            "viewport_frame" => handle_viewport_frame(&mut session, &mut loaded_path, id, &req),
            "close_scene" => {
                loaded_path = None;
                ok_response(id, json!({ "closed": true }))
            }
            "mesh_for_cycles" => match req.get("scenePath").and_then(|v| v.as_str()) {
                None => err_response(id, "scenePath required"),
                Some(path) => match crate::cycles_mesh::mesh_for_cycles(path) {
                    Err(e) => err_response(id, e.to_string()),
                    Ok(data) => ok_response(id, data),
                },
            },
            _ => err_response(id, format!("unknown cmd: {}", cmd)),
        };

        if let Err(e) = writeln!(stdout, "{}", resp) {
            eprintln!("daemon stdout: {}", e);
            break;
        }
        if let Err(e) = stdout.flush() {
            eprintln!("daemon flush: {}", e);
            break;
        }
    }
}
