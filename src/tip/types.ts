// Shared pixel-buffer type for the tip image-processing pipeline.
// RGBA8, top-left origin, tightly packed. No DOM Canvas dependency.

export interface PixelBuffer {
  width: number;
  height: number;
  // length === width * height * 4
  data: Uint8ClampedArray;
}

export function createBuffer(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function clone(buf: PixelBuffer): PixelBuffer {
  return { width: buf.width, height: buf.height, data: new Uint8ClampedArray(buf.data) };
}

export function fill(buf: PixelBuffer, r: number, g: number, b: number, a: number): void {
  const d = buf.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
  }
}

// Rec.601 luminance.
export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Extract a single channel as a Uint8ClampedArray of length w*h.
// channel: 0=R 1=G 2=B 3=A.
export function extractChannel(buf: PixelBuffer, channel: 0 | 1 | 2 | 3): Uint8ClampedArray {
  const n = buf.width * buf.height;
  const out = new Uint8ClampedArray(n);
  const d = buf.data;
  for (let i = 0, j = channel; i < n; i++, j += 4) out[i] = d[j];
  return out;
}

// Bounding box of pixels with alpha > threshold. null if none.
export function bboxOfNonTransparent(
  buf: PixelBuffer,
  alphaThreshold = 0,
): { x: number; y: number; w: number; h: number } | null {
  const { width, height, data } = buf;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Bounding box where luminance is below threshold (dark pixels = brush mark).
export function bboxOfDark(
  buf: PixelBuffer,
  lumThreshold = 250,
): { x: number; y: number; w: number; h: number } | null {
  const { width, height, data } = buf;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = luminance(data[i], data[i + 1], data[i + 2]);
      if (l < lumThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
