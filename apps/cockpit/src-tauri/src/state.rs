// Shared application state: helpers location, active sim-input children,
// MCP event broadcast channel.

use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::process::ChildStdin;
use tokio::sync::{broadcast, Mutex};

pub type InputHandle = Arc<Mutex<ChildStdin>>;

pub struct AppState {
    pub helpers_dir: PathBuf,
    pub inputs: RwLock<HashMap<String, InputHandle>>,
    pub mcp_events: broadcast::Sender<serde_json::Value>,
}

impl AppState {
    pub fn new() -> Arc<Self> {
        let helpers_dir = resolve_helpers_dir();
        tracing::info!("helpers_dir = {}", helpers_dir.display());
        let (mcp_events, _) = broadcast::channel(256);
        Arc::new(Self {
            helpers_dir,
            inputs: RwLock::new(HashMap::new()),
            mcp_events,
        })
    }
}

/// Find helpers/bin directory:
///   1. CLAUDE_SIM_HELPERS env var (explicit override)
///   2. ../../../../helpers/bin relative to this crate's manifest dir
///   3. <cwd>/helpers/bin
fn resolve_helpers_dir() -> PathBuf {
    if let Ok(s) = std::env::var("CLAUDE_SIM_HELPERS") {
        let p = PathBuf::from(s);
        if p.exists() {
            return p;
        }
    }
    // Manifest path is .../apps/cockpit/src-tauri → repo root is 3 levels up
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir
        .ancestors()
        .nth(3)
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));
    let p = repo_root.join("helpers/bin");
    if p.exists() {
        return p;
    }
    // Final fallback
    PathBuf::from("./helpers/bin")
}
