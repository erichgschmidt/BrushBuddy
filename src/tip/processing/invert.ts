import { PixelBuffer } from "../types";

export function invert(input: PixelBuffer): PixelBuffer {
  const s = input.data;
  const out = new Uint8ClampedArray(s.length);
  for (let i = 0; i < s.length; i += 4) {
    out[i] = 255 - s[i];
    out[i + 1] = 255 - s[i + 1];
    out[i + 2] = 255 - s[i + 2];
    out[i + 3] = s[i + 3];
  }
  return { width: input.width, height: input.height, data: out };
}
