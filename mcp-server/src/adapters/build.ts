// Detect Xcode project + build/install/launch in one call.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";

const execFileP = promisify(execFile);

export interface XcodeProject {
  type: "xcodeproj" | "xcworkspace";
  path: string;
  schemes: string[];
}

export function detectXcodeProject(cwd: string): XcodeProject | null {
  if (!existsSync(cwd)) return null;
  const entries = readdirSync(cwd);
  const ws = entries.find((e) => e.endsWith(".xcworkspace"));
  if (ws) return { type: "xcworkspace", path: resolve(cwd, ws), schemes: [] };
  const proj = entries.find((e) => e.endsWith(".xcodeproj"));
  if (proj) return { type: "xcodeproj", path: resolve(cwd, proj), schemes: [] };
  return null;
}

export async function listSchemes(project: XcodeProject): Promise<string[]> {
  const flag = project.type === "xcworkspace" ? "-workspace" : "-project";
  const { stdout } = await execFileP("xcodebuild", [flag, project.path, "-list", "-json"], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const data = JSON.parse(stdout);
  const schemes: string[] = data.workspace?.schemes ?? data.project?.schemes ?? [];
  return schemes;
}

export interface BuildResult {
  status: "ok" | "error";
  appPath?: string;
  bundleId?: string;
  durationMs: number;
  errors: string[];
  stderr_tail: string;
}

export async function buildForSimulator(opts: {
  projectPath: string;
  type: "xcodeproj" | "xcworkspace";
  scheme: string;
  destination: string; // e.g., "platform=iOS Simulator,name=iPhone 17"
}): Promise<BuildResult> {
  const t0 = Date.now();
  const flag = opts.type === "xcworkspace" ? "-workspace" : "-project";

  // 1. xcodebuild — build for sim, produce .app
  let stderrTail = "";
  let buildOut = "";
  try {
    const { stdout } = await execFileP(
      "xcodebuild",
      [
        flag, opts.projectPath,
        "-scheme", opts.scheme,
        "-destination", opts.destination,
        "-configuration", "Debug",
        "build",
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    buildOut = stdout;
  } catch (e: any) {
    stderrTail = (e?.stderr ?? "").toString().slice(-4000);
    return {
      status: "error",
      durationMs: Date.now() - t0,
      errors: [extractFirstError(stderrTail) ?? "xcodebuild failed"],
      stderr_tail: stderrTail,
    };
  }

  // 2. Extract product .app path from build output
  const m = buildOut.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^\s]+)/);
  const bundleId = m?.[1];

  // Find .app under DerivedData — xcodebuild logs "BUILT_PRODUCTS_DIR = …"
  const builtDirM = buildOut.match(/BUILT_PRODUCTS_DIR\s*=\s*(.+)/);
  let appPath: string | undefined;
  if (builtDirM) {
    const dir = builtDirM[1].trim();
    if (existsSync(dir)) {
      const apps = readdirSync(dir).filter((f) => f.endsWith(".app"));
      if (apps.length > 0) appPath = resolve(dir, apps[0]);
    }
  }
  // Fallback: query via -showBuildSettings
  if (!appPath) {
    try {
      const { stdout: bs } = await execFileP(
        "xcodebuild",
        [
          flag, opts.projectPath,
          "-scheme", opts.scheme,
          "-destination", opts.destination,
          "-showBuildSettings",
          "-json",
        ],
        { maxBuffer: 32 * 1024 * 1024 },
      );
      const settings = JSON.parse(bs);
      const first = settings[0]?.buildSettings;
      if (first) {
        const dir = first.BUILT_PRODUCTS_DIR;
        const name = first.FULL_PRODUCT_NAME ?? (first.PRODUCT_NAME + ".app");
        if (dir && name) appPath = resolve(dir, name);
      }
    } catch { /* ignore */ }
  }

  return {
    status: "ok",
    appPath,
    bundleId,
    durationMs: Date.now() - t0,
    errors: [],
    stderr_tail: "",
  };
}

function extractFirstError(stderr: string): string | null {
  const lines = stderr.split("\n");
  for (const line of lines) {
    if (/error:/i.test(line)) return line.trim().slice(0, 300);
  }
  return null;
}
