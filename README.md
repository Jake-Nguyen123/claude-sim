# claude-sim

> **Give Claude Code eyes and hands on your iOS Simulator.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Status: alpha](https://img.shields.io/badge/Status-alpha-orange)
![Platform: macOS](https://img.shields.io/badge/Platform-macOS-lightgrey)

<!-- HERO GIF placeholder — record after Tauri mirror window ships -->
<p align="center"><em>[hero demo — Claude Code building an iOS app while claude-sim mirrors the simulator live, agent taps buttons autonomously]</em></p>

---

## Why

When you build iOS apps with [Claude Code](https://claude.ai/code), the AI agent is **blind**.
It can run `xcodebuild`, parse logs, write Swift — but it cannot **see** what your app actually looks like, and it cannot **interact** with it.

You end up screenshotting Simulator.app and pasting images back into chat. Or asking Claude to "trust me, the login button is at coordinate (180, 420)". The dev loop is slow and the agent is half-blind.

**claude-sim fixes that.** It gives Claude Code two things:

1. **Eyes** — live framebuffer mirror of any booted iOS Simulator, captured via CoreSimulator IOSurface at ~30–60 fps. No Simulator.app window needed.
2. **Hands** — full HID input (tap, swipe, type, hardware buttons) forwarded via SimulatorKit's Indigo HID protocol — the same path facebook/idb uses.

Both exposed to Claude Code via [MCP](https://modelcontextprotocol.io/) — install once, then Claude can `build_and_run`, `screenshot`, `tap`, `type` autonomously.

## What you get

| Tool | What Claude can do |
|---|---|
| `list_devices` | Enumerate available iOS simulators |
| `boot_device` | Boot a simulator (idempotent) |
| `build_and_run` | Detect Xcode project, `xcodebuild`, install + launch app |
| `screenshot` | Capture current frame as PNG/JPEG |
| `tap` | Coordinate-based tap, double-tap, long-press |
| `type_text` | Keyboard input + hardware buttons (home/lock/siri) |

Plus an optional **Tauri-based mirror window** so you can watch what Claude sees in real time (~60 fps WKWebView render — validated).

## Quick start

> **macOS only. Requires Xcode + iOS Simulator. Apple Silicon recommended.**

```bash
# 1. Install
npx claude-sim install        # downloads binaries, builds helpers from source

# 2. Register MCP server with Claude Code
claude mcp add claude-sim npx -- claude-sim mcp

# 3. From your iOS project directory
claude --print "build this app on iPhone 17, verify the login screen looks correct"
```

Claude will autonomously: detect the project → boot a simulator → build → install → launch → screenshot → analyze image → report results. All without touching Xcode or Simulator.app.

## How it works

```
┌─────────────────┐  MCP stdio   ┌────────────────────┐
│ Claude Code     │ ───────────► │ claude-sim MCP     │
│ (CLI / Desktop) │              │ server (Node)      │
└─────────────────┘              └──────┬─────────────┘
                                        │ spawn / pipe
                          ┌─────────────┴──────────────┐
                          ▼                            ▼
                  ┌──────────────┐            ┌────────────────┐
                  │ sim-capture  │            │ sim-input      │
                  │ (Swift)      │            │ (Obj-C)        │
                  │ IOSurface →  │            │ Indigo HID →   │
                  │ JPEG stream  │            │ touches/keys   │
                  └──────┬───────┘            └────────┬───────┘
                         │                             │
                         ▼                             ▼
                  ┌──────────────────────────────────────────┐
                  │     CoreSimulator (private framework)    │
                  │     + booted iOS Simulator device        │
                  └──────────────────────────────────────────┘
```

- **sim-capture** uses CoreSimulator's `SimDisplayIOSurfaceRenderable` + damage callback to emit JPEGs at ~25–60 fps with zero Simulator.app overhead.
- **sim-input** uses SimulatorKit's `SimDeviceLegacyHIDClient` + Indigo wire format, ported from facebook/idb's `FBSimulatorIndigoHID`.
- **MCP server** orchestrates them as long-lived processes per device.

## Status & roadmap

**v0.1 (current, alpha):** iOS Simulator only, screenshot + tap + type, MCP integration, optional Tauri mirror window.

**v0.2 (next):**
- [ ] Live `simctl spawn ... log stream` exposed as MCP resource
- [ ] Accessibility tree inspector (`describe_screen` tool)
- [ ] Multi-simulator concurrency
- [ ] Hot reload Flutter `--machine` daemon

**v0.3+:**
- [ ] Android Emulator (gRPC EmulatorService streaming)
- [ ] Real device support (iOS via idb, Android via scrcpy)
- [ ] React Native Metro integration
- [ ] VS Code extension panel

## Known limitations

- macOS only. iOS Simulator cannot run on Linux/Windows (it requires the macOS kernel + Apple EULA).
- Uses Apple's CoreSimulator **private framework**. Symbols may shift between Xcode major versions — `claude-sim` runs a compatibility probe on startup and falls back to slower `xcrun simctl io` if private symbols are missing.
- Currently unsigned (Developer ID notarization coming in v0.2). On first launch you may need: `xattr -d com.apple.quarantine $(which claude-sim)`.

## Acknowledgements

The native helpers (`helpers/sim-capture.swift`, `helpers/sim-input.m`) are derived from [b-nnett/codex-plusplus-ios-simulator](https://github.com/b-nnett/codex-plusplus-ios-simulator) (MIT). Huge thanks to that project for proving the CoreSimulator IOSurface + Indigo HID approach works headlessly. The Indigo wire format itself was reverse-engineered by facebook/idb.

## Disclaimer

**claude-sim is a community/unofficial project. It is NOT affiliated with, endorsed by, or sponsored by Anthropic.** "Claude" is a trademark of Anthropic, used here only to describe interoperability with the Claude Code product.

## License

[MIT](LICENSE) — do whatever, just keep the notice.

---

<p align="center">
  <a href="https://github.com/Jake-Nguyen123/claude-sim/stargazers">⭐ Star this repo</a> if you find it useful — it's the only way to know if this niche actually matters to anyone.
</p>
