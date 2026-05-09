// Vector types — adapted from VectorShaper. Normalized [0,1] coordinates so
// shapes are resolution-independent.

export interface VectorCurve {
  // Quadratic Bezier control point for the segment FROM this point to the next.
  controlX: number;  // 0..1
  controlY: number;  // 0..1
}

export interface VectorPoint {
  x: number;        // 0..1
  y: number;        // 0..1
  // If present, the segment leaving this point uses this control point
  // (quadratic Bezier). Absent → straight line to next point.
  curve?: VectorCurve;
}

export interface VectorShape {
  points: VectorPoint[];
  closed: boolean;     // true → polygon (filled); false → polyline (stroked)
}

/** Quick boolean check that a shape is well-formed enough to render. */
export function isShapeRenderable(s: VectorShape | null | undefined): boolean {
  return !!s && Array.isArray(s.points) && s.points.length >= 2;
}
