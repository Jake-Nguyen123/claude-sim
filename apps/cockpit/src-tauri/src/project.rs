// Xcode project detection + scheme listing + build settings.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tokio::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectInfo {
    pub project_type: String, // "xcodeproj" or "xcworkspace"
    pub path: String,
    pub name: String,
    pub schemes: Vec<String>,
    pub configurations: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct BuildSettings {
    pub built_products_dir: String,
    pub full_product_name: String,
    pub product_bundle_identifier: String,
    pub app_path: String,
}

/// Search dir for an .xcworkspace (preferred) or .xcodeproj.
pub fn find_project(dir: &Path) -> Result<Option<(String, PathBuf)>> {
    let entries = fs::read_dir(dir).with_context(|| format!("read_dir {}", dir.display()))?;
    let mut xcworkspace: Option<PathBuf> = None;
    let mut xcodeproj: Option<PathBuf> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if name.ends_with(".xcworkspace") {
            xcworkspace = Some(path);
        } else if name.ends_with(".xcodeproj") && xcodeproj.is_none() {
            xcodeproj = Some(path);
        }
    }
    if let Some(p) = xcworkspace {
        return Ok(Some(("xcworkspace".to_string(), p)));
    }
    if let Some(p) = xcodeproj {
        return Ok(Some(("xcodeproj".to_string(), p)));
    }
    Ok(None)
}

pub async fn detect(dir: &Path) -> Result<ProjectInfo> {
    let (project_type, project_path) = find_project(dir)?
        .ok_or_else(|| anyhow!("no .xcodeproj or .xcworkspace in {}", dir.display()))?;

    let name = project_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let (schemes, configurations) = list_schemes(&project_type, &project_path).await?;

    Ok(ProjectInfo {
        project_type,
        path: project_path.to_string_lossy().to_string(),
        name,
        schemes,
        configurations,
    })
}

async fn list_schemes(project_type: &str, project_path: &Path) -> Result<(Vec<String>, Vec<String>)> {
    let flag = if project_type == "xcworkspace" { "-workspace" } else { "-project" };
    let output = Command::new("xcodebuild")
        .args([flag, &project_path.to_string_lossy(), "-list", "-json"])
        .output()
        .await
        .context("xcodebuild -list failed")?;

    if !output.status.success() {
        anyhow::bail!(
            "xcodebuild -list exit {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout)
        .context("xcodebuild -list returned invalid JSON")?;

    let key = if project_type == "xcworkspace" { "workspace" } else { "project" };
    let schemes = parsed[key]["schemes"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
        .unwrap_or_default();
    let configurations = parsed[key]["configurations"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
        .unwrap_or_default();
    Ok((schemes, configurations))
}

/// Query build settings via `xcodebuild -showBuildSettings -json` to find the
/// .app path + bundle id BEFORE running the actual build.
pub async fn build_settings(
    project_type: &str,
    project_path: &str,
    scheme: &str,
    udid: &str,
) -> Result<BuildSettings> {
    let flag = if project_type == "xcworkspace" { "-workspace" } else { "-project" };
    let destination = format!("platform=iOS Simulator,id={}", udid);
    let output = Command::new("xcodebuild")
        .args([
            flag,
            project_path,
            "-scheme",
            scheme,
            "-destination",
            &destination,
            "-configuration",
            "Debug",
            "-showBuildSettings",
            "-json",
        ])
        .output()
        .await
        .context("xcodebuild -showBuildSettings failed")?;

    if !output.status.success() {
        anyhow::bail!(
            "xcodebuild -showBuildSettings exit {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let parsed: serde_json::Value = serde_json::from_slice(&output.stdout)
        .context("showBuildSettings returned invalid JSON")?;
    let arr = parsed.as_array().context("expected JSON array")?;
    let first = arr.first().context("no targets")?;
    let settings = &first["buildSettings"];

    let built_products_dir = settings["BUILT_PRODUCTS_DIR"]
        .as_str()
        .context("BUILT_PRODUCTS_DIR missing")?
        .to_string();
    let full_product_name = settings["FULL_PRODUCT_NAME"]
        .as_str()
        .or_else(|| settings["WRAPPER_NAME"].as_str())
        .context("FULL_PRODUCT_NAME missing")?
        .to_string();
    let product_bundle_identifier = settings["PRODUCT_BUNDLE_IDENTIFIER"]
        .as_str()
        .context("PRODUCT_BUNDLE_IDENTIFIER missing")?
        .to_string();

    let app_path = format!("{}/{}", built_products_dir, full_product_name);

    Ok(BuildSettings {
        built_products_dir,
        full_product_name,
        product_bundle_identifier,
        app_path,
    })
}
