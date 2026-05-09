// Composer — the iterative feedback-loop core. Takes a source PixelBuffer
// and a layout strategy, places N transformed copies of the source onto a
// fresh canvas, returns the new buffer.
//
// Variation per stamp: position jitter, scale (min/max), rotation (jitter
// or follow-tangent), opacity (min/max), mirror jitter, deterministic seed.
//
// Blend mode: "max" (lighten) is default — preserves brightest pixels across
// stamps. Suits white-on-transparent tip work.

import type { PixelBuffer } from "../types";
import { mulberry32 } from "../generators/rng";
import type { VectorShape } from "../vector/types";
import { buildPathSampler } from "../vector/sample";

import type { MarkPlacement } from "../analyze/types";

export type LayoutKind = "scatter" | "grid" | "line" | "vectorPath" | "fingerprint";

export interface VariationParams {
  positionJitterPx: number;   // 0..N
  scaleMin: number;           // 0..2 multiplier
  scaleMax: number;           // 0..2
  rotationJitterDeg: number;  // 0..360
  rotationFollowTangent: boolean; // for line / vectorPath
  opacityMin: number;         // 0..1
  opacityMax: number;         // 0..1
  flipXProb: number;          // 0..1
  flipYProb: number;          // 0..1
}

export interface ComposerParams {
  width: number;
  height: number;
  layout: LayoutKind;
  count: number;
  variation: VariationParams;
  seed: number;
  blend?: "max" | "min" | "over" | "sum";

  // Layout-specific:
  // scatter / grid have no extras
  // line: from -> to in [0,1] canvas coords
  lineFrom?: { x: number; y: number };
  lineTo?:   { x: number; y: number };
  // vectorPath:
  vectorShape?: VectorShape | null;
  // fingerprint:
  fingerprintPlacements?: MarkPlacement[] | null;
}

export const DEFAULT_VARIATION: VariationParams = {
  positionJitterPx: 0,
  scaleMin: 1, scaleMax: 1,
  rotationJitterDeg: 0,
  rotationFollowTangent: false,
  opacityMin: 1, opacityMax: 1,
  flipXProb: 0, flipYProb: 0,
};

interface PlacedStamp {
  cx: number;       // center x in dest canvas
  cy: number;       // center y
  scale: number;    // multiplier
  angleRad: number;
  opacity: number;  // 0..1
  flipX: boolean;
  flipY: boolean;
}

function generatePlacements(params: ComposerParams, rand: () => number): PlacedStamp[] {
  const { width: W, height: H, count, variation: v } = params;
  const out: PlacedStamp[] = [];
  const sJitter = (rng: () => number) => v.scaleMin + (v.scaleMax - v.scaleMin) * rng();
  const oJitter = (rng: () => number) => v.opacityMin + (v.opacityMax - v.opacityMin) * rng();

  if (params.layout === "scatter") {
    for (let i = 0; i < count; i++) {
      out.push({
        cx: rand() * W,
        cy: rand() * H,
        scale: sJitter(rand),
        angleRad: (rand() - 0.5) * (v.rotationJitterDeg * Math.PI / 180),
        opacity: oJitter(rand),
        flipX: rand() < v.flipXProb,
        flipY: rand() < v.flipYProb,
      });
    }
  } else if (params.layout === "grid") {
    const cols = Math.max(1, Math.round(Math.sqrt(count * (W / H))));
    const rows = Math.max(1, Math.ceil(count / cols));
    let placed = 0;
    for (let r = 0; r < rows && placed < count; r++) {
      for (let c = 0; c < cols && placed < count; c++) {
        const baseX = (c + 0.5) / cols * W;
        const baseY = (r + 0.5) / rows * H;
        out.push({
          cx: baseX + (rand() - 0.5) * 2 * v.positionJitterPx,
          cy: baseY + (rand() - 0.5) * 2 * v.positionJitterPx,
          scale: sJitter(rand),
          angleRad: (rand() - 0.5) * (v.rotationJitterDeg * Math.PI / 180),
          opacity: oJitter(rand),
          flipX: rand() < v.flipXProb,
          flipY: rand() < v.flipYProb,
        });
        placed++;
      }
    }
  } else if (params.layout === "line") {
    const from = params.lineFrom ?? { x: 0.1, y: 0.5 };
    const to   = params.lineTo   ?? { x: 0.9, y: 0.5 };
    const fx = from.x * W, fy = from.y * H;
    const tx = to.x * W,   ty = to.y * H;
    const tangentRad = Math.atan2(ty - fy, tx - fx);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const baseX = fx + (tx - fx) * t;
      const baseY = fy + (ty - fy) * t;
      const baseAngle = v.rotationFollowTangent ? tangentRad : 0;
      out.push({
        cx: baseX + (rand() - 0.5) * 2 * v.positionJitterPx,
        cy: baseY + (rand() - 0.5) * 2 * v.positionJitterPx,
        scale: sJitter(rand),
        angleRad: baseAngle + (rand() - 0.5) * (v.rotationJitterDeg * Math.PI / 180),
        opacity: oJitter(rand),
        flipX: rand() < v.flipXProb,
        flipY: rand() < v.flipYProb,
      });
    }
  } else if (params.layout === "fingerprint") {
    const placements = params.fingerprintPlacements ?? [];
    for (const p of placements) {
      out.push({
        cx: p.cx, cy: p.cy,
        scale: p.scale,
        angleRad: p.angleDeg * Math.PI / 180,
        opacity: p.opacity,
        flipX: !!p.flipX,
        flipY: !!p.flipY,
      });
    }
  } else if (params.layout === "vectorPath") {
    if (!params.vectorShape) return out;
    const sampler = buildPathSampler(params.vectorShape, W, H);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / count;
      const sp = sampler.at(t);
      const baseAngle = v.rotationFollowTangent ? (sp.tangentDeg * Math.PI / 180) : 0;
      out.push({
        cx: sp.x + (rand() - 0.5) * 2 * v.positionJitterPx,
        cy: sp.y + (rand() - 0.5) * 2 * v.positionJitterPx,
        scale: sJitter(rand),
        angleRad: baseAngle + (rand() - 0.5) * (v.rotationJitterDeg * Math.PI / 180),
        opacity: oJitter(rand),
        flipX: rand() < v.flipXProb,
        flipY: rand() < v.flipYProb,
      });
    }
  }
  return out;
}

/**
 * Composite the source onto the destination at center (cx, cy) with the
 * given affine (scale, angle, flips) and opacity. Uses bilinear sampling.
 * Default blend = max (lighten).
 */
function stampOne(
  dst: Uint8ClampedArray, dW: number, dH: number,
  src: Uint8ClampedArray, sW: number, sH: number,
  s: PlacedStamp,
  blend: "max" | "min" | "over" | "sum",
): void {
  const cosA = Math.cos(-s.angleRad);
  const sinA = Math.sin(-s.angleRad);
  const fx = s.flipX ? -1 : 1;
  const fy = s.flipY ? -1 : 1;
  const invScale = 1 / Math.max(1e-6, s.scale);

  // AABB of the rotated/scaled source in dst coords.
  const halfW = (sW * s.scale) / 2;
  const halfH = (sH * s.scale) / 2;
  const r = Math.hypot(halfW, halfH); // conservative bound
  const xMin = Math.max(0, Math.floor(s.cx - r));
  const yMin = Math.max(0, Math.floor(s.cy - r));
  const xMax = Math.min(dW - 1, Math.ceil(s.cx + r));
  const yMax = Math.min(dH - 1, Math.ceil(s.cy + r));

  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      // dst pixel → src coord
      const dx = x - s.cx;
      const dy = y - s.cy;
      // inverse rotate, then inverse scale, then inverse flip, then center
      const rx = (dx * cosA - dy * sinA) * invScale * fx + sW / 2;
      const ry = (dx * sinA + dy * cosA) * invScale * fy + sH / 2;
      if (rx < 0 || ry < 0 || rx >= sW - 1 || ry >= sH - 1) continue;
      // Bilinear sample.
      const x0 = rx | 0, y0 = ry | 0;
      const x1 = x0 + 1, y1 = y0 + 1;
      const tx = rx - x0, ty = ry - y0;
      const i00 = (y0 * sW + x0) * 4;
      const i10 = (y0 * sW + x1) * 4;
      const i01 = (y1 * sW + x0) * 4;
      const i11 = (y1 * sW + x1) * 4;
      // We assume the source is grayscale-ish; carry alpha properly. RGB
      // is sampled bilinearly per channel. Opacity scales the source alpha.
      for (let c = 0; c < 4; c++) {
        const v00 = src[i00 + c];
        const v10 = src[i10 + c];
        const v01 = src[i01 + c];
        const v11 = src[i11 + c];
        const v = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
        const o = (y * dW + x) * 4 + c;
        let nv = v;
        if (c === 3) nv = v * s.opacity;
        const dstV = dst[o];
        if (blend === "max") dst[o] = Math.max(dstV, nv);
        else if (blend === "min") {
          // For min on alpha we want max alpha (so layered opacity grows);
          // but RGB min, alpha union.
          if (c === 3) dst[o] = Math.max(dstV, nv);
          else dst[o] = Math.min(dstV || 255, nv);
        } else if (blend === "sum") {
          dst[o] = Math.min(255, dstV + nv);
        } else /* over */ {
          if (c === 3) {
            const a = nv / 255;
            dst[o] = dstV + (255 - dstV) * a;
          } else {
            // simple overwrite weighted by source alpha bilinear (cheap)
            const aIdx = (y * dW + x) * 4 + 3;
            const a = (src[i00 + 3] * (1 - tx) + src[i10 + 3] * tx) * (1 - ty)
                    + (src[i01 + 3] * (1 - tx) + src[i11 + 3] * tx) * ty;
            const wt = (a / 255) * s.opacity;
            dst[o] = dstV * (1 - wt) + nv * wt;
            void aIdx;
          }
        }
      }
    }
  }
}

export function compose(source: PixelBuffer, params: ComposerParams): PixelBuffer {
  const W = Math.max(1, params.width | 0);
  const H = Math.max(1, params.height | 0);
  const dst = new Uint8ClampedArray(W * H * 4);
  const blend = params.blend ?? "max";

  const rand = mulberry32(params.seed | 0);
  const placements = generatePlacements({ ...params, width: W, height: H }, rand);
  for (const p of placements) {
    stampOne(dst, W, H, source.data, source.width, source.height, p, blend);
  }
  return { width: W, height: H, data: dst };
}

// ---------------------------------------------------------------------------
// Smart presets — wrap compose() with curated variation profiles.
// ---------------------------------------------------------------------------

export function diverge(source: PixelBuffer, opts: { canvasSize?: number; seed?: number } = {}): PixelBuffer {
  const size = opts.canvasSize ?? Math.max(source.width, source.height);
  return compose(source, {
    width: size, height: size,
    layout: "scatter",
    count: 24,
    seed: opts.seed ?? Math.floor(Math.random() * 1e6),
    variation: {
      ...DEFAULT_VARIATION,
      positionJitterPx: size * 0.1,
      scaleMin: 0.3, scaleMax: 0.9,
      rotationJitterDeg: 180,
      flipXProb: 0.5, flipYProb: 0.5,
      opacityMin: 0.5, opacityMax: 1.0,
    },
    blend: "max",
  });
}

/** Settle is post-processed by the caller (gauss + threshold + autoCrop). */
export function settle(source: PixelBuffer, opts: { canvasSize?: number; seed?: number } = {}): PixelBuffer {
  const size = opts.canvasSize ?? Math.max(source.width, source.height);
  return compose(source, {
    width: size, height: size,
    layout: "scatter",
    count: 8,
    seed: opts.seed ?? 1,
    variation: {
      ...DEFAULT_VARIATION,
      positionJitterPx: size * 0.05,
      scaleMin: 0.85, scaleMax: 1.0,
      rotationJitterDeg: 8,
      opacityMin: 0.7, opacityMax: 1.0,
    },
    blend: "max",
  });
}
