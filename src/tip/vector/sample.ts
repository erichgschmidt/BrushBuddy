// Sample a point + tangent along a VectorShape's outline at parameter t ∈ [0,1].
// Used by the composer's "vectorPath" layout: stamps follow the shape's outline.

import type { VectorShape, VectorPoint } from "./types";

interface SampledPoint {
  x: number;       // pixel x (in canvas coords)
  y: number;       // pixel y
  tangentDeg: number; // path tangent in degrees (0 = +x)
}

interface FlatPoint { x: number; y: number; cum: number /* cumulative arc length */ }

/** Flatten the shape to a polyline with cumulative arc length. */
function flattenWithLength(shape: VectorShape, w: number, h: number): FlatPoint[] {
  const out: FlatPoint[] = [];
  const pts = shape.points;
  const n = pts.length;
  if (n < 2) return out;
  const last = shape.closed ? n : n - 1;

  const px = (p: VectorPoint) => p.x * w;
  const py = (p: VectorPoint) => p.y * h;
  const STEPS = 32;

  let cum = 0;
  let prevX = px(pts[0]), prevY = py(pts[0]);
  out.push({ x: prevX, y: prevY, cum });

  for (let i = 0; i < last; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.curve) {
      const cx = a.curve.controlX * w;
      const cy = a.curve.controlY * h;
      for (let s = 1; s <= STEPS; s++) {
        const t = s / STEPS;
        const u = 1 - t;
        const x = u * u * px(a) + 2 * u * t * cx + t * t * px(b);
        const y = u * u * py(a) + 2 * u * t * cy + t * t * py(b);
        cum += Math.hypot(x - prevX, y - prevY);
        out.push({ x, y, cum });
        prevX = x; prevY = y;
      }
    } else {
      const x = px(b), y = py(b);
      cum += Math.hypot(x - prevX, y - prevY);
      out.push({ x, y, cum });
      prevX = x; prevY = y;
    }
  }
  return out;
}

export interface PathSampler {
  totalLength: number;
  /** sample at t ∈ [0,1]. */
  at(t: number): SampledPoint;
}

export function buildPathSampler(shape: VectorShape, canvasW: number, canvasH: number): PathSampler {
  const flat = flattenWithLength(shape, canvasW, canvasH);
  const total = flat.length ? flat[flat.length - 1].cum : 0;

  return {
    totalLength: total,
    at(t: number): SampledPoint {
      if (flat.length < 2 || total === 0) return { x: 0, y: 0, tangentDeg: 0 };
      const target = Math.max(0, Math.min(1, t)) * total;
      // Binary search for the segment containing the target arc length.
      let lo = 0, hi = flat.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (flat[mid].cum <= target) lo = mid; else hi = mid;
      }
      const a = flat[lo], b = flat[hi];
      const seg = b.cum - a.cum;
      const u = seg > 0 ? (target - a.cum) / seg : 0;
      const x = a.x + (b.x - a.x) * u;
      const y = a.y + (b.y - a.y) * u;
      const tangentDeg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
      return { x, y, tangentDeg };
    },
  };
}
