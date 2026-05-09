// Connected-component blob extractor + per-blob statistics.
//
// Strategy: build a binary "presence" mask (alpha-or-inverted-luminance), then
// flood-fill 4-connected components. For each component compute centroid,
// bbox, area, PCA-based orientation/aspect, mean opacity, solidity.

import type { PixelBuffer } from "../types";
import type { Mark } from "./types";

export interface ExtractOptions {
  /** Min area (px) to consider a component a real mark. Default 4. */
  minArea?: number;
  /** 0..255 threshold on the presence mask. Default 64. */
  threshold?: number;
}

interface ComponentRaw {
  pixels: number[];   // packed (y * w + x) indices
  sumA: number;       // sum of alpha
}

/** Build a presence mask: pixel is "present" if alpha > t OR (255 - luminance) > t. */
function buildPresence(buf: PixelBuffer, t: number): Uint8Array {
  const { width: w, height: h, data } = buf;
  const mask = new Uint8Array(w * h);
  // Detect whether alpha varies; if not, fall back to inverted luminance.
  let aMin = 255, aMax = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < aMin) aMin = data[i];
    if (data[i] > aMax) aMax = data[i];
  }
  const useAlpha = (aMax - aMin) > 8;
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    const a = data[i + 3];
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const presence = useAlpha ? a : 255 - lum;
    mask[p] = presence > t ? 1 : 0;
  }
  return mask;
}

function floodFillComponents(mask: Uint8Array, w: number, h: number): ComponentRaw[] {
  const visited = new Uint8Array(w * h);
  const out: ComponentRaw[] = [];
  const stack: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (!mask[start] || visited[start]) continue;
      stack.length = 0;
      stack.push(start);
      const pixels: number[] = [];
      while (stack.length) {
        const idx = stack.pop()!;
        if (visited[idx]) continue;
        visited[idx] = 1;
        pixels.push(idx);
        const px = idx % w, py = (idx / w) | 0;
        if (px > 0     && mask[idx - 1]   && !visited[idx - 1])   stack.push(idx - 1);
        if (px < w - 1 && mask[idx + 1]   && !visited[idx + 1])   stack.push(idx + 1);
        if (py > 0     && mask[idx - w]   && !visited[idx - w])   stack.push(idx - w);
        if (py < h - 1 && mask[idx + w]   && !visited[idx + w])   stack.push(idx + w);
      }
      out.push({ pixels, sumA: 0 });
    }
  }
  return out;
}

/** PCA on 2D points → dominant axis angle (deg, -90..90) and aspect (long/short). */
function pca(pixels: number[], w: number): { angleDeg: number; aspect: number; cx: number; cy: number } {
  let sx = 0, sy = 0;
  for (const idx of pixels) { sx += idx % w; sy += (idx / w) | 0; }
  const cx = sx / pixels.length;
  const cy = sy / pixels.length;
  let cxx = 0, cyy = 0, cxy = 0;
  for (const idx of pixels) {
    const x = (idx % w) - cx;
    const y = ((idx / w) | 0) - cy;
    cxx += x * x; cyy += y * y; cxy += x * y;
  }
  cxx /= pixels.length; cyy /= pixels.length; cxy /= pixels.length;
  const tr = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.max(0, tr * tr / 4 - det);
  const lam1 = tr / 2 + Math.sqrt(disc);
  const lam2 = tr / 2 - Math.sqrt(disc);
  const angleDeg = Math.atan2(2 * cxy, cxx - cyy) * 90 / Math.PI; // halved
  const long = Math.sqrt(Math.max(lam1, 1e-6));
  const short = Math.sqrt(Math.max(lam2, 1e-6));
  const aspect = long / short;
  return { angleDeg, aspect, cx, cy };
}

export function extractMarks(buf: PixelBuffer, opts: ExtractOptions = {}): Mark[] {
  const minArea = opts.minArea ?? 4;
  const t = opts.threshold ?? 64;
  const w = buf.width, h = buf.height;
  const mask = buildPresence(buf, t);
  const comps = floodFillComponents(mask, w, h);

  const marks: Mark[] = [];
  for (const c of comps) {
    if (c.pixels.length < minArea) continue;
    // Sum alpha over the component for opacity.
    let sumA = 0;
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const idx of c.pixels) {
      const a = buf.data[idx * 4 + 3];
      const lum = 0.299 * buf.data[idx * 4] + 0.587 * buf.data[idx * 4 + 1] + 0.114 * buf.data[idx * 4 + 2];
      sumA += Math.max(a, 255 - lum);
      const x = idx % w, y = (idx / w) | 0;
      if (x < xMin) xMin = x; if (x > xMax) xMax = x;
      if (y < yMin) yMin = y; if (y > yMax) yMax = y;
    }
    const meanA = sumA / c.pixels.length;
    const { angleDeg, aspect, cx, cy } = pca(c.pixels, w);
    // Solidity = area / bbox area (rough, not true convex hull but cheap).
    const bboxArea = Math.max(1, (xMax - xMin + 1) * (yMax - yMin + 1));
    const solidity = c.pixels.length / bboxArea;
    marks.push({
      cx, cy,
      area: c.pixels.length,
      bbox: { left: xMin, top: yMin, right: xMax, bottom: yMax },
      aspect,
      angleDeg,
      opacity: meanA,
      solidity,
    });
  }
  return marks;
}
