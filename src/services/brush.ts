// Brush-specific batchPlay operations for the M0 spike.
//
// These descriptors are first-pass guesses based on community knowledge of how
// Photoshop records brush actions. The whole point of the spike is to validate
// (or correct) them against PS 2025+. Use PS's `Plugins > Development > Record
// Action Commands` or the Alchemist plugin to capture authoritative descriptors
// when a recipe doesn't round-trip.
//
// Naming convention: every volatile artifact is namespaced "BrushBuddy ..." so
// we can find and prune them on session end.

import { bp, executeAsModal, getActiveDoc } from "./photoshop";

export const LIVE_PREVIEW_NAME = "BrushBuddy Live Preview";
export const PROOF_LAYER_NAME = "BrushBuddy Proof";

// ---------------------------------------------------------------------------
// 1. Capture tip from current selection.
//    Pipeline: ensure selection exists → desaturate active layer → auto-levels
//    → define brush preset with the given name (overwriting if it exists).
// ---------------------------------------------------------------------------
export async function captureTipFromSelection(name: string = LIVE_PREVIEW_NAME): Promise<void> {
  await executeAsModal("BrushBuddy: capture tip", async () => {
    // Sanity: confirm there's a selection. PS will refuse defineBrush otherwise.
    const doc = getActiveDoc();
    if (!doc.selection || !doc.selection.bounds) {
      throw new Error("Make a rectangular selection first.");
    }

    // Step 1 — desaturate (Image > Adjustments > Desaturate). Affects the
    // active layer; the spike assumes the user is on a flat or simple layer.
    await bp([
      { _obj: "desaturate", _options: { dialogOptions: "dontDisplay" } },
    ]);

    // Step 2 — auto-levels stretch.
    await bp([
      { _obj: "autoLevels", _options: { dialogOptions: "dontDisplay" } },
    ]);

    // Step 3 — define brush preset. The "defineBrush" event accepts a `name`
    // string; passing an existing preset name overwrites in place (this is
    // exactly what we need for the dummy-brush loop, and is one of the things
    // the spike must verify).
    await bp([
      {
        _obj: "defineBrush",
        name,
        _options: { dialogOptions: "dontDisplay" },
      },
    ]);
  });
}

// ---------------------------------------------------------------------------
// 2. Apply primary dynamics.
//    Recipe: Stipple-ish — visible stamps, scattered, jittered size.
//    Sets the *current brush* settings; the brush must be selected first.
// ---------------------------------------------------------------------------
export async function applyStippleDynamics(): Promise<void> {
  await executeAsModal("BrushBuddy: apply dynamics", async () => {
    await bp([
      {
        _obj: "set",
        _target: [{ _ref: "currentToolOptions" }],
        to: {
          _obj: "currentToolOptions",
          // Brush tip shape
          spacing: { _unit: "percentUnit", _value: 180 },
          // Shape Dynamics
          shapeDynamics: {
            _obj: "shapeDynamics",
            useTipDynamics: true,
            sizeDynamics: 25,
            minimumDiameter: { _unit: "percentUnit", _value: 30 },
            angleDynamics: 0,
            roundnessDynamics: 0,
          },
          // Scattering
          scatter: {
            _obj: "scatter",
            useScatter: true,
            bothAxes: true,
            scatterDynamics: 60,
            count: 1,
            countDynamics: 40,
          },
          // Transfer
          transfer: {
            _obj: "transfer",
            useTransfer: true,
            opacityDynamics: 30,
            minimumOpacity: 30,
          },
        },
        _options: { dialogOptions: "dontDisplay" },
      },
    ]);
  });
}

// ---------------------------------------------------------------------------
// 3. Apply Dual Brush.
//    The riskiest descriptor in the spike. Sub-descriptor naming for the
//    secondary tip varies across PS versions; capture from PS's recorder if
//    this fails.
// ---------------------------------------------------------------------------
export async function applyDualBrush(): Promise<void> {
  await executeAsModal("BrushBuddy: apply dual brush", async () => {
    await bp([
      {
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
            // Note: choosing a *secondary tip* by name requires another set
            // call; the spike just turns Dual Brush on with default tip and
            // verifies the descriptor round-trips at all.
          },
        },
        _options: { dialogOptions: "dontDisplay" },
      },
    ]);
  });
}

// ---------------------------------------------------------------------------
// 4. Render proof stroke.
//    Strategy: ensure a "BrushBuddy Proof" layer exists, target it, then ask
//    PS to paint a straight horizontal line using the current brush. We do
//    this with the "stroke" command on a temporary work path — turns out to
//    be the cleanest way to drive the brush engine programmatically.
// ---------------------------------------------------------------------------
export async function renderProofStroke(): Promise<void> {
  await executeAsModal("BrushBuddy: proof stroke", async () => {
    const doc = getActiveDoc();
    const w = doc.width;
    const h = doc.height;

    // Step A — find or create the proof layer.
    let proofLayer = doc.layers.find((l: any) => l.name === PROOF_LAYER_NAME);
    if (!proofLayer) {
      await bp([
        {
          _obj: "make",
          _target: [{ _ref: "layer" }],
          using: { _obj: "layer", name: PROOF_LAYER_NAME },
          _options: { dialogOptions: "dontDisplay" },
        },
      ]);
    } else {
      // Select it.
      await bp([
        {
          _obj: "select",
          _target: [{ _ref: "layer", _name: PROOF_LAYER_NAME }],
          makeVisible: true,
          _options: { dialogOptions: "dontDisplay" },
        },
      ]);
    }

    // Step B — define a horizontal line as a work path, then stroke it with
    // the current brush. This is the standard "scripted brush stroke" trick.
    const y = h * 0.5;
    const x0 = w * 0.1;
    const x1 = w * 0.9;

    await bp([
      // Make a work path from a line.
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
      // Stroke the path with the current brush tool.
      {
        _obj: "stroke",
        _target: [{ _ref: "path", _enum: "ordinal", _value: "targetEnum" }],
        using: { _enum: "strokeToolType", _value: "brushTool" },
        _options: { dialogOptions: "dontDisplay" },
      },
      // Delete the work path so the user's doc isn't polluted.
      {
        _obj: "delete",
        _target: [{ _ref: "path", _enum: "ordinal", _value: "targetEnum" }],
        _options: { dialogOptions: "dontDisplay" },
      },
    ]);
  });
}

// ---------------------------------------------------------------------------
// 5. Loop test.
//    Runs the full pipeline N times and reports per-cycle wall time. Used to
//    measure whether the dummy-brush update loop fits within our < 600 ms
//    budget for debounced auto-update.
// ---------------------------------------------------------------------------
export interface LoopResult { cycles: number; samplesMs: number[]; medianMs: number; p95Ms: number; }

export async function loopTest(cycles: number = 10): Promise<LoopResult> {
  const samples: number[] = [];
  for (let i = 0; i < cycles; i++) {
    const t0 = performance.now();
    await captureTipFromSelection();
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
// Cleanup — prune volatile artifacts. Call on session end (or a button).
// ---------------------------------------------------------------------------
export async function cleanupVolatiles(): Promise<void> {
  await executeAsModal("BrushBuddy: cleanup", async () => {
    // Try to delete the proof layer if present.
    try {
      await bp([
        {
          _obj: "delete",
          _target: [{ _ref: "layer", _name: PROOF_LAYER_NAME }],
          _options: { dialogOptions: "dontDisplay" },
        },
      ]);
    } catch {
      // It may not exist — that's fine.
    }
    // The Live Preview brush preset is more involved to delete via batchPlay
    // and isn't strictly necessary; leave it for the user to remove or for a
    // future "manage previews" UI. Document this in the spike report.
  });
}
