mod build;
mod input;
mod mirror;
mod project;
mod server;
mod simctl;
mod state;

use state::AppState;
use tauri::Manager;

const SERVER_PORT: u16 = 8765;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,cockpit_lib=debug")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_state = AppState::new();
            app.manage(app_state.clone());
            // Spawn the HTTP server on Tauri's tokio runtime.
            tauri::async_runtime::spawn(async move {
                if let Err(e) = server::serve(app_state, SERVER_PORT).await {
                    tracing::error!("axum server failed: {:#}", e);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
