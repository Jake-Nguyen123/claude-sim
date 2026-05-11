// Thin async wrappers around `xcrun simctl` for device lifecycle.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tokio::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SimDevice {
    pub udid: String,
    pub name: String,
    pub runtime: String,
    pub state: String,
}

pub async fn list_devices() -> Result<Vec<SimDevice>> {
    let output = Command::new("xcrun")
        .args(["simctl", "list", "devices", "--json", "available"])
        .output()
        .await
        .context("failed to run xcrun simctl list")?;

    if !output.status.success() {
        anyhow::bail!(
            "simctl list exit {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout)
        .context("simctl list returned invalid JSON")?;

    let devices_map = parsed["devices"]
        .as_object()
        .context("simctl list: no 'devices' map")?;

    let mut result = Vec::new();
    for (runtime, devices) in devices_map {
        if let Some(arr) = devices.as_array() {
            for d in arr {
                if let (Some(udid), Some(name), Some(state)) = (
                    d["udid"].as_str(),
                    d["name"].as_str(),
                    d["state"].as_str(),
                ) {
                    result.push(SimDevice {
                        udid: udid.to_string(),
                        name: name.to_string(),
                        runtime: runtime.clone(),
                        state: state.to_string(),
                    });
                }
            }
        }
    }
    Ok(result)
}

/// Returns true if the device was already booted, false if we booted it.
pub async fn boot(udid: &str) -> Result<bool> {
    let devices = list_devices().await?;
    let target = devices
        .iter()
        .find(|d| d.udid == udid)
        .with_context(|| format!("device {} not found", udid))?;
    if target.state == "Booted" {
        return Ok(true);
    }

    let status = Command::new("xcrun")
        .args(["simctl", "boot", udid])
        .status()
        .await?;
    if !status.success() {
        anyhow::bail!("simctl boot {} failed: exit {}", udid, status);
    }

    // Wait for full boot
    let _ = Command::new("xcrun")
        .args(["simctl", "bootstatus", udid, "-b"])
        .status()
        .await?;
    Ok(false)
}

pub async fn shutdown(udid: &str) -> Result<()> {
    Command::new("xcrun")
        .args(["simctl", "shutdown", udid])
        .status()
        .await?;
    Ok(())
}
