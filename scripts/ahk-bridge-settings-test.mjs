/**
 * Unit tests for AHK bridge settings helpers (#16, #21, #22).
 * Seam: shared/ahk-bridge.js (isWindowsPlatform, clearedAhkBridgeStorage,
 * resetPatchOmitsAhkBridgeStorage, Bridge toggle hotkey normalize + collision).
 *
 * Covers Windows gating signals, clear/reset storage policy, Bridge toggle
 * hotkey persist shape, and bidirectional External↔toggle collision — not
 * options DOM.
 */
import {
  AHK_BRIDGE_STORAGE,
  ahkBridgeStorageKeys,
  bridgeToggleConflictsWithExternalMappings,
  clearedAhkBridgeStorage,
  externalHotkeyConflictsWithBridgeToggle,
  externalHotkeyHighCollisionWarn,
  isWindowsPlatform,
  normalizeBridgeToggleHotkey,
  normalizeBridgeToggleHotkeyRecord,
  normalizeBrowserGate,
  normalizeLastBrowserGate,
  resetPatchOmitsAhkBridgeStorage,
} from "../shared/ahk-bridge.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${message}: expected ${e}, got ${a}`);
}

// --- Slice 1: Windows platform gating from normal web signals ---

{
  assert(
    isWindowsPlatform({ userAgentDataPlatform: "Windows" }) === true,
    "userAgentData Windows → true",
  );
  assert(
    isWindowsPlatform({ userAgentDataPlatform: "Win32" }) === true,
    "userAgentData Win32 → true",
  );
  assert(
    isWindowsPlatform({ userAgentDataPlatform: "macOS" }) === false,
    "userAgentData macOS → false",
  );
  assert(
    isWindowsPlatform({ userAgentDataPlatform: "Linux" }) === false,
    "userAgentData Linux → false",
  );
  assert(
    isWindowsPlatform({ userAgentDataPlatform: "Chrome OS" }) === false,
    "userAgentData Chrome OS → false",
  );
  assert(
    isWindowsPlatform({ platform: "Win32" }) === true,
    "navigator.platform Win32 → true",
  );
  assert(
    isWindowsPlatform({ platform: "MacIntel" }) === false,
    "navigator.platform MacIntel → false",
  );
  assert(
    isWindowsPlatform({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }) === true,
    "userAgent Windows NT → true",
  );
  assert(
    isWindowsPlatform({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }) === false,
    "userAgent Macintosh → false",
  );
  assert(
    isWindowsPlatform({}) === false,
    "empty signals → false (do not present full AHK UI)",
  );
}

// --- Slice 2: Clear AHK mappings clears companion storage keys ---

{
  assertDeepEqual(
    ahkBridgeStorageKeys().slice().sort(),
    [
      AHK_BRIDGE_STORAGE.bridgeToggleHotkey,
      AHK_BRIDGE_STORAGE.browserGate,
      AHK_BRIDGE_STORAGE.driftDismissedFingerprint,
      AHK_BRIDGE_STORAGE.externalMappings,
      AHK_BRIDGE_STORAGE.lastBrowserGate,
      AHK_BRIDGE_STORAGE.lastChordSnapshot,
    ].sort(),
    "AHK bridge storage keys include External hotkeys, Browser gate, snapshot companions, and Bridge toggle hotkey",
  );

  assert(
    AHK_BRIDGE_STORAGE.bridgeToggleHotkey === "ahkBridgeToggleHotkey",
    "Bridge toggle hotkey uses a dedicated companion storage key",
  );
  assert(
    AHK_BRIDGE_STORAGE.browserGate === "ahkBrowserGate",
    "Browser gate uses a dedicated companion storage key",
  );
  assert(
    AHK_BRIDGE_STORAGE.lastBrowserGate === "ahkLastBrowserGate",
    "Last-download Browser gate uses a dedicated companion storage key",
  );

  assertDeepEqual(
    clearedAhkBridgeStorage(),
    {
      [AHK_BRIDGE_STORAGE.externalMappings]: [],
      [AHK_BRIDGE_STORAGE.lastChordSnapshot]: null,
      [AHK_BRIDGE_STORAGE.driftDismissedFingerprint]: "",
      [AHK_BRIDGE_STORAGE.bridgeToggleHotkey]: "",
      [AHK_BRIDGE_STORAGE.browserGate]: true,
      [AHK_BRIDGE_STORAGE.lastBrowserGate]: null,
    },
    "Clear AHK mappings wipes mappings/snapshot/toggle and resets Browser gate to default on",
  );
}

// --- Slice 3: Reset-all patch must omit AHK bridge storage ---

{
  const playbackDefaults = {
    skipIntervals: [5, 10, 30],
    speedStep: 0.25,
    themeMode: "system",
  };
  assert(
    resetPatchOmitsAhkBridgeStorage(playbackDefaults) === true,
    "playback defaults omit AHK bridge keys",
  );
  assert(
    resetPatchOmitsAhkBridgeStorage({
      ...playbackDefaults,
      [AHK_BRIDGE_STORAGE.externalMappings]: [],
    }) === false,
    "reset patch that clears External hotkeys is rejected by policy helper",
  );
  assert(
    resetPatchOmitsAhkBridgeStorage({
      ...playbackDefaults,
      [AHK_BRIDGE_STORAGE.lastChordSnapshot]: null,
    }) === false,
    "reset patch that clears chord snapshot is rejected by policy helper",
  );
  assert(
    resetPatchOmitsAhkBridgeStorage({
      ...playbackDefaults,
      [AHK_BRIDGE_STORAGE.bridgeToggleHotkey]: "",
    }) === false,
    "reset patch that clears Bridge toggle hotkey is rejected by policy helper",
  );
  assert(
    resetPatchOmitsAhkBridgeStorage({
      ...playbackDefaults,
      [AHK_BRIDGE_STORAGE.browserGate]: true,
    }) === false,
    "reset patch that touches Browser gate is rejected by policy helper",
  );
}

// --- Browser gate persist shape (default on) ---

{
  assert(normalizeBrowserGate(undefined) === true, "missing Browser gate → on");
  assert(normalizeBrowserGate(null) === true, "null Browser gate → on");
  assert(normalizeBrowserGate(true) === true, "true Browser gate → on");
  assert(normalizeBrowserGate(false) === false, "false Browser gate → off");
  assert(normalizeBrowserGate("false") === true, "non-boolean truthy-ish string does not turn gate off");
  assert(normalizeLastBrowserGate(undefined) === null, "missing last Browser gate → null");
  assert(normalizeLastBrowserGate(null) === null, "null last Browser gate → null");
  assert(normalizeLastBrowserGate(true) === true, "true last Browser gate preserved");
  assert(normalizeLastBrowserGate(false) === false, "false last Browser gate preserved");
  assert(normalizeLastBrowserGate("true") === null, "non-boolean last Browser gate → null");
}

// --- Gate-off high-collision External hotkey confirm copy ---

{
  const gated = externalHotkeyHighCollisionWarn(true);
  assert(
    gated.messageKey === "ahkHighCollisionWarn",
    "Browser gate on uses gated high-collision message key",
  );
  assert(
    /usable|browser/i.test(gated.fallback) && !/all applications/i.test(gated.fallback),
    "gated high-collision fallback mentions usable browser, not all applications",
  );

  const ungated = externalHotkeyHighCollisionWarn(false);
  assert(
    ungated.messageKey === "ahkHighCollisionWarnGateOff",
    "Browser gate off uses stronger high-collision message key",
  );
  assert(
    /all applications/i.test(ungated.fallback),
    "gate-off high-collision fallback warns key is swallowed in all applications",
  );
  assert(
    externalHotkeyHighCollisionWarn().messageKey === "ahkHighCollisionWarn",
    "omitted Browser gate defaults to gated high-collision copy",
  );
}

// --- Slice 4: Bridge toggle hotkey persist shape (#22) ---

{
  assertDeepEqual(
    normalizeBridgeToggleHotkeyRecord(null),
    null,
    "null Bridge toggle hotkey record → null",
  );
  assertDeepEqual(
    normalizeBridgeToggleHotkeyRecord(""),
    null,
    "empty string Bridge toggle hotkey → null",
  );
  assertDeepEqual(
    normalizeBridgeToggleHotkeyRecord("   "),
    null,
    "whitespace-only Bridge toggle hotkey → null",
  );
  assertDeepEqual(
    normalizeBridgeToggleHotkeyRecord("F24"),
    { ahkHotkey: "F24", label: "F24" },
    "legacy string Bridge toggle hotkey keeps AHK syntax and defaults label",
  );
  assertDeepEqual(
    normalizeBridgeToggleHotkeyRecord({ ahkHotkey: " ^!t ", label: " Ctrl+Alt+T " }),
    { ahkHotkey: "^!t", label: "Ctrl+Alt+T" },
    "object Bridge toggle hotkey trims ahkHotkey + label",
  );
  assertDeepEqual(
    normalizeBridgeToggleHotkeyRecord({ ahkHotkey: "F13", label: "   " }),
    { ahkHotkey: "F13", label: "F13" },
    "blank label falls back to ahkHotkey",
  );
  assertDeepEqual(
    normalizeBridgeToggleHotkeyRecord({ ahkHotkey: "", label: "F24" }),
    null,
    "object without ahkHotkey → null",
  );

  assert(
    normalizeBridgeToggleHotkey("F24") === "F24",
    "generator normalize accepts string Bridge toggle hotkey",
  );
  assert(
    normalizeBridgeToggleHotkey({ ahkHotkey: "F24", label: "F24" }) === "F24",
    "generator normalize accepts stored Bridge toggle hotkey record",
  );
  assert(
    normalizeBridgeToggleHotkey({ ahkHotkey: "  ^t  " }) === "^t",
    "generator normalize trims ahkHotkey from record",
  );
  assert(
    normalizeBridgeToggleHotkey("") === "" &&
      normalizeBridgeToggleHotkey(null) === "" &&
      normalizeBridgeToggleHotkey({ label: "F24" }) === "",
    "generator normalize treats missing/empty Bridge toggle hotkey as omitted",
  );
}

// --- Slice 5: Bidirectional External ↔ Bridge toggle collision (#22) ---

{
  const mappings = [
    { commandId: "01-play-pause", ahkHotkey: "F13", label: "F13" },
    { commandId: "02-speed-up", ahkHotkey: "^q", label: "Ctrl+Q" },
  ];

  assert(
    bridgeToggleConflictsWithExternalMappings("F13", mappings) === true,
    "Bridge toggle hotkey matching an External hotkey is a conflict",
  );
  assert(
    bridgeToggleConflictsWithExternalMappings("F24", mappings) === false,
    "Bridge toggle hotkey unused by External mappings is allowed",
  );
  assert(
    bridgeToggleConflictsWithExternalMappings("  ^q  ", mappings) === true,
    "Bridge toggle collision trims before compare",
  );
  assert(
    bridgeToggleConflictsWithExternalMappings("", mappings) === false,
    "empty Bridge toggle hotkey never conflicts",
  );

  assert(
    externalHotkeyConflictsWithBridgeToggle("F24", { ahkHotkey: "F24", label: "F24" }) === true,
    "External hotkey matching stored Bridge toggle hotkey is a conflict",
  );
  assert(
    externalHotkeyConflictsWithBridgeToggle("F13", "F13") === true,
    "External hotkey matching legacy string Bridge toggle hotkey is a conflict",
  );
  assert(
    externalHotkeyConflictsWithBridgeToggle("F13", { ahkHotkey: "F24", label: "F24" }) === false,
    "External hotkey distinct from Bridge toggle hotkey is allowed",
  );
  assert(
    externalHotkeyConflictsWithBridgeToggle("F24", "") === false,
    "External hotkey never conflicts with cleared Bridge toggle hotkey",
  );
  assert(
    externalHotkeyConflictsWithBridgeToggle("F24", null) === false,
    "External hotkey never conflicts with missing Bridge toggle hotkey",
  );
}

console.log("ahk-bridge-settings unit tests passed.");
