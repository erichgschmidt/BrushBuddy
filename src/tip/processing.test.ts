// Unit tests for tip/processing primitives.
// Run via: npm test  (compiles to dist/tip-test/ then runs with node).

import { PixelBuffer, createBuffer } from "./types";
import {
  invert, mirror, threshold, autoCrop, alphaFromLuminance,
  desaturate, levels, autoLevels, gaussianBlur, unsharpMask,
  erode, dilate, noise, autoCenter, resize, pad,
} from "./processing";

type Test = { name: string; fn: () => void };
const tests: Test[] = [];
function test(name: string, fn: () => void): void { tests.push({ name, fn }); }
function expect(actual: unknown): {
  toBe: (expected: unknown) => void;
  toEqual: (expected: unknown) => void;
  toBeLessThan: (n: number) => void;
} {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual), b = JSON.stringify(expected);
      if (a !== b) throw new Error(`expected ${b}, got ${a}`);
    },
    toBeLessThan(n: number) {
      if (typeof actual !== "number" || !(actual < n)) throw new Error(`expected <${n}, got ${String(actual)}`);
    },
  };
}

function makeBuf(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): PixelBuffer {
  const buf = createBuffer(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fn(x, y);
      const i = (y * w + x) * 4;
      buf.data[i] = r; buf.data[i + 1] = g; buf.data[i + 2] = b; buf.data[i + 3] = a;
    }
  }
  return buf;
}

function bufEqual(a: PixelBuffer, b: PixelBuffer): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

// --- tests --------------------------------------------------------------

test("invert(invert(x)) === x", () => {
  const buf = makeBuf(8, 8, (x, y) => [x * 31 & 255, y * 17 & 255, (x ^ y) * 7 & 255, 200]);
  const round = invert(invert(buf));
  expect(bufEqual(buf, round)).toBe(true);
});

test("threshold soft=0 yields only 0 or 255 in alpha", () => {
  const buf = makeBuf(16, 16, (x, _y) => [x * 16, x * 16, x * 16, 255]);
  const out = threshold(buf, { value: 128, soft: 0 });
  for (let i = 3; i < out.data.length; i += 4) {
    const a = out.data[i];
    if (a !== 0 && a !== 255) throw new Error(`alpha not binary: ${a}`);
  }
});

test("autoCrop trims a black square in a white image", () => {
  // 32x32 white, with a 4x4 black square at (10,12).
  const buf = makeBuf(32, 32, () => [255, 255, 255, 255]);
  for (let y = 12; y < 16; y++) {
    for (let x = 10; x < 14; x++) {
      const i = (y * 32 + x) * 4;
      buf.data[i] = 0; buf.data[i + 1] = 0; buf.data[i + 2] = 0;
    }
  }
  const cropped = autoCrop(buf, { paddingPx: 0 });
  expect(cropped.width).toBe(4);
  expect(cropped.height).toBe(4);
});

test("alphaFromLuminance: pure black => alpha 255", () => {
  const buf = makeBuf(4, 4, () => [0, 0, 0, 255]);
  const out = alphaFromLuminance(buf);
  for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(255);
});

test("alphaFromLuminance: pure white => alpha 0", () => {
  const buf = makeBuf(4, 4, () => [255, 255, 255, 255]);
  const out = alphaFromLuminance(buf);
  for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(0);
});

test("mirror twice = identity (x and y)", () => {
  const buf = makeBuf(7, 5, (x, y) => [x * 30, y * 50, (x + y) * 20 & 255, 255]);
  const x2 = mirror(mirror(buf, { axis: "x" }), { axis: "x" });
  const y2 = mirror(mirror(buf, { axis: "y" }), { axis: "y" });
  expect(bufEqual(buf, x2)).toBe(true);
  expect(bufEqual(buf, y2)).toBe(true);
});

test("desaturate produces grayscale (R=G=B)", () => {
  const buf = makeBuf(3, 3, (x, y) => [x * 80, y * 80, 100, 255]);
  const out = desaturate(buf);
  for (let i = 0; i < out.data.length; i += 4) {
    expect(out.data[i] === out.data[i + 1] && out.data[i + 1] === out.data[i + 2]).toBe(true);
  }
});

test("levels identity returns unchanged data", () => {
  const buf = makeBuf(4, 4, (x, y) => [x * 60, y * 60, 50, 255]);
  const out = levels(buf, {});
  expect(bufEqual(buf, out)).toBe(true);
});

test("autoLevels stretches a low-contrast image", () => {
  const buf = makeBuf(8, 8, () => [100, 100, 100, 255]);
  // single value won't stretch, add a couple of extreme pixels
  buf.data[0] = 80; buf.data[1] = 80; buf.data[2] = 80;
  const i2 = 4 * 4;
  buf.data[i2] = 120; buf.data[i2 + 1] = 120; buf.data[i2 + 2] = 120;
  const out = autoLevels(buf, { clip: 0 });
  // mid value should now be near 255 since original whitepoint was 120.
  let max = 0;
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i] > max) max = out.data[i];
  expect(max).toBe(255);
});

test("gaussianBlur radius 0 is no-op", () => {
  const buf = makeBuf(5, 5, (x, y) => [x * 50, y * 50, 0, 255]);
  const out = gaussianBlur(buf, { radiusPx: 0 });
  expect(bufEqual(buf, out)).toBe(true);
});

test("gaussianBlur radius 2 reduces variance", () => {
  const buf = makeBuf(16, 16, (x, y) => [(x ^ y) * 16 & 255, 0, 0, 255]);
  const out = gaussianBlur(buf, { radiusPx: 2 });
  expect(varianceR(out) < varianceR(buf)).toBe(true);
});
function varianceR(b: PixelBuffer): number {
  let mean = 0; const n = b.width * b.height;
  for (let i = 0; i < b.data.length; i += 4) mean += b.data[i];
  mean /= n;
  let v = 0;
  for (let i = 0; i < b.data.length; i += 4) { const d = b.data[i] - mean; v += d * d; }
  return v / n;
}

test("unsharpMask amount=0 is no-op", () => {
  const buf = makeBuf(6, 6, (x, _y) => [x * 40, 0, 0, 255]);
  const out = unsharpMask(buf, { radiusPx: 1, amount: 0, threshold: 0 });
  expect(bufEqual(buf, out)).toBe(true);
});

test("erode then dilate is approximately idempotent on a hard square", () => {
  const buf = makeBuf(20, 20, (x, y) => {
    const inside = x >= 6 && x < 14 && y >= 6 && y < 14;
    return [0, 0, 0, inside ? 255 : 0];
  });
  const e = erode(buf, { radiusPx: 1 });
  const d = dilate(e, { radiusPx: 1 });
  // Should still contain the original interior (the (8..12,8..12) core).
  for (let y = 8; y < 12; y++) {
    for (let x = 8; x < 12; x++) {
      expect(d.data[(y * 20 + x) * 4 + 3]).toBe(255);
    }
  }
});

test("noise amount=0 is no-op", () => {
  const buf = makeBuf(5, 5, () => [128, 128, 128, 255]);
  const out = noise(buf, { amount: 0, mode: "additive" });
  expect(bufEqual(buf, out)).toBe(true);
});

test("noise is deterministic given seed", () => {
  const buf = makeBuf(5, 5, () => [128, 128, 128, 255]);
  const a = noise(buf, { amount: 50, mode: "additive", seed: 42 });
  const b = noise(buf, { amount: 50, mode: "additive", seed: 42 });
  expect(bufEqual(a, b)).toBe(true);
});

test("autoCenter centers a single black dot in pow2 square", () => {
  const buf = makeBuf(10, 10, () => [255, 255, 255, 255]);
  // Single dark dot at (1,2)
  const i = (2 * 10 + 1) * 4;
  buf.data[i] = 0; buf.data[i + 1] = 0; buf.data[i + 2] = 0;
  const out = autoCenter(buf);
  expect(out.width).toBe(out.height);
  // Power of two
  expect((out.width & (out.width - 1)) === 0).toBe(true);
});

test("resize identity dims clones data", () => {
  const buf = makeBuf(4, 4, (x, y) => [x * 60, y * 60, 0, 255]);
  const out = resize(buf, { width: 4, height: 4 });
  expect(bufEqual(buf, out)).toBe(true);
});

test("resize downscale 8->4", () => {
  const buf = makeBuf(8, 8, (x, y) => [x * 30, y * 30, 0, 255]);
  const out = resize(buf, { width: 4, height: 4 });
  expect(out.width).toBe(4);
  expect(out.height).toBe(4);
});

test("resize caps at 2500", () => {
  const buf = makeBuf(2, 2, () => [0, 0, 0, 255]);
  const out = resize(buf, { width: 9999, height: 9999 });
  expect(out.width).toBe(2500);
  expect(out.height).toBe(2500);
});

test("pad enlarges canvas with transparent background", () => {
  const buf = makeBuf(2, 2, () => [255, 0, 0, 255]);
  const out = pad(buf, { width: 6, height: 6 });
  expect(out.width).toBe(6);
  expect(out.height).toBe(6);
  // Corner is transparent
  expect(out.data[3]).toBe(0);
});

// --- runner ---------------------------------------------------------------

let pass = 0, fail = 0;
const failures: string[] = [];
for (const t of tests) {
  try { t.fn(); pass++; }
  catch (e) { fail++; failures.push(`  - ${t.name}: ${(e as Error).message}`); }
}
const total = tests.length;
// eslint-disable-next-line no-console
console.log(`tip/processing tests: ${pass}/${total} passed${fail ? `, ${fail} failed` : ""}`);
if (fail) {
  // eslint-disable-next-line no-console
  console.log(failures.join("\n"));
  process.exit(1);
}
