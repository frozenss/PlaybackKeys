/** Skip burst cumulative toast accounting (ADR-0003). */

export const SKIP_BURST_WINDOW_MS = 2000;

/**
 * Apply one relative skip to Skip burst state.
 * Toast shows intended cumulative seconds (press count × interval), not clamped displacement.
 *
 * @param {null | { intervalIndex: number, sign: number, count: number, lastAt: number }} state
 * @param {{ intervalIndex: number, sign: number, intervalSeconds: number, now: number, toastDurationMs: number }} input
 */
export function applySkipToBurst(state, input) {
  const intervalIndex = input.intervalIndex;
  const sign = input.sign;
  const intervalSeconds = input.intervalSeconds;
  const now = input.now;
  const toastDurationMs = input.toastDurationMs;

  const matches =
    state &&
    state.intervalIndex === intervalIndex &&
    state.sign === sign &&
    now - state.lastAt <= SKIP_BURST_WINDOW_MS;

  const count = matches ? state.count + 1 : 1;
  const next = { intervalIndex, sign, count, lastAt: now };
  const intendedSeconds = count * intervalSeconds;
  const plusMinus = sign >= 0 ? "+" : "−";
  const ic = sign >= 0 ? "»" : "«";
  const hideMs = Math.max(SKIP_BURST_WINDOW_MS, Number(toastDurationMs) || 0);

  return {
    state: next,
    intendedSeconds,
    toast: { ic, name: `${plusMinus}${intendedSeconds}s`, det: "" },
    hideMs,
  };
}

/** End the current Skip burst (non-skip Command). Absolute seek must not call this. */
export function clearSkipBurst() {
  return null;
}
