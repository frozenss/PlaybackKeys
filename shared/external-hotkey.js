/**
 * Pure External hotkey capture: KeyboardEvent-like → AHK syntax + label.
 * No DOM / chrome.* (issue #14).
 */

/**
 * @typedef {{
 *   key: string,
 *   code?: string,
 *   ctrlKey?: boolean,
 *   altKey?: boolean,
 *   shiftKey?: boolean,
 *   metaKey?: boolean,
 *   repeat?: boolean,
 * }} KeyboardEventLike
 *
 * @typedef {{ cancel: true }} ExternalHotkeyCancel
 * @typedef {{ ahkHotkey: string, label: string, highCollision: boolean }} ExternalHotkeyCapture
 */

/**
 * Capture an External hotkey from a keyboard event.
 * Returns null for ignore (modifier-only, repeat, unknown),
 * { cancel: true } for Escape, or a capture result.
 *
 * @param {KeyboardEventLike} event
 * @returns {ExternalHotkeyCancel | ExternalHotkeyCapture | null}
 */
export function captureExternalHotkey(event) {
  if (!event || typeof event !== "object") return null;
  if (event.repeat) return null;

  const key = String(event.key || "");
  if (key === "Escape") return { cancel: true };

  const code = String(event.code || "");
  const ahkKey = ahkKeyFromEvent(key, code);
  if (!ahkKey) return null;

  const ctrl = !!event.ctrlKey;
  const alt = !!event.altKey;
  const shift = !!event.shiftKey;
  const meta = !!event.metaKey;

  const ahkHotkey = `${ahkMods(ctrl, alt, shift, meta)}${ahkKey}`;
  const label = friendlyLabel(ctrl, alt, shift, meta, ahkKey);
  // Typing-collision only: Shift-only still warns; Ctrl/Alt/Win suppress (AltGr≈Ctrl+Alt: v1 ok).
  const highCollision =
    isHighCollisionBaseKey(ahkKey) && !ctrl && !alt && !meta;

  return { ahkHotkey, label, highCollision };
}

function ahkMods(ctrl, alt, shift, meta) {
  // Match common AHK examples: ^ ! + # order.
  let mods = "";
  if (ctrl) mods += "^";
  if (alt) mods += "!";
  if (shift) mods += "+";
  if (meta) mods += "#";
  return mods;
}

function friendlyLabel(ctrl, alt, shift, meta, ahkKey) {
  const parts = [];
  if (ctrl) parts.push("Ctrl");
  if (alt) parts.push("Alt");
  if (shift) parts.push("Shift");
  if (meta) parts.push("Win");
  parts.push(displayKey(ahkKey));
  return parts.join("+");
}

function displayKey(ahkKey) {
  if (/^[a-z]$/.test(ahkKey)) return ahkKey.toUpperCase();
  return ahkKey;
}

function isHighCollisionBaseKey(ahkKey) {
  if (/^[a-z]$/.test(ahkKey)) return true;
  if (/^[0-9]$/.test(ahkKey)) return true;
  return (
    ahkKey === "Space" ||
    ahkKey === "Enter" ||
    ahkKey === "Tab" ||
    ahkKey === "Backspace" ||
    ahkKey === "Delete"
  );
}

/**
 * @param {string} key
 * @param {string} code
 * @returns {string | null}
 */
function ahkKeyFromEvent(key, code) {
  if (!key) return null;

  // Modifier-only presses are not a complete External hotkey.
  if (
    key === "Control" ||
    key === "Shift" ||
    key === "Alt" ||
    key === "Meta" ||
    key === "AltGraph"
  ) {
    return null;
  }

  if (/^F\d{1,2}$/.test(key)) return key;

  // Prefer event.code for numpad so "1" on Numpad1 does not collapse to Digit1.
  if (/^Numpad[0-9]$/.test(code)) return code; // Numpad0..Numpad9
  if (code === "NumpadDecimal") return "NumpadDot";
  if (code === "NumpadAdd") return "NumpadAdd";
  if (code === "NumpadSubtract") return "NumpadSub";
  if (code === "NumpadMultiply") return "NumpadMult";
  if (code === "NumpadDivide") return "NumpadDiv";
  if (code === "NumpadEnter") return "NumpadEnter";
  if (code === "NumLock") return "NumLock";

  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^[a-zA-Z]$/.test(key)) return key.toLowerCase();

  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^[0-9]$/.test(key)) return key;

  const named = {
    " ": "Space",
    Spacebar: "Space",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PgUp",
    PageDown: "PgDn",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
  };
  if (Object.prototype.hasOwnProperty.call(named, key)) return named[key];
  if (code === "Space") return "Space";

  return null;
}
