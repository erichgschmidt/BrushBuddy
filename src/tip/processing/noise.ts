import { PixelBuffer } from "../types";

export type NoiseMode = "additive" | "multiplicative" | "bluenoise";

export interface NoiseParams {
  amount: number; // 0-100
  mode: NoiseMode;
  seed?: number;
}

export function noise(input: PixelBuffer, params: NoiseParams): PixelBuffer {
  if (params.amount === 0) {
    return { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) };
  }
  const w = input.width, h = input.height;
  const s = input.data;
  const out = new Uint8ClampedArray(s.length);
  const seed = params.seed ?? 1;
  const rng = mulberry32(seed >>> 0);
  const amt = params.amount / 100;

  let field: Float32Array | null = null;
  if (params.mode === "bluenoise") field = blueNoiseField(w, h, rng);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let n: number;
      if (params.mode === "bluenoise") {
        n = field![y * w + x]; // -1..1
      } else {
        n = rng() * 2 - 1;
      }
      if (params.mode === "multiplicative") {
        const m = 1 + n * amt;
        out[i] = s[i] * m;
        out[i + 1] = s[i + 1] * m;
        out[i + 2] = s[i + 2] * m;
      } else {
        const add = n * amt * 255;
        out[i] = s[i] + add;
        out[i + 1] = s[i + 1] + add;
        out[i + 2] = s[i + 2] + add;
      }
      out[i + 3] = s[i + 3];
    }
  }
  return { width: w, height: h, data: out };
}

// Cheap blue-noise approximation: white noise minus a 3x3 average. Deterministic.
function blueNoiseField(w: number, h: number, rng: () => number): Float32Array {
  const white = new Float32Array(w * h);
  for (let i = 0; i < white.length; i++) white[i] = rng() * 2 - 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          sum += white[yy * w + xx]; c++;
        }
      }
      const avg = sum / c;
      out[y * w + x] = white[y * w + x] - avg;
    }
  }
  // Normalize to [-1,1].
  let maxAbs = 0;
  for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > maxAbs) maxAbs = a; }
  if (maxAbs > 0) for (let i = 0; i < out.length; i++) out[i] /= maxAbs;
  return out;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
