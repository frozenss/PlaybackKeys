/**
 * Unit tests for AHK bridge generator (#13).
 * Seam: shared/ahk-bridge.js (generateAhkBridge).
 *
 * Inputs: External hotkey mappings + Command shortcut snapshot (+ optional prior snapshot).
 * Outputs: eligibility, skipped-unbound details, drift, full AHK bridge script text.
 */
import { generateAhkBridge } from "../shared/ahk-bridge.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${message}: expected ${e}, got ${a}`);
}

// --- Empty mappings → not eligible ---

{
  const result = generateAhkBridge({
    mappings: [],
    commandShortcuts: {},
  });
  assert(result.eligible === false, "empty mappings are not eligible");
  assertDeepEqual(result.skippedUnbound, [], "empty mappings skip nothing");
  assert(result.drift === false, "empty mappings with no prior snapshot → no drift");
  assert(typeof result.scriptText === "string", "scriptText is always a string");
}

// --- Eligible: External hotkey + bound Command → download allowed ---

{
  const result = generateAhkBridge({
    mappings: [{ commandId: "1-play-pause", ahkHotkey: "F13", label: "F13" }],
    commandShortcuts: { "1-play-pause": "Ctrl+Shift+1" },
  });
  assert(result.eligible === true, "complete mapping row is eligible");
  assertDeepEqual(result.skippedUnbound, [], "bound Command is not skipped");
  assert(result.drift === false, "no prior snapshot → drift false");
  assert(result.scriptText.includes("F13::"), "script contains External hotkey line");
  assert(
    result.scriptText.includes('SendPlayback("^+1")'),
    "Ctrl+Shift+1 encodes to AHK ^+1 in SendPlayback",
  );
}

// --- Unbound-only External hotkey does not make generate eligible ---

{
  const result = generateAhkBridge({
    mappings: [{ commandId: "5-speed-down", ahkHotkey: "F17", label: "F17" }],
    commandShortcuts: { "5-speed-down": "" },
  });
  assert(result.eligible === false, "unbound-only mapping is not eligible");
  assertDeepEqual(
    result.skippedUnbound,
    [{ commandId: "5-speed-down", ahkHotkey: "F17", label: "F17" }],
    "unbound mapped Command is reported in skippedUnbound",
  );
  assert(!result.scriptText.includes("F17::"), "unbound-only emits no active hotkey line");
}

// --- Mixed: unbound omitted from active lines; complete row still eligible ---

{
  const result = generateAhkBridge({
    mappings: [
      { commandId: "1-play-pause", ahkHotkey: "F13", label: "F13" },
      { commandId: "5-speed-down", ahkHotkey: "F17", label: "F17" },
    ],
    commandShortcuts: {
      "1-play-pause": "Ctrl+Shift+1",
      "5-speed-down": "",
    },
  });
  assert(result.eligible === true, "one complete row keeps generate eligible");
  assertDeepEqual(
    result.skippedUnbound,
    [{ commandId: "5-speed-down", ahkHotkey: "F17", label: "F17" }],
    "unbound row is listed in skippedUnbound",
  );
  assert(result.scriptText.includes("F13::"), "bound External hotkey stays in script");
  assert(result.scriptText.includes('SendPlayback("^+1")'), "bound chord is embedded");
  assert(!result.scriptText.includes("F17::"), "unbound External hotkey omitted from active lines");
  assert(!result.scriptText.includes('SendPlayback("")'), "never emits empty SendPlayback");
}

// --- Drift: no prior snapshot → false; aligned → false; changed mapped chord → true ---

{
  const mappings = [{ commandId: "1-play-pause", ahkHotkey: "F13", label: "F13" }];
  const current = { "1-play-pause": "Ctrl+Shift+1" };

  assert(
    generateAhkBridge({ mappings, commandShortcuts: current }).drift === false,
    "missing lastSnapshot → drift false",
  );
  assert(
    generateAhkBridge({ mappings, commandShortcuts: current, lastSnapshot: null }).drift === false,
    "null lastSnapshot → drift false",
  );
  assert(
    generateAhkBridge({ mappings, commandShortcuts: current, lastSnapshot: {} }).drift === false,
    "empty-object lastSnapshot counts as no prior → drift false",
  );
  assert(
    generateAhkBridge({
      mappings,
      commandShortcuts: current,
      lastSnapshot: { "1-play-pause": "Ctrl+Shift+1" },
    }).drift === false,
    "aligned snapshot → drift false",
  );
  assert(
    generateAhkBridge({
      mappings,
      commandShortcuts: current,
      lastSnapshot: { "1-play-pause": "Ctrl+Shift+9" },
    }).drift === true,
    "mapped Command chord differs from lastSnapshot → drift true",
  );
}

// --- Drift ignores Commands that are not in External hotkey mappings ---

{
  const result = generateAhkBridge({
    mappings: [{ commandId: "1-play-pause", ahkHotkey: "F13" }],
    commandShortcuts: {
      "1-play-pause": "Ctrl+Shift+1",
      "2-speed-up": "Ctrl+Shift+2",
    },
    lastSnapshot: {
      "1-play-pause": "Ctrl+Shift+1",
      "2-speed-up": "Alt+Shift+2",
    },
  });
  assert(result.drift === false, "unmapped Command chord changes do not count as drift");
}

// --- Script shape: allowlist, AHK v2 bridge behavior, chord encoding ---

{
  const result = generateAhkBridge({
    mappings: [
      { commandId: "1-play-pause", ahkHotkey: "F13", label: "F13" },
      { commandId: "2-speed-up", ahkHotkey: "F14", label: "F14" },
    ],
    commandShortcuts: {
      "1-play-pause": "Ctrl+Shift+1",
      "2-speed-up": "Alt+Shift+F1",
    },
  });

  assert(result.eligible === true, "multi-row complete mappings are eligible");
  for (const exe of ["chrome.exe", "msedge.exe", "brave.exe", "chromium.exe"]) {
    assert(result.scriptText.includes(exe), `script mentions ${exe}`);
  }
  assert(
    /add|append|Opera|Vivaldi|manual/i.test(result.scriptText),
    "script comments explain how to add another process name",
  );
  assert(result.scriptText.includes("#Requires AutoHotkey v2.0"), "script requires AHK v2");
  assert(/#HotIf\s+HasUsableBrowserWindow\(\)/.test(result.scriptText), "script gates with #HotIf");
  assert(result.scriptText.includes("SendInput("), "script uses SendInput");
  assert(
    /Do NOT WinActivate|Do not WinActivate/i.test(result.scriptText),
    "script documents no WinActivate",
  );
  assert(!/WinActivate\s*\(/.test(result.scriptText), "script never calls WinActivate");
  assert(result.scriptText.includes('SendPlayback("^+1")'), "Ctrl+Shift+1 → ^+1");
  assert(result.scriptText.includes('SendPlayback("!+F1")'), "Alt+Shift+F1 → !+F1");
  assert(result.scriptText.includes("F13::"), "first External hotkey line present");
  assert(result.scriptText.includes("F14::"), "second External hotkey line present");
}

console.log("ahk-bridge unit tests passed.");
