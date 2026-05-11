// MJPEG streaming endpoint backed by helpers/sim-capture.
//
// sim-capture writes length-prefixed JPEGs to stdout:
//   [u32 big-endian length][JPEG bytes][u32][JPEG]…
//
// We translate that into HTTP multipart/x-mixed-replace which any browser
// (or WKWebView) renders inline via <img src="/mirror.mjpg">.

use anyhow::{Context, Result};
use axum::body::Body;
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use std::path::Path;
use std::process::Stdio;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

pub async fn mirror_stream(helpers_dir: &Path, _udid: &str) -> Result<Response> {
    let bin = helpers_dir.join("sim-capture");
    if !bin.exists() {
        return Ok((
            StatusCode::SERVICE_UNAVAILABLE,
            format!("sim-capture helper not found at {}", bin.display()),
        )
            .into_response());
    }

    let mut child = Command::new(&bin)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit()) // pipe sim-capture diagnostics to our stderr
        .spawn()
        .with_context(|| format!("failed to spawn {}", bin.display()))?;

    let mut stdout = child
        .stdout
        .take()
        .context("sim-capture spawned without stdout")?;

    let stream = async_stream::stream! {
        let mut len_buf = [0u8; 4];
        loop {
            // Read u32 big-endian length prefix
            if stdout.read_exact(&mut len_buf).await.is_err() {
                break;
            }
            let len = u32::from_be_bytes(len_buf) as usize;
            // Sanity: reject absurd sizes (>50 MB) — would indicate framing desync
            if len == 0 || len > 50_000_000 {
                tracing::warn!("mirror: bad frame length {}, stopping", len);
                break;
            }

            // Read full JPEG into a buffer
            let mut jpeg = vec![0u8; len];
            if stdout.read_exact(&mut jpeg).await.is_err() {
                break;
            }

            // Emit one multipart frame
            let header_line = format!(
                "--FRAME\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n",
                len
            );
            yield Ok::<Bytes, std::io::Error>(Bytes::from(header_line));
            yield Ok(Bytes::from(jpeg));
            yield Ok(Bytes::from("\r\n"));
        }

        // Best-effort cleanup when client disconnects or stream ends
        let _ = child.kill().await;
    };

    let body = Body::from_stream(stream);
    let resp = Response::builder()
        .header(
            header::CONTENT_TYPE,
            "multipart/x-mixed-replace; boundary=FRAME",
        )
        .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")
        .header(header::PRAGMA, "no-cache")
        .header(header::CONNECTION, "close")
        .body(body)?;
    Ok(resp)
}
