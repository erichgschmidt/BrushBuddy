import { PixelBuffer, luminance } from "../types";

export interface AutoCenterParams {
  // If set, pad to this exact square size. Otherwise pad to next pow2 of max input dim.
  outputSize?: number;
  // Force pow2 square output. Ignored if outputSize set. Default true.
  pow2?: boolean;
}

// Recenter using the alpha (or inverse-luminance if fully opaque) center of mass.
export function autoCenter(input: PixelBuffer, params: AutoCenterParams = {}): PixelBuffer {
  const w = input.width, h = input.height;
  const s = input.data;
  const useAlpha = anyTransparent(s);

  let sumW = 0, sumX = 0, sumY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const wt = useAlpha ? s[i + 3] : (255 - luminance(s[i], s[i + 1], s[i + 2]));
      if (wt > 0) { sumW += wt; sumX += wt * x; sumY += wt * y; }
    }
  }
  const cx = sumW > 0 ? sumX / sumW : w / 2;
  const cy = sumW > 0 ? sumY / sumW : h / 2;

  const target = params.outputSize ?? (params.pow2 !== false ? nextPow2(Math.max(w, h)) : Math.max(w, h));
  const out = new Uint8ClampedArray(target * target * 4);
  const ox = Math.round(target / 2 - cx);
  const oy = Math.round(target / 2 - cy);
  for (let y = 0; y < h; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= target) continue;
    for (let x = 0; x < w; x++) {
      const dx = x + ox;
      if (dx < 0 || dx >= target) continue;
      const si = (y * w + x) * 4;
      const di = (dy * target + dx) * 4;
      out[di] = s[si]; out[di + 1] = s[si + 1]; out[di + 2] = s[si + 2]; out[di + 3] = s[si + 3];
    }
  }
  return { width: target, height: target, data: out };
}

function anyTransparent(d: Uint8ClampedArray): boolean {
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

function nextPow2(n: number): number {
  let p = 1; while (p < n) p <<= 1; return p;
}
