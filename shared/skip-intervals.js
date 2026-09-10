/** Skip interval defaults, storage migration, and Command → seek mapping (ADR-0002 / ADR-0004). */

export const SKIP_INTERVAL_DEFAULTS = Object.freeze([5, 10, 30]);
export const SKIP_INTERVAL_COUNT = 3;
export const SKIP_INTERVAL_PRESETS = Object.freeze([2, 5, 10, 15, 30]);

/** Six Skip Commands in product order (ADR-0004 zero-padded ids). */
export const SKIP_COMMAND_IDS = Object.freeze([
  "06-skip-back",
  "07-skip-forward",
  "08-skip-back-2",
  "09-skip-forward-2",
  "10-skip-back-3",
  "11-skip-forward-3",
]);

/** Back/forward Command id pairs per Skip interval slot. */
export const SKIP_INTERVAL_COMMAND_PAIRS = Object.freeze([
  Object.freeze(["06-skip-back", "07-skip-forward"]),
  Object.freeze(["08-skip-back-2", "09-skip-forward-2"]),
  Object.freeze(["10-skip-back-3", "11-skip-forward-3"]),
]);

const SKIP_COMMAND_MAP = Object.freeze({
  "06-skip-back": { index: 0, sign: -1 },
  "07-skip-forward": { index: 0, sign: 1 },
  "08-skip-back-2": { index: 1, sign: -1 },
  "09-skip-forward-2": { index: 1, sign: 1 },
  "10-skip-back-3": { index: 2, sign: -1 },
  "11-skip-forward-3": { index: 2, sign: 1 },
});

function clampIntervalSeconds(value, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

/**
 * Normalize stored settings into three Skip interval seconds.
 * Legacy `seekSeconds` migrates to interval 1; intervals 2/3 default to 10/30.
 */
export function normalizeSkipIntervals(stored = {}) {
  const defaults = SKIP_INTERVAL_DEFAULTS;
  let raw;
  if (Array.isArray(stored?.skipIntervals)) {
    raw = stored.skipIntervals;
  } else if (stored && stored.seekSeconds != null) {
    raw = [stored.seekSeconds, defaults[1], defaults[2]];
  } else {
    raw = defaults;
  }

  return Array.from({ length: SKIP_INTERVAL_COUNT }, (_, i) =>
    clampIntervalSeconds(raw[i], defaults[i]),
  );
}

/** Parse a skip Command id into Skip interval index and direction sign. */
export function parseSkipCommand(command) {
  const skip = SKIP_COMMAND_MAP[command];
  return skip ? { index: skip.index, sign: skip.sign } : null;
}

/**
 * Map a chrome.commands id to an in-page action payload.
 * Skip Commands use the matching Skip interval seconds; non-skip
 * Commands stay here so the service worker has one dispatch table.
 */
export function commandToAction(command, settings) {
  const intervals = normalizeSkipIntervals(settings);
  const skip = parseSkipCommand(command);
  if (skip) {
    return { action: "seek", delta: skip.sign * intervals[skip.index] };
  }

  const speedOpts = {
    min: settings.speedMin,
    max: settings.speedMax,
    wrap: settings.wrapSpeed,
  };
  switch (command) {
    case "01-play-pause":
      return { action: "toggle" };
    case "02-speed-up":
      return { action: "speed", delta: settings.speedStep, ...speedOpts };
    case "03-speed-down":
      return { action: "speed", delta: -settings.speedStep, ...speedOpts };
    case "04-speed-reset":
      return { action: "speed", reset: true };
    default:
      return null;
  }
}
