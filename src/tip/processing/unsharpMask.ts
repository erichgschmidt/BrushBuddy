import { PixelBuffer } from "../types";
import { gaussianBlur } from "./gaussianBlur";

export interface UnsharpMaskParams {
  radiusPx: number;
  amount: number;    // 0-... typical 0-2
  threshold: number; // 0-255, only sharpen where |delta| > threshold
}

export function unsharpMask(input: PixelBuffer, params: UnsharpMaskParams): PixelBuffer {
  if (params.amount === 0 || params.radiusPx <= 0) {
    return { width: input.width, height: input.height, data: new Uint8ClampedArray(input.data) };
  }
  const blurred = gaussianBlur(input, { radiusPx: params.radiusPx });
  const s = input.data, b = blurred.data;
  const out = new Uint8ClampedArray(s.length);
  const amt = params.amount;
  const thr = params.threshold;
  for (let i = 0; i < s.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = s[i + c] - b[i + c];
      out[i + c] = Math.abs(d) > thr ? s[i + c] + d * amt : s[i + c];
    }
    out[i + 3] = s[i + 3];
  }
  return { width: input.width, height: input.height, data: out };
}
