import { PixelBuffer } from "../types";

export interface GaussianBlurParams { radiusPx: number }

export function gaussianBlur(input: PixelBuffer, params: GaussianBlurParams): PixelBuffer {
  const r = Math.max(0, params.radiusPx | 0);
  if (r === 0) return { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) };
  const kernel = buildKernel(r);
  // Two passes: horizontal into temp, vertical into out. Operate on premultiplied alpha
  // to avoid bleed of fully-transparent RGB into edges.
  const w = input.width, h = input.height;
  const src = premultiply(input.data);
  const tmp = new Float32Array(w * h * 4);
  convolve1D(src, tmp, w, h, kernel, true);
  const out = new Float32Array(w * h * 4);
  convolve1D(tmp, out, w, h, kernel, false);
  return { width: w, height: h, data: unpremultiply(out) };
}

function buildKernel(r: number): Float32Array {
  const sigma = Math.max(0.5, r / 2);
  const size = r * 2 + 1;
  const k = new Float32Array(size);
  const inv = 1 / (2 * sigma * sigma);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - r;
    const v = Math.exp(-x * x * inv);
    k[i] = v; sum += v;
  }
  for (let i = 0; i < size; i++) k[i] /= sum;
  return k;
}

function premultiply(data: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    out[i] = data[i] * a;
    out[i + 1] = data[i + 1] * a;
    out[i + 2] = data[i + 2] * a;
    out[i + 3] = data[i + 3];
  }
  return out;
}

function unpremultiply(data: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a <= 0) { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0; }
    else {
      const inv = 255 / a;
      out[i] = data[i] * inv;
      out[i + 1] = data[i + 1] * inv;
      out[i + 2] = data[i + 2] * inv;
      out[i + 3] = a;
    }
  }
  return out;
}

function convolve1D(
  src: Float32Array, dst: Float32Array,
  w: number, h: number, k: Float32Array, horizontal: boolean,
): void {
  const r = (k.length - 1) >> 1;
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        let r0 = 0, g0 = 0, b0 = 0, a0 = 0;
        for (let i = -r; i <= r; i++) {
          let xx = x + i;
          if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
          const si = row + xx * 4;
          const wt = k[i + r];
          r0 += src[si] * wt;
          g0 += src[si + 1] * wt;
          b0 += src[si + 2] * wt;
          a0 += src[si + 3] * wt;
        }
        const di = row + x * 4;
        dst[di] = r0; dst[di + 1] = g0; dst[di + 2] = b0; dst[di + 3] = a0;
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r0 = 0, g0 = 0, b0 = 0, a0 = 0;
        for (let i = -r; i <= r; i++) {
          let yy = y + i;
          if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
          const si = (yy * w + x) * 4;
          const wt = k[i + r];
          r0 += src[si] * wt;
          g0 += src[si + 1] * wt;
          b0 += src[si + 2] * wt;
          a0 += src[si + 3] * wt;
        }
        const di = (y * w + x) * 4;
        dst[di] = r0; dst[di + 1] = g0; dst[di + 2] = b0; dst[di + 3] = a0;
      }
    }
  }
}
