# @claude-sim/mcp-server

MCP server that exposes 6 atomic tools for controlling an iOS Simulator from Claude Code (or any MCP client — Cursor, Codex, Windsurf, etc.).

## Tools

| Tool | What it does |
|---|---|
| `list_devices` | List available iOS Simulator devices with state |
| `boot_device` | Boot a simulator by udid or name (idempotent) |
| `screenshot` | Capture PNG/JPEG of booted simulator |
| `tap` | Tap normalized (x,y) or a hardware button (home/lock/side/siri/applepay) |
| `type_text` | Type ASCII into focused field (supports shift for caps + common punctuation) |
| `build_and_run` | Detect Xcode project, build, install, launch — one shot |

## Install (from source, until npm publish)

```bash
cd ../helpers && make all        # build native helpers (sim-capture, sim-input)
cd ../mcp-server
pnpm install
pnpm build
```

## Register with Claude Code

```bash
claude mcp add claude-sim node /full/path/to/claude-sim/mcp-server/dist/index.js
```

Or, once we publish to npm:

```bash
npm install -g @claude-sim/mcp-server
claude mcp add claude-sim claude-sim-mcp
```

## Try it

In a Claude Code session inside any iOS project:

```
> build my app on iPhone 17 simulator and show me the first screen
```

Claude will autonomously call `boot_device` → `build_and_run` → `screenshot` and analyze the image.

## Env vars

- `CLAUDE_SIM_HELPERS` — path to a directory containing `sim-capture` and `sim-input` binaries. Defaults to `../helpers/bin/` relative to the installed package.

## Limitations (v0.1)

- macOS only (iOS Simulator requirement)
- ASCII text only via `type_text` (no emoji, no IME)
- Coordinate-based tap requires you to know layout — combine with `screenshot` first
- No log streaming yet (coming in v0.2)
- No accessibility tree inspection yet (coming in v0.2)
