// Regenerate procedural mark placements from a Fingerprint + Multipliers.

import type { Fingerprint, MarkPlacement, Multipliers, Percentiles } from "./types";
import { mulberry32 } from "../generators/rng";

interface RegenerateOpts {
  width: number;
  height: number;
  seed: number;
  /** Source tip's natural rendered size in pixels — used to convert size→scale. */
  sourceTipSize?: number;
}

/** Sample from a percentile-defined distribution by inverse CDF on the 5 anchors. */
function sampleFromPercentiles(p: Percentiles, rand: () => number): number {
  // Map u ∈ [0,1] → value via piecewise-linear interpolation through
  // (0, p10), (0.5, p50), (1.0, p90). We slightly extend at ends to mean ± std.
  const u = rand();
  if (u < 0.1) return p.p10 - (0.1 - u) * 10 * Math.max(0, p.p50 - p.p10);
  if (u < 0.5) return p.p10 + (u - 0.1) * (p.p50 - p.p10) / 0.4;
  if (u < 0.9) return p.p50 + (u - 0.5) * (p.p90 - p.p50) / 0.4;
  return p.p90 + (u - 0.9) * 10 * Math.max(0, p.p90 - p.p50);
}

/** Apply multiplier to a percentiles bundle by scaling spread around median. */
function multiplyPercentiles(p: Percentiles, sizeMul: number, spreadMul: number): Percentiles {
  const m = p.p50 * sizeMul;
  const lo = m - (p.p50 - p.p10) * spreadMul * sizeMul;
  const hi = m + (p.p90 - p.p50) * spreadMul * sizeMul;
  return { p10: lo, p50: m, p90: hi, mean: p.mean * sizeMul, std: p.std * spreadMul * sizeMul };
}

/** Pick an orientation bin index using bin probabilities + concentration multiplier. */
function pickOrientationDeg(fp: Fingerprint, alignmentMul: number, rotateDeg: number, rand: () => number): number {
  const BINS = fp.orientationBins.length || 8;
  const conc = Math.max(0, Math.min(1, fp.orientationConcentration * alignmentMul));
  const uniform = 1 / BINS;
  // Re-shape distribution: lerp toward concentrated form.
  const reshaped = fp.orientationBins.map((b) => uniform + (b - uniform) * conc);
  const total = reshaped.reduce((a, b) => a + b, 0) || 1;
  let u = rand() * total;
  let pickedIdx = BINS - 1;
  for (let i = 0; i < BINS; i++) { u -= reshaped[i]; if (u <= 0) { pickedIdx = i; break; } }
  const baseDeg = (pickedIdx + 0.5) * (180 / BINS) - 90;
  // Within-bin jitter for smoothness.
  const jitter = (rand() - 0.5) * (180 / BINS);
  return baseDeg + jitter + rotateDeg;
}

/**
 * Generate placements using a Thomas-process-flavored point pattern when the
 * fingerprint says clustered, or quasi-uniform Poisson otherwise. Each
 * placement gets size/aspect/orientation/opacity sampled from the per-mark
 * distributions modified by multipliers.
 */
export function regeneratePlacements(
  fp: Fingerprint,
  multipliers: Multipliers,
  opts: RegenerateOpts,
): MarkPlacement[] {
  const W = Math.max(1, opts.width | 0);
  const H = Math.max(1, opts.height | 0);
  const rand = mulberry32(opts.seed | 0);
  const tipPx = Math.max(1, opts.sourceTipSize ?? 64);

  // Effective count (scale ref density to current canvas, then apply multiplier).
  const effDensity = fp.countPerKpx2 * multipliers.density;
  const count = Math.max(1, Math.round((W * H / 1000) * effDensity));

  // Effective stat distributions.
  const sizeP = multiplyPercentiles(fp.size, multipliers.size, multipliers.sizeSpread);
  const aspectP = multiplyPercentiles(fp.aspect, multipliers.aspect, 1);
  const opacityP = multiplyPercentiles(fp.opacity, multipliers.opacity, 1);

  // Decide spatial sampling: if clusteringIndex * mul is positive, use Thomas
  // process (cluster centers + offspring). Otherwise quasi-uniform.
  const ci = fp.clusteringIndex * multipliers.clustering;

  const points: { x: number; y: number }[] = [];
  if (ci > 0.15) {
    // Thomas: K parents, each with N children scattered with sigma based on density.
    const parents = Math.max(1, Math.round(count / Math.max(2, 4 * (1 + ci))));
    const sigma = Math.sqrt((W * H) / count) * (1 - Math.min(0.8, ci));
    for (let p = 0; p < parents; p++) {
      const px = rand() * W;
      const py = rand() * H;
      const offspring = Math.max(1, Math.round(count / parents + (rand() - 0.5) * 2));
      for (let i = 0; i < offspring && points.length < count * 2; i++) {
        // Box-Muller for Gaussian offset.
        const u1 = Math.max(1e-6, rand());
        const u2 = rand();
        const r = sigma * Math.sqrt(-2 * Math.log(u1));
        const a = 2 * Math.PI * u2;
        const x = px + r * Math.cos(a);
        const y = py + r * Math.sin(a);
        if (x >= 0 && x < W && y >= 0 && y < H) points.push({ x, y });
      }
    }
  } else if (ci < -0.15) {
    // Regular: quasi-grid with mild jitter.
    const cols = Math.max(1, Math.round(Math.sqrt(count * (W / H))));
    const rows = Math.max(1, Math.ceil(count / cols));
    const jitter = Math.min(W / cols, H / rows) * 0.2 * Math.max(0.2, 1 + ci);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (points.length >= count) break;
        const x = (c + 0.5) / cols * W + (rand() - 0.5) * 2 * jitter;
        const y = (r + 0.5) / rows * H + (rand() - 0.5) * 2 * jitter;
        if (x >= 0 && x < W && y >= 0 && y < H) points.push({ x, y });
      }
    }
  } else {
    // Quasi-uniform Poisson.
    for (let i = 0; i < count; i++) {
      points.push({ x: rand() * W, y: rand() * H });
    }
  }

  // Build placements.
  const out: MarkPlacement[] = [];
  for (const p of points.slice(0, count * 2)) {
    const sizePx = Math.max(1, sampleFromPercentiles(sizeP, rand));
    const aspect = Math.max(0.2, sampleFromPercentiles(aspectP, rand));
    const opacity = Math.max(0, Math.min(255, sampleFromPercentiles(opacityP, rand))) / 255;
    const angleDeg = pickOrientationDeg(fp, multipliers.alignment, multipliers.rotateDeg, rand);
    // Convert reference-mark size into a scale on the source tip.
    const scale = sizePx / tipPx;
    out.push({ cx: p.x, cy: p.y, scale, angleDeg, opacity });
    void aspect; // aspect not yet applied per-stamp — would need anisotropic stamping
  }
  return out;
}

/** Friendly text summary of a fingerprint — for the analyze panel. */
export function summarizeFingerprint(fp: Fingerprint): string[] {
  const align = fp.orientationConcentration > 0.6 ? "strongly aligned"
              : fp.orientationConcentration > 0.3 ? "somewhat aligned"
              : "random";
  const cluster = fp.clusteringIndex > 0.3 ? "clustered"
                : fp.clusteringIndex < -0.3 ? "regularly spaced"
                : "near-random";
  return [
    `density: ${fp.countPerKpx2.toFixed(2)} marks per 1k px²`,
    `size: p10=${fp.size.p10.toFixed(1)} p50=${fp.size.p50.toFixed(1)} p90=${fp.size.p90.toFixed(1)} px`,
    `aspect: p50=${fp.aspect.p50.toFixed(2)}`,
    `orientation: dominant ${fp.orientationDominantDeg.toFixed(0)}°, ${align} (κ=${fp.orientationConcentration.toFixed(2)})`,
    `nearest-neighbor: p50=${fp.nnDist.p50.toFixed(1)} px`,
    `spatial: ${cluster} (CI=${fp.clusteringIndex.toFixed(2)})`,
    `opacity p50: ${fp.opacity.p50.toFixed(0)}/255`,
  ];
}
