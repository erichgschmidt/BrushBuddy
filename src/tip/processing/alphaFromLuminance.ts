import { PixelBuffer, luminance } from "../types";

export interface AlphaFromLuminanceParams {
  // If true, set RGB to black (PS brush convention). Default true.
  blackRgb?: boolean;
}

// PS brush convention: black pixels => opaque, white => transparent.
// alpha = 255 - luminance.
export function alphaFromLuminance(input: PixelBuffer, params: AlphaFromLuminanceParams = {}): PixelBuffer {
  const blackRgb = params.blackRgb ?? true;
  const s = input.data;
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i += 4) {
    const y = luminance(s[i], s[i + 1], s[i + 2]);
    const a = Math.round(255 - y);
    if (blackRgb) { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; }
    else { out[i] = s[i]; out[i + 1] = s[i + 1]; out[i + 2] = s[i + 2]; }
    // Combine with any pre-existing alpha multiplicatively.
    out[i + 3] = Math.round((a * s[i + 3]) / 255);
  }
  return { width: input.width, height: input.height, data: out };
}
