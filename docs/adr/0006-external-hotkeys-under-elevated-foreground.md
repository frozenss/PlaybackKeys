# External hotkeys under an elevated foreground: Browser gate vs elevation

Chrome Global **Commands** keep working while an elevated game (Genshin-class anti-cheat) is focused because Chromium registers them with Win32 `RegisterHotKey`. The **AHK bridge script**’s External hotkey remaps sit under `#HotIf HasUsableBrowserWindow()` (the **Browser gate**), which forces AHK’s keyboard-hook path; an unelevated hook often cannot see keys destined for a higher-integrity foreground window (UIPI). That mismatch—not exclusive fullscreen, and not “AHK cannot be global”—is the working root cause for “Command works, External hotkey does not” in borderless Genshin. We will ship **two complementary paths**: keep the Browser gate by default and document **run the bridge elevated** when the foreground app is elevated; optionally turn the Browser gate **off** at generate time so remaps can use AHK’s `RegisterHotKey` path without elevation, at the cost of claiming those keys system-wide while the script runs.

**Status:** proposed (pending live repro: admin-only retest, and Bridge toggle vs External under Genshin focus)

## Considered options

- **Do nothing / docs only (“use Chrome Commands in games”).** Rejected as the sole answer: External hotkeys in elevated-game foreground is a core success criterion.
- **Always require Administrator; never change `#HotIf`.** Rejected as the only path: works and matches galaran/BetterGI practice, but forces UAC even when a `RegisterHotKey` capture would suffice for our Leg A (observe key → `SendInput` Chrome chord; we never inject into the game).
- **Always remove `#HotIf` (always `RegisterHotKey`).** Rejected as the default: bare External hotkeys would be swallowed in every app for the life of the script; today’s “no usable browser → pass through” safety is worth preserving as default.
- **Replace AHK with a Go/C# `RegisterHotKey` helper (or Native Messaging) in this change.** Deferred: same capture API class as ungated AHK; language choice does not beat UIPI for `SendInput` into an elevated target (not our target anyway). Revisit if AHK gating/UX proves insufficient.
- **Interception / filter-driver capture.** Rejected for this problem: aimed at injecting into stubborn games; overkill and high support/anti-cheat cost for “notify Chrome.”
- **Copy BetterGI/galaran “always elevate” as architecture.** Rejected as the primary story: those tools elevate to `SendInput`/`Click` **into** Genshin. PlaybackKeys only needs to **observe** the chord while the game is focused, then signal Chrome. Their READMEs still confirm the elevation/UIPI pattern; they do not prove a non-admin magic path (BetterGI has none).
- **UI Access instead of Admin.** Deferred: valid AHK FAQ bypass; heavier install/signing story than “Run as administrator” or ungated `RegisterHotKey`.

## Consequences

- **Glossary:** **Browser gate** names the “only remap while a usable supported browser window is known” condition. User-facing copy prefers “仅在有浏览器时拦截” / equivalent; avoid calling this “game mode” as the primary name.
- **Default generate:** Browser gate **on** (`#HotIf HasUsableBrowserWindow()` [+ optional Bridge remaps flag]) — current behavior.
- **Optional setting:** persisted in the AHK panel; when **off**, generated External hotkey lines are global (no remap `#HotIf`). `SendPlayback` may still no-op without a usable browser, but the key is already consumed. Download regenerates; changing the setting implies re-download.
- **High-collision warning:** when the Browser gate is off, confirm copy must state the key is swallowed in **all applications** while the script runs (stronger than the gated wording).
- **Elevation path:** document that if the Browser gate stays on and External hotkeys fail over an elevated game, run the AHK bridge script as Administrator (or equivalent scheduled-task elevation). Optional panel self-elevation (default off) can embed an AutoHotkey `*RunAs` restart on Download (#24); UAC still applies, and it remains complementary to Path B rather than a replacement.
- **Diagnostics to promote proposed → accepted:** (1) unelevated vs elevated same script under Genshin focus; (2) Bridge toggle (outside remap `#HotIf`, expected `reg`) vs External (gated, expected hook) while Genshin is focused.
- **Out of scope here:** injecting into games; per-game `#HotIf WinActive`; dropping the dual-layer model (Chrome remains the Command owner); claiming exclusive fullscreen was the root cause (repro was borderless).
