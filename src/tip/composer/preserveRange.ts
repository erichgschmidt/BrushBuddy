// Linear remap each channel of `dst` so its [min, max] matches `src`'s.
// Used by the composer's "Preserve range" toggle — prevents the iterative
// accumulation drift where max-blended stamps keep getting brighter.
//
// Strategy: per channel (R, G, B, A), measure src and dst min/max, then
// linearly stretch dst values into src's range. Channels with degenerate
// dst range (max == min) are left untouched.

import type { PixelBuffer } from "../types";

export function preserveRange(src: PixelBuffer, dst: PixelBuffer): PixelBuffer {
  const srcMin = [255, 255, 255, 255];
  const srcMax = [0, 0, 0, 0];
  for (let i = 0; i < src.data.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      const v = src.data[i + c];
      if (v < srcMin[c]) srcMin[c] = v;
      if (v > srcMax[c]) srcMax[c] = v;
    }
  }
  const dstMin = [255, 255, 255, 255];
  const dstMax = [0, 0, 0, 0];
  for (let i = 0; i < dst.data.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      const v = dst.data[i + c];
      if (v < dstMin[c]) dstMin[c] = v;
      if (v > dstMax[c]) dstMax[c] = v;
    }
  }
  const out = new Uint8ClampedArray(dst.data.length);
  for (let i = 0; i < dst.data.length; i += 4) {
    for (let c = 0; c < 4; c++) {
      const v = dst.data[i + c];
      const dRange = dstMax[c] - dstMin[c];
      const sRange = srcMax[c] - srcMin[c];
      if (dRange <= 0) { out[i + c] = v; continue; }
      const t = (v - dstMin[c]) / dRange;
      out[i + c] = Math.round(srcMin[c] + t * sRange);
    }
  }
  return { width: dst.width, height: dst.height, data: out };
}
