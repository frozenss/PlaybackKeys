/**
 * Unit tests for AHK bridge generator (#13, #21).
 * Seam: shared/ahk-bridge.js (generateAhkBridge).
 *
 * Inputs: External hotkey mappings + Command shortcut snapshot (+ optional prior
 * snapshot and optional Bridge toggle hotkey).
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
    mappings: [{ commandId: "01-play-pause", ahkHotkey: "F13", label: "F13" }],
    commandShortcuts: { "01-play-pause": "Ctrl+Shift+1" },
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
    mappings: [{ commandId: "03-speed-down", ahkHotkey: "F17", label: "F17" }],
    commandShortcuts: { "03-speed-down": "" },
  });
  assert(result.eligible === false, "unbound-only mapping is not eligible");
  assertDeepEqual(
    result.skippedUnbound,
    [{ commandId: "03-speed-down", ahkHotkey: "F17", label: "F17" }],
    "unbound mapped Command is reported in skippedUnbound",
  );
  assert(!result.scriptText.includes("F17::"), "unbound-only emits no active hotkey line");
}

// --- Mixed: unbound omitted from active lines; complete row still eligible ---

{
  const result = generateAhkBridge({
    mappings: [
      { commandId: "01-play-pause", ahkHotkey: "F13", label: "F13" },
      { commandId: "03-speed-down", ahkHotkey: "F17", label: "F17" },
    ],
    commandShortcuts: {
      "01-play-pause": "Ctrl+Shift+1",
      "03-speed-down": "",
    },
  });
  assert(result.eligible === true, "one complete row keeps generate eligible");
  assertDeepEqual(
    result.skippedUnbound,
    [{ commandId: "03-speed-down", ahkHotkey: "F17", label: "F17" }],
    "unbound row is listed in skippedUnbound",
  );
  assert(result.scriptText.includes("F13::"), "bound External hotkey stays in script");
  assert(result.scriptText.includes('SendPlayback("^+1")'), "bound chord is embedded");
  assert(!result.scriptText.includes("F17::"), "unbound External hotkey omitted from active lines");
  assert(!result.scriptText.includes('SendPlayback("")'), "never emits empty SendPlayback");
}

// --- Drift: no prior snapshot → false; aligned → false; changed mapped chord → true ---

{
  const mappings = [{ commandId: "01-play-pause", ahkHotkey: "F13", label: "F13" }];
  const current = { "01-play-pause": "Ctrl+Shift+1" };

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
      lastSnapshot: { "01-play-pause": "Ctrl+Shift+1" },
    }).drift === false,
    "aligned snapshot → drift false",
  );
  assert(
    generateAhkBridge({
      mappings,
      commandShortcuts: current,
      lastSnapshot: { "01-play-pause": "Ctrl+Shift+9" },
    }).drift === true,
    "mapped Command chord differs from lastSnapshot → drift true",
  );
}

// --- Drift ignores Commands that are not in External hotkey mappings ---

{
  const result = generateAhkBridge({
    mappings: [{ commandId: "01-play-pause", ahkHotkey: "F13" }],
    commandShortcuts: {
      "01-play-pause": "Ctrl+Shift+1",
      "02-speed-up": "Ctrl+Shift+2",
    },
    lastSnapshot: {
      "01-play-pause": "Ctrl+Shift+1",
      "02-speed-up": "Alt+Shift+2",
    },
  });
  assert(result.drift === false, "unmapped Command chord changes do not count as drift");
}

// --- Script shape: allowlist, AHK v2 bridge behavior, chord encoding ---

{
  const result = generateAhkBridge({
    mappings: [
      { commandId: "01-play-pause", ahkHotkey: "F13", label: "F13" },
      { commandId: "02-speed-up", ahkHotkey: "F14", label: "F14" },
    ],
    commandShortcuts: {
      "01-play-pause": "Ctrl+Shift+1",
      "02-speed-up": "Alt+Shift+F1",
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

const BASELINE_MAPPINGS = [{ commandId: "01-play-pause", ahkHotkey: "F13", label: "F13" }];
const BASELINE_SHORTCUTS = { "01-play-pause": "Ctrl+Shift+1" };
const BASELINE_NO_TOGGLE_SCRIPT = generateAhkBridge({
  mappings: BASELINE_MAPPINGS,
  commandShortcuts: BASELINE_SHORTCUTS,
}).scriptText;

// --- No Bridge toggle hotkey → prior no-toggle script shape ---

{
  assert(
    generateAhkBridge({
      mappings: BASELINE_MAPPINGS,
      commandShortcuts: BASELINE_SHORTCUTS,
      bridgeToggleHotkey: "",
    }).scriptText === BASELINE_NO_TOGGLE_SCRIPT,
    "empty Bridge toggle hotkey matches omitted-toggle output",
  );
  assert(
    generateAhkBridge({
      mappings: BASELINE_MAPPINGS,
      commandShortcuts: BASELINE_SHORTCUTS,
      bridgeToggleHotkey: "   ",
    }).scriptText === BASELINE_NO_TOGGLE_SCRIPT,
    "whitespace-only Bridge toggle hotkey matches omitted-toggle output",
  );
  assert(
    BASELINE_NO_TOGGLE_SCRIPT.includes("#HotIf HasUsableBrowserWindow()\n"),
    "no-toggle script keeps prior #HotIf gate",
  );
  assert(
    !/BridgeRemapsEnabled|TrayTip\s*\(/.test(BASELINE_NO_TOGGLE_SCRIPT),
    "no-toggle script has no Bridge toggle remaps flag or TrayTip",
  );
}

// --- Optional Bridge toggle hotkey embeds global toggle outside remap #HotIf ---

{
  const result = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    bridgeToggleHotkey: "F24",
  });
  assert(result.eligible === true, "Bridge toggle hotkey does not affect eligibility");
  assert(result.scriptText.includes("F24::"), "script embeds Bridge toggle hotkey");
  assert(
    result.scriptText.includes("BridgeRemapsEnabled := true"),
    "remaps default on at script start/reload",
  );
  assert(
    /#HotIf\s+HasUsableBrowserWindow\(\)\s*&&\s*BridgeRemapsEnabled/.test(result.scriptText),
    "External hotkey remaps also require BridgeRemapsEnabled",
  );
  assert(
    result.scriptText.includes('SendPlayback("^+1")'),
    "External hotkey remap lines remain when toggle is present",
  );

  const toggleIndex = result.scriptText.indexOf("F24::");
  const remapHotIfIndex = result.scriptText.search(
    /#HotIf\s+HasUsableBrowserWindow\(\)\s*&&\s*BridgeRemapsEnabled/,
  );
  assert(toggleIndex >= 0 && remapHotIfIndex >= 0, "toggle and remap #HotIf are both present");
  assert(
    toggleIndex < remapHotIfIndex,
    "Bridge toggle hotkey is declared outside / before the External hotkey remap #HotIf",
  );

  const toggleBlock = result.scriptText.slice(toggleIndex, remapHotIfIndex);
  assert(
    /TrayTip\s*\(/.test(toggleBlock),
    "toggle handler shows a TrayTip",
  );
  assert(
    /External hotkeys ON/.test(toggleBlock) && /External hotkeys OFF/.test(toggleBlock),
    "TrayTip uses English ON/OFF copy",
  );
  assert(
    !/IniRead|IniWrite|FileAppend|A_AppData|A_ScriptDir\s*\.\s*"\\/.test(result.scriptText),
    "on/off state is in-memory only (no ini/appdata persistence helpers)",
  );
  assert(
    result.scriptText !== BASELINE_NO_TOGGLE_SCRIPT,
    "toggle-bearing script differs from no-toggle output",
  );
}

console.log("ahk-bridge unit tests passed.");
