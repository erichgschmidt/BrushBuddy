// Tip commit pipeline. Pushes an in-memory PixelBuffer (from the op stack)
// into Photoshop as a brush preset by way of a transient scratch document.
//
// See commit.notes.md for design rationale.

import { action, imaging } from "photoshop";
import { bp, bpSilent, ensureBrushTool, executeAsModal } from "../services/photoshop";
import type { PixelBuffer } from "./types";

export interface CommitResult {
  brushName: string;
  widthPx: number;
  heightPx: number;
}

const PS_BRUSH_MAX = 2500;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function commitTipAsBrush(
  buf: PixelBuffer,
  desiredName?: string,
): Promise<CommitResult> {
  assertBufferOk(buf);
  return await executeAsModal("BrushBuddy: commit tip as brush", async () => {
    const { result, scratchDocId } = await runCommit(buf, desiredName);
    await teardownScratchDoc(scratchDocId);
    return result;
  });
}

export async function commitTipAsBrushKeepScratch(
  buf: PixelBuffer,
  desiredName?: string,
): Promise<CommitResult & { scratchDocId: number }> {
  assertBufferOk(buf);
  return await executeAsModal("BrushBuddy: commit tip (keep scratch)", async () => {
    const { result, scratchDocId } = await runCommit(buf, desiredName);
    return { ...result, scratchDocId };
  });
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

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

interface RunResult {
  result: CommitResult;
  scratchDocId: number;
}

async function runCommit(buf: PixelBuffer, desiredName?: string): Promise<RunResult> {
  const name = desiredName ?? "BrushBuddy Tip";
  let scratchDocId: number | null = null;

  try {
    scratchDocId = await createScratchDoc(buf.width, buf.height);
    await writePixelsToActiveLayer(scratchDocId, buf);
    await selectAll();
    await ensureBrushTool();
    await defineBrush(name);

    const actualName = await readActiveBrushName(name);
    return {
      result: { brushName: actualName, widthPx: buf.width, heightPx: buf.height },
      scratchDocId,
    };
  } catch (e) {
    // Clean up so we never orphan the scratch doc on failure.
    if (scratchDocId !== null) {
      await teardownScratchDoc(scratchDocId).catch(() => { /* swallow */ });
    }
    throw e;
  }
}

// Make a new RGB document at the buffer's dimensions. Use the UXP DOM
// app.documents.add — far more reliable than batchPlay `make document` whose
// descriptor varies between PS versions and was rejected with -128 in PS 26.
async function createScratchDoc(width: number, height: number): Promise<number> {
  const { app } = await import("photoshop");
  const doc: any = await (app as any).documents.add({
    width,
    height,
    resolution: 72,
    mode: "RGBColorMode",
    fill: "transparent",
    name: "BrushBuddy Scratch",
  });
  if (!doc || typeof doc.id !== "number") {
    throw new Error("Failed to create scratch document via app.documents.add");
  }
  return doc.id;
}

async function writePixelsToActiveLayer(docId: number, buf: PixelBuffer): Promise<void> {
  if (!imaging || !(imaging as any).putPixels || !(imaging as any).createImageDataFromBuffer) {
    throw new Error("UXP imaging.putPixels/createImageDataFromBuffer unavailable. Requires Photoshop 24.2+.");
  }

  // imaging.createImageDataFromBuffer expects a Uint8Array view. PixelBuffer
  // uses Uint8ClampedArray; share the same backing store (no copy).
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
      // No layerID → writes to the active (background) layer.
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

async function selectAll(): Promise<void> {
  await bp([{
    _obj: "set",
    _target: [{ _ref: "channel", _property: "selection" }],
    to: { _enum: "ordinal", _value: "allEnum" },
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

// PS often ignores our `name` and assigns "Sampled Brush N". Read it back
// from currentToolOptions.brush.name (same trick brush.ts uses).
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

// Close scratch doc without saving. We must target *this specific* doc id;
// the user's source doc may have become active again at any moment.
async function teardownScratchDoc(docId: number): Promise<void> {
  // Wrap in its own modal scope only if we're not already in one. The public
  // entrypoints already hold the modal lock, so call bp directly.
  await bpSilent([{
    _obj: "select",
    _target: [{ _ref: "document", _id: docId }],
    _options: { dialogOptions: "dontDisplay" },
  }]);
  await bpSilent([{
    _obj: "close",
    _target: [{ _ref: "document", _id: docId }],
    saving: { _enum: "yesNo", _value: "no" },
    _options: { dialogOptions: "dontDisplay" },
  }]);
}

