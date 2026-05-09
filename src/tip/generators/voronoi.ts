// Voronoi cells — flat-colored regions, each pixel gets the seed index of
// the nearest seed mapped to a grayscale value. Useful for mosaic-style
// tips and as a base for cracked/cell brushes (combine with edge detection
// or threshold).

import type { PixelBuffer } from "../types";
import { mulberry32 } from "./rng";

export interface VoronoiParams {
  width: number;
  height: number;
  cellSize: number;     // average cell size. default 32
  jitter: number;       // 0-1. default 1
  // "value" = each cell a unique random gray; "edges" = white cells, black borders.
  mode: "value" | "edges";
  seed: number;
}

export function generateVoronoi(params: VoronoiParams): PixelBuffer {
  const w = Math.max(1, params.width | 0);
  const h = Math.max(1, params.height | 0);
  const cs = Math.max(2, params.cellSize);
  const j = Math.max(0, Math.min(1, params.jitter));
  const rand = mulberry32(params.seed | 0);

  const cols = Math.max(1, Math.ceil(w / cs) + 1);
  const rows = Math.max(1, Math.ceil(h / cs) + 1);
  const seeds: number[] = [];   // x, y per seed
  const seedValue: number[] = []; // 0-255 per seed
  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const sx = (c + 0.5 + (rand() - 0.5) * j) * cs;
      const sy = (r + 0.5 + (rand() - 0.5) * j) * cs;
      seeds.push(sx, sy);
      seedValue.push(Math.floor(rand() * 256));
    }
  }

  const data = new Uint8ClampedArray(w * h * 4);
  const idx = new Int32Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity, bestIdx = 0;
      for (let s = 0; s < seeds.length; s += 2) {
        const dx = seeds[s] - x, dy = seeds[s + 1] - y;
        if (Math.abs(dx) > cs * 2 || Math.abs(dy) > cs * 2) continue;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; bestIdx = s >> 1; }
      }
      idx[y * w + x] = bestIdx;
    }
  }

  if (params.mode === "value") {
    for (let i = 0; i < w * h; i++) {
      const v = seedValue[idx[i]] ?? 128;
      const o = i * 4;
      data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
    }
  } else {
    // "edges" — black on cell borders, white inside.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const me = idx[y * w + x];
        let isEdge = false;
        if (x > 0 && idx[y * w + (x - 1)] !== me) isEdge = true;
        else if (x < w - 1 && idx[y * w + (x + 1)] !== me) isEdge = true;
        else if (y > 0 && idx[(y - 1) * w + x] !== me) isEdge = true;
        else if (y < h - 1 && idx[(y + 1) * w + x] !== me) isEdge = true;
        const v = isEdge ? 0 : 255;
        const o = (y * w + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
      }
    }
  }
  return { width: w, height: h, data };
}
