# Multiple Skip intervals and Skip burst toast

Canonical tracker entry: https://github.com/frozenss/PlaybackKeys/issues/9  
Keep this repo copy and the issue body in sync if either is edited.

## Problem Statement

When skipping with global Commands, each press only toasts that press’s delta (for example `+5s`). Rapid presses do not show how far the whole run moved, so it is hard to know whether three taps were enough. PlaybackKeys also exposes only one Skip interval shared by skip back and skip forward. Users who want both a fine nudge and a coarse jump need multiple intervals, each with its own chords.

## Solution

Ship three Skip intervals (symmetric ±N each). Interval defaults are 5 / 10 / 30 seconds; existing `seekSeconds` migrates to interval 1. Enhance the existing toast so a Skip burst shows intended cumulative seconds. Follow ADR-0002 and ADR-0003. Use glossary terms from `CONTEXT.md` (Command, Skip interval, Skip burst, Controllable video).

## User Stories

1. As a user, I want three Skip intervals with independent skip-back and skip-forward Commands, so that I can bind both a short nudge and a longer jump.
2. As a new install, I want defaults of 5s, 10s, and 30s, so that multi-interval skipping works before I open options.
3. As an existing user who customized `seekSeconds`, I want that value to become interval 1, so that my muscle memory and setting are not reset to 5 if I had changed it.
4. As an existing user, I want interval 1 to keep Command ids `3-skip-back` and `4-skip-forward`, so that chords I already bound in Chrome keep working.
5. As a user opening Chrome’s shortcut settings, I want slot labels “Skip back 1/2/3” and “Skip forward 1/2/3”, so that static descriptions stay honest when I change seconds.
6. As a user who never binds intervals 2 and 3, I want those Commands to simply do nothing until bound, so that I do not need a separate “disable interval” switch.
7. As a user in options, I want one row per Skip interval with its seconds control and read-only chord display, so that seconds and keys sit together.
8. As a user of the popup, I want only interval 1’s skip buttons, so that the popup stays compact while extra intervals stay keyboard-first.
9. As a user who rapidly presses the same skip-forward Command, I want the toast to show cumulative intended seconds (for example three 10s presses → `+30s`), so that I know how far the Skip burst asked to jump.
10. As a user who waits about two seconds without another matching skip, I want the next skip to start a new Skip burst at one interval, so that unrelated later skips do not keep adding.
11. As a user who switches from interval 1 forward to interval 2 forward inside the window, I want a new Skip burst starting at interval 2’s size, so that totals are not mixed across intervals.
12. As a user who presses the opposite direction inside the window, I want the previous Skip burst cleared and a new one started, so that forward and back do not net in one number.
13. As a user who presses play/pause, speed, reset, or switch-target during a Skip burst, I want that burst cleared, so that leaving “skip mode” does not leave a surprise running total.
14. As a user whose video clamps at the start or end, I want the toast to keep showing intended cumulative seconds, so that the readout matches presses × interval rather than clamped displacement.
15. As a user with toast duration set below 2s, I want a live Skip burst’s toast to remain visible for at least the 2000ms burst window (via max(2000ms, toastDurationMs) from the last matching skip), so that the cumulative number does not vanish mid-burst.
16. As a user who disabled toasts, I want skips to still seek with no toast and no alternate overlay, so that feedback prefs stay consistent.
17. As a user who holds a chord, I do not require dedicated hold-to-repeat behavior; rapid repeated Command fires are enough for Skip burst accumulation.
18. As a user dragging the popup scrubber (absolute seek), I want that seek neither to join nor to clear a Skip burst, so that absolute scrubbing stays out of burst accounting.
19. As a user on Bilibili or a generic Built-in / Opt-in page, I want Skip burst toast behavior to match, so that site adapters do not invent a second feedback model.
20. As a maintainer, I want ADR-0002 and ADR-0003 to record why commands are static and why toast cumulative rules look this way, so that later renames or overlay rewrites are deliberate.

## Implementation Decisions

- Manifest: keep `3-skip-back` / `4-skip-forward` for interval 1; add `8-skip-back-2` / `9-skip-forward-2` / `10-skip-back-3` / `11-skip-forward-3`. All global.
- i18n command descriptions: Skip back/forward 1/2/3 (slot names only).
- Settings: replace the single `seekSeconds` product surface with three symmetric interval values (storage may migrate `seekSeconds` → interval 1). Defaults `[5, 10, 30]`. Presets may stay `[2, 5, 10, 15, 30]` plus custom ≥ 1s per row.
- `commandToAction` (and popup interval-1 buttons) map each skip Command to `{ action: "seek", delta: ±intervalSeconds }`.
- Skip burst state: same Skip interval + same direction; window 2000ms since last matching skip; toast shows intended cumulative `|delta| * count` with existing `«`/`»` and `+`/`−` styling.
- End burst on: opposite direction, different Skip interval, or any non-skip Command. Absolute seek does not join or clear.
- Toast visibility while bursting: refresh on each matching skip; schedule hide with `max(2000, toastDurationMs)` (and still honor `showToast` / duration off).
- Options: one “Skip intervals” group, three rows (seconds + read-only shortcuts + link to Chrome shortcut settings as today).
- Popup: only interval 1 skip controls; labels show that interval’s seconds.
- No per-interval enable flag; no YouTube side overlay in this scope; no dedicated hold-to-repeat loop.
- Respect ADR-0002 and ADR-0003.

## Testing Decisions

Observe external behavior only: after Command payloads, Controllable video time changes by the expected delta (clamped by media bounds), and toast text shows the expected cumulative intended seconds when toasts are enabled.

Cover at least:

- Single skip on each of the three intervals shows one-interval toast and seeks ± that interval.
- Three rapid same-Command forwards within 2000ms toast `+3N` and seek `+3N` (when not clamped).
- Waiting >2000ms between presses starts a new burst (`+N`, not `+2N`).
- Switching interval or direction resets the visible cumulative total.
- A non-skip Command between skips prevents the next skip from continuing the prior total.
- Clamped end: presses still report intended cumulative toast while `currentTime` stops at the bound.
- `showToast: false` seeks without toast.
- Migration: stored `seekSeconds: 15` becomes interval 1 = 15 with intervals 2/3 at defaults 10/30 (unless product code defines a clearer migration; document the chosen rule in the PR if it differs only in unused slots).
- Regression: play/pause, speed, badge, Bilibili adapter seek still function; interval 1 Command ids unchanged.

Prefer unit/adapter-level tests for burst accounting and toast payload; use existing Playwright smoke patterns for one extension-level seek if already cheap. Do not depend on live YouTube/Bilibili.

## Out of Scope

YouTube-style left/right overlay, configurable burst window, asymmetric forward/back seconds within one interval, more than three intervals, in-extension key capture / hold-to-repeat, renaming interval 1 Command ids, popup buttons for intervals 2/3, per-interval enable flags, changing absolute-seek toast policy beyond “no join / no clear”.

## Further Notes

- Glossary: `CONTEXT.md` (Command, Skip interval, Skip burst).
- ADRs: `docs/adr/0002-static-skip-interval-commands.md`, `docs/adr/0003-skip-burst-cumulative-toast.md`.
- Grilled defaults confirmed: burst window 2000ms; toast appearance unchanged except cumulative N; popup scrubber absolute seek excluded from burst state.
