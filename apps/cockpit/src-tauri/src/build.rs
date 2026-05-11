// Build orchestrator: xcodebuild → install → launch, streaming progress events.

use crate::project::{self, BuildSettings};
use crate::simctl;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Instant;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::broadcast;

#[derive(Deserialize, Debug)]
pub struct BuildRequest {
    pub project_path: String,
    pub project_type: String,
    pub scheme: String,
    pub udid: String,
    #[serde(default = "default_true")]
    pub launch: bool,
}

fn default_true() -> bool { true }

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BuildEvent {
    Started {
        build_id: String,
        scheme: String,
        udid: String,
    },
    Progress {
        line: String,
    },
    Diagnostic {
        severity: String, // "error" | "warning"
        file: Option<String>,
        line: Option<u32>,
        col: Option<u32>,
        message: String,
    },
    Phase {
        name: String, // "settings" | "build" | "install" | "launch"
    },
    Finished {
        status: String, // "ok" | "error"
        app_path: Option<String>,
        bundle_id: Option<String>,
        pid: Option<i32>,
        duration_ms: u64,
        error: Option<String>,
    },
}

pub async fn run(
    req: BuildRequest,
    tx: broadcast::Sender<BuildEvent>,
    build_id: String,
) -> Result<BuildEvent> {
    let start = Instant::now();

    let _ = tx.send(BuildEvent::Started {
        build_id: build_id.clone(),
        scheme: req.scheme.clone(),
        udid: req.udid.clone(),
    });

    // 1. Resolve build settings (paths + bundle id) — before the build runs
    let _ = tx.send(BuildEvent::Phase { name: "settings".into() });
    let settings: BuildSettings = match project::build_settings(
        &req.project_type,
        &req.project_path,
        &req.scheme,
        &req.udid,
    )
    .await
    {
        Ok(s) => s,
        Err(e) => return Ok(emit_error(&tx, start, &format!("build_settings: {:#}", e))),
    };
    let _ = tx.send(BuildEvent::Progress {
        line: format!(
            "→ resolved bundle_id={} app_path={}",
            settings.product_bundle_identifier, settings.app_path
        ),
    });

    // 2. Run xcodebuild build, streaming stdout line-by-line
    let _ = tx.send(BuildEvent::Phase { name: "build".into() });
    let flag = if req.project_type == "xcworkspace" { "-workspace" } else { "-project" };
    let destination = format!("platform=iOS Simulator,id={}", req.udid);
    let mut child = Command::new("xcodebuild")
        .args([
            flag,
            &req.project_path,
            "-scheme",
            &req.scheme,
            "-destination",
            &destination,
            "-configuration",
            "Debug",
            "build",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .context("spawn xcodebuild")?;

    let stdout = child.stdout.take().context("no stdout")?;
    let stderr = child.stderr.take().context("no stderr")?;

    // Spawn a task to drain stderr to broadcast
    let tx2 = tx.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx2.send(BuildEvent::Progress { line });
        }
    });

    let mut reader = BufReader::new(stdout).lines();
    while let Some(line) = reader.next_line().await.unwrap_or(None) {
        // Lightweight diagnostic parse — covers "file:line:col: error|warning: msg"
        if let Some(diag) = parse_diagnostic(&line) {
            let _ = tx.send(diag);
        }
        let _ = tx.send(BuildEvent::Progress { line });
    }

    let status = match child.wait().await {
        Ok(s) => s,
        Err(e) => return Ok(emit_error(&tx, start, &format!("wait xcodebuild: {}", e))),
    };

    if !status.success() {
        return Ok(emit_error(
            &tx,
            start,
            &format!("xcodebuild exit {}", status),
        ));
    }

    // Verify produced .app exists
    let app_path = PathBuf::from(&settings.app_path);
    if !app_path.exists() {
        return Ok(emit_error(
            &tx,
            start,
            &format!("build succeeded but .app not found at {}", settings.app_path),
        ));
    }

    // 3. Install
    let _ = tx.send(BuildEvent::Phase { name: "install".into() });
    if let Err(e) = simctl::install(&req.udid, &settings.app_path).await {
        return Ok(emit_error(&tx, start, &format!("install: {:#}", e)));
    }

    // 4. Launch
    let mut pid = None;
    if req.launch {
        let _ = tx.send(BuildEvent::Phase { name: "launch".into() });
        match simctl::launch(&req.udid, &settings.product_bundle_identifier).await {
            Ok(p) => pid = Some(p),
            Err(e) => return Ok(emit_error(&tx, start, &format!("launch: {:#}", e))),
        }
    }

    let finished = BuildEvent::Finished {
        status: "ok".into(),
        app_path: Some(settings.app_path.clone()),
        bundle_id: Some(settings.product_bundle_identifier.clone()),
        pid,
        duration_ms: start.elapsed().as_millis() as u64,
        error: None,
    };
    let _ = tx.send(finished.clone());
    Ok(finished)
}

fn emit_error(tx: &broadcast::Sender<BuildEvent>, start: Instant, msg: &str) -> BuildEvent {
    let e = BuildEvent::Finished {
        status: "error".into(),
        app_path: None,
        bundle_id: None,
        pid: None,
        duration_ms: start.elapsed().as_millis() as u64,
        error: Some(msg.to_string()),
    };
    let _ = tx.send(e.clone());
    e
}

/// Parse `path/to/file.swift:NN[:CC]: error|warning: message` from xcodebuild output.
fn parse_diagnostic(line: &str) -> Option<BuildEvent> {
    let lower = line.to_ascii_lowercase();
    let severity = if lower.contains(": error:") {
        "error"
    } else if lower.contains(": warning:") {
        "warning"
    } else {
        return None;
    };

    // Split at ": error:" or ": warning:"
    let needle = format!(": {}:", severity);
    let idx = line.find(&needle)?;
    let (before, after) = line.split_at(idx);
    let message = after[needle.len()..].trim().to_string();

    // before should be "path:line:col" or "path:line"
    // Find last two ':' to split path/line/col
    let parts: Vec<&str> = before.rsplitn(3, ':').collect();
    let (file, line_num, col_num) = match parts.as_slice() {
        [col, ln, file] => (
            file.to_string(),
            ln.parse::<u32>().ok(),
            col.parse::<u32>().ok(),
        ),
        [ln, file] => (file.to_string(), ln.parse::<u32>().ok(), None),
        _ => return None,
    };

    Some(BuildEvent::Diagnostic {
        severity: severity.to_string(),
        file: Some(file),
        line: line_num,
        col: col_num,
        message,
    })
}
