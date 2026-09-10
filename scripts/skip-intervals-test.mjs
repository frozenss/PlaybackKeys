/**
 * Unit tests for Skip interval settings migration and command → seek mapping (#10).
 * Seam: shared/skip-intervals.js (normalizeSkipIntervals, commandToAction).
 */
import {
  SKIP_INTERVAL_DEFAULTS,
  normalizeSkipIntervals,
  commandToAction,
  parseSkipCommand,
  SKIP_COMMAND_IDS,
} from "../shared/skip-intervals.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${message}: expected ${e}, got ${a}`);
}

// --- Migration / normalize ---

assertDeepEqual(
  normalizeSkipIntervals({}),
  [5, 10, 30],
  "empty storage uses defaults 5/10/30",
);

assertDeepEqual(
  normalizeSkipIntervals({ seekSeconds: 15 }),
  [15, 10, 30],
  "legacy seekSeconds: 15 becomes interval 1; 2/3 stay defaults",
);

assertDeepEqual(
  normalizeSkipIntervals({ seekSeconds: 5 }),
  [5, 10, 30],
  "legacy seekSeconds: 5 becomes interval 1 at 5",
);

assertDeepEqual(
  normalizeSkipIntervals({ skipIntervals: [7, 12, 45] }),
  [7, 12, 45],
  "explicit skipIntervals wins",
);

assertDeepEqual(
  normalizeSkipIntervals({ skipIntervals: [7, 12, 45], seekSeconds: 99 }),
  [7, 12, 45],
  "skipIntervals wins over leftover seekSeconds",
);

assertDeepEqual(
  normalizeSkipIntervals({ skipIntervals: [0, -3, 2.7] }),
  [5, 10, 3],
  "invalid slots fall back to defaults; fractional rounds",
);

assertDeepEqual(
  normalizeSkipIntervals({ skipIntervals: [2] }),
  [2, 10, 30],
  "short array pads with defaults",
);

assertDeepEqual(
  SKIP_INTERVAL_DEFAULTS,
  [5, 10, 30],
  "exported defaults are 5/10/30",
);

// --- commandToAction ---

const settings = { skipIntervals: [5, 10, 30], speedStep: 0.25, speedMin: 0.25, speedMax: 4, wrapSpeed: false };

assertDeepEqual(
  commandToAction("3-skip-back", settings),
  { action: "seek", delta: -5 },
  "interval 1 back uses skipIntervals[0]",
);
assertDeepEqual(
  commandToAction("4-skip-forward", settings),
  { action: "seek", delta: 5 },
  "interval 1 forward uses skipIntervals[0]",
);
assertDeepEqual(
  commandToAction("8-skip-back-2", settings),
  { action: "seek", delta: -10 },
  "interval 2 back uses skipIntervals[1]",
);
assertDeepEqual(
  commandToAction("9-skip-forward-2", settings),
  { action: "seek", delta: 10 },
  "interval 2 forward uses skipIntervals[1]",
);
assertDeepEqual(
  commandToAction("10-skip-back-3", settings),
  { action: "seek", delta: -30 },
  "interval 3 back uses skipIntervals[2]",
);
assertDeepEqual(
  commandToAction("11-skip-forward-3", settings),
  { action: "seek", delta: 30 },
  "interval 3 forward uses skipIntervals[2]",
);

const custom = { ...settings, skipIntervals: [3, 8, 20] };
assertDeepEqual(
  commandToAction("9-skip-forward-2", custom),
  { action: "seek", delta: 8 },
  "custom interval 2 seconds are used",
);

assert(
  commandToAction("1-play-pause", settings)?.action === "toggle",
  "play/pause still maps",
);
assert(
  commandToAction("unknown-cmd", settings) === null,
  "unknown command returns null",
);

assertDeepEqual(
  SKIP_COMMAND_IDS,
  [
    "3-skip-back",
    "4-skip-forward",
    "8-skip-back-2",
    "9-skip-forward-2",
    "10-skip-back-3",
    "11-skip-forward-3",
  ],
  "six skip Command ids are exported",
);

assertDeepEqual(
  parseSkipCommand("9-skip-forward-2"),
  { index: 1, sign: 1 },
  "parseSkipCommand maps interval 2 forward",
);
assert(parseSkipCommand("1-play-pause") === null, "parseSkipCommand ignores non-skip");

console.log("skip-intervals unit tests passed.");
