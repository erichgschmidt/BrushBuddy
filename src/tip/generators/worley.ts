// Worley / cellular noise. For each pixel, find the N closest seed points and
// output a function of those distances. F1 = nearest distance (cells dark in
// centers), F2-F1 = ridge between cells (cracks/edges), F2 = secondary cells.

import type { PixelBuffer } from "../types";
import { mulberry32 } from "./rng";

export type WorleyMode = "F1" | "F2" | "F2-F1" | "F1F2" /* avg */;

export interface WorleyParams {
  width: number;
  height: number;
  cellSize: number;     // average distance between seeds in pixels. default 32
  jitter: number;       // 0-1, how much seeds wander from their grid cell. default 1
  mode: WorleyMode;
  seed: number;
}

export function generateWorley(params: WorleyParams): PixelBuffer {
  const w = Math.max(1, params.width | 0);
  const h = Math.max(1, params.height | 0);
  const cs = Math.max(2, params.cellSize);
  const j = Math.max(0, Math.min(1, params.jitter));
  const rand = mulberry32(params.seed | 0);

  // Generate seeds in a coarse grid + jitter.
  const cols = Math.max(1, Math.ceil(w / cs) + 1);
  const rows = Math.max(1, Math.ceil(h / cs) + 1);
  const seeds: number[] = []; // [x, y, x, y, ...]
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const sx = (c + 0.5 + (rand() - 0.5) * j) * cs;
      const sy = (r + 0.5 + (rand() - 0.5) * j) * cs;
      seeds.push(sx, sy);
    }
  }

  const data = new Uint8ClampedArray(w * h * 4);
  const raw = new Float32Array(w * h);
  let minV = Infinity, maxV = -Infinity;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Only check seeds within ~2 cell widths for speed.
      let f1 = Infinity, f2 = Infinity;
      for (let s = 0; s < seeds.length; s += 2) {
        const dx = seeds[s] - x, dy = seeds[s + 1] - y;
        if (Math.abs(dx) > cs * 2 || Math.abs(dy) > cs * 2) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) { f2 = f1; f1 = d; }
        else if (d < f2) { f2 = d; }
      }
      let v: number;
      switch (params.mode) {
        case "F1":    v = f1; break;
        case "F2":    v = f2; break;
        case "F2-F1": v = f2 - f1; break;
        case "F1F2":  v = (f1 + f2) * 0.5; break;
      }
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
