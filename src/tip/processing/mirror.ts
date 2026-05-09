import { PixelBuffer } from "../types";

export interface MirrorParams { axis: "x" | "y" }

export function mirror(input: PixelBuffer, params: MirrorParams): PixelBuffer {
  const { width: w, height: h, data: s } = input;
  const out = new Uint8ClampedArray(s.length);
  if (params.axis === "x") {
    // flip horizontally
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        const si = row + x * 4;
        const di = row + (w - 1 - x) * 4;
        out[di] = s[si]; out[di + 1] = s[si + 1]; out[di + 2] = s[si + 2]; out[di + 3] = s[si + 3];
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      const srow = y * w * 4;
      const drow = (h - 1 - y) * w * 4;
      for (let i = 0; i < w * 4; i++) out[drow + i] = s[srow + i];
    }
  }
  return { width: w, height: h, data: out };
}
