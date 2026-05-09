// Spike: try to programmatically issue a single brush dab. We need this to
// extract tip pixels from arbitrary PS brushes (sampled or otherwise) by
// stamping them onto a scratch layer and reading back the pixels.
//
// We tried path-stroke before and PS rejected it with -128. This probe tries
// alternative event shapes that might be accepted: paint, dabs, etc.

import { action, app } from "photoshop";
import { bp, ensureBrushTool, executeAsModal, getActiveDoc } from "../services/photoshop";

export interface ProbeResult {
  label: string;
  ok: boolean;
  error?: string;
}

/**
 * Run the stamp probe. Adds a transient layer, tries N stamp event shapes at
 * the layer's center, and reports which (if any) succeeded.
 *
 * The user should ensure they have a brush selected and a foreground color
 * that will be visible against the scratch layer's transparent background.
 */
export async function probeStamp(): Promise<ProbeResult[]> {
  return await executeAsModal("BrushBuddy: stamp probe", async () => {
    const doc = getActiveDoc();
    await ensureBrushTool();

    // Make a transient layer for the probe so we don't dirty the user's art.
    const before = new Set<number>((doc.layers ?? []).map((l: any) => l.id));
    await bp([{
      _obj: "make",
      _target: [{ _ref: "layer" }],
      using: { _obj: "layer", name: "BrushBuddy Stamp Probe" },
      _options: { dialogOptions: "dontDisplay" },
    }]);
    const fresh = (app.activeDocument?.layers ?? []) as any[];
    const probeLayer = fresh.find((l) => !before.has(l.id));
    if (!probeLayer) throw new Error("probe layer not found");

    const cx = doc.width / 2;
    const cy = doc.height / 2;

    const attempts: { label: string; cmd: any[] }[] = [
      // A. "paint" event with brush tool and a single point.
      {
        label: "A: paint event w/ point",
        cmd: [{
          _obj: "paint",
          _target: [{ _ref: "paintbrushTool" }],
          point: { _obj: "paint", horizontal: { _unit: "pixelsUnit", _value: cx }, vertical: { _unit: "pixelsUnit", _value: cy } },
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      // B. "stroke" with a single-point path (degenerate stroke = dab).
      {
        label: "B: stroke single-point path",
        cmd: [
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
                    { _obj: "pathPoint", anchor: { _obj: "paint", horizontal: { _unit: "pixelsUnit", _value: cx }, vertical: { _unit: "pixelsUnit", _value: cy } } },
                  ],
                }],
              }],
            },
            _options: { dialogOptions: "dontDisplay" },
          },
          {
            _obj: "stroke",
            _target: [{ _ref: "path", _enum: "ordinal", _value: "targetEnum" }],
            using: { _enum: "type", _value: "brushTool" },
            _options: { dialogOptions: "dontDisplay" },
          },
          {
            _obj: "delete",
            _target: [{ _ref: "path", _enum: "ordinal", _value: "targetEnum" }],
            _options: { dialogOptions: "dontDisplay" },
          },
        ],
      },
      // C. "click" event (legacy emulation of mouse click on canvas).
      {
        label: "C: click event",
        cmd: [{
          _obj: "click",
          _target: [{ _ref: "paintbrushTool" }],
          at: { _obj: "paint", horizontal: { _unit: "pixelsUnit", _value: cx }, vertical: { _unit: "pixelsUnit", _value: cy } },
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      // D. "dab" event (brush dab — undocumented but recorded historically).
      {
        label: "D: dab event",
        cmd: [{
          _obj: "dab",
          _target: [{ _ref: "paintbrushTool" }],
          at: { _obj: "paint", horizontal: { _unit: "pixelsUnit", _value: cx }, vertical: { _unit: "pixelsUnit", _value: cy } },
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
      // E. "paint" with the modern point-array form.
      {
        label: "E: paint w/ points array",
        cmd: [{
          _obj: "paint",
          points: [
            { _obj: "paint", horizontal: { _unit: "pixelsUnit", _value: cx }, vertical: { _unit: "pixelsUnit", _value: cy } },
          ],
          _options: { dialogOptions: "dontDisplay" },
        }],
      },
    ];

    const results: ProbeResult[] = [];
    for (const { label, cmd } of attempts) {
      try {
        await action.batchPlay(cmd, { synchronousExecution: true });
        results.push({ label, ok: true });
      } catch (e: any) {
        results.push({ label, ok: false, error: e?.message ?? String(e) });
      }
    }

    // Tear down the probe layer.
    try {
      await bp([{
        _obj: "delete",
        _target: [{ _ref: "layer", _id: probeLayer.id }],
        _options: { dialogOptions: "dontDisplay" },
      }]);
    } catch { /* ignore */ }

    // eslint-disable-next-line no-console
    console.log("[BrushBuddy] stamp probe:", JSON.stringify(results, null, 2));
    return results;
  });
}
