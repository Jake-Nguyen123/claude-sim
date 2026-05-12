// Per-UDID `xcrun simctl spawn <udid> log stream --style ndjson` adapter.
// On first subscriber, we spawn the child and start broadcasting log lines.
// Subsequent subscribers attach to the same broadcast.

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::broadcast;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LogLine {
    pub ts: u64, // ms epoch
    pub level: String,
    pub subsystem: Option<String>,
    pub category: Option<String>,
    pub process: Option<String>,
    pub message: String,
}

pub fn ensure_stream(state: &Arc<AppState>, udid: &str) -> broadcast::Sender<LogLine> {
    if let Some(tx) = state.log_streams.read().get(udid) {
        return tx.clone();
    }

    let (tx, _) = broadcast::channel(2000);
    state.log_streams.write().insert(udid.to_string(), tx.clone());

    let tx_for_task = tx.clone();
    let udid_owned = udid.to_string();
    let state_clone = state.clone();

    tokio::spawn(async move {
        let res = Command::new("xcrun")
            .args([
                "simctl",
                "spawn",
                &udid_owned,
                "log",
                "stream",
                "--style",
                "ndjson",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn();

        match res {
            Ok(mut child) => {
                if let Some(stdout) = child.stdout.take() {
                    let mut lines = BufReader::new(stdout).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        if let Some(log_line) = parse(&line) {
                            // Best-effort send; if no subscribers, channel just drops.
                            let _ = tx_for_task.send(log_line);
                        }
                    }
                }
                let _ = child.wait().await;
            }
            Err(e) => {
                tracing::warn!("failed to spawn log stream for {}: {}", udid_owned, e);
            }
        }

        state_clone.log_streams.write().remove(&udid_owned);
        tracing::info!("log stream for {} stopped", udid_owned);
    });

    tx
}

fn parse(line: &str) -> Option<LogLine> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    let message = v["eventMessage"].as_str().unwrap_or_default().to_string();
    // Skip empty messages (lots of these from system processes)
    if message.is_empty() {
        return None;
    }
    let process = v["processImagePath"]
        .as_str()
        .and_then(|p| p.rsplit('/').next())
        .map(String::from);
    Some(LogLine {
        ts: now_ms(),
        level: v["messageType"]
            .as_str()
            .unwrap_or("Default")
            .to_lowercase(),
        subsystem: v["subsystem"].as_str().map(String::from),
        category: v["category"].as_str().map(String::from),
        process,
        message,
    })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
