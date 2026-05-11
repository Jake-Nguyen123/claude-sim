// Thin wrapper around `xcrun simctl` for device + app lifecycle.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface SimDevice {
  udid: string;
  name: string;
  state: "Booted" | "Shutdown" | "Booting" | "Shutting Down" | string;
  runtime: string;
  deviceTypeIdentifier?: string;
}

export async function listDevices(opts: { availableOnly?: boolean } = {}): Promise<SimDevice[]> {
  const args = ["simctl", "list", "devices", "--json"];
  if (opts.availableOnly !== false) args.push("available");
  const { stdout } = await execFileP("xcrun", args, { maxBuffer: 8 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as { devices: Record<string, Array<Omit<SimDevice, "runtime">>> };
  const out: SimDevice[] = [];
  for (const [runtime, devices] of Object.entries(parsed.devices)) {
    for (const d of devices) {
      out.push({ ...d, runtime });
    }
  }
  return out;
}

export async function bootDevice(udid: string): Promise<{ alreadyBooted: boolean }> {
  // Check state first — boot is non-idempotent (errors if already booted)
  const devs = await listDevices();
  const target = devs.find((d) => d.udid === udid);
  if (!target) throw new Error(`Device ${udid} not found`);
  if (target.state === "Booted") return { alreadyBooted: true };

  await execFileP("xcrun", ["simctl", "boot", udid]);
  // Wait for boot to settle (services come up)
  await execFileP("xcrun", ["simctl", "bootstatus", udid, "-b"]);
  return { alreadyBooted: false };
}

export async function shutdownDevice(udid: string): Promise<void> {
  await execFileP("xcrun", ["simctl", "shutdown", udid]);
}

export async function takeScreenshot(udid: string, format: "png" | "jpeg" = "png"): Promise<Buffer> {
  // simctl's stdout pipe mode (`-`) emits informational notes mixed with the
  // image bytes, which corrupts the output. Write to a tmp file instead.
  const { readFile, unlink } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const tmpFile = join(tmpdir(), `claude-sim-${udid.slice(0, 8)}-${Date.now()}.${format}`);
  try {
    await execFileP("xcrun", ["simctl", "io", udid, "screenshot", `--type=${format}`, tmpFile], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return await readFile(tmpFile);
  } finally {
    await unlink(tmpFile).catch(() => { /* ignore */ });
  }
}

export async function installApp(udid: string, appPath: string): Promise<void> {
  await execFileP("xcrun", ["simctl", "install", udid, appPath], { maxBuffer: 16 * 1024 * 1024 });
}

export async function launchApp(udid: string, bundleId: string): Promise<{ pid: number }> {
  const { stdout } = await execFileP("xcrun", ["simctl", "launch", udid, bundleId]);
  // Output format: "<bundleId>: <pid>"
  const m = stdout.match(/:\s*(\d+)/);
  return { pid: m ? Number(m[1]) : -1 };
}
