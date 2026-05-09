import { PixelBuffer } from "../types";

export interface LevelsParams {
  blackPoint?: number; // 0-255
  whitePoint?: number; // 0-255
  gamma?: number;      // 0.1 - 9.99
}

export function levels(input: PixelBuffer, params: LevelsParams = {}): PixelBuffer {
  const black = params.blackPoint ?? 0;
  const white = params.whitePoint ?? 255;
  const gamma = clampGamma(params.gamma ?? 1);
  if (black === 0 && white === 255 && gamma === 1) {
    return { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) };
  }
  // Build LUT.
  const lut = new Uint8ClampedArray(256);
  const range = Math.max(1e-6, white - black);
  const inv = 1 / gamma;
  for (let i = 0; i < 256; i++) {
    let t = (i - black) / range;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    lut[i] = Math.round(Math.pow(t, inv) * 255);
  }
  const s = input.data;
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i += 4) {
    out[i] = lut[s[i]]; out[i + 1] = lut[s[i + 1]]; out[i + 2] = lut[s[i + 2]];
    out[i + 3] = s[i + 3];
  }
  return { width: input.width, height: input.height, data: out };
}

function clampGamma(g: number): number {
  if (g < 0.1) return 0.1;
  if (g > 9.99) return 9.99;
  return g;
}
