import { PixelBuffer } from "../types";

export interface MorphParams { radiusPx: number }

// Square-kernel morphology on the alpha channel, RGB carried through unchanged.
// Erode: keep min alpha in window. Dilate: keep max alpha in window.
export function erode(input: PixelBuffer, params: MorphParams): PixelBuffer {
  return runMorph(input, params.radiusPx, false);
}

export function dilate(input: PixelBuffer, params: MorphParams): PixelBuffer {
  return runMorph(input, params.radiusPx, true);
}

function runMorph(input: PixelBuffer, radius: number, max: boolean): PixelBuffer {
  const r = Math.max(0, radius | 0);
  if (r === 0) return { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) };
  const w = input.width, h = input.height;
  const s = input.data;
  // Two-pass separable (1D min/max along x then y).
  const tmpA = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = max ? 0 : 255;
      for (let i = -r; i <= r; i++) {
        let xx = x + i; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
        const a = s[(y * w + xx) * 4 + 3];
        if (max ? a > v : a < v) v = a;
      }
      tmpA[y * w + x] = v;
    }
  }
  const out = new Uint8ClampedArray(s.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = max ? 0 : 255;
      for (let i = -r; i <= r; i++) {
        let yy = y + i; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
        const a = tmpA[yy * w + x];
        if (max ? a > v : a < v) v = a;
      }
      const di = (y * w + x) * 4;
      out[di] = s[di]; out[di + 1] = s[di + 1]; out[di + 2] = s[di + 2];
      out[di + 3] = v;
    }
  }
  return { width: w, height: h, data: out };
}
