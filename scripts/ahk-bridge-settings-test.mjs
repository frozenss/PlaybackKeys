/**
 * Unit tests for AHK bridge settings helpers (#16).
 * Seam: shared/ahk-bridge.js (isWindowsPlatform, clearedAhkBridgeStorage,
 * resetPatchOmitsAhkBridgeStorage).
 *
 * Covers Windows gating signals and clear/reset storage policy — not options DOM.
 */
import {
  AHK_BRIDGE_STORAGE,
  ahkBridgeStorageKeys,
  clearedAhkBridgeStorage,
  isWindowsPlatform,
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
      AHK_BRIDGE_STORAGE.driftDismissedFingerprint,
      AHK_BRIDGE_STORAGE.externalMappings,
      AHK_BRIDGE_STORAGE.lastChordSnapshot,
    ].sort(),
    "AHK bridge storage keys are the External hotkey + snapshot companions",
  );

  assertDeepEqual(
    clearedAhkBridgeStorage(),
    {
      [AHK_BRIDGE_STORAGE.externalMappings]: [],
      [AHK_BRIDGE_STORAGE.lastChordSnapshot]: null,
      [AHK_BRIDGE_STORAGE.driftDismissedFingerprint]: "",
    },
    "Clear AHK mappings wipes mappings and related bridge snapshot state",
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
}

console.log("ahk-bridge-settings unit tests passed.");
