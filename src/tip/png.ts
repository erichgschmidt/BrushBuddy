// Minimal PNG encoder — RGBA, 8-bit, uncompressed (stored zlib blocks).
// UXP's canvas 2D context lacks ImageData/createImageData; this lets us
// preview a PixelBuffer by encoding it to PNG bytes and using an <img> src
// (via Blob + URL.createObjectURL, both of which UXP supports).
//
// Tradeoff: no DEFLATE compression — bytes are roughly width*height*4 + a few
// kilobytes of overhead. For a 512x512 preview that's ~1 MB. Fine for in-panel
// display; if we ever export to disk we can swap in a real compressor.

import type { PixelBuffer } from "./types";

const SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Pre-built CRC32 table.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeU32BE(buf: Uint8Array, off: number, v: number) {
  buf[off]     = (v >>> 24) & 0xff;
  buf[off + 1] = (v >>> 16) & 0xff;
  buf[off + 2] = (v >>> 8) & 0xff;
  buf[off + 3] = v & 0xff;
}

function writeU16LE(buf: Uint8Array, off: number, v: number) {
  buf[off]     = v & 0xff;
  buf[off + 1] = (v >>> 8) & 0xff;
}

function writeChunk(out: number[], type: string, data: Uint8Array): void {
  const tmp = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) tmp[i] = type.charCodeAt(i);
  tmp.set(data, 4);
  // length (data only)
  out.push((data.length >>> 24) & 0xff, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff);
  // type + data
  for (let i = 0; i < tmp.length; i++) out.push(tmp[i]);
  // crc over type+data
  const crc = crc32(tmp, 0, tmp.length);
  out.push((crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff);
}

/**
 * Encode a PixelBuffer as PNG bytes (RGBA, 8-bit, no compression).
 */
export function encodePng(buf: PixelBuffer): Uint8Array {
  const { width: w, height: h, data } = buf;

  // Filtered scanlines: prepend filter byte 0 (None) to each row.
  const stride = w * 4;
  const filtered = new Uint8Array(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    filtered[y * (stride + 1)] = 0;
    filtered.set(data.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }

  // Wrap in zlib using stored (uncompressed) DEFLATE blocks. Max block size 65535.
  const MAX = 65535;
  const blocks: number[] = [];
  // zlib header: 0x78 0x01 (default compression, no preset dict)
  blocks.push(0x78, 0x01);
  let off = 0;
  while (off < filtered.length) {
    const len = Math.min(MAX, filtered.length - off);
    const isLast = (off + len) === filtered.length;
    blocks.push(isLast ? 1 : 0); // BFINAL, BTYPE=00 stored
    blocks.push(len & 0xff, (len >>> 8) & 0xff);
    blocks.push((~len) & 0xff, ((~len) >>> 8) & 0xff);
    for (let i = 0; i < len; i++) blocks.push(filtered[off + i]);
    off += len;
  }
  const adler = adler32(filtered);
  blocks.push((adler >>> 24) & 0xff, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff);

  const idat = new Uint8Array(blocks);

  // IHDR
  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, w);
  writeU32BE(ihdr, 4, h);
  ihdr[8]  = 8;   // bit depth
  ihdr[9]  = 6;   // color type RGBA
  ihdr[10] = 0;   // compression
  ihdr[11] = 0;   // filter
  ihdr[12] = 0;   // interlace

  // Assemble
  const out: number[] = [];
  for (let i = 0; i < SIG.length; i++) out.push(SIG[i]);
  writeChunk(out, "IHDR", ihdr);
  writeChunk(out, "IDAT", idat);
  writeChunk(out, "IEND", new Uint8Array(0));
  return new Uint8Array(out);
}

/**
 * Encode a PixelBuffer to a Blob URL ready to use as <img src>. Caller must
 * URL.revokeObjectURL when no longer needed (or rely on GC at session end).
 */
export function pixelBufferToObjectUrl(buf: PixelBuffer): string {
  const png = encodePng(buf);
  const blob = new Blob([png], { type: "image/png" });
  return URL.createObjectURL(blob);
}

// Suppress unused-import noise for writeU16LE (kept for symmetry / future use).
void writeU16LE;
