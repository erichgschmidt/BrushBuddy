// Non-destructive op-stack engine for the Tip Editor.
// Pure TS state machine — no UXP, no Photoshop, no DOM.
// Pipeline: source PixelBuffer → enabled ops in order → final PixelBuffer.
// Mutations return new state objects (immutable). Cache is module-private,
// keyed by (opId, paramsHash, prevOutputHash), bounded LRU ~32 entries.

import { PixelBuffer } from "./types";
import * as P from "./processing";

export type OpKind =
  | "desaturate" | "levels" | "autoLevels"
  | "threshold" | "invert" | "mirrorX" | "mirrorY"
  | "gaussianBlur" | "unsharpMask"
  | "erode" | "dilate"
  | "noise"
  | "autoCrop" | "autoCenter"
  | "alphaFromLuminance"
  | "resize" | "pad";

export interface Op {
  id: string;
  kind: OpKind;
  enabled: boolean;
  params: Record<string, any>;
}

export interface OpStackState {
  source: PixelBuffer | null;
  ops: Op[];
}

// ---------------------------------------------------------------------------
// Op metadata + defaults.
// ---------------------------------------------------------------------------

const META: Record<OpKind, { label: string; description: string; defaults: Record<string, any> }> = {
  desaturate:        { label: "Desaturate",          description: "Convert to grayscale via Rec.601 luminance.",       defaults: {} },
  levels:            { label: "Levels",              description: "Manual black/white/gamma remap.",                   defaults: { blackPoint: 0, whitePoint: 255, gamma: 1.0 } },
  autoLevels:        { label: "Auto Levels",         description: "Stretch luminance to full range.",                  defaults: {} },
  threshold:         { label: "Threshold",           description: "Hard or soft cutoff to black/white.",              defaults: { value: 128, soft: 0 } },
  invert:            { label: "Invert",              description: "Invert RGB.",                                       defaults: {} },
  mirrorX:           { label: "Mirror X",            description: "Flip horizontally.",                                defaults: {} },
  mirrorY:           { label: "Mirror Y",            description: "Flip vertically.",                                  defaults: {} },
  gaussianBlur:      { label: "Gaussian Blur",       description: "Separable Gaussian blur.",                          defaults: { radiusPx: 2 } },
  unsharpMask:       { label: "Unsharp Mask",        description: "Edge sharpen via blurred-difference.",              defaults: { radiusPx: 2, amount: 0.5, threshold: 0 } },
  erode:             { label: "Erode",               description: "Morphological erosion (shrink alpha).",             defaults: { radiusPx: 1 } },
  dilate:            { label: "Dilate",              description: "Morphological dilation (grow alpha).",              defaults: { radiusPx: 1 } },
  noise:             { label: "Noise",               description: "Additive grain.",                                   defaults: { amount: 10, mode: "additive" as const, seed: 1 } },
  autoCrop:          { label: "Auto Crop",           description: "Trim to non-transparent bounds.",                   defaults: { paddingPx: 0 } },
  autoCenter:        { label: "Auto Center",         description: "Recenter content within canvas.",                   defaults: { pow2: true } },
  alphaFromLuminance:{ label: "Alpha from Luminance",description: "Build alpha channel from inverted luminance.",      defaults: { blackRgb: true } },
  resize:            { label: "Resize",              description: "Resample to width × height.",                       defaults: { width: 256, height: 256 } },
  pad:               { label: "Pad",                 description: "Add transparent padding to a target size.",         defaults: { width: 256, height: 256 } },
};

export function defaultParamsFor(kind: OpKind): Record<string, any> {
  return { ...META[kind].defaults };
}

export function opMeta(kind: OpKind): { label: string; description: string } {
  const m = META[kind];
  return { label: m.label, description: m.description };
}

// ---------------------------------------------------------------------------
// Dispatch — call into ../processing primitives. Sibling agent owns those.
// If a primitive isn't exported yet, throw a clear error rather than fake it.
// ---------------------------------------------------------------------------

type Primitive = (input: PixelBuffer, params: Record<string, any>) => PixelBuffer;

function callPrimitive(name: OpKind, fn: any, input: PixelBuffer, params: Record<string, any>): PixelBuffer {
  if (typeof fn !== "function") {
    throw new Error(`opstack: primitive '${name}' not implemented in src/tip/processing yet`);
  }
  return (fn as Primitive)(input, params);
}

function dispatch(op: Op, input: PixelBuffer): PixelBuffer {
  // Map each kind to its primitive. Most primitives take (input, params);
  // a few take no params (desaturate/invert/mirror/autoLevels) — the
  // primitive functions are still expected to accept (input, params?) for
  // a uniform call shape. If the sibling exports a no-arg version, the
  // ignored 2nd arg is harmless.
  const reg = P as any;
  switch (op.kind) {
    case "desaturate":         return callPrimitive(op.kind, reg.desaturate,         input, op.params);
    case "levels":             return callPrimitive(op.kind, reg.levels,             input, op.params);
    case "autoLevels":         return callPrimitive(op.kind, reg.autoLevels,         input, op.params);
    case "threshold":          return callPrimitive(op.kind, reg.threshold,          input, op.params);
    case "invert":             return callPrimitive(op.kind, reg.invert,             input, op.params);
    case "mirrorX":            return callPrimitive(op.kind, reg.mirror,            input, { ...op.params, axis: "x" });
    case "mirrorY":            return callPrimitive(op.kind, reg.mirror,            input, { ...op.params, axis: "y" });
    case "gaussianBlur":       return callPrimitive(op.kind, reg.gaussianBlur,       input, op.params);
    case "unsharpMask":        return callPrimitive(op.kind, reg.unsharpMask,        input, op.params);
    case "erode":              return callPrimitive(op.kind, reg.erode,              input, op.params);
    case "dilate":             return callPrimitive(op.kind, reg.dilate,             input, op.params);
    case "noise":              return callPrimitive(op.kind, reg.noise,              input, op.params);
    case "autoCrop":           return callPrimitive(op.kind, reg.autoCrop,           input, op.params);
    case "autoCenter":         return callPrimitive(op.kind, reg.autoCenter,         input, op.params);
    case "alphaFromLuminance": return callPrimitive(op.kind, reg.alphaFromLuminance, input, op.params);
    case "resize":             return callPrimitive(op.kind, reg.resize,             input, op.params);
    case "pad":                return callPrimitive(op.kind, reg.pad,                input, op.params);
  }
}

// ---------------------------------------------------------------------------
// Stable id generation (uuid-ish; not cryptographic).
// ---------------------------------------------------------------------------

let __idCounter = 0;
function newId(): string {
  __idCounter = (__idCounter + 1) | 0;
  return `op_${Date.now().toString(36)}_${__idCounter.toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Hashing — cheap and deterministic. FNV-1a 32-bit over a stable string repr.
// ---------------------------------------------------------------------------

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) | 0;
  }
  return h >>> 0;
}

function stableStringify(v: any): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

function paramsHash(op: Op): number {
  return fnv1a(op.kind + "|" + stableStringify(op.params));
}

function bufferHash(buf: PixelBuffer): number {
  // Sample-hash: full pixel hash is O(n); for caching purposes a strided
  // sample is sufficient — collisions only mean a redundant recompute.
  const d = buf.data;
  const n = d.length;
  // Stride chosen so we touch ~512 bytes regardless of size.
  const stride = Math.max(4, ((n / 512) | 0) & ~3) || 4;
  let h = 0x811c9dc5 ^ buf.width ^ (buf.height << 16);
  for (let i = 0; i < n; i += stride) {
    h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) | 0;
  }
  // Mix in length so resized buffers don't alias.
  h ^= n;
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// LRU cache (module-private). Key: opId + paramsHash + prevOutputHash.
// Value: cached output buffer + its own hash (so the next op can key off it
// without re-hashing).
// ---------------------------------------------------------------------------

interface CacheEntry {
  key: string;
  output: PixelBuffer;
  outputHash: number;
}

const CACHE_CAP = 32;
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  // Touch — Map preserves insertion order, so re-set to mark MRU.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, output: PixelBuffer, outputHash: number): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { key, output, outputHash });
  while (cache.size > CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// Test hook — exported via a private name so tests can spy on recomputes
// without exposing it as part of the public API.
let __runCounter = 0;
export function __resetRunCounter(): void { __runCounter = 0; }
export function __getRunCounter(): number { return __runCounter; }
export function __clearCache(): void { cache.clear(); }

// ---------------------------------------------------------------------------
// Public: run pipeline.
// ---------------------------------------------------------------------------

function runRange(state: OpStackState, endExclusive: number, useMemo: boolean): PixelBuffer | null {
  if (!state.source) return null;
  let current: PixelBuffer = state.source;
  let prevHash = useMemo ? bufferHash(current) : 0;

  for (let i = 0; i < endExclusive; i++) {
    const op = state.ops[i];
    if (!op.enabled) continue;

    if (useMemo) {
      const key = op.id + ":" + paramsHash(op).toString(16) + ":" + prevHash.toString(16);
      const hit = cacheGet(key);
      if (hit) {
        current = hit.output;
        prevHash = hit.outputHash;
        continue;
      }
      __runCounter++;
      const out = dispatch(op, current);
      const outHash = bufferHash(out);
      cacheSet(key, out, outHash);
      current = out;
      prevHash = outHash;
    } else {
      __runCounter++;
      current = dispatch(op, current);
    }
  }
  return current;
}

export function runStack(state: OpStackState): PixelBuffer | null {
  return runRange(state, state.ops.length, false);
}

export function runStackPartial(state: OpStackState, upToIndex: number): PixelBuffer | null {
  const end = Math.max(0, Math.min(state.ops.length, upToIndex + 1));
  return runRange(state, end, false);
}

export interface RunOptions { useMemo?: boolean }
export function runStackMemoized(state: OpStackState, options?: RunOptions): PixelBuffer | null {
  const useMemo = options?.useMemo ?? true;
  return runRange(state, state.ops.length, useMemo);
}

// ---------------------------------------------------------------------------
// Public: immutable mutation helpers.
// ---------------------------------------------------------------------------

export function addOp(state: OpStackState, op: Omit<Op, "id">, atIndex?: number): OpStackState {
  const next: Op = { id: newId(), kind: op.kind, enabled: op.enabled, params: { ...op.params } };
  const ops = state.ops.slice();
  const idx = atIndex === undefined || atIndex < 0 || atIndex > ops.length ? ops.length : atIndex;
  ops.splice(idx, 0, next);
  return { ...state, ops };
}

export function removeOp(state: OpStackState, id: string): OpStackState {
  const ops = state.ops.filter((o) => o.id !== id);
  return ops.length === state.ops.length ? state : { ...state, ops };
}

export function moveOp(state: OpStackState, id: string, toIndex: number): OpStackState {
  const from = state.ops.findIndex((o) => o.id === id);
  if (from < 0) return state;
  const ops = state.ops.slice();
  const [op] = ops.splice(from, 1);
  const clamped = Math.max(0, Math.min(ops.length, toIndex));
  ops.splice(clamped, 0, op);
  return { ...state, ops };
}

export function toggleOp(state: OpStackState, id: string): OpStackState {
  const ops = state.ops.map((o) => (o.id === id ? { ...o, enabled: !o.enabled } : o));
  return { ...state, ops };
}

export function updateOpParams(state: OpStackState, id: string, params: Partial<Op["params"]>): OpStackState {
  const ops = state.ops.map((o) => (o.id === id ? { ...o, params: { ...o.params, ...params } } : o));
  return { ...state, ops };
}

export function setSource(state: OpStackState, source: PixelBuffer | null): OpStackState {
  return { ...state, source };
}
