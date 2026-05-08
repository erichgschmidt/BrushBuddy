// Brush-specific batchPlay operations for the M0 spike.
//
// Descriptors are first-pass guesses; the spike's purpose is to find which
// ones don't round-trip on PS 2025+ and correct them via PS's
// `Plugins > Development > Record Action Commands` (or the Alchemist plugin).
//
// Naming convention: every volatile artifact is namespaced "BrushBuddy ..." so
// we can find and prune them on session end.

import { bp, executeAsModal, getActiveDoc } from "./photoshop";
import { action } from "photoshop";

export const LIVE_PREVIEW_NAME = "BrushBuddy Live Preview";
export const PROOF_LAYER_NAME = "BrushBuddy Proof";

// ---------------------------------------------------------------------------
// Building blocks (each step is a separate button so we can isolate failures).
// ---------------------------------------------------------------------------

export async function prepDesaturate(): Promise<void> {
  await executeAsModal("BrushBuddy: desaturate", async () => {
    // Image > Adjustments > Desaturate. Recorded event id: "desaturate".
    await bp([{ _obj: "desaturate", _options: { dialogOptions: "dontDisplay" } }]);
  });
}

export async function prepAutoLevels(): Promise<void> {
  await executeAsModal("BrushBuddy: auto-tone", async () => {
    // PS 2025 records "Image > Auto Tone" as `levels` with `auto: true`.
    await bp([{ _obj: "levels", auto: true, _options: { dialogOptions: "dontDisplay" } }]);
  });
}

// State: PS may not honor our `name` parameter to defineBrush — when recorded
// manually, brushes get default names like "Sampled Brush 1". After every
// defineBrush we scan the brush list to discover the actual name PS assigned.
let LAST_DEFINED_BRUSH_NAME: string | null = null;
export function getLastDefinedBrushName(): string | null { return LAST_DEFINED_BRUSH_NAME; }

export async function defineBrushFromSelection(name: string = LIVE_PREVIEW_NAME): Promise<string> {
  return await executeAsModal("BrushBuddy: define brush", async () => {
    const doc = getActiveDoc();
    if (!doc.selection || !doc.selection.bounds) {
      throw new Error("Make a rectangular selection first.");
    }
    // Snapshot brush list before, define, snapshot after, diff to find the new one.
    // Optional: snapshot brush list to detect if PS renamed our preset.
    // listBrushNames may fail on some PS builds — that's fine, we trust the
    // name parameter (PS 2025 honors it).
    const before = await listBrushNames().catch(() => [] as string[]);
    await bp([{ _obj: "defineBrush", name, _options: { dialogOptions: "dontDisplay" } }]);
    const after = await listBrushNames().catch(() => [] as string[]);
    const beforeSet = new Set(before);
    const newOnes = after.filter((n) => !beforeSet.has(n));
    const actual = newOnes.find((n) => n === name) ?? newOnes[newOnes.length - 1] ?? name;
    LAST_DEFINED_BRUSH_NAME = actual;
    return actual;
  });
}

// List all brush preset names via batchPlay get-property. Tries a few shapes
// because PS's get-property accepts slightly different forms across versions.
async function listBrushNames(): Promise<string[]> {
  const attempts: any[] = [
    // Form A — property reference, application target (most common).
    [{
      _obj: "get",
      _target: [
        { _ref: "property", _property: "brushes" },
        { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
      ],
      _options: { dialogOptions: "dontDisplay" },
    }],
    // Form B — direct brush listing.
    [{
      _obj: "get",
      _target: [{ _ref: "brush", _enum: "ordinal", _value: "targetEnum" }],
      _options: { dialogOptions: "dontDisplay" },
    }],
  ];
  // Try each shape; swallow PS dialog errors — `listBrushNames` is optional
  // diagnostics, not load-bearing.
  for (const cmd of attempts) {
    try {
      const r = await action.batchPlay(cmd, {});
      const top = r?.[0] as any;
      const candidates: any[] =
        top?.brushes ??
        top?.presetManager?.brushes ??
        (Array.isArray(top) ? top : []) ??
        [];
      const names = candidates.map((b: any) => b?.name).filter((n: any) => typeof n === "string");
      if (names.length) return names;
    } catch { /* try next, no log */ }
  }
  return [];
}

// Public for the debug button in the panel.
export async function debugListBrushes(): Promise<{ count: number; first10: string[]; last10: string[] }> {
  const names = await listBrushNames();
  return { count: names.length, first10: names.slice(0, 10), last10: names.slice(-10) };
}

/**
 * Dump the current brush tool options. We try a handful of get-property
 * shapes and return whichever one comes back with content. This is the
 * authoritative descriptor shape we need to mirror in our `set` calls.
 */
export async function debugDumpCurrentToolOptions(): Promise<any> {
  return await executeAsModal("BrushBuddy: dump tool options", async () => {
    // Brush tool active first.
    try {
      await bp([{
        _obj: "select",
        _target: [{ _ref: "paintbrushTool" }],
        _options: { dialogOptions: "dontDisplay" },
      }]);
    } catch { /* ignore */ }

    const attempts: { label: string; cmd: any[] }[] = [
      {
        label: "property currentToolOptions of application",
        cmd: [{
          _obj: "get",
          _target: [
            { _ref: "property", _property: "currentToolOptions" },
            { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
          ],
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      {
        label: "currentToolOptions targetEnum",
        cmd: [{
          _obj: "get",
          _target: [{ _ref: "currentToolOptions", _enum: "ordinal", _value: "targetEnum" }],
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      {
        label: "paintbrushTool targetEnum",
        cmd: [{
          _obj: "get",
          _target: [{ _ref: "paintbrushTool", _enum: "ordinal", _value: "targetEnum" }],
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      {
        label: "brush targetEnum",
        cmd: [{
          _obj: "get",
          _target: [{ _ref: "brush", _enum: "ordinal", _value: "targetEnum" }],
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
    ];

    const results: { label: string; ok: boolean; keys?: string[]; sample?: any; error?: string }[] = [];
    for (const { label, cmd } of attempts) {
      try {
        const r = await action.batchPlay(cmd, { synchronousExecution: true });
        const top = r?.[0] ?? null;
        const keys = top && typeof top === "object" ? Object.keys(top) : [];
        results.push({ label, ok: true, keys, sample: top });
      } catch (e: any) {
        results.push({ label, ok: false, error: e?.message ?? String(e) });
      }
    }
    // eslint-disable-next-line no-console
    console.log("[BrushBuddy] currentToolOptions probes:", JSON.stringify(results, null, 2));
    // Stash the full payloads on a global so the panel can read + copy them.
    (globalThis as any).__brushBuddyDumps = results;
    return results.map((r) => r.ok ? `✓ ${r.label}: keys=${(r.keys ?? []).slice(0, 12).join(",")}` : `✗ ${r.label}: ${r.error}`);
  });
}

/** Returns the most recent dump's full JSON, suitable for paste. */
export function getLastDumpJson(): string {
  const dumps = (globalThis as any).__brushBuddyDumps;
  if (!dumps) return "(no dump yet — click 'debug: dump tool options' first)";
  return JSON.stringify(dumps, null, 2);
}

// Combined "capture" — runs prep + define, but each step's failure is caught
// individually and reported instead of stopping the whole flow.
export async function captureTipFromSelection(name: string = LIVE_PREVIEW_NAME): Promise<{
  desaturate: "ok" | string;
  autoLevels: "ok" | string;
  defineBrush: "ok" | string;
}> {
  const result = { desaturate: "ok" as "ok" | string, autoLevels: "ok" as "ok" | string, defineBrush: "ok" as "ok" | string };
  try { await prepDesaturate(); } catch (e: any) { result.desaturate = e?.message ?? String(e); }
  try { await prepAutoLevels(); } catch (e: any) { result.autoLevels = e?.message ?? String(e); }
  try { await defineBrushFromSelection(name); } catch (e: any) { result.defineBrush = e?.message ?? String(e); }
  return result;
}

// ---------------------------------------------------------------------------
// Select the brush tool + the named preset.
// ---------------------------------------------------------------------------
export async function selectBrushTool(): Promise<void> {
  await executeAsModal("BrushBuddy: select brush tool", async () => {
    await bp([{
      _obj: "select",
      _target: [{ _ref: "paintbrushTool" }],
      _options: { dialogOptions: "dontDisplay" },
    }]);
  });
}

export async function selectLivePreviewBrush(): Promise<string> {
  return await executeAsModal("BrushBuddy: select live preview", async () => {
    // Brush tool must be active first.
    await bp([{
      _obj: "select",
      _target: [{ _ref: "paintbrushTool" }],
      _options: { dialogOptions: "dontDisplay" },
    }]);
    const target = LAST_DEFINED_BRUSH_NAME ?? LIVE_PREVIEW_NAME;
    // Recorded form from PS 2025: select brush by ref+name.
    await bp([{
      _obj: "select",
      _target: [{ _ref: "brush", _name: target }],
      _options: { dialogOptions: "dontDisplay" },
    }]);
    return target;
  });
}

// ---------------------------------------------------------------------------
// Apply primary dynamics (Stipple-ish recipe).
// Sets the *current brush preset's* settings via currentToolOptions.
// ---------------------------------------------------------------------------
// Minimal: just bump spacing. If this works, we know the target ref is right
// and the failure is in one of the inner sub-descriptors.
export async function applyMinimalSpacingOnly(): Promise<void> {
  await executeAsModal("BrushBuddy: spacing only", async () => {
    await bp([{
      _obj: "select",
      _target: [{ _ref: "paintbrushTool" }],
      _options: { dialogOptions: "dontDisplay" },
    }]);
    await bp([{
      _obj: "set",
      _target: [{
        _ref: [
          { _ref: "property", _property: "currentToolOptions" },
          { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
        ],
      }],
      to: {
        _obj: "currentToolOptions",
        spacing: { _unit: "percentUnit", _value: 180 },
      },
      _options: { dialogOptions: "dontDisplay" },
    }]);
  });
}

// Minimal Shape Dynamics only — adds one panel.
export async function applyShapeDynamicsOnly(): Promise<void> {
  await executeAsModal("BrushBuddy: shape dynamics only", async () => {
    await bp([{
      _obj: "select",
      _target: [{ _ref: "paintbrushTool" }],
      _options: { dialogOptions: "dontDisplay" },
    }]);
    await bp([{
      _obj: "set",
      _target: [{
        _ref: [
          { _ref: "property", _property: "currentToolOptions" },
          { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
        ],
      }],
      to: {
        _obj: "currentToolOptions",
        shapeDynamics: {
          _obj: "shapeDynamics",
          useTipDynamics: true,
          sizeDynamics: 25,
        },
      },
      _options: { dialogOptions: "dontDisplay" },
    }]);
  });
}

export async function applyStippleDynamics(): Promise<void> {
  await executeAsModal("BrushBuddy: apply dynamics", async () => {
    // Ensure brush tool is active — PS gates `set` on currentToolOptions by tool context.
    await bp([{
      _obj: "select",
      _target: [{ _ref: "paintbrushTool" }],
      _options: { dialogOptions: "dontDisplay" },
    }]);
    // Standard target syntax for the active tool's options.
    await bp([{
      _obj: "set",
      _target: [{
        _ref: [
          { _ref: "property", _property: "currentToolOptions" },
          { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
        ],
      }],
      to: {
        _obj: "currentToolOptions",
        spacing: { _unit: "percentUnit", _value: 180 },
        shapeDynamics: {
          _obj: "shapeDynamics",
          useTipDynamics: true,
          sizeDynamics: 25,
          minimumDiameter: { _unit: "percentUnit", _value: 30 },
          angleDynamics: 0,
          roundnessDynamics: 0,
        },
        scatter: {
          _obj: "scatter",
          useScatter: true,
          bothAxes: true,
          scatterDynamics: 60,
          count: 1,
          countDynamics: 40,
        },
        transfer: {
          _obj: "transfer",
          useTransfer: true,
          opacityDynamics: 30,
          minimumOpacity: 30,
        },
      },
      _options: { dialogOptions: "dontDisplay" },
    }]);
  });
}

// ---------------------------------------------------------------------------
// Apply Dual Brush — the riskiest descriptor in the spike.
// ---------------------------------------------------------------------------
export async function applyDualBrush(): Promise<void> {
  await executeAsModal("BrushBuddy: apply dual brush", async () => {
    await bp([{
      _obj: "select",
      _target: [{ _ref: "paintbrushTool" }],
      _options: { dialogOptions: "dontDisplay" },
    }]);
    await bp([{
      _obj: "set",
      _target: [{
        _ref: [
          { _ref: "property", _property: "currentToolOptions" },
          { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
        ],
      }],
      to: {
        _obj: "currentToolOptions",
        dualBrush: {
          _obj: "dualBrush",
          useDualBrush: true,
          blendMode: { _enum: "blendMode", _value: "multiply" },
          spacing: { _unit: "percentUnit", _value: 25 },
          scatter: 50,
          count: 2,
        },
      },
      _options: { dialogOptions: "dontDisplay" },
    }]);
  });
}

// ---------------------------------------------------------------------------
// Render proof stroke: ensure a "BrushBuddy Proof" layer, make a horizontal
// work path, stroke with current brush, delete the path.
// ---------------------------------------------------------------------------
export async function renderProofStroke(): Promise<void> {
  await executeAsModal("BrushBuddy: proof stroke", async () => {
    const doc = getActiveDoc();
    const w = doc.width;
    const h = doc.height;

    // Brush tool must be active for `stroke` to be available.
    await bp([{
      _obj: "select",
      _target: [{ _ref: "paintbrushTool" }],
      _options: { dialogOptions: "dontDisplay" },
    }]);

    const proofLayer = doc.layers.find((l: any) => l.name === PROOF_LAYER_NAME);
    if (!proofLayer) {
      await bp([{
        _obj: "make",
        _target: [{ _ref: "layer" }],
        using: { _obj: "layer", name: PROOF_LAYER_NAME },
        _options: { dialogOptions: "dontDisplay" },
      }]);
    } else {
      await bp([{
        _obj: "select",
        _target: [{ _ref: "layer", _name: PROOF_LAYER_NAME }],
        makeVisible: true,
        _options: { dialogOptions: "dontDisplay" },
      }]);
    }

    const y = h * 0.5;
    const x0 = w * 0.1;
    const x1 = w * 0.9;

    await bp([
      {
        _obj: "make",
        _target: [{ _ref: "path" }],
        using: {
          _obj: "pathClass",
          pathComponents: [{
            _obj: "pathComponent",
            shapeOperation: { _enum: "shapeOperation", _value: "xor" },
            subpathListKey: [{
              _obj: "subpathList",
              closedSubpath: false,
              points: [
                { _obj: "pathPoint", anchor: { _obj: "paint", horizontal: { _unit: "pixelsUnit", _value: x0 }, vertical: { _unit: "pixelsUnit", _value: y } } },
                { _obj: "pathPoint", anchor: { _obj: "paint", horizontal: { _unit: "pixelsUnit", _value: x1 }, vertical: { _unit: "pixelsUnit", _value: y } } },
              ],
            }],
          }],
        },
        _options: { dialogOptions: "dontDisplay" },
      },
      {
        _obj: "stroke",
        _target: [{ _ref: "path", _enum: "ordinal", _value: "targetEnum" }],
        using: { _enum: "strokeToolType", _value: "brushTool" },
        _options: { dialogOptions: "dontDisplay" },
      },
      {
        _obj: "delete",
        _target: [{ _ref: "path", _enum: "ordinal", _value: "targetEnum" }],
        _options: { dialogOptions: "dontDisplay" },
      },
    ]);
  });
}

// ---------------------------------------------------------------------------
// Loop test — define + dynamics + proof stroke in a tight loop.
// ---------------------------------------------------------------------------
export interface LoopResult { cycles: number; samplesMs: number[]; medianMs: number; p95Ms: number; }

export async function loopTest(cycles: number = 10): Promise<LoopResult> {
  const samples: number[] = [];
  for (let i = 0; i < cycles; i++) {
    const t0 = performance.now();
    await defineBrushFromSelection();
    await selectLivePreviewBrush();
    await applyStippleDynamics();
    await renderProofStroke();
    samples.push(performance.now() - t0);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return { cycles, samplesMs: samples, medianMs: median, p95Ms: p95 };
}

// ---------------------------------------------------------------------------
// Cleanup volatile artifacts.
// ---------------------------------------------------------------------------
export async function cleanupVolatiles(): Promise<void> {
  await executeAsModal("BrushBuddy: cleanup", async () => {
    try {
      await bp([{
        _obj: "delete",
        _target: [{ _ref: "layer", _name: PROOF_LAYER_NAME }],
        _options: { dialogOptions: "dontDisplay" },
      }]);
    } catch {
      /* layer may not exist */
    }
  });
}
