# claude-sim native helpers

Two small command-line tools that talk to a booted iOS Simulator at the lowest level macOS exposes — directly through `CoreSimulator.framework` private APIs and `SimulatorKit.framework`'s Indigo HID protocol.

| Helper | Language | Job |
|---|---|---|
| `sim-capture` | Swift | Mirrors the simulator's framebuffer. Emits length-prefixed JPEGs on stdout (`[u32 big-endian length][JPEG bytes]…`) at the simulator's refresh rate. Status/diagnostic JSON on stderr. |
| `sim-input` | Obj-C | Forwards touches, hardware buttons, and keyboard events into the booted simulator via `SimulatorKit`'s `SimDeviceLegacyHIDClient`. Reads NDJSON event objects on stdin. |

The MCP server (`../mcp-server/`) spawns both as long-lived child processes per device, multiplexing screenshots and HID events for Claude Code.

## Build

```bash
make            # produces bin/sim-capture and bin/sim-input
make verify     # boot any simulator first, then this captures ~2s as smoke test
make clean
```

Build prerequisites: Xcode command-line tools (`xcode-select --install`). No CocoaPods, no SwiftPM dependencies — both helpers `dlopen` the private frameworks at runtime.

## Event protocol (sim-input)

Each line of stdin is one JSON object:

```json
{"type":"tap", "x":0.5, "y":0.4, "hold":150}              // convenience tap
{"type":"touch", "phase":"down|move|up", "x":0..1, "y":0..1}
{"type":"button-tap", "name":"home|lock|side|siri|applepay"}
{"type":"key-tap", "usage":40, "modifiers":[227]}          // USB HID usage codes
```

`x`/`y` are normalized 0..1 (top-left origin).

## Origin & license

These two files originated in [b-nnett/codex-plusplus-ios-simulator](https://github.com/b-nnett/codex-plusplus-ios-simulator) (MIT), which proved that CoreSimulator + Indigo HID work entirely headlessly. We took them mostly as-is — see `LICENSE.upstream`. The Indigo wire format itself was reverse-engineered by facebook/idb's `FBSimulatorIndigoHID`.

## Compatibility notes

- `sim-capture` reads `/Library/Developer/PrivateFrameworks/CoreSimulator.framework/CoreSimulator` and resolves selectors at runtime. If Apple renames symbols in a future Xcode, the helper exits with a clear error and the MCP server falls back to `xcrun simctl io recordVideo` (~5–15 fps).
- Tested on:
  - Xcode 26.4.1 / iOS 26.3 / iOS 26.4 — ✅ ~25 fps idle, much higher with active UI
