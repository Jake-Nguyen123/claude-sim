// Input dispatcher — keeps a long-lived helpers/sim-input child per UDID and
// writes NDJSON event lines to its stdin. Spawning sim-input is expensive
// (~150 ms — dlopen + bootstrap CoreSimulator + init HID client) so we keep
// it alive across calls.

use crate::state::{AppState, InputHandle};
use anyhow::{Context, Result};
use serde::Deserialize;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::Mutex;

#[derive(Deserialize, Debug)]
pub struct TapBody {
    pub udid: String,
    pub x: f64,
    pub y: f64,
    pub hold_ms: Option<u32>,
}

#[derive(Deserialize, Debug)]
pub struct SwipeBody {
    pub udid: String,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub duration_ms: Option<u32>,
}

#[derive(Deserialize, Debug)]
pub struct KeyTapBody {
    pub udid: String,
    pub usage: u32,
    #[serde(default)]
    pub modifiers: Vec<u32>,
}

#[derive(Deserialize, Debug)]
pub struct ButtonTapBody {
    pub udid: String,
    pub name: String,
}

async fn ensure_child(state: &Arc<AppState>, udid: &str) -> Result<InputHandle> {
    // Fast path: already have a handle
    if let Some(handle) = state.inputs.read().get(udid).cloned() {
        return Ok(handle);
    }

    let bin = state.helpers_dir.join("sim-input");
    if !bin.exists() {
        anyhow::bail!("sim-input helper not found at {}", bin.display());
    }

    let mut child = Command::new(&bin)
        .arg(udid)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .with_context(|| format!("spawn {}", bin.display()))?;

    let stdin = child
        .stdin
        .take()
        .context("sim-input spawned without stdin")?;
    let handle: InputHandle = Arc::new(Mutex::new(stdin));

    {
        let mut map = state.inputs.write();
        map.insert(udid.to_string(), handle.clone());
    }

    // Reap when sim-input exits unexpectedly
    let udid_owned = udid.to_string();
    let state_clone = state.clone();
    tokio::spawn(async move {
        let _ = child.wait().await;
        state_clone.inputs.write().remove(&udid_owned);
        tracing::warn!("sim-input for {} exited; will respawn on next event", udid_owned);
    });

    Ok(handle)
}

async fn write_line(handle: &InputHandle, event: &serde_json::Value) -> Result<()> {
    let mut stdin = handle.lock().await;
    let line = serde_json::to_string(event)? + "\n";
    stdin.write_all(line.as_bytes()).await?;
    stdin.flush().await?;
    Ok(())
}

pub async fn tap(state: &Arc<AppState>, body: TapBody) -> Result<()> {
    let handle = ensure_child(state, &body.udid).await?;
    let event = serde_json::json!({
        "type": "tap",
        "x": body.x,
        "y": body.y,
        "hold": body.hold_ms.unwrap_or(80),
    });
    write_line(&handle, &event).await
}

pub async fn swipe(state: &Arc<AppState>, body: SwipeBody) -> Result<()> {
    let handle = ensure_child(state, &body.udid).await?;
    let duration = body.duration_ms.unwrap_or(200).max(20);
    let steps = 18u32;
    let step_ms = (duration / steps).max(8);

    // Touch down
    write_line(&handle, &serde_json::json!({
        "type": "touch", "phase": "down", "x": body.x1, "y": body.y1,
    })).await?;

    // Interpolated moves (smooth gesture)
    for i in 1..steps {
        let t = i as f64 / steps as f64;
        let x = body.x1 + (body.x2 - body.x1) * t;
        let y = body.y1 + (body.y2 - body.y1) * t;
        write_line(&handle, &serde_json::json!({
            "type": "touch", "phase": "move", "x": x, "y": y,
        })).await?;
        tokio::time::sleep(tokio::time::Duration::from_millis(step_ms as u64)).await;
    }

    // Touch up
    write_line(&handle, &serde_json::json!({
        "type": "touch", "phase": "up", "x": body.x2, "y": body.y2,
    })).await?;

    Ok(())
}

pub async fn key_tap(state: &Arc<AppState>, body: KeyTapBody) -> Result<()> {
    let handle = ensure_child(state, &body.udid).await?;
    let event = serde_json::json!({
        "type": "key-tap",
        "usage": body.usage,
        "modifiers": body.modifiers,
    });
    write_line(&handle, &event).await
}

pub async fn button_tap(state: &Arc<AppState>, body: ButtonTapBody) -> Result<()> {
    let handle = ensure_child(state, &body.udid).await?;
    let event = serde_json::json!({
        "type": "button-tap",
        "name": body.name,
    });
    write_line(&handle, &event).await
}
