# Tip commit pipeline — developer notes

## Scratch-doc approach
We create a **new RGB document** sized exactly to the buffer (batchPlay `make
document`, 8-bit, sRGB, 72dpi, white fill) rather than injecting a layer into
the user's active doc. Reasons:
- No risk of polluting the user's undo stack or layer panel.
- `defineBrush` operates on the active selection in the *frontmost* doc, so
  isolating it keeps the source doc untouched.
- Cleanup is one `close ... saving: no` — no layer to track and remove.

A hidden/offscreen doc would be ideal but UXP `make document` has no such
flag; the doc briefly flashes visible. Acceptable for M2.

## Pixel write API
Used `imaging.createImageDataFromBuffer` + `imaging.putPixels`:
- `createImageDataFromBuffer(Uint8Array, { width, height, components: 4,
  componentSize: 8, colorSpace: "RGB", pixelFormat: "RGBA",
  colorProfile: "sRGB IEC61966-2.1" })`
- `putPixels({ documentID, imageData, targetBounds, replace: true })` — no
  `layerID` so it writes to the active (background) layer.
- We share the `Uint8ClampedArray.buffer` via a `Uint8Array` view to avoid a
  copy.

## Edge cases
- **Alpha:** PS `defineBrush` interprets *luminance* (black = opaque, white =
  transparent), not the alpha channel. Callers must run
  `alphaFromLuminance` (or equivalent) upstream so the buffer's RGB encodes
  the desired opacity. The alpha channel we write is preserved in the scratch
  doc but is largely ignored by `defineBrush`.
- **Color space / depth:** locked to sRGB / 8-bit to match `componentSize: 8`
  in the pixel write. Mismatches cause `putPixels` to throw.
- **Size cap:** PS rejects brushes >2500px on either axis. We throw early
  with a clear message rather than silently downsampling — the op stack's
  `resize` op is the right place for that.
- **Cleanup on error:** the inner `runCommit` wraps everything in try/catch
  and tears down the scratch doc on any failure. Both public entrypoints run
  inside `executeAsModal` so the lock is held across creation + teardown.

## Brush name caveat
PS frequently ignores the `name` field on `defineBrush` and assigns
"Sampled Brush N" instead. We re-read `currentToolOptions.brush.name` after
defining and return the actual assigned name in `CommitResult.brushName`.
Callers should treat `desiredName` as a hint only.
