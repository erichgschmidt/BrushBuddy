import { PixelBuffer, luminance } from "../types";

export function desaturate(input: PixelBuffer): PixelBuffer {
  const out = new Uint8ClampedArray(input.data.length);
  const s = input.data;
  for (let i = 0; i < s.length; i += 4) {
    const y = luminance(s[i], s[i + 1], s[i + 2]);
    out[i] = y; out[i + 1] = y; out[i + 2] = y; out[i + 3] = s[i + 3];
  }
  return { width: input.width, height: input.height, data: out };
}
