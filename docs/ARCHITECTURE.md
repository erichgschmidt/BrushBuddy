# BrushBuddy — Preview & Sync Architecture

The product promise: **instant simulated preview, frequent real Photoshop verification.**

BrushBuddy does not replace Photoshop's brush engine. It is a brush-design cockpit that prepares tips, simulates strokes in real time, and commits native Photoshop brushes when the result feels right.

## Hybrid preview pipeline

Three layers, each with its own latency budget and source of truth.

### Layer 1 — Instant simulated preview (BrushBuddy canvas)

- Rendered inside the UXP panel using **HTML Canvas / WebGL**.
- Drives every slider tick, drag, and toggle. Target frame budget: < 16ms.
- Approximates — not replicates — Photoshop's brush engine. Good enough for shape, texture, scatter, jitter, basic dual-brush composition, feather, roundness, and a synthesized stroke ramp.
- Tip-editing tools (feather, threshold, levels, blur, warp, pinch, twist, edge erosion, noise, mirror, invert, crop, center) all run here on the source tip with immediate feedback.
- This is what the user *feels* while authoring.

### Layer 2 — Debounced Photoshop proof

- After the user pauses (debounce ~250ms; configurable 150–500ms), BrushBuddy updates a temporary preset named **`BrushBuddy Live Preview`** via `batchPlay`, selects it, and renders a proof stroke on a scratch layer.
- The dummy brush is overwritten in place — same name, same slot — so it doesn't pollute the user's library.
- Proof strokes render on a dedicated `BrushBuddy Proof` layer so they're disposable.
- The user always sees the real Photoshop output one beat behind their edits.

### Layer 3 — Optional Photoshop panel sync (bonus, not foundation)

- Photoshop's native Brush Settings panel *may* reflect the dummy brush as descriptors are written. Treat as nice-to-have.
- We do not build UX guarantees around it. If it works, power users get a free bridge to PS's full settings panel; if it doesn't, the BrushBuddy panel is the canonical UI.

## Dummy-brush update loop (the load-bearing risk)

This is the riskiest piece of the architecture and the focus of the M0 spike.

```
slider tick      →  BrushBuddy canvas redraw           (immediate)
user pauses 250ms→  batchPlay: write tip + dynamics
                 →  batchPlay: select "BrushBuddy Live Preview"
                 →  batchPlay: render proof stroke on scratch layer
user clicks Proof→  same as above, forced
user clicks Save →  duplicate Live Preview to a named, permanent preset
```

What we need to validate in M0:

1. Overwriting the same preset name doesn't accumulate cruft in PS's preset library.
2. The full update round-trip (write descriptors → select → draw) completes in **< 600ms** on representative hardware.
3. PS doesn't pop modal dialogs or confirmation prompts during overwrite.
4. Undo behavior is sane (user `Ctrl+Z` doesn't unwind their painting work because of our internal traffic).

If any of these fail, fallbacks:

- **Cruft accumulates** → suffix with a timestamp and prune old previews on session start.
- **Round-trip too slow** → degrade to "click Proof" only; ship without auto-debounce.
- **Modals appear** → ship without overwrite, create-new each time, prune.
- **Undo pollution** → wrap proof actions in a history-state group we can suppress; if not possible, document and warn.

## Source-of-truth model

There is only one canonical brush state — the one in BrushBuddy's panel. The Photoshop dummy preset is a *projection*. The internal model is JSON, the dummy preset is regenerated from it on debounce.

```
BrushBuddyState (in-memory, JSON)
  ├── source tip (image data + edit history)
  ├── semantic settings (chaos, wetness, …)
  ├── derived parameters (PS descriptors, computed)
  └── archetype lineage (which template did we start from)

   ↓  on debounce / proof / save

Photoshop side
  ├── "BrushBuddy Live Preview" preset (volatile, overwritten)
  ├── "BrushBuddy Proof" layer (volatile, drawn on)
  └── named preset (permanent, only on Save)
```

## Tip editor — a masking-cockpit, not a settings panel

The tip itself is a first-class artifact, not just an input. The tip editor exposes the operations artists already know from PS's masking and adjustment tools:

- **Levels** (auto + manual black/white/gamma)
- **Curves** (S-curve preset, custom)
- **Feather** (selection feather + post-capture Gaussian)
- **Threshold** (with hard/soft toggle — soft = S-curve, hard = step)
- **Blur / Sharpen**
- **Edge erosion** (morphological erode, for roughened edges)
- **Noise** (additive, multiplicative, blue-noise)
- **Warp / pinch / twist** (interactive transforms on the tip)
- **Squash / roundness**
- **Invert / mirror X / mirror Y**
- **Auto-crop** (trim to alpha bounds + padding)
- **Auto-center** (center-of-mass recenter)

Every operation is non-destructive: stored as an op in the edit stack, replayable, individually toggle-able. The Layer-1 canvas re-runs the stack on every change.

## Dual Brush Lab (flagship differentiator)

Dual Brush is one of Photoshop's most powerful but least understood brush features. We make it tractable by treating it as an explicit composition system:

- **Primary tip** = the main mark.
- **Secondary tip** = the texture / gate / cutter.
- **Composition mode** = how secondary modifies primary (Multiply, Subtract, Hard Mix, Linear Height, etc.) — labeled with perceptual descriptions, not just blend names.
- **Live preview** shows how the secondary breaks up, masks, or patterns the primary stroke.
- **Swap** primary ↔ secondary in one click.
- **Semantic sliders for the dual interaction**:
  - "more broken"
  - "more speckled"
  - "more bristly"
  - "more stamped"
  - "less repetitive"
  - "more natural edge"

Why this earns its keep: PS's Dual Brush UI is a Russian-doll panel-inside-a-panel with no preview of the *interaction*. A visual lab for it is genuinely new ground.

## Performance budgets

| Operation | Budget |
|---|---|
| Canvas preview redraw | < 16 ms (60 fps) |
| Tip edit op (single) | < 50 ms |
| Tip edit stack replay (full) | < 150 ms |
| Debounced PS update + proof | < 600 ms |
| Save final preset | < 1 s |

Where Photoshop is in the loop, latency is what it is — we measure and degrade gracefully.

## What we don't do

- Real-time interception of the user's actual painting strokes (PS doesn't expose it).
- Custom brush engine that replaces PS's (off-mission and reproducing PS's engine pixel-perfect is intractable).
- Direct `.abr` file write (undocumented format with two generations; drive PS's export action instead).
- Pixel-perfect parity between Layer-1 simulated preview and Layer-2 PS proof. The simulated preview is a *guide*; the proof is *truth*.
