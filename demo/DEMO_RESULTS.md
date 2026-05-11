# claude-sim — End-to-end demo with Claude Code

**Date:** 2026-05-11
**Environment:** Xcode 26.4.1, iOS 26.4, iPhone 17 simulator (1206×2622)
**Setup:** `claude mcp add claude-sim node $REPO/mcp-server/dist/index.js`

## Demo 1 — `list_devices` (one tool)

Prompt: "Use the claude-sim list_devices tool. Tell me how many simulators are available and which one is currently booted."

Output (verbatim from Claude Code):
> 26 simulators available (iOS 26.3 and 26.4 runtimes). Currently booted: **iPhone 17** (iOS 26.4, UDID `C833AD5B-…`), last booted 2026-05-11.

## Demo 2 — `screenshot` + vision (one tool + LLM vision)

Prompt: "Use claude-sim screenshot tool to capture the currently booted iOS simulator. Look at the image and describe in detail what app/screen is shown."

Output (verbatim):
> The screenshot shows the iOS Home Screen on a notch-style iPhone with the status bar reading 11:20, Wi-Fi and full battery on the right. Top row has two large widgets: a blank pale-green Maps widget (left) and a white Calendar widget (right) showing "MONDAY 11" with "No Events Today". Below sits a 4-column app grid — row one: Calendar (showing Mon 11), Photos (rainbow pinwheel), Reminders, News (red "N"); row two: Maps, Health (red heart), Wallet, Settings (gear). Background is a swirling blue/teal abstract iOS wallpaper, with a "Search" pill above the dock, and the dock contains Safari (compass) and Messages (green chat bubble).

## Demo 3 — Autonomous workflow + self-correction (screenshot + tap chained)

Prompt: "Use claude-sim tools to autonomously open the Settings app. Take a screenshot, find the Settings icon, calculate coords, tap, screenshot again, verify."

Output (verbatim):
> - Step 1: Captured home screen — saw Settings gear icon in the bottom-right of the 4×3 app grid (row 3, col 4).
> - Step 2: Estimated normalized coords of the Settings icon center at x≈0.83, y≈0.47.
> - Step 3: Tap (0.83, 0.47) → returned ok, but the next screenshot was identical to the home screen (miss — likely just above the icon row).
> - Step 4: Retried with (0.83, 0.48); post-tap screenshot shows the Settings root view (title "Settings", Apple Account banner, General/Accessibility/…/Camera/…list).
>
> Verdict: Settings opened successfully on the second tap. The (0.83, 0.47) coordinate missed slightly; (0.83, 0.48) hit and launched Settings.app.

**Key takeaway:** The agent observed its own miss via post-tap screenshot, self-corrected the Y coordinate by 0.01, and successfully opened the app. This is the full perception→action→observation→correction loop that claude-sim enables.
