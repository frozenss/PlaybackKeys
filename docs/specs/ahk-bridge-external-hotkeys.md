# Windows AHK bridge for External hotkeys

Canonical tracker entry: https://github.com/frozenss/PlaybackKeys/issues/12  
Keep this repo copy and the issue body in sync if either is edited.

## Problem Statement

`chrome.commands` Global chords are limited: many useful keys (single letters, F13–F24, some numpad keys) cannot be bound the way power users want, and rebinding still requires `chrome://extensions/shortcuts`. Users who already control video from another app (editor, notes) want arbitrary OS-level keys that fire PlaybackKeys **Commands** without focusing the browser. A hand-maintained AutoHotkey script works, but it drifts whenever Command target chords change and is invisible from the extension settings page. Users who are fine with Chrome’s own Global chords must not be forced through any of this.

## Solution

Add an optional, Windows-oriented advanced panel under the existing Shortcuts settings: users record **External hotkeys**, map them to Commands, optionally record a **Bridge toggle hotkey**, and download a generated **AHK bridge script**. The script uses AutoHotkey v2 to intercept those External hotkeys (only while a known Chromium browser window is usable) and `SendInput` the Command’s current target chord—without activating the browser. When a Bridge toggle hotkey is set, the script also embeds a global on/off hotkey for External hotkey remapping (the toggle never disables itself; on/off is in-memory only). Target chords stay owned by Chrome (`chrome.commands`); the extension reads them with `getAll()`, embeds them at generate time, and prompts to regenerate when they drift. Non-Windows users see only a short note that the AHK bridge is Windows-only. Ordinary Global Command users can ignore the panel entirely.

## User Stories

1. As a Windows user who wants keys Chrome cannot bind as Global Commands, I want to map External hotkeys to Commands, so that I can control video while another app stays focused.
2. As a user who is satisfied with `chrome://extensions/shortcuts` alone, I want the AHK bridge UI collapsed and optional, so that I am not pushed into advanced setup.
3. As a user on the settings Shortcuts section, I want a collapsible “Windows: remap with AutoHotkey” panel under the read-only Command list, so that companion remapping sits next to the chords it depends on.
4. As a non-Windows user, I want a single muted line that the AutoHotkey bridge is Windows-only (not the full panel), so that I am not misled into downloading AHK.
5. As a Windows user, I want External hotkey mappings persisted in extension storage, so that I can reopen settings, edit mappings, and regenerate without re-recording everything.
6. As a user who clicks “Reset all to defaults”, I want my External hotkey mappings left intact, so that a playback-settings reset does not wipe the companion configuration.
7. As a user who wants to clear companion config, I want an explicit “Clear AHK mappings” (or equivalent) control in the AHK panel, so that reset of bridge config is intentional (including the Bridge toggle hotkey).
8. As a user recording an External hotkey, I want key-capture (press to record) that shows a friendly label and stores AHK syntax, so that I do not have to know AutoHotkey notation up front.
9. As a user who binds a commonly typed key (for example a bare letter, or Shift+letter) as an External hotkey, I want a one-time warning at bind/confirm time that the key will be swallowed globally while a usable browser window exists, so that I understand the trade-off without a permanent banner cluttering the page. Chords that include Ctrl, Alt, or Win do not get this typing-collision warning (shortcut-collision is out of scope for the confirm; AltGr≈Ctrl+Alt is an accepted v1 edge case).
9a. As a Windows user, I want an optional remaps on/off hotkey row above the External hotkey mapping list (friendly UI copy; docs still say **Bridge toggle hotkey**), so that I can embed a global AHK toggle for External hotkey remapping without it being a Command.
9b. As a user recording that remaps on/off hotkey, I want the same press-to-record path, row-level Clear, and high-collision one-shot confirm as External hotkey recording (with copy that reflects global swallow while the script runs), so that capture UX stays consistent.
9c. As a user who tries to reuse the same chord for a Bridge toggle hotkey and an External hotkey, I want save rejected either way, so that the generated script never has colliding hotkey lines.
9d. As a user with only a Bridge toggle hotkey and no complete External hotkey + Command chord row, I want Download still disabled, so that a toggle alone cannot produce a useless script.
9e. As a user who changes only the Bridge toggle hotkey after a download, I do not want a new chord-style drift hint for that edit alone; Chrome Command chord drift stays as today.
10. As a user looking at a Command with no Chrome target chord yet, I want to still record an External hotkey for it, so that I can prepare mappings before finishing Chrome shortcut setup.
11. As a user generating a script while some Commands are unbound in Chrome, I want those unbound Commands omitted from active hotkey lines and called out in the UI, so that the script never emits empty `SendPlayback("")` bindings.
12. As a user whose Command already has a target chord, I want the generated script’s `SendPlayback` argument to match the live `chrome.commands.getAll()` shortcut at generate time, so that AHK stays synchronized with Chrome without hand-editing.
13. As a user who changed chords in `chrome://extensions/shortcuts` after a prior download, I want a drift hint beside Download when I expand the AHK panel, so that I know to regenerate without a always-visible settings banner.
14. As a user who dismisses that drift hint, I want it to stay out of the way until something relevant changes again (or until I regenerate), so that warnings do not permanently occupy the layout.
15. As a user with no complete mapping row (External hotkey recorded and Command target chord present), I want Download disabled with a short reason, so that I do not download a useless script.
16. As a user with at least one complete mapping row, I want to download a single complete `.ahk` file, so that I can run one script without assembling includes.
17. As a user running the AHK bridge script, I want External hotkeys to fire only when a usable supported browser window is known, so that keys pass through when no browser is available.
18. As a user running the script, I want it not to activate/focus the browser when I press an External hotkey, so that my editor or notes app keeps focus.
19. As a user of Chrome, Edge, Brave, or Chromium, I want the script’s runtime process allowlist to include `chrome.exe`, `msedge.exe`, `brave.exe`, and `chromium.exe`, so that common hosts work without hand-editing.
20. As a user of another Chromium host (Opera, Vivaldi, etc.), I want comments in the generated script explaining how to add a process name, so that I can extend the allowlist locally.
21. As a user with multiple supported browser windows, I want the script to remember the last focused supported browser window for “usable window” checks (same spirit as the existing tmp bridge), so that behavior matches PlaybackKeys’ last-focused targeting expectations.
22. As a user who has not yet assigned a Command to Global in Chrome, I want settings copy to remind me that the AHK bridge still depends on Global Command chords, so that SendInput can reach PlaybackKeys while another app is focused.
23. As a user new to AutoHotkey, I want the panel to point at AutoHotkey v2 and brief run instructions (download script, install AHK v2, run script; optionally start with Windows), so that generation is not a dead end.
24. As a user who edits External hotkeys after a download, I want regeneration to embed the latest mappings and the latest Command chord snapshot, so that one download action refreshes both layers.
25. As a maintainer, I want glossary terms External hotkey and AHK bridge script used consistently, so that agents do not call External hotkeys “Commands” or “shortcuts”.
26. As a maintainer, I want the generate/drift/eligibility logic in one pure module with Node tests, so that script output and drift rules stay regression-safe without DOM tests.
27. As a macOS or Linux user of PlaybackKeys overall, I want existing Global Commands and the rest of settings unchanged, so that a Windows companion feature does not regress other platforms.
28. As a user of the popup or onboarding, I do not need a full AHK configurator there; a settings-only advanced panel is enough for this scope.
29. As a user who never expands the AHK panel, I want zero change to how I open `chrome://extensions/shortcuts` or read the existing Command list, so that the baseline Shortcuts UX stays familiar.

## Implementation Decisions

- **Architecture**: Dual-layer remapping. Chrome continues to own Command target chords (read via `chrome.commands.getAll()`; not programmatically writable on Chromium). The extension owns External hotkey → Command id mappings. The AHK bridge script translates External hotkey → `SendInput` of the embedded target chord.
- **Not chosen**: Native Messaging / custom native host (heavier install and distribution). Not chosen: `#Include mappings.ahk` split (user explicitly wants one downloadable `.ahk` file per generate).
- **UI placement**: Collapsible advanced panel under the existing Shortcuts group on the options page. Default collapsed. Non-Windows: one muted Windows-only note instead of the full panel (detect platform via normal web/platform signals already appropriate for options).
- **Persistence**: Store External hotkey mappings, optional Bridge toggle hotkey (`ahkHotkey` + label; legacy bare AHK string accepted), and last-generated Command chord snapshot / generate metadata needed for drift in `chrome.storage.local`, separate from playback defaults. “Reset all to defaults” does not clear AHK bridge companion state (mappings, toggle, snapshot); the AHK panel’s “Clear AHK mappings” clears all of them.
- **Recording UX**: Key-capture primary path for External hotkeys and the Bridge toggle hotkey; persist AHK syntax plus a display label. On confirming a high-collision External hotkey (letters / digits / Space / Enter / Tab / Backspace / Delete, including Shift-only variants), show a one-shot warning at that moment only—not a persistent page banner. Presence of Ctrl, Alt, or Win suppresses the warning (typing-collision only; not a general shortcut denylist). Bridge toggle high-collision uses the same classifier and confirm path with copy that the key is swallowed globally while the AHK bridge script runs (toggle is outside remap `#HotIf`).
- **Bridge toggle UI**: Optional row above the External hotkey mapping list with friendly user-facing label (“Remaps on/off hotkey”); glossary term **Bridge toggle hotkey** stays in docs/`CONTEXT.md`. Row-level Clear; bidirectional collision with any External hotkey forbids save either way.
- **Generate eligibility**: Download enabled only when at least one row has both an External hotkey and a non-empty Command shortcut from `getAll()`. A Bridge toggle hotkey alone is never enough. Unbound Commands may show recorded External hotkeys but are skipped in active hotkey lines of the output, with UI explanation.
- **Output**: One AutoHotkey v2 script file (single-instance, persistent, `#HotIf` gated on usable supported browser window, `SendInput`, no `WinActivate`). Embed the Command target chords resolved at generate time. When a Bridge toggle hotkey is set, embed it outside the External hotkey remap `#HotIf` so remaps can be toggled without disabling the toggle itself; remaps default on; on/off is in-memory only with an English TrayTip. Runtime process allowlist: `chrome.exe`, `msedge.exe`, `brave.exe`, `chromium.exe`, with comments for manual additions. Do not bake a single exe at generate time; do not claim the extension can read the host exe via extension APIs.
- **Drift**: When the panel is expanded, compare current `getAll()` shortcuts to the snapshot from the last successful generate; if they differ for any mapped Command, show a dismissible regenerate hint beside Download. Folded panel: no drift chrome. Changing only the Bridge toggle hotkey does **not** introduce a new chord-style drift hint.
- **Test seam (single)**: One pure AHK bridge generator / settings module (no DOM, no `chrome.*`). Inputs: External hotkey mappings, optional Bridge toggle hotkey, Command shortcut snapshot, generate metadata. Outputs: full `.ahk` text, download eligibility, skipped-unbound details, drift boolean versus last snapshot; plus normalize/collision helpers for Bridge toggle ↔ External hotkey. Options page wires storage, `getAll()`, capture UI, and download blob only.
- **i18n**: User-visible strings go through the existing message catalog pattern; Windows-only note, panel copy, and remaps on/off hotkey copy included.
- **Glossary**: Use External hotkey, AHK bridge script, and Bridge toggle hotkey from `CONTEXT.md`; do not call External hotkeys Commands; UI may use friendly “remaps on/off hotkey” copy.

## Testing Decisions

Good tests assert external behavior of the generator module only: given mappings + Command snapshot (+ prior snapshot), the module returns the expected eligibility, drift flag, skip reasons, and an `.ahk` string that contains the expected hotkey lines, `SendPlayback` chords, and process allowlist—without inspecting options DOM or Chrome APIs.

Cover at least:

- Eligible generate: one mapped Command with shortcut → download allowed; output contains that External hotkey line and the matching chord in AHK modifier syntax.
- Unbound Command with External hotkey → not eligible solely from that row; if it is the only row, download disallowed; if another row is complete, unbound row omitted from active hotkey lines.
- Drift: last snapshot chord ≠ current snapshot for a mapped Command → drift true; identical snapshots → drift false.
- Allowlist: generated script text mentions `chrome.exe`, `msedge.exe`, `brave.exe`, and `chromium.exe`.
- Empty mappings → download not eligible.
- Chord encoding: representative Chrome shortcut strings encode to the expected AHK `SendPlayback` argument (e.g. Ctrl+Shift+1 → `^+1`).
- Bridge toggle hotkey: optional input embeds only when present; generator accepts bare AHK string or `{ ahkHotkey, label }` record; Clear AHK mappings clears toggle storage; reset-all omits AHK companion keys; bidirectional External ↔ Bridge toggle collision helpers reject matching chords; toggle alone does not make download eligible.

Prior art: `shared/skip-burst.js` + `scripts/skip-burst-test.mjs`, `shared/skip-intervals.js` + `scripts/skip-intervals-test.mjs` (pure module + Node assert script). Do not require Playwright for the generator. Manual or light smoke check of the options panel is enough for wiring.

## Out of Scope

Native Messaging; in-extension writing of `chrome.commands` bindings; macOS/Linux companion scripts (Hammerspoon, etc.); auto-installing or auto-launching AutoHotkey; sending keys into a specific window via `ControlSend` / forcing browser focus; generating split `#Include` mapping files; popup/onboarding full AHK configurators; detecting the real browser exe path via extension APIs; per-application `#HotIf` profiles beyond “usable supported browser window”; mouse-button capture unless it falls out naturally from the same key-capture path with negligible extra scope.

## Further Notes

- Reference behavior and comments live in the existing tmp AutoHotkey v2 bridge sample used during grilling; productize via the generator rather than shipping `tmp` as the user-facing surface.
- Grilled product defaults: full single-file download; runtime multi-exe allowlist; advanced-only collapsible UI; persist mappings; reset-all excludes AHK mappings; drift hint only when panel expanded.
- Optional later: ADR for “AHK bridge over Native Messaging” if the trade-off should be frozen in `docs/adr/`.
- Glossary: `CONTEXT.md` (Command, External hotkey, AHK bridge script, Bridge toggle hotkey).
- Bridge toggle hotkey grilled defaults: optional; above mapping list; Clear AHK mappings clears it; Reset all does not; bidirectional External collision forbid; high-collision confirm; download still needs ≥1 complete mapping row; no toggle-only drift hint.
