// Axum localhost server — all UI ↔ backend traffic.

use crate::state::AppState;
use crate::{build, input, logs, mirror, project, simctl};
use anyhow::Result;
use axum::extract::{Json, Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use futures_util::stream::Stream;
use serde::Deserialize;
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

pub async fn serve(state: Arc<AppState>, port: u16) -> Result<()> {
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/devices", get(list_devices))
        .route("/api/devices/:udid/boot", post(boot_device))
        .route("/api/devices/:udid/shutdown", post(shutdown_device))
        .route("/mirror.mjpg", get(mirror_handler))
        .route("/api/input/tap", post(tap_handler))
        .route("/api/input/swipe", post(swipe_handler))
        .route("/api/input/key-tap", post(key_tap_handler))
        .route("/api/input/button-tap", post(button_tap_handler))
        .route("/api/project/detect", get(detect_project_handler))
        .route("/api/build", post(build_handler))
        .route("/api/build/:id/events", get(build_events_handler))
        .route("/api/mcp-events", get(mcp_events_handler))
        .route("/api/mcp-events/push", post(mcp_events_push_handler))
        .route("/api/logs", get(logs_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("claude-sim cockpit HTTP server listening on http://{}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}

fn err_response(e: anyhow::Error) -> Response {
    tracing::warn!("API error: {:#}", e);
    (StatusCode::INTERNAL_SERVER_ERROR, format!("{:#}", e)).into_response()
}

async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let sim_capture = state.helpers_dir.join("sim-capture").exists();
    let sim_input = state.helpers_dir.join("sim-input").exists();
    Json(serde_json::json!({
        "ok": true,
        "version": env!("CARGO_PKG_VERSION"),
        "helpers_dir": state.helpers_dir.display().to_string(),
        "helpers": { "sim_capture": sim_capture, "sim_input": sim_input },
        "mcp_attached": false,
    }))
}

async fn list_devices(State(_): State<Arc<AppState>>) -> impl IntoResponse {
    match simctl::list_devices().await {
        Ok(devices) => Json(serde_json::json!({ "devices": devices })).into_response(),
        Err(e) => err_response(e),
    }
}

async fn boot_device(
    Path(udid): Path<String>,
    State(_): State<Arc<AppState>>,
) -> impl IntoResponse {
    match simctl::boot(&udid).await {
        Ok(already) => {
            Json(serde_json::json!({ "ok": true, "already_booted": already })).into_response()
        }
        Err(e) => err_response(e),
    }
}

async fn shutdown_device(
    Path(udid): Path<String>,
    State(_): State<Arc<AppState>>,
) -> impl IntoResponse {
    match simctl::shutdown(&udid).await {
        Ok(_) => Json(serde_json::json!({ "ok": true })).into_response(),
        Err(e) => err_response(e),
    }
}

#[derive(Deserialize)]
struct MirrorQuery {
    udid: Option<String>,
}

async fn mirror_handler(
    Query(q): Query<MirrorQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let udid = q.udid.unwrap_or_default();
    match mirror::mirror_stream(&state.helpers_dir, &udid).await {
        Ok(resp) => resp,
        Err(e) => err_response(e),
    }
}

async fn tap_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<input::TapBody>,
) -> impl IntoResponse {
    match input::tap(&state, body).await {
        Ok(_) => Json(serde_json::json!({ "ok": true })).into_response(),
        Err(e) => err_response(e),
    }
}

async fn swipe_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<input::SwipeBody>,
) -> impl IntoResponse {
    match input::swipe(&state, body).await {
        Ok(_) => Json(serde_json::json!({ "ok": true })).into_response(),
        Err(e) => err_response(e),
    }
}

async fn key_tap_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<input::KeyTapBody>,
) -> impl IntoResponse {
    match input::key_tap(&state, body).await {
        Ok(_) => Json(serde_json::json!({ "ok": true })).into_response(),
        Err(e) => err_response(e),
    }
}

async fn button_tap_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<input::ButtonTapBody>,
) -> impl IntoResponse {
    match input::button_tap(&state, body).await {
        Ok(_) => Json(serde_json::json!({ "ok": true })).into_response(),
        Err(e) => err_response(e),
    }
}

async fn mcp_events_handler(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.mcp_events.subscribe();
    let stream = async_stream::stream! {
        while let Ok(val) = rx.recv().await {
            yield Ok(Event::default().data(val.to_string()));
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[derive(Deserialize)]
struct DetectProjectQuery {
    path: String,
}

async fn detect_project_handler(
    Query(q): Query<DetectProjectQuery>,
    State(_): State<Arc<AppState>>,
) -> impl IntoResponse {
    match project::detect(&PathBuf::from(&q.path)).await {
        Ok(info) => Json(info).into_response(),
        Err(e) => err_response(e),
    }
}

async fn build_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<build::BuildRequest>,
) -> impl IntoResponse {
    // Allocate a build_id and a broadcast channel, then kick off in background.
    let build_id = format!("b{:x}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0));
    let (tx, _) = tokio::sync::broadcast::channel::<build::BuildEvent>(256);
    state.builds.write().insert(build_id.clone(), tx.clone());

    let bid = build_id.clone();
    let state_clone = state.clone();
    let tx_for_task = tx.clone();
    tokio::spawn(async move {
        let _ = build::run(body, tx_for_task, bid.clone()).await;
        // Keep sender alive briefly for late subscribers, then drop.
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        state_clone.builds.write().remove(&bid);
    });

    Json(serde_json::json!({ "build_id": build_id })).into_response()
}

#[derive(Deserialize)]
struct LogsQuery {
    udid: String,
}

async fn logs_handler(
    Query(q): Query<LogsQuery>,
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let tx = logs::ensure_stream(&state, &q.udid);
    let mut rx = tx.subscribe();
    let stream = async_stream::stream! {
        while let Ok(line) = rx.recv().await {
            let json = serde_json::to_string(&line).unwrap_or_else(|_| "{}".into());
            yield Ok::<Event, Infallible>(Event::default().data(json));
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn mcp_events_push_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    let _ = state.mcp_events.send(body);
    Json(serde_json::json!({ "ok": true })).into_response()
}

async fn build_events_handler(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let tx = match state.builds.read().get(&id).cloned() {
        Some(tx) => tx,
        None => {
            return (
                StatusCode::NOT_FOUND,
                format!("build {} not found or already expired", id),
            )
                .into_response();
        }
    };
    let mut rx = tx.subscribe();
    let stream = async_stream::stream! {
        while let Ok(evt) = rx.recv().await {
            let json = serde_json::to_string(&evt).unwrap_or_else(|_| "{}".into());
            yield Ok::<Event, Infallible>(Event::default().data(json));
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}
