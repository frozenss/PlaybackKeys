# Static Skip interval Commands

Chrome's `commands` API only accepts chords declared in the manifest, so PlaybackKeys always registers three Skip intervals (six skip Commands) even when some are unbound. Interval 1 keeps the existing `3-skip-back` / `4-skip-forward` ids so already-bound user shortcuts survive; intervals 2 and 3 use `8-skip-back-2` / `9-skip-forward-2` and `10-skip-back-3` / `11-skip-forward-3`. Chrome shortcut labels are slot-based ("Skip back 1", …), not second values, because command descriptions are static.

**Status:** accepted

## Considered options

- **One configurable pair only.** Rejected: the product needs multiple jump sizes with independent chords.
- **Dynamically add/remove commands.** Rejected: not supported by `chrome.commands`; chords must be manifest-declared.
- **Rename interval 1 into a symmetric id scheme.** Rejected: renames silently drop existing user bindings.
- **Per-interval enable flags.** Rejected: unbound chords already mean "unused"; an extra off switch fights Chrome's binding state.
- **Role names in Chrome (Short/Medium/Long).** Rejected: users can set any seconds per slot, so role names lie.

## Consequences

- Manifest always ships eleven Commands (five non-skip + six skip).
- Options configure three symmetric second values; defaults 5 / 10 / 30. Existing `seekSeconds` migrates to interval 1.
- Popup skip buttons stay on interval 1 only.
- Options show one row per Skip interval (seconds + read-only chord), with binding still in `chrome://extensions/shortcuts`.
