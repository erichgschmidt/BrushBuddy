// Tip commit pipeline. Pushes an in-memory PixelBuffer (from the op stack)
// into Photoshop as a brush preset.
//
// Strategy (revised after PS 26 rejected `make document`):
//   - Use the user's currently active document.
//   - Add a transient pixel layer named "BrushBuddy Tip Source".
//   - Write the buffer to that layer via imaging.putPixels.
//   - Make a rectangular selection covering the buffer's bounds.
//   - defineBrush.
//   - Delete the layer; deselect.
//
// This avoids the brittle batchPlay `make document` path AND the
// `app.documents.add` DOM signature variation that errored as
// "invalid target sheet". The user's doc is the safe scratch surface.

import { action, app, imaging } from "photoshop";
import { bp, bpSilent, ensureBrushTool, executeAsModal, getActiveDoc } from "../services/photoshop";
import type { PixelBuffer } from "./types";

export interface CommitResult {
  brushName: string;
  widthPx: number;
  heightPx: number;
}

const PS_BRUSH_MAX = 2500;
const TIP_LAYER_NAME = "BrushBuddy Tip Source";

export async function commitTipAsBrush(
  buf: PixelBuffer,
  desiredName?: string,
): Promise<CommitResult> {
  assertBufferOk(buf);
  return await executeAsModal("BrushBuddy: commit tip as brush", async () => {
    return await runCommit(buf, desiredName);
  });
}

// Backwards-compatible no-op alias — the "keep scratch" mode no longer makes
// sense now that we use a layer in the user's doc, but callers may still
// import this name.
export async function commitTipAsBrushKeepScratch(
  buf: PixelBuffer,
  desiredName?: string,
): Promise<CommitResult & { scratchDocId: number }> {
  const r = await commitTipAsBrush(buf, desiredName);
  return { ...r, scratchDocId: -1 };
}

function assertBufferOk(buf: PixelBuffer): void {
  if (!buf || !buf.data || buf.width <= 0 || buf.height <= 0) {
    throw new Error("commitTipAsBrush: invalid PixelBuffer.");
  }
  if (buf.data.length !== buf.width * buf.height * 4) {
    throw new Error(
      `commitTipAsBrush: buffer length ${buf.data.length} != w*h*4 (${buf.width}x${buf.height}).`,
    );
  }
  if (buf.width > PS_BRUSH_MAX || buf.height > PS_BRUSH_MAX) {
    throw new Error(
      `Tip is ${buf.width}x${buf.height} but Photoshop's brush size cap is ${PS_BRUSH_MAX}x${PS_BRUSH_MAX}. Apply a resize op upstream before committing.`,
    );
  }
}

async function runCommit(buf: PixelBuffer, desiredName?: string): Promise<CommitResult> {
  const name = desiredName ?? "BrushBuddy Tip";
  const doc = getActiveDoc();
  let layerId: number | null = null;

  try {
    layerId = await makeTipLayer();
    await writePixelsToLayer(doc.id, layerId, buf);
    await selectRect(0, 0, buf.width, buf.height);
    await ensureBrushTool();
    await defineBrush(name);

    const actualName = await readActiveBrushName(name);
    return { brushName: actualName, widthPx: buf.width, heightPx: buf.height };
  } finally {
    // Always clean up: delete the tip layer + deselect, even on error.
    if (layerId !== null) await deleteLayer(layerId).catch(() => { /* swallow */ });
    await deselect().catch(() => { /* swallow */ });
  }
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

// Make a new pixel layer at the top of the active doc; return its id.
async function makeTipLayer(): Promise<number> {
  // The `make layer` event returns the new layer's id directly in the result.
  // Shapes vary by PS version — `layerID`, `ID`, or nested under `_obj:"layer"`.
  // Fallback: read app.activeDocument.activeLayers (PS auto-selects new layer).
  const res = await bp([{
    _obj: "make",
    _target: [{ _ref: "layer" }],
    using: { _obj: "layer", name: TIP_LAYER_NAME },
    _options: { dialogOptions: "dontDisplay" },
  }]);
  const r0 = (res?.[0] ?? {}) as any;
  const idFromResult: number | undefined =
    (typeof r0.layerID === "number" && r0.layerID) ||
    (typeof r0.ID === "number"      && r0.ID)      ||
    (typeof r0?.layer?._id === "number" && r0.layer._id) ||
    undefined;
  if (idFromResult) return idFromResult;

  // Fallback: PS auto-selects the new layer; pick the active one.
  const doc = app.activeDocument;
  const active = (doc?.activeLayers ?? [])[0]
              ?? (doc?.layers ?? []).find((l: any) => l.name === TIP_LAYER_NAME);
  if (!active) throw new Error("makeTipLayer: could not resolve new layer id");
  return active.id;
}

async function writePixelsToLayer(docId: number, layerId: number, buf: PixelBuffer): Promise<void> {
  if (!imaging || !(imaging as any).putPixels || !(imaging as any).createImageDataFromBuffer) {
    throw new Error("UXP imaging.putPixels unavailable. Requires Photoshop 24.2+.");
  }

  const u8 = new Uint8Array(buf.data.buffer, buf.data.byteOffset, buf.data.byteLength);
  const imgData = await (imaging as any).createImageDataFromBuffer(u8, {
    width: buf.width,
    height: buf.height,
    components: 4,
    componentSize: 8,
    colorSpace: "RGB",
    pixelFormat: "RGBA",
    colorProfile: "sRGB IEC61966-2.1",
  });

  try {
    await (imaging as any).putPixels({
      documentID: docId,
      layerID: layerId,
      imageData: imgData,
      targetBounds: { left: 0, top: 0, right: buf.width, bottom: buf.height },
      replace: true,
    });
  } finally {
    if (imgData?.dispose) {
      try { imgData.dispose(); } catch { /* noop */ }
    }
  }
}

async function selectRect(left: number, top: number, right: number, bottom: number): Promise<void> {
  await bp([{
    _obj: "set",
    _target: [{ _ref: "channel", _property: "selection" }],
    to: {
      _obj: "rectangle",
      top:    { _unit: "pixelsUnit", _value: top },
      left:   { _unit: "pixelsUnit", _value: left },
      bottom: { _unit: "pixelsUnit", _value: bottom },
      right:  { _unit: "pixelsUnit", _value: right },
    },
    _options: { dialogOptions: "dontDisplay" },
  }]);
}

async function deselect(): Promise<void> {
  await bp([{
    _obj: "set",
    _target: [{ _ref: "channel", _property: "selection" }],
    to: { _enum: "ordinal", _value: "none" },
    _options: { dialogOptions: "dontDisplay" },
  }]);
}

async function defineBrush(name: string): Promise<void> {
  await bp([{
    _obj: "defineBrush",
    name,
    _options: { dialogOptions: "dontDisplay" },
  }]);
}

async function readActiveBrushName(fallback: string): Promise<string> {
  try {
    const r = await action.batchPlay([{
      _obj: "get",
      _target: [
        { _ref: "property", _property: "currentToolOptions" },
        { _ref: "application", _enum: "ordinal", _value: "targetEnum" },
      ],
      _options: { dialogOptions: "dontDisplay" },
    }], { synchronousExecution: true });
    const n = r?.[0]?.currentToolOptions?.brush?.name;
    return (typeof n === "string" && n) ? n : fallback;
  } catch {
    return fallback;
  }
}

async function deleteLayer(layerId: number): Promise<void> {
  await bpSilent([{
    _obj: "delete",
    _target: [{ _ref: "layer", _id: layerId }],
    _options: { dialogOptions: "dontDisplay" },
  }]);
}
