# Ingest layer — developer notes

## UXP APIs used

- `photoshop.imaging.getPixels({ documentID, layerID, sourceBounds, componentSize: 8, applyAlpha: false, colorSpace: "RGB" })` for selection + layer paths. Always `imageData.dispose()` in a `finally`.
- `photoshop.core.executeAsModal` wraps every PS-touching call (required by PS 24.2+).
- `uxp.storage.localFileSystem.getFileForOpening({ types: [...] })` for the file path. No modal needed — no PS state is touched.
- File decode uses `Blob` + `URL.createObjectURL` + `new Image()` + `<canvas>.getContext("2d").getImageData()` — UXP's web-platform sandbox supports this.

## Edge cases handled

- No active document / no active layer / empty layer bounds → friendly throw.
- Selection with zero area, or selection fully outside the layer (no overlap) → friendly throw with intersection check.
- 3-component results promoted to RGBA with alpha 255. 1-component (grayscale) replicated to RGB. Anything else throws asking to convert to RGB.
- Pixel result exceeds the 2500x2500 brush cap → box-average downsample, sourceLabel notes it.
- File pick cancelled → throw "File pick cancelled.".
- File with bad bytes → image `onerror` becomes a friendly throw.

## Edge cases NOT handled (caveats)

- **Background layer**: `imaging.getPixels` works on it but `applyAlpha: false` returns RGB only — already covered by the 3→4 promotion.
- **Smart objects / adjustment layers / shape layers**: `getPixels` returns the rasterized appearance at the layer's own bounds — the data is fine but the bounds may be smaller than the visible area for clipped/adjustment layers. Not an ingest concern; surfaces as the user's expected raster.
- **Hidden layers**: `getPixels` still returns pixels (visibility is a render concern). Acceptable.
- **Non-RGB document modes** (CMYK, Lab, Indexed, Multichannel): the `colorSpace: "RGB"` request asks PS to convert; if PS refuses for an exotic mode, the components count check throws a clear "convert to RGB" message.
- **Locked layers**: read-only is fine for `getPixels`.

## Version caveats

- `imaging.getPixels` requires PS 24.2+; we check at call time.
- `OffscreenCanvas` may be missing in older UXP runtimes — fall back to `document.createElement("canvas")`.
- The downsample is an approximate box average. Replace with `src/tip/processing/resize.ts` Lanczos when the sibling agent ships it (TODO marker in code).
