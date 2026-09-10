/**
 * Zero-padded Command ids in product order (ADR-0004 / #20).
 * Non-Skip Commands first, then Skip back/forward for intervals 1–3.
 */

/** @type {readonly string[]} */
export const COMMAND_IDS = Object.freeze([
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
]);

/** Pre-ADR-0004 ids → current zero-padded ids. */
export const LEGACY_COMMAND_ID_MAP = Object.freeze({
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
});

const CURRENT_IDS = new Set(COMMAND_IDS);

/**
 * Map a stored Command id to the current id, or null if orphaned.
 * @param {unknown} commandId
 * @returns {string | null}
 */
export function migrateCommandId(commandId) {
  const id = typeof commandId === "string" ? commandId : "";
  if (!id) return null;
  if (Object.prototype.hasOwnProperty.call(LEGACY_COMMAND_ID_MAP, id)) {
    return LEGACY_COMMAND_ID_MAP[id];
  }
  if (CURRENT_IDS.has(id)) return id;
  return null;
}

/**
 * Remap External hotkey mappings to current Command ids; drop orphans.
 * First occurrence of a target id wins when legacy and current collide.
 *
 * @param {unknown} raw
 * @returns {Array<{ commandId: string, ahkHotkey: string, label?: string }>}
 */
export function migrateAhkExternalMappings(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Array<{ commandId: string, ahkHotkey: string, label?: string }>} */
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const nextId = migrateCommandId(/** @type {{ commandId?: unknown }} */ (row).commandId);
    if (!nextId || seen.has(nextId)) continue;
    const ahkHotkey = String(/** @type {{ ahkHotkey?: unknown }} */ (row).ahkHotkey || "");
    if (!ahkHotkey) continue;
    seen.add(nextId);
    const label = /** @type {{ label?: unknown }} */ (row).label;
    /** @type {{ commandId: string, ahkHotkey: string, label?: string }} */
    const next = { commandId: nextId, ahkHotkey };
    if (typeof label === "string" && label) next.label = label;
    out.push(next);
  }
  return out;
}

/**
 * Remap chord-snapshot keys to current Command ids; drop orphans.
 * @param {unknown} raw
 * @returns {Record<string, string> | null}
 */
export function migrateChordSnapshot(raw) {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  /** @type {Record<string, string>} */
  const out = {};
  for (const [commandId, shortcut] of Object.entries(raw)) {
    const nextId = migrateCommandId(commandId);
    if (!nextId || Object.prototype.hasOwnProperty.call(out, nextId)) continue;
    out[nextId] = typeof shortcut === "string" ? shortcut : "";
  }
  return out;
}

/**
 * Migrate AHK bridge companion storage fields in one pass.
 *
 * @param {{
 *   ahkExternalMappings?: unknown,
 *   ahkLastChordSnapshot?: unknown,
 * }} [stored]
 * @returns {{
 *   changed: boolean,
 *   externalMappings: Array<{ commandId: string, ahkHotkey: string, label?: string }>,
 *   lastChordSnapshot: Record<string, string> | null,
 * }}
 */
export function migrateAhkBridgeStoredState(stored = {}) {
  const externalMappings = migrateAhkExternalMappings(stored.ahkExternalMappings);
  const lastChordSnapshot = migrateChordSnapshot(stored.ahkLastChordSnapshot);

  const rawMappings = Array.isArray(stored.ahkExternalMappings) ? stored.ahkExternalMappings : [];
  const mappingsChanged = JSON.stringify(rawMappings) !== JSON.stringify(externalMappings);

  const rawSnapshot = stored.ahkLastChordSnapshot;
  let snapshotChanged = false;
  if (rawSnapshot == null && lastChordSnapshot == null) {
    snapshotChanged = false;
  } else if (rawSnapshot == null || lastChordSnapshot == null) {
    snapshotChanged = true;
  } else {
    snapshotChanged = JSON.stringify(rawSnapshot) !== JSON.stringify(lastChordSnapshot);
  }

  return {
    changed: mappingsChanged || snapshotChanged,
    externalMappings,
    lastChordSnapshot,
  };
}
