// Source-pixel ingestion for the tip pipeline. Produces a PixelBuffer
// (RGBA8, top-left, tightly packed Uint8ClampedArray) from one of three
// user intents: current selection, current layer, or a picked image file.
//
// All Photoshop-touching code runs inside core.executeAsModal. The 2500x2500
// brush-size cap is enforced here via a quick box-average downsample; a
// proper Lanczos lives in src/tip/processing/resize.ts (sibling agent) and
// can be swapped in later — see TODO below.

import { app, core, imaging } from "photoshop";
import type { PixelBuffer } from "./types";

// Photoshop's max sampled-brush dimension.
const MAX_TIP_DIM = 2500;

export interface IngestResult {
  buffer: PixelBuffer;
  bounds?: { left: number; top: number; right: number; bottom: number };
  sourceLabel: string;
}

interface Rect { left: number; top: number; right: number; bottom: number }

function getActiveDocOrThrow(): any {
  const doc = (app as any).activeDocument;
  if (!doc) throw new Error("No active document. Open an image first.");
  return doc;
}

function getActiveLayerOrThrow(doc: any): any {
  const layer = doc.activeLayers?.[0];
  if (!layer) throw new Error("No active layer. Select a layer first.");
  return layer;
}

function rectFromLayer(layer: any): Rect {
  const b = layer.bounds;
  if (!b) throw new Error("Active layer has no bounds (empty layer?).");
  const r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  if (r.right <= r.left || r.bottom <= r.top) {
    throw new Error("Active layer is empty (zero-size bounds).");
  }
  return r;
}

function rectFromSelection(doc: any): Rect {
  const sel = doc.selection;
  const b = sel?.bounds;
  if (!b) throw new Error("No selection. Make a rectangular selection first.");
  const r = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  if (r.right <= r.left || r.bottom <= r.top) {
    throw new Error("Selection is empty.");
  }
  return r;
}

function intersect(a: Rect, b: Rect): Rect | null {
  const r: Rect = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return (r.right > r.left && r.bottom > r.top) ? r : null;
}

// ---------------------------------------------------------------------------
// Imaging API call. Returns a tightly-packed RGBA Uint8ClampedArray.
// ---------------------------------------------------------------------------
async function getPixelsAsRGBA(
  documentID: number,
  layerID: number,
  sourceBounds?: Rect,
): Promise<PixelBuffer> {
  if (!imaging || !(imaging as any).getPixels) {
    throw new Error("Imaging API unavailable. Requires Photoshop 24.2+.");
  }
  const opts: any = {
    documentID,
    layerID,
    componentSize: 8,
    applyAlpha: false,
    colorSpace: "RGB",
  };
  if (sourceBounds) opts.sourceBounds = sourceBounds;
  const result = await (imaging as any).getPixels(opts);
  const id = result.imageData;
  try {
    const raw = await id.getData();
    const src = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const w: number = id.width;
    const h: number = id.height;
    const components: number = id.components ?? Math.round(src.length / (w * h));
    const out = new Uint8ClampedArray(w * h * 4);
    if (components === 4) {
      out.set(src);
    } else if (components === 3) {
      for (let i = 0, j = 0; i < w * h; i++, j += 3) {
        const o = i * 4;
        out[o] = src[j]; out[o + 1] = src[j + 1]; out[o + 2] = src[j + 2]; out[o + 3] = 255;
      }
    } else if (components === 1) {
      // Grayscale: replicate to RGB, full alpha.
      for (let i = 0; i < w * h; i++) {
        const v = src[i]; const o = i * 4;
        out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255;
      }
    } else {
      throw new Error(
        `Unsupported pixel layout (${components} components). ` +
        `BrushBuddy expects RGB/RGBA — convert the document to RGB mode.`,
      );
    }
    return { width: w, height: h, data: out };
  } finally {
    if (id && typeof id.dispose === "function") {
      try { id.dispose(); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Quick box-average downsample to fit MAX_TIP_DIM. Approximate; sibling agent's
// Lanczos in src/tip/processing/resize.ts should replace this once available.
// TODO(resize): swap to processing/resize.ts Lanczos when it exists.
// ---------------------------------------------------------------------------
function downsampleToCap(buf: PixelBuffer): { buffer: PixelBuffer; downsampled: boolean } {
  const { width, height } = buf;
  if (width <= MAX_TIP_DIM && height <= MAX_TIP_DIM) {
    return { buffer: buf, downsampled: false };
  }
  const scale = Math.min(MAX_TIP_DIM / width, MAX_TIP_DIM / height);
  const dw = Math.max(1, Math.floor(width * scale));
  const dh = Math.max(1, Math.floor(height * scale));
  const src = buf.data;
  const dst = new Uint8ClampedArray(dw * dh * 4);
  // Box-average each destination pixel over its source footprint.
  const fx = width / dw;
  const fy = height / dh;
  for (let y = 0; y < dh; y++) {
    const sy0 = Math.floor(y * fy);
    const sy1 = Math.min(height, Math.floor((y + 1) * fy));
    for (let x = 0; x < dw; x++) {
      const sx0 = Math.floor(x * fx);
      const sx1 = Math.min(width, Math.floor((x + 1) * fx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * width + sx) * 4;
          r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++;
        }
      }
      if (n === 0) n = 1;
      const o = (y * dw + x) * 4;
      dst[o] = r / n; dst[o + 1] = g / n; dst[o + 2] = b / n; dst[o + 3] = a / n;
    }
  }
  return { buffer: { width: dw, height: dh, data: dst }, downsampled: true };
}

function withCap(buf: PixelBuffer, base: string): { buffer: PixelBuffer; sourceLabel: string } {
  const { buffer, downsampled } = downsampleToCap(buf);
  const sourceLabel = downsampled
    ? `${base} (downsampled to ${buffer.width}x${buffer.height})`
    : base;
  return { buffer, sourceLabel };
}

// ---------------------------------------------------------------------------
// Public: read pixels from the current selection on the active layer.
// ---------------------------------------------------------------------------
export async function ingestFromSelection(): Promise<IngestResult> {
  return await core.executeAsModal(async () => {
    const doc = getActiveDocOrThrow();
    const layer = getActiveLayerOrThrow(doc);
    const layerRect = rectFromLayer(layer);
    const selRect = rectFromSelection(doc);
    const region = intersect(layerRect, selRect);
    if (!region) {
      throw new Error("Selection does not overlap the active layer.");
    }
    const w = region.right - region.left;
    const h = region.bottom - region.top;
    const raw = await getPixelsAsRGBA(doc.id, layer.id, region);
    const base = `selection ${w}x${h}`;
    const { buffer, sourceLabel } = withCap(raw, base);
    return { buffer, bounds: region, sourceLabel };
  }, { commandName: "BrushBuddy: ingest from selection" });
}

// ---------------------------------------------------------------------------
// Public: read pixels from the entire active layer.
// ---------------------------------------------------------------------------
export async function ingestFromActiveLayer(): Promise<IngestResult> {
  return await core.executeAsModal(async () => {
    const doc = getActiveDocOrThrow();
    const layer = getActiveLayerOrThrow(doc);
    const region = rectFromLayer(layer);
    const raw = await getPixelsAsRGBA(doc.id, layer.id, region);
    const layerName = typeof layer.name === "string" ? layer.name : "(unnamed)";
    const base = `layer '${layerName}'`;
    const { buffer, sourceLabel } = withCap(raw, base);
    return { buffer, bounds: region, sourceLabel };
  }, { commandName: "BrushBuddy: ingest from active layer" });
}

// ---------------------------------------------------------------------------
// Public: pick a PNG/JPG/etc. and decode into a PixelBuffer via Blob + <img>
// + offscreen canvas. UXP supports this without entering executeAsModal
// (no PS state is touched).
// ---------------------------------------------------------------------------
export async function ingestFromFile(): Promise<IngestResult> {
  // Lazy require so non-UXP envs (e.g. tsc) don't choke on the module.
  const uxp: any = require("uxp");
  const fs = uxp?.storage?.localFileSystem;
  if (!fs || typeof fs.getFileForOpening !== "function") {
    throw new Error("UXP localFileSystem unavailable.");
  }
  const file = await fs.getFileForOpening({
    types: ["png", "jpg", "jpeg", "bmp", "tiff", "tif", "gif", "webp"],
  });
  if (!file) throw new Error("File pick cancelled.");

  const bytes = await file.read({ format: uxp.storage.formats.binary });
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Best-effort mime type from extension; the browser's image decoder is forgiving.
  const name: string = (file.name || "image").toString();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime =
    ext === "png" ? "image/png" :
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "bmp" ? "image/bmp" :
    ext === "gif" ? "image/gif" :
    ext === "webp" ? "image/webp" :
    ext === "tif" || ext === "tiff" ? "image/tiff" :
    "application/octet-stream";

  // ArrayBuffer slice for Blob — defensively copy to detach from the file handle.
  const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  const blob = new Blob([ab], { type: mime });
  const url = URL.createObjectURL(blob);
  let bitmapW = 0, bitmapH = 0, rgba: Uint8ClampedArray;
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Could not decode '${name}'. Try PNG or JPG.`));
      i.src = url;
    });
    bitmapW = img.naturalWidth || img.width;
    bitmapH = img.naturalHeight || img.height;
    if (!bitmapW || !bitmapH) {
      throw new Error(`'${name}' decoded to a zero-size image.`);
    }
    const canvas = (typeof OffscreenCanvas !== "undefined")
      ? new OffscreenCanvas(bitmapW, bitmapH)
      : Object.assign(document.createElement("canvas"), { width: bitmapW, height: bitmapH });
    const ctx: any = (canvas as any).getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable in this UXP build.");
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, bitmapW, bitmapH);
    rgba = new Uint8ClampedArray(id.data); // detach from canvas
  } finally {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }

  const raw: PixelBuffer = { width: bitmapW, height: bitmapH, data: rgba };
  const base = `file: ${name}`;
  const { buffer, sourceLabel } = withCap(raw, base);
  return { buffer, sourceLabel };
}
