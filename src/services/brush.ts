// Brush-specific batchPlay operations for the M0 spike.
//
// Descriptors are first-pass guesses; the spike's purpose is to find which
// ones don't round-trip on PS 2025+ and correct them via PS's
// `Plugins > Development > Record Action Commands` (or the Alchemist plugin).
//
// Naming convention: every volatile artifact is namespaced "BrushBuddy ..." so
// we can find and prune them on session end.

import { bp, executeAsModal, getActiveDoc } from "./photoshop";

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
  await executeAsModal("BrushBuddy: auto-levels", async () => {
    // Image > Auto Tone (sometimes recorded as "autoLevels", sometimes "autoTone").
    // Try autoLevels first; if that's the rejected one, swap to autoTone.
    await bp([{ _obj: "autoLevels", _options: { dialogOptions: "dontDisplay" } }]);
  });
}

export async function defineBrushFromSelection(name: string = LIVE_PREVIEW_NAME): Promise<void> {
  await executeAsModal("BrushBuddy: define brush", async () => {
    const doc = getActiveDoc();
    if (!doc.selection || !doc.selection.bounds) {
      throw new Error("Make a rectangular selection first.");
    }
    await bp([{ _obj: "defineBrush", name, _options: { dialogOptions: "dontDisplay" } }]);
  });
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

export async function selectLivePreviewBrush(): Promise<void> {
  await executeAsModal("BrushBuddy: select live preview", async () => {
    // First make sure we're on the brush tool.
    await bp([{
      _obj: "select",
      _target: [{ _ref: "paintbrushTool" }],
      _options: { dialogOptions: "dontDisplay" },
    }]);
    // Then select the named brush preset.
    await bp([{
      _obj: "select",
      _target: [{ _ref: "brush", _name: LIVE_PREVIEW_NAME }],
      _options: { dialogOptions: "dontDisplay" },
    }]);
  });
}

// ---------------------------------------------------------------------------
// Apply primary dynamics (Stipple-ish recipe).
// Sets the *current brush preset's* settings via currentToolOptions.
// ---------------------------------------------------------------------------
export async function applyStippleDynamics(): Promise<void> {
  await executeAsModal("BrushBuddy: apply dynamics", async () => {
    await bp([{
      _obj: "set",
      _target: [{ _ref: "currentToolOptions" }],
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
      _obj: "set",
      _target: [{ _ref: "currentToolOptions" }],
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
