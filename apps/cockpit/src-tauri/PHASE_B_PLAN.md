# Phase B — Rust backend plan (apply after Tauri first build completes)

This file is the spec for the next Rust edits. Don't apply until `pnpm tauri dev` first build is done (otherwise the in-progress compile invalidates).

## 1. Add deps to `Cargo.toml`

```toml
[dependencies]
# existing tauri deps stay
axum = "0.7"
tokio = { version = "1", features = ["full", "process"] }
tower-http = { version = "0.5", features = ["cors"] }
futures-util = "0.3"
bytes = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tracing = "0.1"
tracing-subscriber = "0.3"
parking_lot = "0.12"
```

## 2. New modules

```
src/
├── main.rs       (existing)
├── lib.rs        (new — top-level, builds tauri app + spawns server)
├── server.rs     (new — axum routes)
├── mirror.rs     (new — spawn sim-capture, multipart/x-mixed-replace MJPEG stream)
├── input.rs      (new — long-lived sim-input child, NDJSON dispatch)
├── simctl.rs     (new — list/boot/shutdown wrappers, async)
└── state.rs      (new — shared Arc<RwLock<AppState>>)
```

## 3. Endpoints

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| GET  | `/api/health` | — | `{ ok, version, helpers: {...}, mcp_attached }` |
| GET  | `/api/devices` | — | `{ devices: [...] }` |
| POST | `/api/devices/:udid/boot` | — | `{ ok, already_booted? }` |
| POST | `/api/devices/:udid/shutdown` | — | `{ ok }` |
| GET  | `/mirror.mjpg?udid=<udid>` | — | multipart/x-mixed-replace stream |
| POST | `/api/input/tap` | `{udid,x,y,hold_ms}` | `{ ok }` |
| POST | `/api/input/swipe` | `{udid,x1,y1,x2,y2,duration_ms}` | `{ ok }` |
| POST | `/api/input/key-tap` | `{udid,usage,modifiers}` | `{ ok }` |
| POST | `/api/input/button-tap` | `{udid,name}` | `{ ok }` |
| GET  | `/api/logs?udid=<udid>` | SSE | streaming `LogLine` JSON events |
| GET  | `/api/mcp-events` | SSE | streaming `McpEvent` JSON events |

## 4. `mirror.rs` — sim-capture → MJPEG

```
on GET /mirror.mjpg?udid=X:
  1. spawn helpers/bin/sim-capture (CLAUDE_SIM_HELPERS env or repo path)
  2. set stderr inherit, stdout piped
  3. response Content-Type: multipart/x-mixed-replace; boundary=FRAME
  4. for each frame: read 4-byte big-endian u32 length → read N bytes JPEG
       emit boundary --FRAME, Content-Type: image/jpeg, Content-Length: N,
       blank line, JPEG, blank line
  5. on client disconnect → SIGTERM the sim-capture child
```

Use `tokio::process::Command` + AsyncBufRead to read frames. Pipe into
`axum::body::Body::from_stream` so axum forwards bytes without buffering.

## 5. `input.rs` — persistent sim-input child

`AppState` holds `HashMap<udid, ChildStdin>`. On first `/api/input/*` for a
UDID, spawn `helpers/bin/sim-input <udid>` and stash stdin. Send NDJSON.

Convenience helpers map our typed POST bodies (tap/swipe/key-tap) to the
NDJSON event schema sim-input expects (see helpers/sim-input.m header).

For swipe: emit `{type:touch, phase:down, x:x1, y:y1}` → wait 16ms → series of
move events at 60Hz between (x1,y1) and (x2,y2) → final `{type:touch, phase:up, x:x2, y:y2}`.

## 6. `simctl.rs`

`async fn list_devices() -> Result<Vec<SimDevice>>` shelling out to
`xcrun simctl list devices --json available`. Parse JSON, flatten the
runtime → devices map.

`async fn boot(udid) -> Result<bool>` returns `true` if already booted.

## 7. `state.rs`

```rust
pub struct AppState {
    pub inputs: parking_lot::RwLock<HashMap<String, ChildStdin>>,
    pub mcp_events: broadcast::Sender<McpEvent>,
    pub log_streams: parking_lot::RwLock<HashMap<String, broadcast::Sender<LogLine>>>,
    pub helpers_dir: PathBuf,
}
```

## 8. Wire-up in `lib.rs`

```rust
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = Arc::new(AppState::new());
            let server_state = state.clone();
            tauri::async_runtime::spawn(async move {
                server::serve(server_state, 8765).await.unwrap();
            });
            app.manage(state);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error");
}
```

`main.rs` shrinks to just calling `lib::run()`.

## 9. CORS

Allow `http://localhost:1420` (Vite) + `tauri://*` (Tauri WebView origin) in dev.
In production WebView serves from `tauri://` only — set CORS to that.

## 10. Acceptance for Phase B

- [ ] `curl http://localhost:8765/api/health` returns `{"ok":true,…}`
- [ ] `curl -i http://localhost:8765/mirror.mjpg?udid=<booted-udid>` returns 200 + multipart stream
- [ ] Open Cockpit in dev mode — mirror panel shows live iPhone 17 framebuffer
- [ ] Click on mirror → corresponding tap fires in simulator
- [ ] Drag from top → notification center pulled down
- [ ] No memory leak after 10 minutes streaming + ~100 taps

## Migration steps

1. After Tauri Phase A build completes and window opens, kill it (Ctrl-C).
2. Add deps to Cargo.toml.
3. Create the new modules above.
4. `cargo check` to verify everything compiles.
5. `pnpm tauri dev` again — second run is fast (incremental).
6. Test endpoints with curl + Cockpit UI.
