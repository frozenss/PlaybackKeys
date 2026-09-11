/**
 * Unit tests for External hotkey key-capture (#14).
 * Seam: shared/external-hotkey.js (captureExternalHotkey).
 *
 * Input: KeyboardEvent-like object.
 * Output: null (ignore), { cancel: true }, or { ahkHotkey, label, highCollision }.
 */
import { captureExternalHotkey } from "../shared/external-hotkey.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${message}: expected ${e}, got ${a}`);
}

function event(partial) {
  return {
    key: "",
    code: "",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    ...partial,
  };
}

// --- Slice 1: bare F-key → AHK syntax + friendly label, not high-collision ---

{
  const result = captureExternalHotkey(event({ key: "F13", code: "F13" }));
  assertDeepEqual(
    result,
    { ahkHotkey: "F13", label: "F13", highCollision: false },
    "F13 captures as External hotkey",
  );
}

// --- Slice 2: bare letter → AHK lowercase + high-collision warning flag ---

{
  const result = captureExternalHotkey(event({ key: "z", code: "KeyZ" }));
  assertDeepEqual(
    result,
    { ahkHotkey: "z", label: "Z", highCollision: true },
    "letter Z is a high-collision External hotkey",
  );
}

// --- Slice 3: Ctrl+letter stores AHK ^ + key; not a typing-collision warn ---

{
  const result = captureExternalHotkey(
    event({ key: "q", code: "KeyQ", ctrlKey: true }),
  );
  assertDeepEqual(
    result,
    { ahkHotkey: "^q", label: "Ctrl+Q", highCollision: false },
    "Ctrl+Q encodes to AHK ^q without high-collision warn",
  );
}

// --- Slice 4: Ctrl+Shift+digit ---

{
  const result = captureExternalHotkey(
    event({ key: "1", code: "Digit1", ctrlKey: true, shiftKey: true }),
  );
  assertDeepEqual(
    result,
    { ahkHotkey: "^+1", label: "Ctrl+Shift+1", highCollision: false },
    "Ctrl+Shift+1 encodes to AHK ^+1 without high-collision warn",
  );
}

// --- Slice 4b: Shift+letter is still typing collision ---

{
  const result = captureExternalHotkey(
    event({ key: "z", code: "KeyZ", shiftKey: true }),
  );
  assertDeepEqual(
    result,
    { ahkHotkey: "+z", label: "Shift+Z", highCollision: true },
    "Shift+Z remains high-collision (capital typing)",
  );
}

// --- Slice 4c: Alt / Win suppress typing-collision warn ---

{
  assertDeepEqual(
    captureExternalHotkey(event({ key: "z", code: "KeyZ", altKey: true })),
    { ahkHotkey: "!z", label: "Alt+Z", highCollision: false },
    "Alt+Z is not a typing-collision warn",
  );
  assertDeepEqual(
    captureExternalHotkey(event({ key: "z", code: "KeyZ", metaKey: true })),
    { ahkHotkey: "#z", label: "Win+Z", highCollision: false },
    "Win+Z is not a typing-collision warn",
  );
}

// --- Slice 5: modifier-only / repeat → ignore ---

{
  assert(
    captureExternalHotkey(event({ key: "Control", code: "ControlLeft", ctrlKey: true })) === null,
    "Control alone is ignored",
  );
  assert(
    captureExternalHotkey(event({ key: "F13", code: "F13", repeat: true })) === null,
    "key repeat is ignored",
  );
}

// --- Slice 6: Escape cancels capture ---

{
  assertDeepEqual(
    captureExternalHotkey(event({ key: "Escape", code: "Escape" })),
    { cancel: true },
    "Escape cancels External hotkey capture",
  );
}

// --- Slice 7: Numpad and Space names ---

{
  assertDeepEqual(
    captureExternalHotkey(event({ key: "1", code: "Numpad1" })),
    { ahkHotkey: "Numpad1", label: "Numpad1", highCollision: false },
    "Numpad1 uses AHK Numpad name",
  );
  assertDeepEqual(
    captureExternalHotkey(event({ key: " ", code: "Space" })),
    { ahkHotkey: "Space", label: "Space", highCollision: true },
    "Space is high-collision",
  );
}

console.log("external-hotkey unit tests passed.");
