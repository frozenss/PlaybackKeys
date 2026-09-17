/**
 * Pure AHK bridge generator + settings helpers:
 * External hotkey mappings + Command shortcut snapshot → eligibility, skip
 * info, drift, and AutoHotkey v2 script text (#13); optional Bridge toggle
 * hotkey embedding (#21); Bridge toggle persist/normalize + External
 * collision helpers for the options recorder (#22); Windows gating and
 * clear/reset storage policy for the companion panel (#16); Browser gate
 * generate/persist + regenerate-needed when the gate drifts (#23); optional
 * self-elevate (*RunAs) embed default off + regenerate-needed (#24).
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
 *   browserGateChanged: boolean,
 *   selfElevateChanged: boolean,
 *   needsRegenerate: boolean,
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
  browserGate: "ahkBrowserGate",
  lastBrowserGate: "ahkLastBrowserGate",
  selfElevate: "ahkSelfElevate",
  lastSelfElevate: "ahkLastSelfElevate",
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
 * @returns {Record<string, [] | null | string | boolean>}
 *   Clears External hotkey mappings, generate snapshot state, and Bridge toggle hotkey;
 *   resets Browser gate to default on, self-elevate to default off, and clears
 *   last-download gate/self-elevate snapshots.
 */
export function clearedAhkBridgeStorage() {
  return {
    [AHK_BRIDGE_STORAGE.externalMappings]: [],
    [AHK_BRIDGE_STORAGE.lastChordSnapshot]: null,
    [AHK_BRIDGE_STORAGE.driftDismissedFingerprint]: "",
    [AHK_BRIDGE_STORAGE.bridgeToggleHotkey]: "",
    [AHK_BRIDGE_STORAGE.browserGate]: true,
    [AHK_BRIDGE_STORAGE.lastBrowserGate]: null,
    [AHK_BRIDGE_STORAGE.selfElevate]: false,
    [AHK_BRIDGE_STORAGE.lastSelfElevate]: null,
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

/**
 * Normalize Bridge toggle hotkey companion storage to a display/persist record.
 * Accepts legacy bare AHK strings and `{ ahkHotkey, label }` objects.
 *
 * @param {unknown} value
 * @returns {{ ahkHotkey: string, label: string } | null}
 */
export function normalizeBridgeToggleHotkeyRecord(value) {
  if (typeof value === "string") {
    const ahkHotkey = value.trim();
    return ahkHotkey ? { ahkHotkey, label: ahkHotkey } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ahkHotkey = String(/** @type {{ ahkHotkey?: unknown }} */ (value).ahkHotkey || "").trim();
  if (!ahkHotkey) return null;
  const rawLabel = String(/** @type {{ label?: unknown }} */ (value).label || "").trim();
  return { ahkHotkey, label: rawLabel || ahkHotkey };
}

/**
 * Extract the AHK syntax string for generate/embed.
 * Accepts a bare string or a stored `{ ahkHotkey, label }` record.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeBridgeToggleHotkey(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return String(/** @type {{ ahkHotkey?: unknown }} */ (value).ahkHotkey || "").trim();
  }
  return "";
}

/**
 * True when a Bridge toggle hotkey matches any External hotkey mapping.
 *
 * @param {unknown} ahkHotkey
 * @param {unknown} mappings
 * @returns {boolean}
 */
export function bridgeToggleConflictsWithExternalMappings(ahkHotkey, mappings) {
  const needle = String(ahkHotkey || "").trim();
  if (!needle || !Array.isArray(mappings)) return false;
  for (const mapping of mappings) {
    const row = normalizeExternalHotkeyMapping(mapping);
    if (row && row.ahkHotkey === needle) return true;
  }
  return false;
}

/**
 * True when an External hotkey matches the stored Bridge toggle hotkey.
 *
 * @param {unknown} ahkHotkey
 * @param {unknown} bridgeToggle
 * @returns {boolean}
 */
export function externalHotkeyConflictsWithBridgeToggle(ahkHotkey, bridgeToggle) {
  const needle = String(ahkHotkey || "").trim();
  const toggle = normalizeBridgeToggleHotkey(bridgeToggle);
  return Boolean(needle && toggle && needle === toggle);
}

/**
 * Browser gate preference: default on unless explicitly false.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function normalizeBrowserGate(value) {
  return value !== false;
}

/**
 * Last-download Browser gate snapshot. Only true/false count as a prior download.
 *
 * @param {unknown} value
 * @returns {boolean | null}
 */
export function normalizeLastBrowserGate(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

/**
 * Self-elevate preference: default off unless explicitly true.
 * When on, Download embeds an optional *RunAs restart (Path A); UAC still applies.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function normalizeSelfElevate(value) {
  return value === true;
}

/**
 * Last-download self-elevate snapshot. Only true/false count as a prior download.
 *
 * @param {unknown} value
 * @returns {boolean | null}
 */
export function normalizeLastSelfElevate(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}
/**
 * High-collision External hotkey confirm copy depends on Browser gate.
 * Gate off must warn that the key is swallowed in all applications while the script runs.
 *
 * @param {unknown} [browserGate]
 * @returns {{ messageKey: string, fallback: string }}
 */
export function externalHotkeyHighCollisionWarn(browserGate) {
  if (normalizeBrowserGate(browserGate)) {
    return {
      messageKey: "ahkHighCollisionWarn",
      fallback:
        "This External hotkey is commonly typed. While a supported browser window is usable, AutoHotkey will swallow it globally. Bind it anyway?",
    };
  }
  return {
    messageKey: "ahkHighCollisionWarnGateOff",
    fallback:
      "This External hotkey is commonly typed. AutoHotkey will swallow it in all applications while the AHK bridge script is running. Bind it anyway?",
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
 *   bridgeToggleHotkey?: string | { ahkHotkey?: string, label?: string } | null,
 *   browserGate?: boolean,
 *   lastBrowserGate?: boolean | null,
 *   selfElevate?: boolean,
 *   lastSelfElevate?: boolean | null,
 * }} input
 * @returns {AhkBridgeGenerateResult}
 */
export function generateAhkBridge(input = {}) {
  const mappings = Array.isArray(input.mappings) ? input.mappings : [];
  const commandShortcuts =
    input.commandShortcuts && typeof input.commandShortcuts === "object"
      ? input.commandShortcuts
      : {};
  const bridgeToggleHotkey = normalizeBridgeToggleHotkey(input.bridgeToggleHotkey ?? null);
  const browserGate = normalizeBrowserGate(input.browserGate);
  const lastBrowserGate = normalizeLastBrowserGate(input.lastBrowserGate);
  const browserGateChanged =
    lastBrowserGate !== null && lastBrowserGate !== browserGate;
  const selfElevate = normalizeSelfElevate(input.selfElevate);
  const lastSelfElevate = normalizeLastSelfElevate(input.lastSelfElevate);
  const selfElevateChanged =
    lastSelfElevate !== null && lastSelfElevate !== selfElevate;
  const settingChanged = browserGateChanged || selfElevateChanged;

  if (mappings.length === 0) {
    return {
      eligible: false,
      skippedUnbound: [],
      drift: false,
      browserGateChanged,
      selfElevateChanged,
      needsRegenerate: settingChanged,
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
  const scriptText = eligible
    ? buildScriptText(active, bridgeToggleHotkey, browserGate, selfElevate)
    : "";
  const drift = detectDrift(mappings, commandShortcuts, input.lastSnapshot);

  return {
    eligible,
    skippedUnbound,
    drift,
    browserGateChanged,
    selfElevateChanged,
    needsRegenerate: drift || settingChanged,
    scriptText,
  };
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
 * @param {boolean} [browserGate]
 * @param {boolean} [selfElevate]
 */
function buildScriptText(
  active,
  bridgeToggleHotkey = "",
  browserGate = true,
  selfElevate = false,
) {
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

  let remapBlock;
  if (browserGate) {
    const remapHotIf = bridgeToggleHotkey
      ? "#HotIf HasUsableBrowserWindow() && BridgeRemapsEnabled"
      : "#HotIf HasUsableBrowserWindow()";
    remapBlock = `; Browser gate ON: only intercept External hotkeys while a usable supported browser window is known.
${remapHotIf}

${hotkeyLines}

#HotIf
`;
  } else if (bridgeToggleHotkey) {
    // No remap #HotIf when Browser gate is off: keep RegisterHotKey-style capture.
    // Bridge toggle still gates SendPlayback via an in-handler flag check.
    const gatedLines = active
      .map((row) => {
        const comment = row.label ? ` ; ${row.label}` : ` ; ${row.commandId}`;
        return `${row.ahkHotkey}:: {${comment}
    global BridgeRemapsEnabled
    if !BridgeRemapsEnabled
        return
    SendPlayback("${row.ahkSend}")
}`;
      })
      .join("\n");
    remapBlock = `; Browser gate OFF: External hotkeys are claimed system-wide while this script runs
; (no remap #HotIf). Bridge toggle still enables/disables SendPlayback via BridgeRemapsEnabled.
; SendPlayback may no-op without a usable browser, but the key is already consumed.
${gatedLines}
`;
  } else {
    remapBlock = `; Browser gate OFF: External hotkeys are claimed system-wide while this script runs.
; SendPlayback may no-op without a usable browser, but the key is already consumed.
${hotkeyLines}
`;
  }

  const elevationComment = selfElevate
    ? `; Optional self-elevation is ON (Path A helper): restart elevated via UAC so
; External hotkeys can observe keys while an elevated foreground app has focus.
; Complementary to Browser gate — not a replacement for Path B (gate off).`
    : `; Self-elevation is OFF (default): this generate does not auto-elevate on start.`;

  const elevationBlock = selfElevate
    ? `; Restart elevated when not already admin. Canceling UAC exits this instance.
full_command_line := DllCall("GetCommandLine", "str")
if !(A_IsAdmin || RegExMatch(full_command_line, " /restart(?!\\S)")) {
    try {
        if A_IsCompiled
            Run '*RunAs "' A_ScriptFullPath '" /restart'
        else
            Run '*RunAs "' A_AhkPath '" /restart "' A_ScriptFullPath '"'
    }
    ExitApp
}

`
    : "";

  return `#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent()

; PlaybackKeys AHK bridge script (generated)
; External hotkeys → SendInput of Command target chords.
; Do not WinActivate the browser; keep the current app focused.
;
; Path A: keep Browser gate on; if External hotkeys fail over an elevated game
; foreground, run this AHK bridge script as Administrator (or enable optional
; self-elevation before Download so this script asks for admin via UAC on start).
; Path B: turn Browser gate off for system-wide capture without elevation
; (keys are swallowed in all applications while the script runs).
${elevationComment}

${elevationBlock}SendMode "Input"
SetWorkingDir A_ScriptDir

${togglePrefix}${remapBlock}
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
