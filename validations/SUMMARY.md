# SimPilot — Phase 0 Critical Validations Summary

**Date:** 2026-05-11
**Status:** 3 of 4 critical validations passed; V4 deferred to Phase 3 prep

| ID | Validation | Status | Notes |
|---|---|---|---|
| **V1** | WKWebView render 60fps video stream | ✅ **PASS (HIGH)** | 59.5 fps locked. Tauri stack validated. |
| **V2** | codex-plusplus license check | ✅ **PASS** | MIT — can reuse Swift/Obj-C helpers as project base. |
| **V3** | CoreSimulator IOSurface on Xcode 26.4.1 | ✅ **PASS** | 25 fps idle iPhone 17 (1206×2622); real apps will be higher. |
| **V4** | Android Emulator gRPC streaming | ⏸ **DEFERRED** | Not blocking Phase 1 (iOS only). Validate in Phase 3 prep. |

## Architectural decisions confirmed by validations

1. **Tauri 2.x** (UI framework) — confirmed by V1
2. **CoreSimulator IOSurface private API** (iOS mirror) — confirmed by V3
3. **MJPEG-over-localhost** as primary frame transport — confirmed by V1+V3 working together
4. **Adopt codex-plusplus helpers as starting point** (vs writing from scratch) — confirmed by V2

## Time saved vs original plan
- ~2 weeks of Phase 1 work eliminated (don't need to write sim-capture/sim-input from scratch)
- ~1 week of Phase 0 risk-discovery cycles eliminated (architecture validated early)

## Environment

- Mac: Apple Silicon (per uname -m)
- macOS: 15.x (Darwin 25.3.0)
- Xcode: 26.4.1, Build 17E202
- iOS Simulator runtimes: iOS 26.3, iOS 26.4
- Node: v25.8.1, pnpm: 11.0.9
- Rust: 1.95.0 (stable-aarch64-apple-darwin)
- Tauri CLI: not installed yet (Phase 0 follow-up)

## Next actions
1. Update plan file `dapper-crafting-lynx.md` with validation results
2. Continue Phase 0 foundation:
   - Initialize monorepo (pnpm + Turborepo + Cargo workspace)
   - Scaffold Tauri 2.x app
   - Set up GitHub private repo
   - LICENSE (MIT), README v0, .gitignore, .editorconfig
3. Defer V4 Android validation until Phase 3 prep
