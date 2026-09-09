# Skip burst cumulative toast

Relative skip feedback uses the existing in-page toast, not a YouTube-style left/right overlay. Rapid same-direction skips on one Skip interval form a Skip burst: the toast shows intended cumulative seconds (press count × that interval). The burst window is a fixed 2000ms since the last matching skip. A different Skip interval, the opposite direction, or any non-skip Command ends the burst. Hide timing is max(2000ms, toastDurationMs); if toasts are off, there is no readout and no special hold-to-repeat path.

**Status:** accepted

## Considered options

- **YouTube-style side overlay.** Rejected for v1: the toast pipeline and prefs already exist; cumulative semantics matter more than matching mobile chrome.
- **Merge any same-direction skip across intervals.** Rejected: multi-interval chords would produce opaque totals.
- **Show actual timeline displacement (clamped).** Rejected: the readout answers “how much did I ask to skip,” like YouTube’s tap counter.
- **Configurable merge window.** Rejected: one more rarely tuned pref; ~2s matches common YouTube double-tap recreations.
- **Dedicated hold-to-repeat seeking.** Rejected: global Commands do not reliably re-fire on key hold; rapid press is the contract.

## Consequences

- Toast copy stays `«`/`»` plus `+Ns`/`−Ns`; N becomes the burst total while a Skip burst is live.
- Absolute seeks (popup scrubber) neither join nor clear a Skip burst.
- Popup relative skip still uses interval 1 and therefore can extend or start that interval’s burst.
