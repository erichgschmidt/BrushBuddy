import { PixelBuffer } from "../types";

export interface ResizeParams { width: number; height: number }

const MAX_DIM = 2500;

export function resize(input: PixelBuffer, params: ResizeParams): PixelBuffer {
  const tw = clampDim(params.width);
  const th = clampDim(params.height);
  if (tw === input.width && th === input.height) {
    return { width: tw, height: th, data: new Uint8ClampedArray(input.data) };
  }
  // Lanczos-3 downscale on any axis that shrinks; bilinear elsewhere.
  // Simplest: if either axis upscales, use bilinear for both. Otherwise lanczos.
  if (tw >= input.width && th >= input.height) return bilinear(input, tw, th);
  return lanczos3(input, tw, th);
}

function clampDim(v: number): number {
  v = Math.max(1, v | 0);
  return v > MAX_DIM ? MAX_DIM : v;
}

function bilinear(src: PixelBuffer, tw: number, th: number): PixelBuffer {
  const sw = src.width, sh = src.height, sd = src.data;
  const out = new Uint8ClampedArray(tw * th * 4);
  const sx = sw / tw, sy = sh / th;
  for (let y = 0; y < th; y++) {
    const fy = (y + 0.5) * sy - 0.5;
    let y0 = Math.floor(fy); if (y0 < 0) y0 = 0; if (y0 > sh - 1) y0 = sh - 1;
    let y1 = y0 + 1; if (y1 > sh - 1) y1 = sh - 1;
    const wy = fy - y0;
    for (let x = 0; x < tw; x++) {
      const fx = (x + 0.5) * sx - 0.5;
      let x0 = Math.floor(fx); if (x0 < 0) x0 = 0; if (x0 > sw - 1) x0 = sw - 1;
      let x1 = x0 + 1; if (x1 > sw - 1) x1 = sw - 1;
      const wx = fx - x0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const di = (y * tw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = sd[i00 + c] * (1 - wx) + sd[i10 + c] * wx;
        const b = sd[i01 + c] * (1 - wx) + sd[i11 + c] * wx;
        out[di + c] = a * (1 - wy) + b * wy;
      }
    }
  }
  return { width: tw, height: th, data: out };
}

function lanczos3(src: PixelBuffer, tw: number, th: number): PixelBuffer {
  // Two-pass: horizontal -> intermediate, vertical -> output.
  const sw = src.width, sh = src.height;
  const horiz = resampleAxis(src.data, sw, sh, tw, true);
  const out = resampleAxis(horiz, tw, sh, th, false);
  return { width: tw, height: th, data: new Uint8ClampedArray(out) };
}

function lanczosKernel(x: number, a = 3): number {
  if (x === 0) return 1;
  if (x <= -a || x >= a) return 0;
  const px = Math.PI * x;
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px);
}

function resampleAxis(
  src: ArrayLike<number>, sw: number, sh: number, td: number, horizontal: boolean,
): Uint8ClampedArray {
  const tw = horizontal ? td : sw;
  const th = horizontal ? sh : td;
  const out = new Uint8ClampedArray(tw * th * 4);
  const ratio = horizontal ? sw / tw : sh / th;
  const filterRadius = Math.max(3, Math.ceil(3 * ratio));
  const scale = ratio > 1 ? 1 / ratio : 1;

  if (horizontal) {
    for (let x = 0; x < tw; x++) {
      const center = (x + 0.5) * ratio - 0.5;
      const left = Math.floor(center - filterRadius);
      const right = Math.floor(center + filterRadius);
      let sum = 0;
      const weights: number[] = [];
      for (let i = left; i <= right; i++) {
        const w = lanczosKernel((i - center) * scale);
        weights.push(w); sum += w;
      }
      const inv = sum !== 0 ? 1 / sum : 0;
      for (let y = 0; y < th; y++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let i = left, k = 0; i <= right; i++, k++) {
          let xx = i; if (xx < 0) xx = 0; else if (xx >= sw) xx = sw - 1;
          const si = (y * sw + xx) * 4;
          const w = weights[k];
          r += src[si] * w; g += src[si + 1] * w; b += src[si + 2] * w; a += src[si + 3] * w;
        }
        const di = (y * tw + x) * 4;
        out[di] = r * inv; out[di + 1] = g * inv; out[di + 2] = b * inv; out[di + 3] = a * inv;
      }
    }
  } else {
    for (let y = 0; y < th; y++) {
      const center = (y + 0.5) * ratio - 0.5;
      const left = Math.floor(center - filterRadius);
      const right = Math.floor(center + filterRadius);
      let sum = 0;
      const weights: number[] = [];
      for (let i = left; i <= right; i++) {
        const w = lanczosKernel((i - center) * scale);
        weights.push(w); sum += w;
      }
      const inv = sum !== 0 ? 1 / sum : 0;
      for (let x = 0; x < tw; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let i = left, k = 0; i <= right; i++, k++) {
          let yy = i; if (yy < 0) yy = 0; else if (yy >= sh) yy = sh - 1;
          const si = (yy * sw + x) * 4;
          const w = weights[k];
          r += src[si] * w; g += src[si + 1] * w; b += src[si + 2] * w; a += src[si + 3] * w;
        }
        const di = (y * tw + x) * 4;
        out[di] = r * inv; out[di + 1] = g * inv; out[di + 2] = b * inv; out[di + 3] = a * inv;
      }
    }
  }
  return out;
}
