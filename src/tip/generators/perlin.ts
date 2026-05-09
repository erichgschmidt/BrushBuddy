// 2D simplex noise (Perlin-style coherent noise) with FBM octaves.
// Reference: Stefan Gustavson's simplex noise (public domain).

import type { PixelBuffer } from "../types";
import { mulberry32 } from "./rng";

export interface PerlinParams {
  width: number;
  height: number;
  scale: number;        // base feature size in pixels (larger = bigger blobs). default 32
  octaves: number;      // 1-8. default 4
  persistence: number;  // 0-1. default 0.5
  lacunarity: number;   // typically 2. default 2
  seed: number;         // default 1
  // If true, output is grayscale alpha-encoded (R=G=B=value, A=255).
  // If false, R=G=B=value, A=255 (same — we always output grayscale RGBA).
  // Reserved for future modes.
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD2 = new Float32Array([
  1, 1,  -1, 1,   1,-1,  -1,-1,
  1, 0,  -1, 0,   1, 0,  -1, 0,
  0, 1,   0,-1,   0, 1,   0,-1,
]);

function buildPerm(seed: number): Uint8Array {
  const rand = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

function simplex(perm: Uint8Array, xin: number, yin: number): number {
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const X0 = i - t, Y0 = j - t;
  const x0 = xin - X0, y0 = yin - Y0;
  let i1: number, j1: number;
  if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  const gi0 = (perm[ii + perm[jj]] % 12) * 2;
  const gi1 = (perm[ii + i1 + perm[jj + j1]] % 12) * 2;
  const gi2 = (perm[ii + 1 + perm[jj + 1]] % 12) * 2;
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (GRAD2[gi0] * x0 + GRAD2[gi0 + 1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (GRAD2[gi1] * x1 + GRAD2[gi1 + 1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (GRAD2[gi2] * x2 + GRAD2[gi2 + 1] * y2); }
  return 70 * (n0 + n1 + n2); // ~[-1, 1]
}

export function generatePerlin(params: PerlinParams): PixelBuffer {
  const w = Math.max(1, params.width | 0);
  const h = Math.max(1, params.height | 0);
  const scale = Math.max(1, params.scale);
  const octaves = Math.max(1, Math.min(8, params.octaves | 0));
  const persistence = Math.max(0, Math.min(1, params.persistence));
  const lacunarity = params.lacunarity || 2;
  const perm = buildPerm(params.seed | 0);

  const data = new Uint8ClampedArray(w * h * 4);
  // First pass: compute raw noise, track min/max to normalize to [0,1].
  const raw = new Float32Array(w * h);
  let minV = Infinity, maxV = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let amp = 1, freq = 1 / scale, sum = 0, ampSum = 0;
      for (let o = 0; o < octaves; o++) {
        sum += amp * simplex(perm, x * freq, y * freq);
        ampSum += amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      const v = sum / ampSum;
      raw[y * w + x] = v;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }
  const range = (maxV - minV) || 1;
  for (let i = 0; i < w * h; i++) {
    const v = ((raw[i] - minV) / range) * 255;
    const o = i * 4;
    data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
  }
  return { width: w, height: h, data };
}
