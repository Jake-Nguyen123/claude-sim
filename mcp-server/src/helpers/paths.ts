// Locate the native helper binaries (sim-capture, sim-input).
// Search order:
//   1. CLAUDE_SIM_HELPERS env var (explicit override)
//   2. ../../helpers/bin/<name> relative to dist/
//   3. PATH lookup
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// dist/helpers/paths.js → up to mcp-server/, mcp-server/.., repo root, then helpers/bin
const REPO_HELPERS = resolve(__dirname, "..", "..", "..", "helpers", "bin");

export function resolveHelper(name: "sim-capture" | "sim-input"): string {
  const envOverride = process.env.CLAUDE_SIM_HELPERS;
  if (envOverride) {
    const p = resolve(envOverride, name);
    if (existsSync(p)) return p;
  }
  const repoPath = resolve(REPO_HELPERS, name);
  if (existsSync(repoPath)) return repoPath;
  // Fall back to bare name (PATH)
  return name;
}
