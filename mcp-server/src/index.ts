#!/usr/bin/env node
// claude-sim MCP server — give Claude Code eyes and hands on iOS Simulator.
//
// Exposes 6 atomic tools over MCP stdio transport:
//   list_devices · boot_device · screenshot · tap · type_text · build_and_run
//
// Spawn with:
//   claude mcp add claude-sim claude-sim-mcp
// or directly:
//   node dist/index.js

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { listDevices, bootDevice, takeScreenshot, installApp, launchApp } from "./adapters/simctl.js";
import { tap, typeText, buttonTap, shutdownAllInputs } from "./adapters/input.js";
import { detectXcodeProject, listSchemes, buildForSimulator } from "./adapters/build.js";

const VERSION = "0.1.0-alpha.0";

const TOOLS = [
  {
    name: "list_devices",
    description: "Enumerate available iOS Simulator devices with their current state (Booted / Shutdown). Use this first when you don't know which simulators are available.",
    inputSchema: {
      type: "object",
      properties: {
        booted_only: { type: "boolean", description: "Only return booted devices.", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "boot_device",
    description: "Boot an iOS Simulator by UDID or name. Idempotent — no-op if already booted. Waits for full boot before returning. Use list_devices first to find UDIDs.",
    inputSchema: {
      type: "object",
      properties: {
        udid: { type: "string", description: "Simulator UDID. Either udid or name must be provided." },
        name: { type: "string", description: "Simulator name (e.g., 'iPhone 17'). Resolved via list_devices." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "screenshot",
    description: "Capture a screenshot of the currently booted simulator (or specified UDID). Returns PNG (default) or JPEG as base64. Use this to see what the app looks like before tapping.",
    inputSchema: {
      type: "object",
      properties: {
        udid: { type: "string", description: "Optional UDID. If omitted, uses the first booted device." },
        format: { type: "string", enum: ["png", "jpeg"], default: "png" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "tap",
    description: "Tap a point on the simulator screen. Coordinates are NORMALIZED 0..1 (top-left origin). To tap the bottom-center button on a 1206x2622 screen, use x=0.5 y=0.9. Use screenshot first to find the right coordinates.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X 0..1 normalized.", minimum: 0, maximum: 1 },
        y: { type: "number", description: "Y 0..1 normalized.", minimum: 0, maximum: 1 },
        udid: { type: "string", description: "Optional UDID; defaults to first booted device." },
        hold_ms: { type: "number", description: "Hold duration in ms.", default: 80 },
        button: { type: "string", enum: ["home", "lock", "side", "siri", "applepay"], description: "Alternative: tap a hardware button. If set, x/y are ignored." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "type_text",
    description: "Type ASCII text into the focused field on the simulator. Supports lowercase, uppercase (via shift), digits, common punctuation, Enter (use '\\n'), Tab ('\\t'), Backspace ('\\b'). Returns skipped chars if any. Make sure a text field is focused first (tap it).",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to type. Use '\\n' for Enter." },
        udid: { type: "string", description: "Optional UDID; defaults to first booted device." },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "build_and_run",
    description: "Detect an Xcode project in the working directory, build it for the specified simulator, install, and launch the app. Returns app bundle id + path + build duration. Streams xcodebuild errors structured. Use this instead of telling the user to run xcodebuild manually.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string", description: "Path to the directory containing .xcodeproj/.xcworkspace. Defaults to cwd." },
        scheme: { type: "string", description: "Xcode scheme. If omitted, uses the first scheme reported by xcodebuild -list." },
        device_name: { type: "string", description: "Simulator name to build for, e.g. 'iPhone 17'. Defaults to the first booted device or 'iPhone 17'." },
        launch: { type: "boolean", description: "After building, install + launch the app.", default: true },
      },
      additionalProperties: false,
    },
  },
];

const server = new Server(
  { name: "claude-sim", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params as { name: string; arguments?: Record<string, unknown> };
  try {
    switch (name) {
      case "list_devices": {
        const schema = z.object({ booted_only: z.boolean().default(false) });
        const a = schema.parse(args);
        const devs = await listDevices();
        const filtered = a.booted_only ? devs.filter((d) => d.state === "Booted") : devs;
        return jsonResult({ devices: filtered });
      }

      case "boot_device": {
        const schema = z.object({ udid: z.string().optional(), name: z.string().optional() });
        const a = schema.parse(args);
        const udid = await resolveUDID(a);
        const r = await bootDevice(udid);
        return jsonResult({ status: r.alreadyBooted ? "already_booted" : "booted", udid });
      }

      case "screenshot": {
        const schema = z.object({ udid: z.string().optional(), format: z.enum(["png", "jpeg"]).default("png") });
        const a = schema.parse(args);
        const udid = await resolveBootedUDID(a.udid);
        const buf = await takeScreenshot(udid, a.format);
        return {
          content: [
            {
              type: "image",
              data: buf.toString("base64"),
              mimeType: a.format === "png" ? "image/png" : "image/jpeg",
            },
            { type: "text", text: JSON.stringify({ udid, format: a.format, bytes: buf.length }) },
          ],
        };
      }

      case "tap": {
        const schema = z.object({
          x: z.number().min(0).max(1).optional(),
          y: z.number().min(0).max(1).optional(),
          udid: z.string().optional(),
          hold_ms: z.number().default(80),
          button: z.enum(["home", "lock", "side", "siri", "applepay"]).optional(),
        });
        const a = schema.parse(args);
        const udid = await resolveBootedUDID(a.udid);
        if (a.button) {
          await buttonTap(udid, a.button);
          return jsonResult({ ok: true, button: a.button });
        }
        if (a.x === undefined || a.y === undefined) {
          throw new Error("tap requires either {x, y} normalized coords or {button}");
        }
        await tap(udid, a.x, a.y, a.hold_ms);
        return jsonResult({ ok: true, x: a.x, y: a.y });
      }

      case "type_text": {
        const schema = z.object({ text: z.string(), udid: z.string().optional() });
        const a = schema.parse(args);
        const udid = await resolveBootedUDID(a.udid);
        const r = await typeText(udid, a.text);
        return jsonResult({ ok: true, sent: r.sent, skipped: r.skipped });
      }

      case "build_and_run": {
        const schema = z.object({
          project_path: z.string().default(process.cwd()),
          scheme: z.string().optional(),
          device_name: z.string().optional(),
          launch: z.boolean().default(true),
        });
        const a = schema.parse(args);

        const project = detectXcodeProject(a.project_path);
        if (!project) {
          return jsonResult({ status: "error", error: `No .xcodeproj or .xcworkspace in ${a.project_path}` });
        }

        const schemes = await listSchemes(project);
        const scheme = a.scheme ?? schemes[0];
        if (!scheme) return jsonResult({ status: "error", error: "No schemes found in project" });

        // Resolve device name + UDID
        const devs = await listDevices();
        let device = devs.find((d) => d.state === "Booted");
        if (a.device_name) device = devs.find((d) => d.name === a.device_name) ?? device;
        if (!device) device = devs.find((d) => d.name === "iPhone 17");
        if (!device) return jsonResult({ status: "error", error: "No device found. Boot one first." });

        if (device.state !== "Booted") await bootDevice(device.udid);

        const build = await buildForSimulator({
          projectPath: project.path,
          type: project.type,
          scheme,
          destination: `platform=iOS Simulator,id=${device.udid}`,
        });

        if (build.status === "error" || !build.appPath || !build.bundleId) {
          return jsonResult({ status: "error", errors: build.errors, stderr_tail: build.stderr_tail });
        }

        if (a.launch) {
          await installApp(device.udid, build.appPath);
          const { pid } = await launchApp(device.udid, build.bundleId);
          return jsonResult({
            status: "ok",
            scheme,
            udid: device.udid,
            device_name: device.name,
            app_path: build.appPath,
            bundle_id: build.bundleId,
            pid,
            build_duration_ms: build.durationMs,
          });
        }

        return jsonResult({
          status: "ok",
          scheme,
          udid: device.udid,
          app_path: build.appPath,
          bundle_id: build.bundleId,
          build_duration_ms: build.durationMs,
        });
      }

      default:
        return jsonResult({ error: `Unknown tool: ${name}` }, true);
    }
  } catch (e: any) {
    return jsonResult({ error: e?.message ?? String(e), stack: e?.stack }, true);
  }
});

async function resolveUDID(a: { udid?: string; name?: string }): Promise<string> {
  if (a.udid) return a.udid;
  if (!a.name) throw new Error("Either udid or name is required");
  const devs = await listDevices();
  const match = devs.find((d) => d.name === a.name);
  if (!match) throw new Error(`No simulator named "${a.name}"`);
  return match.udid;
}

async function resolveBootedUDID(udid?: string): Promise<string> {
  if (udid) return udid;
  const devs = await listDevices();
  const booted = devs.find((d) => d.state === "Booted");
  if (!booted) throw new Error("No booted simulator. Use boot_device first.");
  return booted.udid;
}

function jsonResult(obj: unknown, isError = false) {
  return {
    isError,
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  };
}

// Cleanup on exit
function cleanup() {
  shutdownAllInputs();
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`[claude-sim] v${VERSION} MCP server ready on stdio\n`);
