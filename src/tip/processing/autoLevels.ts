import { PixelBuffer, luminance } from "../types";
import { levels } from "./levels";

export interface AutoLevelsParams {
  // Fraction of pixels to clip at each end. Default 0.005 (0.5%).
  clip?: number;
}

export function autoLevels(input: PixelBuffer, params: AutoLevelsParams = {}): PixelBuffer {
  const clip = Math.max(0, Math.min(0.499, params.clip ?? 0.005));
  const hist = new Uint32Array(256);
  const s = input.data;
  const total = input.width * input.height;
  for (let i = 0; i < s.length; i += 4) {
    const y = luminance(s[i], s[i + 1], s[i + 2]) | 0;
    hist[y < 0 ? 0 : y > 255 ? 255 : y]++;
  }
  const target = Math.floor(total * clip);
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > target) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > target) { hi = i; break; } }
  if (hi <= lo) { hi = Math.min(255, lo + 1); }
  return levels(input, { blackPoint: lo, whitePoint: hi, gamma: 1 });
}
