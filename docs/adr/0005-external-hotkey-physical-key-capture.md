# External hotkey capture binds physical keys, not layout characters

External hotkey (and Bridge toggle hotkey) recording must produce AutoHotkey v2 hotkey lines that still work when the user’s keyboard layout or IME changes what `event.key` types. We bind the **physical key** (prefer `KeyboardEvent.code` → AHK key / symbol), not the produced character. Layout glyphs such as `·` on Period are recorded as that OEM key (e.g. `.`), never as a literal `·::` hotkey. Stored `ahkHotkey` strings are **embed-safe** AHK syntax (capture escapes `;` and `` ` ``), so the generator can keep concatenating hotkey lines without a second escaping pass. Friendly `label` stays human-readable symbols.

**Status:** accepted

This supersedes the accidental v1 gap where OEM punctuation (`` ` ``, `.`, `,`, `-`, `=`, `;`, `/`, brackets, quote, backslash, …) returned “unknown” and was **silently ignored**. That omission was an incomplete allowlist, not a product trade-off.

## Considered options

- **Bind `event.key` (produced character).** Rejected: breaks across layouts/IME; `·` and similar glyphs are not stable AHK hotkey names.
- **Store raw symbols; escape only when generating the `.ahk` file.** Rejected: today’s generator embeds `ahkHotkey` verbatim; a second escaping seam would drift from capture tests and from hand-readable storage expectations.
- **Keep ignoring main-keyboard punctuation.** Rejected: no ADR/spec rationale; power users remap those keys; AHK can represent them once escaped correctly.
- **Also ship media / lock / system keys in the same change.** Deferred: separate product surface (OS/browser often owns them); not the gap users hit. Mouse stays out of scope per the AHK bridge spec.

## Consequences

- Capture allowlist grows to main-keyboard OEM punctuation with a known AHK mapping via `event.code`; numpad (including NumLock) remains as today.
- `Intl*` codes without a fixed AHK key name stay unsupported—no `event.key` fallback (would violate physical-key binding).
- Still rejected on purpose: modifier-only, key repeat, Escape (cancel recording), Dead / IME / `Unidentified`, mouse; media / browser / lock / system keys other than the existing numpad set remain deferred.
- High-collision one-shot confirm extends to common typing punctuation (same Ctrl/Alt/Win suppression rule as letters/digits).
- Unmapped keys that look like real presses get a short “unsupported” tip while recording stays open; modifier-only and repeat stay silent.
- Spec: `docs/specs/ahk-bridge-external-hotkeys.md` (Recording UX). Implementation seam remains `shared/external-hotkey.js`.
