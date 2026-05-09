// Canvas weave / paper-grain texture from orthogonal sin patterns.
// Cheap to compute, looks like fabric or paper grain.

import type { PixelBuffer } from "../types";
import { mulberry32 } from "./rng";

export interface CanvasWeaveParams {
  width: number;
  height: number;
  pitch: number;     // weave period in pixels. default 6
  contrast: number;  // 0-1. default 0.6
  jitter: number;    // 0-1, per-pixel high-freq noise. default 0.15
  seed: number;
}

export function generateCanvasWeave(params: CanvasWeaveParams): PixelBuffer {
  const w = Math.max(1, params.width | 0);
  const h = Math.max(1, params.height | 0);
  const pitch = Math.max(2, params.pitch);
  const contrast = Math.max(0, Math.min(1, params.contrast));
  const jitter = Math.max(0, Math.min(1, params.jitter));
  const rand = mulberry32(params.seed | 0);

  const k = (Math.PI * 2) / pitch;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.sin(x * k);
      const sy = Math.sin(y * k);
      // Combine orthogonal sins; clamp.
      let v = 0.5 + 0.5 * (sx + sy) * 0.5 * contrast;
      // Add jitter for grain.
      v += (rand() - 0.5) * jitter;
      v = Math.max(0, Math.min(1, v));
      const o = (y * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v * 255;
      data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}
