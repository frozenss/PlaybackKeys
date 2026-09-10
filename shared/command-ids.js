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
 * @param {unknown} row
 * @returns {{ commandId: string, ahkHotkey: string, label?: string } | null}
 */
function normalizeMappingRow(row) {
  if (!row || typeof row !== "object") return null;
  const nextId = migrateCommandId(/** @type {{ commandId?: unknown }} */ (row).commandId);
  if (!nextId) return null;
  const ahkHotkey = String(/** @type {{ ahkHotkey?: unknown }} */ (row).ahkHotkey || "");
  if (!ahkHotkey) return null;
  const label = /** @type {{ label?: unknown }} */ (row).label;
  /** @type {{ commandId: string, ahkHotkey: string, label?: string }} */
  const next = { commandId: nextId, ahkHotkey };
  if (typeof label === "string" && label) next.label = label;
  return next;
}

/**
 * Remap External hotkey mappings to current Command ids; drop orphans.
 * Already-current rows win over legacy rows that map to the same id.
 *
 * @param {unknown} raw
 * @returns {Array<{ commandId: string, ahkHotkey: string, label?: string }>}
 */
export function migrateAhkExternalMappings(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Map<string, { commandId: string, ahkHotkey: string, label?: string }>} */
  const byId = new Map();

  // Pass 1: keep rows that already use current ids.
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rawId = String(/** @type {{ commandId?: unknown }} */ (row).commandId || "");
    if (!CURRENT_IDS.has(rawId) || byId.has(rawId)) continue;
    const normalized = normalizeMappingRow(row);
    if (normalized) byId.set(normalized.commandId, normalized);
  }

  // Pass 2: migrate legacy ids only when the target is still empty.
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rawId = String(/** @type {{ commandId?: unknown }} */ (row).commandId || "");
    if (CURRENT_IDS.has(rawId)) continue;
    const normalized = normalizeMappingRow(row);
    if (!normalized || byId.has(normalized.commandId)) continue;
    byId.set(normalized.commandId, normalized);
  }

  return [...byId.values()];
}

/**
 * Remap chord-snapshot keys to current Command ids; drop orphans.
 * Already-current keys win over legacy keys that map to the same id.
 * @param {unknown} raw
 * @returns {Record<string, string> | null}
 */
export function migrateChordSnapshot(raw) {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  /** @type {Record<string, string>} */
  const out = {};
  for (const [commandId, shortcut] of Object.entries(raw)) {
    if (!CURRENT_IDS.has(commandId)) continue;
    out[commandId] = typeof shortcut === "string" ? shortcut : "";
  }
  for (const [commandId, shortcut] of Object.entries(raw)) {
    if (CURRENT_IDS.has(commandId)) continue;
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
