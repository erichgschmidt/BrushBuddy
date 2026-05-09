// Brush operations. Post-M0 surface — only the primitives we know work.
// See docs/M0-REPORT.md for the spike findings.

import { bp, ensureBrushTool, executeAsModal, getActiveDoc } from "./photoshop";
import { action } from "photoshop";

export const LIVE_PREVIEW_NAME = "BrushBuddy Live Preview";

let LAST_BRUSH_NAME: string | null = null;
export function getLastBrushName(): string | null { return LAST_BRUSH_NAME; }

// ---------------------------------------------------------------------------
// Read current tool options (for getting brush name + sampledData on every set).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// The load-bearing primitive. Mutates tip-level brush props with live PS-side
// preview update. GET → merge → SET preserves sampledData so the tip pixels
// don't get wiped to a default soft round.
// Honored fields: spacing, diameter, angle, roundness, hardness, flipX, flipY, name.
// Sub-30ms in M0 measurements.
// ---------------------------------------------------------------------------
export interface TipProps {
  spacing?: number;     // percent (1-1000)
  diameter?: number;    // pixels (1-2500)
  angle?: number;       // degrees (-180 to 180)
  roundness?: number;   // percent (0-100)
  hardness?: number;    // percent (0-100, round tips only)
  flipX?: boolean;
  flipY?: boolean;
}

export async function setTipProps(props: TipProps): Promise<void> {
  await executeAsModal("BrushBuddy: set tip props", async () => {
    await ensureBrushTool();
    const tool = await getToolOptions();
    const existing = tool?.brush ?? {};
    const patch: any = {};
    if (props.spacing !== undefined) patch.spacing = { _unit: "percentUnit", _value: props.spacing };
    if (props.diameter !== undefined) patch.diameter = { _unit: "pixelsUnit", _value: props.diameter };
    if (props.angle !== undefined) patch.angle = { _unit: "angleUnit", _value: props.angle };
    if (props.roundness !== undefined) patch.roundness = { _unit: "percentUnit", _value: props.roundness };
    if (props.hardness !== undefined) patch.hardness = { _unit: "percentUnit", _value: props.hardness };
    if (props.flipX !== undefined) patch.flipX = props.flipX;
    if (props.flipY !== undefined) patch.flipY = props.flipY;
    const merged = { _obj: "sampledBrush", ...existing, ...patch };
    await bp([{
      _obj: "set",
      _target: [{ _ref: "brush", _enum: "ordinal", _value: "targetEnum" }],
      to: merged,
      _options: { dialogOptions: "dontDisplay" },
    }]);
  });
}

// ---------------------------------------------------------------------------
// Capture the active selection as a brush tip.
// ---------------------------------------------------------------------------
export async function captureFromSelection(name: string = LIVE_PREVIEW_NAME): Promise<string> {
  return await executeAsModal("BrushBuddy: capture", async () => {
    const doc = getActiveDoc();
    if (!doc.selection || !doc.selection.bounds) {
      throw new Error("Make a rectangular selection first.");
    }
    await bp([{ _obj: "defineBrush", name, _options: { dialogOptions: "dontDisplay" } }]);
    // PS often ignores our `name` and assigns "Sampled Brush N". Read it back.
    try {
      const tool = await getToolOptions();
      LAST_BRUSH_NAME = (typeof tool?.brush?.name === "string" && tool.brush.name) || name;
    } catch {
      LAST_BRUSH_NAME = name;
    }
    return LAST_BRUSH_NAME!;
  });
}

// ---------------------------------------------------------------------------
// Read current tip props (for initializing slider values after capture).
// ---------------------------------------------------------------------------
export async function readTipProps(): Promise<TipProps & { name: string | null }> {
  const tool = await getToolOptions();
  const b = tool?.brush ?? {};
  return {
    name: b.name ?? null,
    spacing: b.spacing?._value,
    diameter: b.diameter?._value,
    angle: b.angle?._value,
    roundness: b.roundness?._value,
    hardness: b.hardness?._value,
    flipX: b.flipX,
    flipY: b.flipY,
  };
}
