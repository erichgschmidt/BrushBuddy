import { PixelBuffer } from "../types";

export interface PadParams {
  width: number;
  height: number;
  // Optional fill color. Default transparent (0,0,0,0).
  color?: { r: number; g: number; b: number; a: number };
  // Anchor: defaults to "center".
  anchor?: "center" | "topLeft";
}

export function pad(input: PixelBuffer, params: PadParams): PixelBuffer {
  const tw = Math.max(input.width, params.width | 0);
  const th = Math.max(input.height, params.height | 0);
  const out = new Uint8ClampedArray(tw * th * 4);
  const c = params.color ?? { r: 0, g: 0, b: 0, a: 0 };
  if (c.a !== 0 || c.r !== 0 || c.g !== 0 || c.b !== 0) {
    for (let i = 0; i < out.length; i += 4) {
      out[i] = c.r; out[i + 1] = c.g; out[i + 2] = c.b; out[i + 3] = c.a;
    }
  }
  const ox = params.anchor === "topLeft" ? 0 : ((tw - input.width) >> 1);
  const oy = params.anchor === "topLeft" ? 0 : ((th - input.height) >> 1);
  const sd = input.data;
  for (let y = 0; y < input.height; y++) {
    const drow = ((y + oy) * tw + ox) * 4;
    const srow = y * input.width * 4;
    for (let i = 0; i < input.width * 4; i++) out[drow + i] = sd[srow + i];
  }
  return { width: tw, height: th, data: out };
}
