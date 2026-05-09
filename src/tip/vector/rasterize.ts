// Rasterize a VectorShape into a PixelBuffer (RGBA). Black fill on
// transparent background — same convention the rest of the tip pipeline
// expects (alphaFromLuminance can convert to PS-brush alpha after).
//
// Implementation:
//   1. Subdivide each Bezier segment into N small line segments.
//   2. Even-odd scanline fill at integer y, with edge crossings at sub-pixel
//      precision and 4-row vertical supersampling for smoother edges.

import type { PixelBuffer } from "../types";
import type { VectorShape, VectorPoint } from "./types";

const BEZIER_STEPS = 16;
const SS = 4; // vertical supersampling

interface Edge {
  yMin: number; yMax: number;     // pixel space
  x: number;                       // current x at scanline
  invSlope: number;                // dx per +1 y
}

/** Flatten a possibly-curved shape to a list of line segments (px coords). */
function flatten(shape: VectorShape, w: number, h: number): { x1: number; y1: number; x2: number; y2: number }[] {
  const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const pts = shape.points;
  const n = pts.length;
  if (n < 2) return segs;
  const last = shape.closed ? n : n - 1;

  const px = (p: VectorPoint) => p.x * w;
  const py = (p: VectorPoint) => p.y * h;

  for (let i = 0; i < last; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.curve) {
      // Quadratic Bezier subdivide.
      const cx = a.curve.controlX * w;
      const cy = a.curve.controlY * h;
      let prevX = px(a), prevY = py(a);
      for (let s = 1; s <= BEZIER_STEPS; s++) {
        const t = s / BEZIER_STEPS;
        const u = 1 - t;
        const x = u * u * px(a) + 2 * u * t * cx + t * t * px(b);
        const y = u * u * py(a) + 2 * u * t * cy + t * t * py(b);
        segs.push({ x1: prevX, y1: prevY, x2: x, y2: y });
        prevX = x; prevY = y;
      }
    } else {
      segs.push({ x1: px(a), y1: py(a), x2: px(b), y2: py(b) });
    }
  }
  return segs;
}

export function rasterizeShape(shape: VectorShape, width: number, height: number): PixelBuffer {
  const w = Math.max(1, width | 0);
  const h = Math.max(1, height | 0);
  const data = new Uint8ClampedArray(w * h * 4);

  if (!shape || !shape.points || shape.points.length < 2) {
    return { width: w, height: h, data };
  }

  const segs = flatten(shape, w, h);

  if (!shape.closed) {
    // Polyline → just rasterize as 1-px lines (Bresenham).
    for (const s of segs) drawLine(data, w, h, s.x1, s.y1, s.x2, s.y2);
    return { width: w, height: h, data };
  }

  // Build edge table for even-odd fill, with vertical supersampling.
  const edges: Edge[] = [];
  for (const s of segs) {
    if (s.y1 === s.y2) continue; // horizontal — ignored
    const yMin = Math.min(s.y1, s.y2);
    const yMax = Math.max(s.y1, s.y2);
    const xAtMin = s.y1 < s.y2 ? s.x1 : s.x2;
    const invSlope = (s.x2 - s.x1) / (s.y2 - s.y1);
    edges.push({ yMin, yMax, x: xAtMin, invSlope });
  }

  // For each pixel row, sample SS subrows and accumulate coverage.
  for (let y = 0; y < h; y++) {
    const cov = new Uint16Array(w); // SS-row coverage count per pixel column (0..SS)
    for (let sub = 0; sub < SS; sub++) {
      const yy = y + (sub + 0.5) / SS;
      const active = edges.filter((e) => yy >= e.yMin && yy < e.yMax);
      if (!active.length) continue;
      // Compute crossings.
      const xs: number[] = [];
      for (const e of active) {
        xs.push(e.x + (yy - e.yMin) * e.invSlope);
      }
      xs.sort((a, b) => a - b);
      // Even-odd: fill between pairs.
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xs0 = xs[i], xs1 = xs[i + 1];
        const i0 = Math.max(0, Math.floor(xs0));
        const i1 = Math.min(w - 1, Math.ceil(xs1) - 1);
        for (let x = i0; x <= i1; x++) cov[x]++;
      }
    }
    for (let x = 0; x < w; x++) {
      const a = (cov[x] * 255 / SS) | 0;
      if (a > 0) {
        const o = (y * w + x) * 4;
        data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = a;
      }
    }
  }
  return { width: w, height: h, data };
}

function drawLine(data: Uint8ClampedArray, w: number, h: number, x1: number, y1: number, x2: number, y2: number) {
  let x0 = Math.round(x1), y0 = Math.round(y1);
  const xe = Math.round(x2), ye = Math.round(y2);
  const dx = Math.abs(xe - x0);
  const dy = Math.abs(ye - y0);
  const sx = x0 < xe ? 1 : -1;
  const sy = y0 < ye ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) {
      const o = (y0 * w + x0) * 4;
      data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 255;
    }
    if (x0 === xe && y0 === ye) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
}
