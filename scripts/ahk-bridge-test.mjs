/**
 * Unit tests for AHK bridge generator (#13, #21, #23, #24).
 * Seam: shared/ahk-bridge.js (generateAhkBridge).
 *
 * Inputs: External hotkey mappings + Command shortcut snapshot (+ optional prior
 * snapshot, optional Bridge toggle hotkey, Browser gate + last-download gate,
 * optional self-elevate + last-download self-elevate).
 * Outputs: eligibility, skipped-unbound details, chord drift / browserGateChanged /
 * selfElevateChanged / needsRegenerate, full AHK bridge script text.
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

  const fromRecord = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    bridgeToggleHotkey: { ahkHotkey: "F24", label: "F24" },
  });
  assert(
    fromRecord.scriptText === result.scriptText,
    "stored Bridge toggle hotkey record embeds the same as a bare AHK string",
  );
}

// --- Browser gate on (default): remaps stay under HasUsableBrowserWindow #HotIf ---

{
  const omitted = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
  });
  const explicitOn = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    browserGate: true,
  });
  assert(
    omitted.scriptText === explicitOn.scriptText,
    "omitted browserGate matches explicit Browser gate on",
  );
  assert(
    omitted.scriptText.includes("#HotIf HasUsableBrowserWindow()\n"),
    "Browser gate on keeps remap #HotIf HasUsableBrowserWindow()",
  );
  assert(
    /Path A:|Path B:/i.test(omitted.scriptText),
    "generated script header comments describe Path A and Path B",
  );
  assert(
    !/\*RunAs|Run\s*\*\s*RunAs|A_IsAdmin/i.test(omitted.scriptText),
    "default generated script has no auto-*RunAs / self-elevation",
  );
}

// --- Browser gate off: External hotkey remaps are global (no remap browser #HotIf) ---

{
  const result = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    browserGate: false,
  });
  assert(result.eligible === true, "Browser gate off does not affect eligibility");
  assert(result.scriptText.includes("F13::"), "gate-off script still embeds External hotkey");
  assert(
    result.scriptText.includes('SendPlayback("^+1")'),
    "gate-off script still embeds Command chord",
  );
  assert(
    !/#HotIf\s+HasUsableBrowserWindow\(\)/.test(result.scriptText),
    "Browser gate off omits HasUsableBrowserWindow remap #HotIf",
  );
  assert(
    result.scriptText.includes("HasUsableBrowserWindow()"),
    "gate-off script still defines HasUsableBrowserWindow for SendPlayback no-op",
  );
  assert(
    /all applications|system-wide|Browser gate OFF/i.test(result.scriptText),
    "gate-off script comments state keys are claimed system-wide",
  );
  assert(
    /Path A:|Path B:/i.test(result.scriptText),
    "gate-off script header still describes Path A and Path B",
  );
  assert(
    !/\*RunAs|Run\s*\*\s*RunAs|A_IsAdmin/i.test(result.scriptText),
    "gate-off script has no auto-*RunAs / self-elevation",
  );
  assert(
    result.scriptText !== BASELINE_NO_TOGGLE_SCRIPT,
    "gate-off script differs from default gate-on output",
  );
}

// --- Browser gate off + Bridge toggle: no remap #HotIf; handlers check the flag ---

{
  const result = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    browserGate: false,
    bridgeToggleHotkey: "F24",
  });
  assert(result.scriptText.includes("F24::"), "gate-off + toggle still embeds Bridge toggle");
  assert(
    !/^#HotIf\b/m.test(result.scriptText),
    "gate-off + toggle uses no remap #HotIf directive (keeps RegisterHotKey-style capture)",
  );
  assert(
    /F13::\s*\{[\s\S]*BridgeRemapsEnabled[\s\S]*SendPlayback\("\^\+1"\)/.test(result.scriptText),
    "gate-off + toggle External hotkey handlers check BridgeRemapsEnabled then SendPlayback",
  );
  const toggleIndex = result.scriptText.indexOf("F24::");
  const remapIndex = result.scriptText.indexOf("F13::");
  assert(toggleIndex >= 0 && remapIndex >= 0, "toggle and External hotkey lines present");
  assert(
    toggleIndex < remapIndex,
    "Bridge toggle stays before External hotkey remaps when Browser gate is off",
  );
}

// --- Changing Browser gate after a prior download → needsRegenerate ---

{
  const aligned = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    lastSnapshot: BASELINE_SHORTCUTS,
    browserGate: true,
    lastBrowserGate: true,
  });
  assert(aligned.drift === false, "aligned chords → drift false");
  assert(
    aligned.browserGateChanged === false,
    "same Browser gate as last download → browserGateChanged false",
  );
  assert(
    aligned.needsRegenerate === false,
    "aligned chords + gate → needsRegenerate false",
  );

  const gateFlipped = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    lastSnapshot: BASELINE_SHORTCUTS,
    browserGate: false,
    lastBrowserGate: true,
  });
  assert(gateFlipped.drift === false, "gate-only change is not chord drift");
  assert(
    gateFlipped.browserGateChanged === true,
    "Browser gate differs from last download → browserGateChanged true",
  );
  assert(
    gateFlipped.needsRegenerate === true,
    "Browser gate change after download → needsRegenerate true",
  );

  const neverDownloaded = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    browserGate: false,
    lastBrowserGate: null,
  });
  assert(
    neverDownloaded.browserGateChanged === false,
    "no prior download → browserGateChanged false",
  );
  assert(
    neverDownloaded.needsRegenerate === false,
    "no prior download → needsRegenerate false even if gate is off",
  );
}

// --- Self-elevate off (default): no auto-*RunAs / A_IsAdmin restart ---

{
  const omitted = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
  });
  const explicitOff = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    selfElevate: false,
  });
  assert(
    omitted.scriptText === explicitOff.scriptText,
    "omitted selfElevate matches explicit self-elevate off",
  );
  assert(
    omitted.selfElevateChanged === false,
    "default generate with no prior self-elevate snapshot → selfElevateChanged false",
  );
  assert(
    !/\*RunAs|A_IsAdmin/i.test(omitted.scriptText),
    "self-elevate off embeds no *RunAs / A_IsAdmin auto-elevation",
  );
  assert(
    /does not auto-elevate|no auto-elevate/i.test(omitted.scriptText),
    "self-elevate off script comments state no auto-elevate on start",
  );
}

// --- Self-elevate on: Download embeds *RunAs restart (UAC still required) ---

{
  const result = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    selfElevate: true,
  });
  assert(result.eligible === true, "self-elevate on does not affect eligibility");
  assert(
    /\*RunAs/.test(result.scriptText) && /A_IsAdmin/.test(result.scriptText),
    "self-elevate on embeds *RunAs restart gated by A_IsAdmin",
  );
  assert(
    /\/restart/.test(result.scriptText),
    "self-elevate on uses /restart to avoid single-instance prompt loops",
  );
  assert(
    result.scriptText.includes("F13::") &&
      result.scriptText.includes('SendPlayback("^+1")'),
    "self-elevate on still embeds External hotkey remaps",
  );
  assert(
    /optional|Path A|UAC|Administrator/i.test(result.scriptText),
    "self-elevate on script comments describe optional Path A elevation",
  );
  assert(
    result.scriptText !== BASELINE_NO_TOGGLE_SCRIPT,
    "self-elevate on script differs from default off output",
  );

  const gateOffElevated = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    browserGate: false,
    selfElevate: true,
  });
  assert(
    /\*RunAs/.test(gateOffElevated.scriptText) &&
      !/#HotIf\s+HasUsableBrowserWindow\(\)/.test(gateOffElevated.scriptText),
    "self-elevate on can combine with Browser gate off",
  );
}

// --- Changing self-elevate after a prior download → needsRegenerate ---

{
  const aligned = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    lastSnapshot: BASELINE_SHORTCUTS,
    selfElevate: false,
    lastSelfElevate: false,
  });
  assert(
    aligned.selfElevateChanged === false,
    "same self-elevate as last download → selfElevateChanged false",
  );
  assert(
    aligned.needsRegenerate === false,
    "aligned chords + self-elevate → needsRegenerate false",
  );

  const flippedOn = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    lastSnapshot: BASELINE_SHORTCUTS,
    selfElevate: true,
    lastSelfElevate: false,
  });
  assert(flippedOn.drift === false, "self-elevate-only change is not chord drift");
  assert(
    flippedOn.selfElevateChanged === true,
    "self-elevate differs from last download → selfElevateChanged true",
  );
  assert(
    flippedOn.needsRegenerate === true,
    "self-elevate change after download → needsRegenerate true",
  );

  const flippedOff = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    lastSnapshot: BASELINE_SHORTCUTS,
    selfElevate: false,
    lastSelfElevate: true,
  });
  assert(
    flippedOff.selfElevateChanged === true && flippedOff.needsRegenerate === true,
    "turning self-elevate off after an elevated download → needsRegenerate",
  );

  const neverDownloaded = generateAhkBridge({
    mappings: BASELINE_MAPPINGS,
    commandShortcuts: BASELINE_SHORTCUTS,
    selfElevate: true,
    lastSelfElevate: null,
  });
  assert(
    neverDownloaded.selfElevateChanged === false,
    "no prior download → selfElevateChanged false",
  );
  assert(
    neverDownloaded.needsRegenerate === false,
    "no prior download → needsRegenerate false even if self-elevate is on",
  );
}

console.log("ahk-bridge unit tests passed.");
