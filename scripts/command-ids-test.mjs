/**
 * Unit tests for zero-padded Command ids and AHK storage migration (#20 / ADR-0004).
 * Seam: shared/command-ids.js (+ manifest command name set/order).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMAND_IDS,
  LEGACY_COMMAND_ID_MAP,
  migrateCommandId,
  migrateAhkExternalMappings,
  migrateChordSnapshot,
  migrateAhkBridgeStoredState,
} from "../shared/command-ids.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${message}: expected ${e}, got ${a}`);
}

// --- Product order: non-Skip, then Skip 1–3 as one block ---

assertDeepEqual(
  COMMAND_IDS,
  [
    "01-play-pause",
    "02-speed-up",
    "03-speed-down",
    "04-speed-reset",
    "05-switch-target",
    "06-skip-back",
    "07-skip-forward",
    "08-skip-back-2",
    "09-skip-forward-2",
    "10-skip-back-3",
    "11-skip-forward-3",
  ],
  "COMMAND_IDS are zero-padded product order",
);

{
  const sorted = [...COMMAND_IDS].sort((a, b) => a.localeCompare(b));
  assertDeepEqual(sorted, [...COMMAND_IDS], "COMMAND_IDS match lexicographic / Chrome shortcuts sort");
}

// --- Legacy → current id map ---

assertDeepEqual(
  LEGACY_COMMAND_ID_MAP,
  {
    "1-play-pause": "01-play-pause",
    "2-speed-up": "02-speed-up",
    "5-speed-down": "03-speed-down",
    "6-speed-reset": "04-speed-reset",
    "7-switch-target": "05-switch-target",
    "3-skip-back": "06-skip-back",
    "4-skip-forward": "07-skip-forward",
    "8-skip-back-2": "08-skip-back-2",
    "9-skip-forward-2": "09-skip-forward-2",
    "10-skip-back-3": "10-skip-back-3",
    "11-skip-forward-3": "11-skip-forward-3",
  },
  "legacy map covers every pre-ADR-0004 Command id",
);

assert(migrateCommandId("1-play-pause") === "01-play-pause", "migrates play-pause");
assert(migrateCommandId("5-speed-down") === "03-speed-down", "migrates speed-down to new slot");
assert(migrateCommandId("3-skip-back") === "06-skip-back", "migrates skip-back interval 1");
assert(migrateCommandId("10-skip-back-3") === "10-skip-back-3", "interval 3 back id stays");
assert(migrateCommandId("01-play-pause") === "01-play-pause", "current ids are identity");
assert(migrateCommandId("ghost-cmd") === null, "unknown / orphan ids become null");
assert(migrateCommandId("") === null, "empty id is orphan");

// --- External hotkey mappings migration ---

assertDeepEqual(
  migrateAhkExternalMappings([
    { commandId: "1-play-pause", ahkHotkey: "F13", label: "F13" },
    { commandId: "5-speed-down", ahkHotkey: "F17", label: "F17" },
    { commandId: "ghost-old", ahkHotkey: "F18", label: "F18" },
  ]),
  [
    { commandId: "01-play-pause", ahkHotkey: "F13", label: "F13" },
    { commandId: "03-speed-down", ahkHotkey: "F17", label: "F17" },
  ],
  "mappings remapped; orphans dropped",
);

assertDeepEqual(
  migrateAhkExternalMappings([
    { commandId: "01-play-pause", ahkHotkey: "F13", label: "F13" },
  ]),
  [{ commandId: "01-play-pause", ahkHotkey: "F13", label: "F13" }],
  "already-current mappings unchanged",
);

assertDeepEqual(
  migrateAhkExternalMappings([
    { commandId: "1-play-pause", ahkHotkey: "F13", label: "F13" },
    { commandId: "01-play-pause", ahkHotkey: "F99", label: "F99" },
  ]),
  [{ commandId: "01-play-pause", ahkHotkey: "F99", label: "F99" }],
  "already-current row wins when legacy and current collide",
);

assertDeepEqual(migrateAhkExternalMappings(null), [], "null mappings → []");
assertDeepEqual(migrateAhkExternalMappings("nope"), [], "non-array mappings → []");

// --- Chord snapshot migration ---

assertDeepEqual(
  migrateChordSnapshot({
    "1-play-pause": "Ctrl+Shift+1",
    "5-speed-down": "",
    "ghost": "Alt+1",
  }),
  {
    "01-play-pause": "Ctrl+Shift+1",
    "03-speed-down": "",
  },
  "snapshot keys remapped; orphans dropped",
);

assert(migrateChordSnapshot(null) === null, "null snapshot stays null");
assert(migrateChordSnapshot("x") === null, "invalid snapshot → null");

// --- Combined stored-state migration ---

{
  const result = migrateAhkBridgeStoredState({
    ahkExternalMappings: [
      { commandId: "3-skip-back", ahkHotkey: "F13", label: "F13" },
    ],
    ahkLastChordSnapshot: { "3-skip-back": "Ctrl+Shift+3" },
  });
  assert(result.changed === true, "legacy state reports changed");
  assertDeepEqual(
    result.externalMappings,
    [{ commandId: "06-skip-back", ahkHotkey: "F13", label: "F13" }],
    "combined migrate remaps mappings",
  );
  assertDeepEqual(
    result.lastChordSnapshot,
    { "06-skip-back": "Ctrl+Shift+3" },
    "combined migrate remaps snapshot",
  );
}

{
  const result = migrateAhkBridgeStoredState({
    ahkExternalMappings: [
      { commandId: "06-skip-back", ahkHotkey: "F13", label: "F13" },
    ],
    ahkLastChordSnapshot: { "06-skip-back": "Ctrl+Shift+3" },
  });
  assert(result.changed === false, "already-current state reports unchanged");
}

// --- Manifest matches product ids and Chrome lexicographic order ---

{
  const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
  const names = Object.keys(manifest.commands || {});
  assertDeepEqual(names, [...COMMAND_IDS], "manifest commands match COMMAND_IDS product order");
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assertDeepEqual(sorted, names, "manifest command names are lexicographically ordered");
  for (const legacy of Object.keys(LEGACY_COMMAND_ID_MAP)) {
    if (legacy === LEGACY_COMMAND_ID_MAP[legacy]) continue;
    assert(!Object.prototype.hasOwnProperty.call(manifest.commands, legacy), `legacy id gone from manifest: ${legacy}`);
  }
}

console.log("command-ids unit tests passed.");
