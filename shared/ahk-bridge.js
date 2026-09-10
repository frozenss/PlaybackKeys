/**
 * Pure AHK bridge generator + settings helpers:
 * External hotkey mappings + Command shortcut snapshot → eligibility, skip
 * info, drift, and AutoHotkey v2 script text (#13); optional Bridge toggle
 * hotkey embedding (#21); Windows gating and clear/reset storage policy for
 * the companion panel (#16).
 * No DOM / chrome.*.
 */

/**
 * @typedef {{ commandId: string, ahkHotkey: string, label?: string }} ExternalHotkeyMapping
 * @typedef {Record<string, string>} CommandShortcutSnapshot
 *
 * @typedef {{
 *   eligible: boolean,
 *   skippedUnbound: Array<{ commandId: string, ahkHotkey: string, label?: string }>,
 *   drift: boolean,
 *   scriptText: string,
 * }} AhkBridgeGenerateResult
 *
 * @typedef {{
 *   userAgentDataPlatform?: string,
 *   platform?: string,
 *   userAgent?: string,
 * }} PlatformSignals
 */

/** chrome.storage.local keys for AHK bridge companion state (not playback defaults). */
export const AHK_BRIDGE_STORAGE = Object.freeze({
  externalMappings: "ahkExternalMappings",
  lastChordSnapshot: "ahkLastChordSnapshot",
  driftDismissedFingerprint: "ahkDriftDismissedFingerprint",
  bridgeToggleHotkey: "ahkBridgeToggleHotkey",
});

/**
 * @returns {string[]}
 */
export function ahkBridgeStorageKeys() {
  return Object.values(AHK_BRIDGE_STORAGE);
}

/**
 * Storage patch that clears External hotkey mappings and related bridge snapshot state.
 * Used by the explicit "Clear AHK mappings" control — not by Reset all to defaults.
 *
 * @returns {Record<string, [] | null | string>}
 *   Clears External hotkey mappings, generate snapshot state, and Bridge toggle hotkey.
 */
export function clearedAhkBridgeStorage() {
  return {
    [AHK_BRIDGE_STORAGE.externalMappings]: [],
    [AHK_BRIDGE_STORAGE.lastChordSnapshot]: null,
    [AHK_BRIDGE_STORAGE.driftDismissedFingerprint]: "",
    [AHK_BRIDGE_STORAGE.bridgeToggleHotkey]: "",
  };
}

/**
 * True when a reset-all patch leaves AHK bridge companion keys untouched.
 *
 * @param {Record<string, unknown> | null | undefined} patch
 * @returns {boolean}
 */
export function resetPatchOmitsAhkBridgeStorage(patch) {
  if (!patch || typeof patch !== "object") return true;
  return ahkBridgeStorageKeys().every(
    (key) => !Object.prototype.hasOwnProperty.call(patch, key),
  );
}

/**
 * Detect Windows for AHK bridge panel gating from normal web platform signals.
 * Unknown / empty signals → false so non-Windows (and uncertain) hosts only see
 * the muted Windows-only note, not the full configurator.
 *
 * @param {PlatformSignals} [signals]
 * @returns {boolean}
 */
export function isWindowsPlatform(signals = {}) {
  const uaData = String(signals.userAgentDataPlatform || "").trim();
  if (uaData) {
    if (/win/i.test(uaData)) return true;
    if (/mac|iphone|ipad|ipod|linux|android|cros|chrome\s*os/i.test(uaData)) {
      return false;
    }
  }

  const platform = String(signals.platform || "").trim();
  if (platform) {
    if (/win/i.test(platform)) return true;
    if (/mac|iphone|ipad|ipod|linux|android|cros/i.test(platform)) return false;
  }

  const userAgent = String(signals.userAgent || "");
  if (/Windows/i.test(userAgent)) return true;
  return false;
}

const MODIFIER_TO_AHK = Object.freeze({
  ctrl: "^",
  control: "^",
  macctrl: "^",
  shift: "+",
  alt: "!",
  option: "!",
  win: "#",
  meta: "#",
  command: "#",
  cmd: "#",
});

// Match common AHK examples in the tmp bridge sample: ^!+ then key (e.g. "!+F1", "^!F2").
const AHK_MODIFIER_ORDER = ["^", "!", "+", "#"];

/**
 * Encode a chrome.commands shortcut string into an AHK SendInput chord.
 * Example: "Ctrl+Shift+1" → "^+1"
 *
 * @param {string} chromeShortcut
 * @returns {string}
 */
function chromeShortcutToAhkSend(chromeShortcut) {
  const raw = String(chromeShortcut || "").trim();
  if (!raw) return "";

  const parts = raw.includes("+")
    ? raw.split("+").map((p) => p.trim()).filter(Boolean)
    : [raw];

  const mods = new Set();
  const keys = [];
  for (const part of parts) {
    const ahkMod = MODIFIER_TO_AHK[part.toLowerCase()];
    if (ahkMod) {
      mods.add(ahkMod);
    } else {
      keys.push(part);
    }
  }

  let encoded = "";
  for (const mod of AHK_MODIFIER_ORDER) {
    if (mods.has(mod)) encoded += mod;
  }
  // Chrome key tokens are usually single keys (digit, letter, F-key name).
  encoded += keys.join("");
  return encoded;
}

function shortcutOf(commandShortcuts, commandId) {
  const value = commandShortcuts?.[commandId];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Normalize one External hotkey mapping to the generator input shape.
 * Shared with options persistence so storage and download use one contract.
 *
 * @param {unknown} mapping
 * @returns {{ commandId: string, ahkHotkey: string, label?: string } | null}
 */
export function normalizeExternalHotkeyMapping(mapping) {
  if (!mapping || typeof mapping !== "object") return null;
  const commandId = String(/** @type {{ commandId?: unknown }} */ (mapping).commandId || "");
  const ahkHotkey = String(/** @type {{ ahkHotkey?: unknown }} */ (mapping).ahkHotkey || "").trim();
  if (!commandId || !ahkHotkey) return null;
  const label = /** @type {{ label?: unknown }} */ (mapping).label;
  return {
    commandId,
    ahkHotkey,
    ...(label != null ? { label: String(label) } : {}),
  };
}

function hasPriorSnapshot(lastSnapshot) {
  return Boolean(
    lastSnapshot &&
      typeof lastSnapshot === "object" &&
      Object.keys(lastSnapshot).length > 0,
  );
}

/**
 * Generate AHK bridge download metadata and script text.
 *
 * @param {{
 *   mappings?: ExternalHotkeyMapping[],
 *   commandShortcuts?: CommandShortcutSnapshot,
 *   lastSnapshot?: CommandShortcutSnapshot | null,
 *   bridgeToggleHotkey?: string | null,
 * }} input
 * @returns {AhkBridgeGenerateResult}
 */
export function generateAhkBridge(input = {}) {
  const mappings = Array.isArray(input.mappings) ? input.mappings : [];
  const commandShortcuts =
    input.commandShortcuts && typeof input.commandShortcuts === "object"
      ? input.commandShortcuts
      : {};
  const bridgeToggleHotkey = normalizeBridgeToggleHotkey(input.bridgeToggleHotkey);

  if (mappings.length === 0) {
    return {
      eligible: false,
      skippedUnbound: [],
      drift: false,
      scriptText: "",
    };
  }

  /** @type {Array<{ commandId: string, ahkHotkey: string, label?: string, ahkSend: string }>} */
  const active = [];
  /** @type {Array<{ commandId: string, ahkHotkey: string, label?: string }>} */
  const skippedUnbound = [];

  for (const mapping of mappings) {
    const row = normalizeExternalHotkeyMapping(mapping);
    if (!row) continue;

    const chromeShortcut = shortcutOf(commandShortcuts, row.commandId);
    const ahkSend = chromeShortcutToAhkSend(chromeShortcut);
    if (!chromeShortcut || !ahkSend) {
      skippedUnbound.push(row);
      continue;
    }
    active.push({ ...row, ahkSend });
  }

  const eligible = active.length > 0;
  const scriptText = eligible ? buildScriptText(active, bridgeToggleHotkey) : "";
  const drift = detectDrift(mappings, commandShortcuts, input.lastSnapshot);

  return {
    eligible,
    skippedUnbound,
    drift,
    scriptText,
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeBridgeToggleHotkey(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Drift is true iff any mapped Command's current target chord differs from lastSnapshot.
 * No prior snapshot (missing / null / non-object / empty object) → false.
 *
 * @param {ExternalHotkeyMapping[]} mappings
 * @param {CommandShortcutSnapshot} commandShortcuts
 * @param {CommandShortcutSnapshot | null | undefined} lastSnapshot
 */
function detectDrift(mappings, commandShortcuts, lastSnapshot) {
  if (!hasPriorSnapshot(lastSnapshot)) return false;

  for (const mapping of mappings) {
    const row = normalizeExternalHotkeyMapping(mapping);
    if (!row) continue;

    const current = shortcutOf(commandShortcuts, row.commandId);
    const previous = shortcutOf(lastSnapshot, row.commandId);
    if (current !== previous) return true;
  }
  return false;
}

/**
 * @param {Array<{ commandId: string, ahkHotkey: string, label?: string, ahkSend: string }>} active
 * @param {string} [bridgeToggleHotkey]
 */
function buildScriptText(active, bridgeToggleHotkey = "") {
  const hotkeyLines = active
    .map((row) => {
      const comment = row.label ? ` ; ${row.label}` : ` ; ${row.commandId}`;
      return `${row.ahkHotkey}:: SendPlayback("${row.ahkSend}")${comment}`;
    })
    .join("\n");

  const togglePrefix = bridgeToggleHotkey
    ? `BridgeRemapsEnabled := true

; Bridge toggle hotkey stays global: it is outside the External hotkey remap #HotIf
; and is never disabled when remaps are off. On/off is in-memory only (resets on reload).
${bridgeToggleHotkey}:: {
    global BridgeRemapsEnabled
    BridgeRemapsEnabled := !BridgeRemapsEnabled
    TrayTip(BridgeRemapsEnabled ? "External hotkeys ON" : "External hotkeys OFF", "PlaybackKeys")
}

`
    : "";
  const remapHotIf = bridgeToggleHotkey
    ? "#HotIf HasUsableBrowserWindow() && BridgeRemapsEnabled"
    : "#HotIf HasUsableBrowserWindow()";

  return `#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent()

; PlaybackKeys AHK bridge script (generated)
; External hotkeys → SendInput of Command target chords.
; Do not WinActivate the browser; keep the current app focused.

SendMode "Input"
SetWorkingDir A_ScriptDir

${togglePrefix}; Only intercept External hotkeys while a usable supported browser window is known.
${remapHotIf}

${hotkeyLines}

#HotIf

LastBrowserHwnd := 0
SetTimer(TrackLastBrowserWindow, 100)
TrackLastBrowserWindow()

TrackLastBrowserWindow() {
    global LastBrowserHwnd
    try {
        hwnd := WinGetID("A")
        if IsSupportedBrowserWindow(hwnd) {
            LastBrowserHwnd := hwnd
        }
    } catch {
    }
}

HasUsableBrowserWindow() {
    global LastBrowserHwnd
    if IsSupportedBrowserWindow(LastBrowserHwnd)
        return true
    for exe in ["chrome.exe", "msedge.exe", "brave.exe", "chromium.exe"] {
        for hwnd in WinGetList("ahk_exe " exe) {
            if IsSupportedBrowserWindow(hwnd) {
                LastBrowserHwnd := hwnd
                return true
            }
        }
    }
    LastBrowserHwnd := 0
    return false
}

IsSupportedBrowserWindow(hwnd) {
    if !hwnd
        return false
    try {
        if !WinExist("ahk_id " hwnd)
            return false
        processName := StrLower(WinGetProcessName("ahk_id " hwnd))
        ; Runtime allowlist. To add Opera/Vivaldi/etc, append another exe name below
        ; and also add it to the HasUsableBrowserWindow() loop above.
        return processName = "chrome.exe"
            || processName = "msedge.exe"
            || processName = "brave.exe"
            || processName = "chromium.exe"
    } catch {
        return false
    }
}

SendPlayback(targetShortcut) {
    if !HasUsableBrowserWindow()
        return
    ; Do NOT WinActivate the browser — SendInput injects the Command chord globally.
    SendInput(targetShortcut)
}
`;
}
