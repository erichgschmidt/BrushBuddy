// Tests for the op-stack engine. Tiny inline runner — no vitest dependency.
// Run via: npx tsc --noEmit  (type-checks)
// Or compile + execute via webpack/node-with-tsx if available.
//
// Uses only primitives that exist today: desaturate, levels. The engine's
// behavior under add/remove/reorder/toggle/memo is independent of which
// primitives are wired.

import { PixelBuffer } from "./types";
import {
  Op,
  OpStackState,
  addOp,
  removeOp,
  moveOp,
  toggleOp,
  updateOpParams,
  setSource,
  runStack,
  runStackMemoized,
  __resetRunCounter,
  __getRunCounter,
  __clearCache,
} from "./opstack";
import { serializeStack, deserializeStack } from "./opstack.serial";

// ---------------------------------------------------------------------------
// Minimal test harness.
// ---------------------------------------------------------------------------

type TestFn = () => void | Promise<void>;
const tests: { name: string; fn: TestFn }[] = [];
function test(name: string, fn: TestFn): void { tests.push({ name, fn }); }

function assert(cond: any, msg: string): void {
  if (!cond) throw new Error("assertion failed: " + msg);
}
function assertEq<T>(a: T, b: T, msg: string): void {
  if (a !== b) throw new Error(`assertion failed: ${msg} — got ${String(a)}, expected ${String(b)}`);
}
function buffersEqual(a: PixelBuffer, b: PixelBuffer): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

function makeSource(): PixelBuffer {
  // 4x4 RGBA gradient — non-uniform so transforms produce distinct outputs.
  const w = 4, h = 4;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = (x * 60) & 0xff;
      data[i + 1] = (y * 60) & 0xff;
      data[i + 2] = ((x + y) * 30) & 0xff;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

function emptyState(src: PixelBuffer | null = null): OpStackState {
  return { source: src, ops: [] };
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

test("add 3 ops, run, remove middle, run — sequence matches expected", () => {
  __clearCache();
  const src = makeSource();
  let s = emptyState(src);
  s = addOp(s, { kind: "desaturate", enabled: true, params: {} });
  s = addOp(s, { kind: "levels",     enabled: true, params: { blackPoint: 30, whitePoint: 220, gamma: 1.2 } });
  s = addOp(s, { kind: "desaturate", enabled: true, params: {} });
  assertEq(s.ops.length, 3, "3 ops added");

  const full = runStack(s)!;
  assert(full, "full run produced output");

  // Remove middle.
  const middleId = s.ops[1].id;
  const s2 = removeOp(s, middleId);
  assertEq(s2.ops.length, 2, "middle removed");

  // Build expected: desaturate -> desaturate (idempotent on already-gray).
  const expectedState = emptyState(src);
  let exp: OpStackState = expectedState;
  exp = addOp(exp, { kind: "desaturate", enabled: true, params: {} });
  exp = addOp(exp, { kind: "desaturate", enabled: true, params: {} });
  const expectedOut = runStack(exp)!;
  const actualOut = runStack(s2)!;
  assert(buffersEqual(actualOut, expectedOut), "remove-middle output matches expected sequence");
});

test("toggling op off skips it", () => {
  __clearCache();
  const src = makeSource();
  let s = emptyState(src);
  s = addOp(s, { kind: "levels", enabled: true, params: { blackPoint: 50, whitePoint: 200, gamma: 1 } });

  const enabledOut = runStack(s)!;
  const sToggled = toggleOp(s, s.ops[0].id);
  assertEq(sToggled.ops[0].enabled, false, "toggled to disabled");
  const disabledOut = runStack(sToggled)!;

  // Disabled => identical to source.
  assert(buffersEqual(disabledOut, src), "disabled op leaves source unchanged");
  assert(!buffersEqual(enabledOut, src), "enabled op altered source");
});

test("reordering changes output", () => {
  __clearCache();
  const src = makeSource();
  let s = emptyState(src);
  s = addOp(s, { kind: "levels",     enabled: true, params: { blackPoint: 100, whitePoint: 200, gamma: 1 } });
  s = addOp(s, { kind: "desaturate", enabled: true, params: {} });

  const orderA = runStack(s)!;
  const sB = moveOp(s, s.ops[0].id, 1); // swap order
  const orderB = runStack(sB)!;

  // levels-then-desaturate vs desaturate-then-levels should differ for a
  // non-grayscale source (since levels per-channel clipping differs once
  // RGB are equal vs not).
  assert(!buffersEqual(orderA, orderB), "reorder produced different output");
});

test("memoization: editing op #2 of 4 only re-runs from op #2 forward", () => {
  __clearCache();
  __resetRunCounter();
  const src = makeSource();
  let s = emptyState(src);
  s = addOp(s, { kind: "desaturate", enabled: true, params: {} });
  s = addOp(s, { kind: "levels",     enabled: true, params: { blackPoint: 10, whitePoint: 240, gamma: 1 } });
  s = addOp(s, { kind: "levels",     enabled: true, params: { blackPoint: 20, whitePoint: 230, gamma: 1.1 } });
  s = addOp(s, { kind: "desaturate", enabled: true, params: {} });

  // First memoized run: all 4 ops execute.
  __resetRunCounter();
  runStackMemoized(s, { useMemo: true });
  assertEq(__getRunCounter(), 4, "first run executes all 4 ops");

  // Second run, same state: nothing should re-execute.
  __resetRunCounter();
  runStackMemoized(s, { useMemo: true });
  assertEq(__getRunCounter(), 0, "second identical run hits cache for all 4");

  // Edit op #2 (index 1) params: ops 0 unchanged (cache hit), op 1
  // re-runs (paramsHash changes), ops 2 and 3 re-run (prevOutputHash changes).
  const op2id = s.ops[1].id;
  const sEdited = updateOpParams(s, op2id, { whitePoint: 200 });
  __resetRunCounter();
  runStackMemoized(sEdited, { useMemo: true });
  assertEq(__getRunCounter(), 3, "editing op #2 re-runs ops 2, 3, 4 only (op 1 cached)");
});

test("serialize → deserialize → run produces same output", () => {
  __clearCache();
  const src = makeSource();
  let s = emptyState(src);
  s = addOp(s, { kind: "desaturate", enabled: true,  params: {} });
  s = addOp(s, { kind: "levels",     enabled: false, params: { blackPoint: 30, whitePoint: 220, gamma: 1.2 } });
  s = addOp(s, { kind: "levels",     enabled: true,  params: { blackPoint: 10, whitePoint: 240, gamma: 0.9 } });

  const json = serializeStack(s);
  const restored = deserializeStack(json, src);

  assertEq(restored.ops.length, s.ops.length, "op count preserved");
  for (let i = 0; i < s.ops.length; i++) {
    const a: Op = s.ops[i], b: Op = restored.ops[i];
    assertEq(a.id, b.id, `op[${i}].id`);
    assertEq(a.kind, b.kind, `op[${i}].kind`);
    assertEq(a.enabled, b.enabled, `op[${i}].enabled`);
    assertEq(JSON.stringify(a.params), JSON.stringify(b.params), `op[${i}].params`);
  }

  const before = runStack(s)!;
  const after = runStack(restored)!;
  assert(buffersEqual(before, after), "deserialized stack produces identical output");

  // Source is not in the JSON.
  const parsed = JSON.parse(json);
  assert(!("source" in parsed), "source not serialized");
});

test("setSource updates source immutably", () => {
  const a = makeSource();
  const b = makeSource();
  const s1 = emptyState(a);
  const s2 = setSource(s1, b);
  assert(s1.source === a, "original state untouched");
  assert(s2.source === b, "new state has new source");
  assert(s1 !== s2, "new state object returned");
});

// ---------------------------------------------------------------------------
// Runner — invoked when this file is executed directly.
// ---------------------------------------------------------------------------

export async function runAllTests(): Promise<{ passed: number; failed: number; failures: string[] }> {
  let passed = 0, failed = 0;
  const failures: string[] = [];
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      // eslint-disable-next-line no-console
      console.log("  ok  " + t.name);
    } catch (e: any) {
      failed++;
      const msg = `  FAIL  ${t.name}: ${e?.message || e}`;
      failures.push(msg);
      // eslint-disable-next-line no-console
      console.error(msg);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`\n${passed} passed, ${failed} failed`);
  return { passed, failed, failures };
}
