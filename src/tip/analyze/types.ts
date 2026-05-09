// Types for image-driven mark analysis. The pipeline:
//   PixelBuffer → extractMarks → Mark[]
//   Mark[]      → computeFingerprint → Fingerprint
//   Fingerprint + Multipliers → regeneratePlacements → MarkPlacement[]
//
// MarkPlacement[] is then consumed by the composer's "fingerprint" layout to
// produce a procedurally-regenerated splatter.

export interface Mark {
  cx: number;        // centroid x (pixels)
  cy: number;        // centroid y
  area: number;      // pixel count
  bbox: { left: number; top: number; right: number; bottom: number };
  aspect: number;    // long/short axis ratio (≥1)
  angleDeg: number;  // dominant orientation, -90..90
  opacity: number;   // mean alpha across the blob, 0..255
  solidity: number;  // area / convex-hull-area approximation, 0..1
}

export interface Percentiles { p10: number; p50: number; p90: number; mean: number; std: number }

export interface Fingerprint {
  // Per-mark distributions (compressed as percentiles)
  size: Percentiles;       // sqrt(area) in pixels
  aspect: Percentiles;     // long/short ratio
  opacity: Percentiles;    // 0..255
  // Orientation histogram (8 bins covering -90..90) + concentration metric
  // (von-Mises-like κ; high = aligned, ~0 = random)
  orientationBins: number[];
  orientationDominantDeg: number;
  orientationConcentration: number; // 0..1 normalized
  // Spatial
  countPerKpx2: number;       // marks per 1000 sq pixels of bbox
  nnDist: Percentiles;        // nearest-neighbor distance (px)
  clusteringIndex: number;    // 0=random, >0=clustered, <0=regular spacing
  // Reference canvas size (so we know what density to scale to)
  refWidth: number;
  refHeight: number;
}

export interface Multipliers {
  density: number;          // 1 = match reference; 2 = twice as many marks
  size: number;             // multiplier on size median
  sizeSpread: number;       // multiplier on (p90 - p10)
  alignment: number;        // multiplier on orientation concentration; >1 tighter
  rotateDeg: number;        // additive rotation of the orientation distribution
  clustering: number;       // multiplier on clusteringIndex
  opacity: number;          // multiplier on opacity median
  aspect: number;           // multiplier on aspect median
}

export const DEFAULT_MULTIPLIERS: Multipliers = {
  density: 1, size: 1, sizeSpread: 1,
  alignment: 1, rotateDeg: 0, clustering: 1,
  opacity: 1, aspect: 1,
};

export interface MarkPlacement {
  cx: number;
  cy: number;
  scale: number;       // multiplier on the source tip's natural size
  angleDeg: number;
  opacity: number;     // 0..1
  flipX?: boolean;
  flipY?: boolean;
}
