// Brush-specific batchPlay operations for the M0 spike.
//
// Descriptors are first-pass guesses; the spike's purpose is to find which
// ones don't round-trip on PS 2025+ and correct them via PS's
// `Plugins > Development > Record Action Commands` (or the Alchemist plugin).
//
// Naming convention: every volatile artifact is namespaced "BrushBuddy ..." so
// we can find and prune them on session end.

import { bp, ensureBrushTool, executeAsModal, getActiveDoc } from "./photoshop";
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
    await bp([{ _obj: "defineBrush", name, _options: { dialogOptions: "dontDisplay" } }]);
    // PS sometimes ignores our `name` and assigns "Sampled Brush N". The new
    // brush IS auto-activated as the current brush, so we read it back from
    // currentToolOptions and store the actual name.
    try {
      const current = await getToolOptions();
      const actualName = current?.brush?.name;
      LAST_DEFINED_BRUSH_NAME = (typeof actualName === "string" && actualName) ? actualName : name;
    } catch {
      LAST_DEFINED_BRUSH_NAME = name;
    }
    return LAST_DEFINED_BRUSH_NAME!;
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
    await ensureBrushTool();

    // Only run the probe we know works — the others spam modal error dialogs.
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

/**
 * Try multiple set-spacing target shapes; report which (if any) PS accepts.
 * The point is to find a SET path that works at all — currentToolOptions
 * appears to be read-only via batchPlay.
 */
export async function debugSetProbe(): Promise<any[]> {
  return await executeAsModal("BrushBuddy: set probe", async () => {
    await ensureBrushTool();
    const current = await getToolOptions();
    const brushName = current?.brush?.name ?? LAST_DEFINED_BRUSH_NAME ?? "Sampled Brush 1";
    const fullBrush = current?.brush ?? null; // sampledBrush sub-descriptor

    const attempts: { label: string; cmd: any[]; opts?: any }[] = [
      // A. Property-chain: set "spacing" property of currentToolOptions of application.
      {
        label: "A: property spacing of currentToolOptions",
        cmd: [{
          _obj: "set",
          _target: [
            { _ref: "property", _property: "spacing" },
            { _ref: "property", _property: "currentToolOptions" },
            { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
          ],
          to: { _unit: "percentUnit", _value: 180 },
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      // F. Same as A but with synchronousExecution.
      {
        label: "F: A + synchronousExecution",
        cmd: [{
          _obj: "set",
          _target: [
            { _ref: "property", _property: "spacing" },
            { _ref: "property", _property: "currentToolOptions" },
            { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
          ],
          to: { _unit: "percentUnit", _value: 180 },
          _options: { dialogOptions: "dontDisplay" },
        }],
        opts: { synchronousExecution: true },
      },
      // G. Legacy "setd" event id (ScriptingListener used setd, UXP may also accept it).
      {
        label: "G: legacy setd event",
        cmd: [{
          _obj: "setd",
          _target: [
            { _ref: "property", _property: "spacing" },
            { _ref: "property", _property: "currentToolOptions" },
            { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
          ],
          to: { _unit: "percentUnit", _value: 180 },
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      // H. invokeCommand 1436 (captured from a previous user recording).
      {
        label: "H: invokeCommand 1436",
        cmd: [{ _obj: "invokeCommand", commandID: 1436, _options: { dialogOptions: "dontDisplay" } }],
      },
      // I. Set on the brush with a sampledBrush descriptor that includes spacing.
      //    Different from B in that we don't merge the existing fields — pure replace.
      {
        label: "I: set brush targetEnum to minimal sampledBrush",
        cmd: [{
          _obj: "set",
          _target: [{ _ref: "brush", _enum: "ordinal", _value: "targetEnum" }],
          to: { _obj: "sampledBrush", spacing: { _unit: "percentUnit", _value: 180 } },
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      // B. Set sampledBrush by name with full brush descriptor + new spacing.
      {
        label: "B: set sampledBrush by name (full descriptor)",
        cmd: fullBrush ? [{
          _obj: "set",
          _target: [{ _ref: "brush", _name: brushName }],
          to: { ...fullBrush, spacing: { _unit: "percentUnit", _value: 180 } },
          _options: { dialogOptions: "dontDisplay" },
        }] : [],
      },
      // C. Set "spacing" property of brush by name.
      {
        label: "C: property spacing of brush by name",
        cmd: [{
          _obj: "set",
          _target: [
            { _ref: "property", _property: "spacing" },
            { _ref: "brush", _name: brushName },
          ],
          to: { _unit: "percentUnit", _value: 180 },
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      // D. Set "spacing" property of brush targetEnum (the active brush).
      {
        label: "D: property spacing of brush targetEnum",
        cmd: [{
          _obj: "set",
          _target: [
            { _ref: "property", _property: "spacing" },
            { _ref: "brush", _enum: "ordinal", _value: "targetEnum" },
          ],
          to: { _unit: "percentUnit", _value: 180 },
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      // E. Set the whole "brush" property of currentToolOptions to new sampledBrush.
      {
        label: "E: property brush of currentToolOptions (new sampledBrush)",
        cmd: fullBrush ? [{
          _obj: "set",
          _target: [
            { _ref: "property", _property: "brush" },
            { _ref: "property", _property: "currentToolOptions" },
            { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
          ],
          to: { ...fullBrush, spacing: { _unit: "percentUnit", _value: 180 } },
          _options: { dialogOptions: "dontDisplay" },
        }] : [],
      },
    ];

    const results: { label: string; ok: boolean; error?: string }[] = [];
    for (const { label, cmd, opts } of attempts) {
      if (!cmd.length) { results.push({ label, ok: false, error: "skipped (no precondition)" }); continue; }
      try {
        await bp(cmd, opts ?? {});
        results.push({ label, ok: true });
      } catch (e: any) {
        results.push({ label, ok: false, error: e?.message ?? String(e) });
      }
    }
    (globalThis as any).__brushBuddyDumps = results;
    // eslint-disable-next-line no-console
    console.log("[BrushBuddy] set-spacing probes:", JSON.stringify(results, null, 2));
    return results.map((r) => r.ok ? `✓ ${r.label}` : `✗ ${r.label}: ${r.error}`);
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
    await ensureBrushTool();
  });
}

export async function selectLivePreviewBrush(): Promise<string> {
  return await executeAsModal("BrushBuddy: select live preview", async () => {
    await ensureBrushTool();
    // defineBrush already auto-activates the new preset, so this is a
    // belt-and-suspenders re-select. We use the discovered actual name.
    const target = LAST_DEFINED_BRUSH_NAME;
    if (!target) return "(no defineBrush yet — capture first; the new brush is auto-active)";
    try {
      await bp([{
        _obj: "select",
        _target: [{ _ref: "brush", _name: target }],
        _options: { dialogOptions: "dontDisplay" },
      }]);
      return `selected: ${target}`;
    } catch (e: any) {
      // Non-fatal — defineBrush already activated it.
      return `select skipped (${e?.message ?? e}); already active`;
    }
  });
}

// ---------------------------------------------------------------------------
// Apply primary dynamics (Stipple-ish recipe).
// Sets the *current brush preset's* settings via currentToolOptions.
// ---------------------------------------------------------------------------
// Minimal: just bump spacing. Uses the working setBrushProps path.
export async function applyMinimalSpacingOnly(): Promise<void> {
  await executeAsModal("BrushBuddy: spacing only", async () => {
    await ensureBrushTool();
    await setBrushProps({
      spacing: { _unit: "percentUnit", _value: 180 },
    });
  });
}

/**
 * The working SET path discovered in the M0 spike: target the brush ref
 * directly with a sampledBrush descriptor. PS accepts partial sampledBrush
 * descriptors here (you don't need to send every field).
 *
 * This is the load-bearing primitive for all brush mutations.
 */
async function setBrushProps(props: any): Promise<void> {
  await bp([{
    _obj: "set",
    _target: [{ _ref: "brush", _enum: "ordinal", _value: "targetEnum" }],
    to: { _obj: "sampledBrush", ...props },
    _options: { dialogOptions: "dontDisplay" },
  }]);
}

// Read current tool options (the descriptor PS uses for the active brush).
async function getToolOptions(): Promise<any> {
  const r = await action.batchPlay([{
    _obj: "get",
    _target: [
      { _ref: "property", _property: "currentToolOptions" },
      { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
    ],
    _options: { dialogOptions: "dontDisplay" },
  }], { synchronousExecution: true });
  return r?.[0]?.currentToolOptions;
}

// Merge a patch into current tool options and SET the whole thing back. PS's
// `set currentToolOptions` rejects partial descriptors with result=-128, but
// accepts a fully-formed one. This get→merge→set pattern is the workaround.
async function patchToolOptions(patch: any): Promise<void> {
  const current = await getToolOptions();
  if (!current) throw new Error("could not read current tool options");
  const merged = { ...current, ...patch, _obj: "currentToolOptions" };
  await bp([{
    _obj: "set",
    _target: [
      { _ref: "property", _property: "currentToolOptions" },
      { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
    ],
    to: merged,
    _options: { dialogOptions: "dontDisplay" },
  }]);
}

// Helper: build a brush variation ($brVr) sub-object — used for size/opacity/
// flow/scatter/count/angle/roundness dynamics. Discovered from PS's own dump.
//   bVTy = control mode (0=Off, 1=Fade, 2=PenPressure, 3=PenTilt, 4=StylusWheel,
//          5=Rotation, 6=InitialDirection, 7=Direction, 8=Random)  [empirical]
function brVr(jitter: number, opts: { control?: number; fadeStep?: number; minimum?: number } = {}): any {
  return {
    _obj: "$brVr",
    $bVTy: opts.control ?? 0,
    $fStp: opts.fadeStep ?? 25,
    jitter: { _unit: "percentUnit", _value: jitter },
    minimum: { _unit: "percentUnit", _value: opts.minimum ?? 0 },
  };
}

// Shape Dynamics — try sending the dynamics fields via the brush ref. Whether
// PS accepts these on a sampledBrush descriptor is the next open question.
export async function applyShapeDynamicsOnly(): Promise<void> {
  await executeAsModal("BrushBuddy: shape dynamics only", async () => {
    await ensureBrushTool();
    await setBrushProps({
      useTipDynamics: true,
      $szVr: brVr(25),
      minimumDiameter: { _unit: "percentUnit", _value: 30 },
    });
  });
}

export async function applyStippleDynamics(): Promise<void> {
  await executeAsModal("BrushBuddy: apply dynamics", async () => {
    await ensureBrushTool();
    await setBrushProps({
      // Shape Dynamics — size jitter w/ minimum diameter floor.
      useTipDynamics: true,
      $szVr: brVr(25),
      minimumDiameter: { _unit: "percentUnit", _value: 30 },
      angleDynamics: brVr(0),
      roundnessDynamics: brVr(0),
      // Scattering — visible stamps, both axes, count jitter.
      useScatter: true,
      spacing: { _unit: "percentUnit", _value: 180 },
      bothAxes: true,
      count: 1,
      scatterDynamics: brVr(60),
      countDynamics: brVr(40),
      // Transfer (Paint Dynamics) — opacity jitter w/ minimum.
      usePaintDynamics: true,
      $opVr: brVr(30, { minimum: 30 }),
    });
  });
}

// ---------------------------------------------------------------------------
// Apply Dual Brush — the riskiest descriptor in the spike.
// ---------------------------------------------------------------------------
export async function applyDualBrush(): Promise<void> {
  await executeAsModal("BrushBuddy: apply dual brush", async () => {
    await ensureBrushTool();
    // Try setting dualBrush as a sub-property of the brush descriptor.
    const current = await getToolOptions();
    const currentDual = current?.dualBrush ?? { _obj: "dualBrush" };
    await setBrushProps({
      dualBrush: {
        ...currentDual,
        _obj: "dualBrush",
        useDualBrush: true,
        blendMode: { _enum: "blendMode", _value: "multiply" },
        spacing: { _unit: "percentUnit", _value: 25 },
        count: 2,
        bothAxes: false,
        scatterDynamics: brVr(50),
        countDynamics: brVr(0),
      },
    });
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
    await ensureBrushTool();

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
