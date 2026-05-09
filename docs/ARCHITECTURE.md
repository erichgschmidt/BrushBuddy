# BrushBuddy — Preview & Sync Architecture (v0.2, post-spike)

**Updated after the M0 spike.** See [M0-REPORT.md](M0-REPORT.md) for findings.

The product promise: *the fastest way to author a custom brush in Photoshop, with the tip itself as a first-class artifact.*

BrushBuddy does not replace Photoshop's brush engine. It is a tip authoring + live tip-property cockpit that commits to native PS brushes.

## Two-layer preview pipeline (revised)

The original three-layer pipeline collapsed once we discovered PS's own Brush Settings panel already provides a live stroke preview that updates whenever the brush changes. We don't need to render proof strokes ourselves.

### Layer 1 — In-panel canvas (BrushBuddy's domain)

- Renders the **tip editor** (warp / pinch / twist / threshold / levels / feather / blur / erode / noise / mirror / invert / auto-crop / auto-center) in HTML Canvas / WebGL.
- The tip is a first-class artifact, edited non-destructively with an op stack.
- Every op runs in <50 ms; full stack replay <150 ms.
- This is what the user *manipulates* while authoring.

### Layer 2 — Photoshop's native preview (PS's domain — free)

- When BrushBuddy mutates a tip-level property via `set brush targetEnum` (the spike's working primitive), Photoshop's own Brush Settings panel preview updates in real time.
- The Brushes panel thumbnail also reflects the new tip.
- We don't render or stroke anything ourselves. No proof layer, no work path, no scratch document.
- This was the spike's biggest architectural simplification.

## The mutation primitive

```ts
async function setBrushProps(props: Partial<SampledBrush>): Promise<void> {
  // GET first, MERGE, then SET — preserves sampledData (tip pixels UUID)
  // and other tip metadata, otherwise PS reverts to a default soft round.
  const tool = await getToolOptions();
  const merged = { _obj: "sampledBrush", ...tool.brush, ...props };
  await batchPlay([{
    _obj: "set",
    _target: [{ _ref: "brush", _enum: "ordinal", _value: "targetEnum" }],
    to: merged,
    _options: { dialogOptions: "dontDisplay" },
  }], {});
}
```

Honored fields: `spacing`, `diameter`, `angle`, `roundness`, `hardness`, `flipX`, `flipY`, `name`. Unknown fields silently ignored.

## What about dynamics?

Brush dynamics (Shape Dynamics, Scattering, Texture, Transfer, Color Dynamics, Dual Brush, Brush Pose) are **not mutable via batchPlay** in PS 2025. The spike confirmed this against 9 different target shapes.

Our approach:

1. **Bundle archetype `.abr` files** with the plugin. Hand-authored in PS once (full dynamics baked in for Pencil, Inker, Stipple, Hair, Foliage, Gouache, Grunge, Watercolor, Calligraphy, Marker, Chalk, Spatter). User installs once, then picks an archetype as a starting point.
2. **Tip authoring layers on top of the chosen archetype** — user picks "Stipple" archetype, then captures a custom tip and live-edits its spacing/angle/roundness. The dynamics ride along from the archetype.
3. **For ad-hoc dynamics tweaking**, the user opens PS's native Brush Settings panel (F5). It's a UX seam — but PS's panel has its own live preview, so the tweaking experience is still tight.

## Source-of-truth model

```
BrushBuddyState (in-memory, JSON)
  ├── source tip image data
  ├── tip op stack (warp/erode/feather/...)
  ├── tip-level props (spacing, diameter, angle, roundness, hardness, flips)
  └── selected archetype (ref to a bundled .abr)

   ↓  on slider change (debounce ~50ms)

Photoshop side (mutated via setBrushProps)
  ├── current brush — sampledData + tip-level props from our state
  └── Brush Settings panel preview (auto-updates)
```

There is no volatile dummy preset, no proof layer, no scratch document. The current brush IS the live preview.

## Tip editor — the masking cockpit

The tip is a first-class artifact, edited non-destructively with an op stack. Every operation is replayable and individually toggleable:

- **Levels** (auto + manual)
- **Curves** (S-curve preset, custom)
- **Feather** (selection feather + Gaussian)
- **Threshold** (hard/soft)
- **Blur / Sharpen**
- **Edge erosion** (morphological erode)
- **Noise** (additive, multiplicative, blue-noise)
- **Warp / pinch / twist** (interactive)
- **Squash / roundness** (preview before committing to brush)
- **Invert / mirror X / mirror Y**
- **Auto-crop** / **Auto-center**

The Layer-1 canvas re-runs the stack on every change. When the user is happy, the resulting raster is `defineBrush`d in PS and our tip-level props are applied via `setBrushProps`.

## Performance budgets (revised)

| Operation | Budget | Spike-measured |
|---|---|---|
| Canvas tip-edit op (single) | < 50 ms | n/a (M1) |
| Tip op stack replay | < 150 ms | n/a (M1) |
| `setBrushProps` round-trip | < 100 ms | **11–24 ms** ✓ |
| `defineBrush` from selection | < 5 s | 2–8 s ✓ (PS-side, one-time) |

## What we don't do

- Real-time interception of the user's painting strokes (PS doesn't expose it).
- Custom brush engine (off-mission; PS's preview is canonical).
- Direct `.abr` file authoring from scratch in code (we ship hand-authored archetype `.abr`s instead — same outcome, vastly less work).
- In-product dynamics editing (deferred to PS's native panel; archetype-based instead).
