/**
 * Unit tests for Skip burst cumulative toast accounting (#11).
 * Seam: shared/skip-burst.js (applySkipToBurst, clearSkipBurst).
 */
import {
  SKIP_BURST_WINDOW_MS,
  applySkipToBurst,
  clearSkipBurst,
} from "../shared/skip-burst.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${message}: expected ${e}, got ${a}`);
}

const base = {
  intervalIndex: 1,
  sign: 1,
  intervalSeconds: 10,
  toastDurationMs: 1500,
};

// --- Slice 1: single skip starts a burst at one interval ---

{
  const result = applySkipToBurst(null, { ...base, now: 1000 });
  assert(result.intendedSeconds === 10, "single skip intended seconds is one interval");
  assertDeepEqual(
    result.toast,
    { ic: "»", name: "+10s", det: "" },
    "single forward skip toast",
  );
  assert(result.hideMs === SKIP_BURST_WINDOW_MS, "hideMs is max(2000, 1500) = 2000");
  assert(result.state.count === 1, "burst count starts at 1");
  assert(result.state.intervalIndex === 1 && result.state.sign === 1, "burst tracks interval and direction");
}

// --- Three rapid same-interval same-direction skips accumulate ---

{
  let state = null;
  let r = applySkipToBurst(state, { ...base, now: 0 });
  state = r.state;
  r = applySkipToBurst(state, { ...base, now: 500 });
  state = r.state;
  r = applySkipToBurst(state, { ...base, now: 1000 });
  assert(r.intendedSeconds === 30, "three +10s presses → intended 30");
  assertDeepEqual(r.toast, { ic: "»", name: "+30s", det: "" }, "cumulative toast +30s");
  assert(r.state.count === 3, "burst count is 3");
}

// --- Idle longer than window starts a new burst ---

{
  let state = applySkipToBurst(null, { ...base, now: 0 }).state;
  const r = applySkipToBurst(state, { ...base, now: SKIP_BURST_WINDOW_MS + 1 });
  assert(r.intendedSeconds === 10, "after >2000ms idle, burst restarts at one interval");
  assert(r.state.count === 1, "count resets after idle");
}

// --- Different Skip interval clears prior burst ---

{
  let state = applySkipToBurst(null, { ...base, now: 0 }).state;
  state = applySkipToBurst(state, { ...base, now: 100 }).state;
  const r = applySkipToBurst(state, {
    ...base,
    intervalIndex: 0,
    intervalSeconds: 5,
    now: 200,
  });
  assert(r.intendedSeconds === 5, "switching interval starts fresh at new interval size");
  assertDeepEqual(r.toast, { ic: "»", name: "+5s", det: "" }, "new interval toast");
}

// --- Opposite direction clears prior burst ---

{
  let state = applySkipToBurst(null, { ...base, now: 0 }).state;
  state = applySkipToBurst(state, { ...base, now: 100 }).state;
  const r = applySkipToBurst(state, {
    ...base,
    sign: -1,
    now: 200,
  });
  assert(r.intendedSeconds === 10, "opposite direction starts fresh at one interval");
  assertDeepEqual(r.toast, { ic: "«", name: "−10s", det: "" }, "back skip toast uses « and −");
}

// --- clearSkipBurst ends accumulation for the next skip ---

{
  let state = applySkipToBurst(null, { ...base, now: 0 }).state;
  state = applySkipToBurst(state, { ...base, now: 100 }).state;
  state = clearSkipBurst();
  assert(state === null, "clearSkipBurst returns null");
  const r = applySkipToBurst(state, { ...base, now: 200 });
  assert(r.intendedSeconds === 10, "skip after clear starts a new burst");
}

// --- hideMs honors longer toastDurationMs ---

{
  const r = applySkipToBurst(null, { ...base, toastDurationMs: 3000, now: 0 });
  assert(r.hideMs === 3000, "hideMs is max(2000, 3000) = 3000");
}

// --- Boundary of window: exactly 2000ms still joins ---

{
  let state = applySkipToBurst(null, { ...base, now: 0 }).state;
  const r = applySkipToBurst(state, { ...base, now: SKIP_BURST_WINDOW_MS });
  assert(r.intendedSeconds === 20, "skip at exactly 2000ms still joins the burst");
}

// --- Intended cumulative is independent of media clamping ---
// (callers seek with single-press delta; toast always uses press count × interval)

{
  let state = null;
  let r = applySkipToBurst(state, { ...base, now: 0 });
  state = r.state;
  r = applySkipToBurst(state, { ...base, now: 100 });
  assert(
    r.intendedSeconds === 20 && r.toast.name === "+20s",
    "clamped currentTime must not reduce intended cumulative toast",
  );
}

console.log("skip-burst unit tests passed.");
