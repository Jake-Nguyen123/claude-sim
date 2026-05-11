// Persistent sim-input child process per UDID.
// sim-input is expensive to bootstrap (~150ms — dlopen, find SimServiceContext,
// init HID client) so we keep one alive and stream NDJSON events to its stdin.
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { resolveHelper } from "../helpers/paths.js";

const SIM_INPUT_BIN = resolveHelper("sim-input");

interface InputProcess {
  child: ChildProcessByStdio<Writable, Readable, Readable>;
  stderrBuffer: string;
}

const processes = new Map<string, InputProcess>();

function ensureInput(udid: string): InputProcess {
  const existing = processes.get(udid);
  if (existing && !existing.child.killed && existing.child.exitCode === null) return existing;

  const child = spawn(SIM_INPUT_BIN, [udid], { stdio: ["pipe", "pipe", "pipe"] });
  const proc: InputProcess = { child, stderrBuffer: "" };
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    proc.stderrBuffer = (proc.stderrBuffer + chunk).slice(-4000);
  });
  child.on("exit", (code) => {
    if (processes.get(udid) === proc) processes.delete(udid);
    if (code !== 0 && code !== null) {
      // eslint-disable-next-line no-console
      console.error(`[claude-sim] sim-input ${udid} exited ${code}\n${proc.stderrBuffer}`);
    }
  });
  processes.set(udid, proc);
  return proc;
}

async function send(udid: string, event: Record<string, unknown>): Promise<void> {
  const proc = ensureInput(udid);
  const line = JSON.stringify(event) + "\n";
  return new Promise<void>((resolve, reject) => {
    proc.child.stdin.write(line, (err) => (err ? reject(err) : resolve()));
  });
}

export async function tap(udid: string, x: number, y: number, holdMs = 80): Promise<void> {
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error(`Coordinates must be 0..1 normalized; got x=${x} y=${y}`);
  }
  await send(udid, { type: "tap", x, y, hold: holdMs });
}

export async function buttonTap(udid: string, name: "home" | "lock" | "side" | "siri" | "applepay"): Promise<void> {
  await send(udid, { type: "button-tap", name });
}

export async function keyTap(udid: string, usage: number, modifiers: number[] = []): Promise<void> {
  await send(udid, { type: "key-tap", usage, modifiers });
}

// Minimal ASCII → USB HID usage map (lowercase + digits + space + enter + backspace).
// HID Usage Tables (Keyboard/Keypad page 0x07):
//   a..z = 4..29   0..9 (top row) = 30..38, then 0=39
//   Enter=40 Esc=41 Backspace=42 Tab=43 Space=44
//   - = 45, = = 46, [ = 47, ] = 48, \ = 49, ; = 51, ' = 52, ` = 53, , = 54, . = 55, / = 56
// Modifier usages: LeftShift = 0xE1 = 225
const LEFT_SHIFT = 225;

function asciiToHID(ch: string): { usage: number; shift?: boolean } | null {
  const c = ch.charCodeAt(0);
  if (c >= 0x61 && c <= 0x7a) return { usage: 4 + (c - 0x61) }; // a..z
  if (c >= 0x41 && c <= 0x5a) return { usage: 4 + (c - 0x41), shift: true }; // A..Z
  if (c >= 0x31 && c <= 0x39) return { usage: 30 + (c - 0x31) }; // 1..9
  if (c === 0x30) return { usage: 39 }; // 0
  switch (ch) {
    case " ": return { usage: 44 };
    case "\n": return { usage: 40 }; // Enter
    case "\t": return { usage: 43 };
    case "\b": return { usage: 42 };
    case "-": return { usage: 45 };
    case "=": return { usage: 46 };
    case "[": return { usage: 47 };
    case "]": return { usage: 48 };
    case "\\": return { usage: 49 };
    case ";": return { usage: 51 };
    case "'": return { usage: 52 };
    case "`": return { usage: 53 };
    case ",": return { usage: 54 };
    case ".": return { usage: 55 };
    case "/": return { usage: 56 };
    case "_": return { usage: 45, shift: true };
    case "+": return { usage: 46, shift: true };
    case "{": return { usage: 47, shift: true };
    case "}": return { usage: 48, shift: true };
    case "|": return { usage: 49, shift: true };
    case ":": return { usage: 51, shift: true };
    case "\"": return { usage: 52, shift: true };
    case "~": return { usage: 53, shift: true };
    case "<": return { usage: 54, shift: true };
    case ">": return { usage: 55, shift: true };
    case "?": return { usage: 56, shift: true };
    case "!": return { usage: 30, shift: true };
    case "@": return { usage: 31, shift: true };
    case "#": return { usage: 32, shift: true };
    case "$": return { usage: 33, shift: true };
    case "%": return { usage: 34, shift: true };
    case "^": return { usage: 35, shift: true };
    case "&": return { usage: 36, shift: true };
    case "*": return { usage: 37, shift: true };
    case "(": return { usage: 38, shift: true };
    case ")": return { usage: 39, shift: true };
  }
  return null;
}

export async function typeText(udid: string, text: string): Promise<{ sent: number; skipped: string[] }> {
  const skipped: string[] = [];
  let sent = 0;
  for (const ch of text) {
    const m = asciiToHID(ch);
    if (!m) { skipped.push(ch); continue; }
    await keyTap(udid, m.usage, m.shift ? [LEFT_SHIFT] : []);
    sent++;
    // Tiny pause between keystrokes — sim-input also sleeps 10ms internally
    await new Promise((r) => setTimeout(r, 12));
  }
  return { sent, skipped };
}

export function shutdownAllInputs(): void {
  for (const [, proc] of processes) {
    try { proc.child.stdin.end(); } catch { /* ignore */ }
    try { proc.child.kill("SIGTERM"); } catch { /* ignore */ }
  }
  processes.clear();
}
