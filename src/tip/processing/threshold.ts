import { PixelBuffer, luminance } from "../types";

export interface ThresholdParams {
  value: number; // 0-255
  soft?: number; // 0 = hard step; >0 = S-curve half-width in luminance units
}

export function threshold(input: PixelBuffer, params: ThresholdParams): PixelBuffer {
  const v = clamp255(params.value);
  const soft = Math.max(0, params.soft ?? 0);
  const s = input.data;
  const out = new Uint8ClampedArray(s.length);
  if (soft === 0) {
    for (let i = 0; i < s.length; i += 4) {
      const y = luminance(s[i], s[i + 1], s[i + 2]);
      const on = y >= v ? 255 : 0;
      out[i] = on; out[i + 1] = on; out[i + 2] = on;
      out[i + 3] = on === 0 ? 0 : s[i + 3];
    }
  } else {
    const inv = 1 / soft;
    for (let i = 0; i < s.length; i += 4) {
      const y = luminance(s[i], s[i + 1], s[i + 2]);
      // Smoothstep-ish S curve centered at v with width soft.
      let t = (y - (v - soft)) * inv * 0.5;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const sm = t * t * (3 - 2 * t);
      const px = Math.round(sm * 255);
      out[i] = px; out[i + 1] = px; out[i + 2] = px;
      out[i + 3] = Math.round((s[i + 3] * px) / 255);
    }
  }
  return { width: input.width, height: input.height, data: out };
}

function clamp255(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : v; }
