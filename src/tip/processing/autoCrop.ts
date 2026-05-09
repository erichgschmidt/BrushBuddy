import { PixelBuffer, bboxOfNonTransparent, bboxOfDark } from "../types";

export interface AutoCropParams {
  paddingPx?: number;
  // Used only when image has no useful alpha.
  lumThreshold?: number;
}

export function autoCrop(input: PixelBuffer, params: AutoCropParams = {}): PixelBuffer {
  const padPx = Math.max(0, params.paddingPx ?? 0);
  const w = input.width, h = input.height;

  // Prefer alpha bbox when there's any transparency; otherwise fall back to luminance.
  let box = anyTransparent(input.data) ? bboxOfNonTransparent(input) : null;
  if (!box) box = bboxOfDark(input, params.lumThreshold ?? 250);
  if (!box) {
    return { width: w, height: h, data: new Uint8ClampedArray(input.data) };
  }
  const x0 = Math.max(0, box.x - padPx);
  const y0 = Math.max(0, box.y - padPx);
  const x1 = Math.min(w, box.x + box.w + padPx);
  const y1 = Math.min(h, box.y + box.h + padPx);
  const tw = x1 - x0, th = y1 - y0;
  const out = new Uint8ClampedArray(tw * th * 4);
  const s = input.data;
  for (let y = 0; y < th; y++) {
    const srow = ((y + y0) * w + x0) * 4;
    const drow = y * tw * 4;
    for (let i = 0; i < tw * 4; i++) out[drow + i] = s[srow + i];
  }
  return { width: tw, height: th, data: out };
}

function anyTransparent(d: Uint8ClampedArray): boolean {
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}
