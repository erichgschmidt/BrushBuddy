// Compute a statistical fingerprint from a list of Marks.

import type { Fingerprint, Mark, Percentiles } from "./types";

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

function describe(arr: number[]): Percentiles {
  if (arr.length === 0) return { p10: 0, p50: 0, p90: 0, mean: 0, std: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return { p10: pct(arr, 0.1), p50: pct(arr, 0.5), p90: pct(arr, 0.9), mean, std: Math.sqrt(variance) };
}

/** Wrap angle to [-90, 90] (axes are unoriented — 80° and -100° are the same axis). */
function wrapAxis(deg: number): number {
  let d = deg % 180;
  if (d > 90)  d -= 180;
  if (d < -90) d += 180;
  return d;
}

/** Build an 8-bin histogram of axis angles, return bins, dominant angle, and concentration (0..1). */
function orientationStats(angles: number[]): { bins: number[]; dominantDeg: number; concentration: number } {
  const BINS = 8;
  const bins = new Array(BINS).fill(0);
  for (const a of angles) {
    const d = wrapAxis(a) + 90;       // 0..180
    const b = Math.min(BINS - 1, Math.floor(d / (180 / BINS)));
    bins[b]++;
  }
  // Normalize.
  const total = angles.length || 1;
  for (let i = 0; i < BINS; i++) bins[i] /= total;
  // Dominant angle = bin with peak (returned as deg).
  let peakIdx = 0, peakVal = -1;
  for (let i = 0; i < BINS; i++) if (bins[i] > peakVal) { peakVal = bins[i]; peakIdx = i; }
  const dominantDeg = (peakIdx + 0.5) * (180 / BINS) - 90;
  // Concentration: peak height vs uniform (1/BINS = 0.125).
  // 0 = uniform, 1 = all in one bin.
  const uniform = 1 / BINS;
  const concentration = Math.max(0, Math.min(1, (peakVal - uniform) / (1 - uniform)));
  return { bins, dominantDeg, concentration };
}

/** Compute pairwise nearest-neighbor distances. */
function nearestNeighborDistances(marks: Mark[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < marks.length; i++) {
    let best = Infinity;
    for (let j = 0; j < marks.length; j++) {
      if (i === j) continue;
      const dx = marks[i].cx - marks[j].cx;
      const dy = marks[i].cy - marks[j].cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < best) best = d;
    }
    if (Number.isFinite(best)) out.push(best);
  }
  return out;
}

/** Clark-Evans-style clustering index:
 *   ratio of observed mean NN distance to expected NN distance under CSR.
 *   < 1 → clustered, ≈ 1 → random, > 1 → regular. We return (1 - ratio) so
 *   positive = clustered, negative = regular spacing.
 */
function clusteringIndex(marks: Mark[], nnDists: number[], refW: number, refH: number): number {
  if (marks.length < 2) return 0;
  const meanNN = nnDists.reduce((a, b) => a + b, 0) / Math.max(1, nnDists.length);
  const density = marks.length / (refW * refH);
  const expectedNN = 0.5 / Math.sqrt(density);
  if (expectedNN === 0) return 0;
  const ratio = meanNN / expectedNN;
  // Clamp to a reasonable range.
  return Math.max(-2, Math.min(2, 1 - ratio));
}

export function computeFingerprint(marks: Mark[], refW: number, refH: number): Fingerprint {
  const sizes = marks.map((m) => Math.sqrt(m.area));
  const aspects = marks.map((m) => m.aspect);
  const opacities = marks.map((m) => m.opacity);
  const angles = marks.map((m) => m.angleDeg);

  const orient = orientationStats(angles);
  const nn = nearestNeighborDistances(marks);
  const ci = clusteringIndex(marks, nn, refW, refH);

  return {
    size: describe(sizes),
    aspect: describe(aspects),
    opacity: describe(opacities),
    orientationBins: orient.bins,
    orientationDominantDeg: orient.dominantDeg,
    orientationConcentration: orient.concentration,
    countPerKpx2: marks.length / Math.max(1, refW * refH / 1000),
    nnDist: describe(nn),
    clusteringIndex: ci,
    refWidth: refW,
    refHeight: refH,
  };
}
