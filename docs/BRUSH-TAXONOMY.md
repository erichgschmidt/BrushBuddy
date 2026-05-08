# Brush Parameter Taxonomy & Recipes

Detailed appendix to [RESEARCH.md](RESEARCH.md). Sources are canonical references (Adobe Help, Krita Manual, Procreate Handbook, CSP Reference, Rebelle docs) — verify before using as load-bearing in code.

## 1. Photoshop brush engine — full inventory

Each panel has an enable checkbox; most parameters offer a Control dropdown (Off, Fade, Pen Pressure, Pen Tilt, Stylus Wheel, Rotation, Initial Direction, Direction) and a Jitter slider (0–100%).

### Brush Tip Shape
| Parameter | Range | Axis |
|---|---|---|
| Size | 1–5000 px | scale |
| Flip X / Y | bool | symmetry |
| Angle | -180–180° | directionality |
| Roundness | 0–100% | tip shape |
| Hardness (round only) | 0–100% | softness |
| Spacing | 1–1000% | rhythm |

### Shape Dynamics
Size Jitter, Minimum Diameter, Tilt Scale, Angle Jitter, Roundness Jitter, Min Roundness, Flip X/Y Jitter, Brush Projection.

### Scattering
Scatter (0–1000%), Both Axes, Count (1–16), Count Jitter.

### Texture
Pattern, Invert, Scale, Brightness, Contrast, Texture Each Tip, Mode (Multiply/Subtract/Hard Mix/Linear Height/Height/etc.), Depth, Min Depth, Depth Jitter.

### Dual Brush
Stamps a second tip inside the first's alpha. Mode, Tip, Size, Spacing, Scatter, Count.

### Color Dynamics
Apply Per Tip, FG/BG Jitter, Hue Jitter, Saturation Jitter, Brightness Jitter, Purity.

### Transfer
Opacity Jitter, Min Opacity, Flow Jitter, Min Flow; Wetness/Mix Jitter for Mixer brush.

### Brush Pose
Override stylus with fixed Tilt X, Tilt Y, Rotation, Pressure.

### Top-level toggles
Noise, Wet Edges, Build-up (airbrush), Smoothing, Protect Texture.

## 2. Cross-app — what to steal

- **Procreate Brush Studio**: single scrollable doc; explicit named **Rendering** modes (Light Glaze, Uniform Glaze, Wet Mix…) that abstract blending math behind perceptual labels; dedicated **Taper** panel with curve editor.
- **Krita**: per-sensor curve editor on every parameter (Pressure, Tilt, Speed, Distance, Time, Fuzzy, Fade, Drawing Angle, Rotation, Random). Gold standard for input mapping.
- **CSP**: stroke-ribbon live preview; explicit Watercolor Edge panel.
- **Rebelle**: physically-based wet-media vocabulary (Water, Loading, Wetness, Bleed, Dilution) — steal the *language* even if the engine differs.

**BrushBuddy shortlist:**
1. Procreate-style named Rendering presets.
2. Krita-style per-sensor curve editor (power-user disclosure).
3. Dedicated Taper panel.
4. Rebelle's wet-media vocabulary.
5. CSP-style stroke-ribbon preview.

## 3. Semantic → underlying mapping

Each semantic slider (0→100) drives multiple parameters in coordinated curves:

| Semantic | Drives |
|---|---|
| **Chaos** | Size Jitter (0→60%), Angle Jitter (0→100%), Scatter (0→200%), Count Jitter (0→50%), Hue Jitter (0→8%), Flip Jitter (off→on past 70) |
| **Softness** | Hardness (100→0%), tip alpha feather, Flow (60→100%), edge AA |
| **Wetness** | Wet Edges (on past 30), Flow Jitter (0→40%), Min Opacity (40→10%), Mixer Wetness |
| **Graininess** | Texture Depth (0→90%), Contrast (0→60), Depth Jitter (0→40%), Mode (Multiply→Hard Mix past 70) |
| **Directionality** | Angle Control = Direction (past 20), Roundness (100→40%), Brush Projection (past 50) |
| **Buildup** | Flow (10→90%), Build-up (past 60), Spacing (25→10%), Min Opacity raise |
| **Spread** | Scatter (0→500%), Both Axes (past 40), Count (1→4), Spacing (25→60%) |
| **Rhythm** | Spacing (5→100%), Count, Count Jitter |
| **Tip Variety** | Size/Roundness/Angle/Flip Jitters, coordinated low→high |
| **Color Life** | Hue Jitter (0→6%), Sat Jitter (0→25%), Brightness Jitter (0→15%), FG/BG Jitter (0→30%), Purity bias |

Each semantic should expose a "show underlying" disclosure for power users.

## 4. Archetype recipes

Defaults: 8-bit RGB, normal blending, tip 30 px unless noted.

**HB Pencil** — Hard round 4 px or speckled grain. Hardness 90, Spacing 5, Size Jitter 8. Texture rough paper Scale 100, Depth 60, Multiply, Each Tip ON. Transfer Flow Jitter 12. Smoothing 10. Pressure→Size+Opacity.

**Inking Pen** — Hard round 100, Spacing 1, Size Jitter 0. Pressure→Size only, Opacity 100. Min Diameter 15. Smoothing 25.

**Dry Brush** — Bristle/multi-dot tip. Spacing 8, Size Jitter 5. Texture canvas Depth 80, Contrast 30, Linear Height. Flow 60, Flow Jitter 25, Min Flow 20.

**Gouache** — Soft round Hardness 70, Spacing 4. Texture cold-press Depth 35, Multiply. Flow 90, Opacity Jitter 5. Brightness Jitter 4, Hue Jitter 1.

**Watercolor Wash** — Soft round Hardness 0, Spacing 3. Wet Edges ON, Flow 20, Build-up ON. Texture watercolor paper Depth 50, Subtract, Each Tip OFF. Hue Jitter 2, Sat Jitter 8.

**Hair / Fur** — Thin tapered streak. Spacing 2. Angle Control = Direction, Size Jitter 30. Scatter 40, Count 2, Count Jitter 30. Dual Brush dot tip Multiply. Brightness Jitter 12.

**Foliage** — Leaf cluster alpha. Spacing 80. Size Jitter 35, Angle Jitter 100, Roundness Jitter 20, Min Roundness 40. Scatter 200, Both Axes ON, Count 2, Count Jitter 50. Hue Jitter 3, Brightness Jitter 18, FG/BG Jitter 25.

**Stipple** — Hard round 6 px. Spacing 180, Size Jitter 25, Scatter 60, Count 1, Count Jitter 40. Opacity Jitter 30, Min Opacity 30. Pressure→Count.

**Chalk** — Chalk grain alpha, Hardness 80, Spacing 8. Texture rough paper Depth 75, Contrast 40, Multiply, Each Tip ON. Flow 85, Flow Jitter 20.

**Spatter** — Spatter alpha. Spacing 50, Size Jitter 40, Angle Jitter 100. Scatter 400, Both Axes ON, Count 3, Count Jitter 60. Opacity Jitter 40, Flow Jitter 30. Pressure→Count+Size.

**Grunge Texture** — Large grunge alpha 200 px. Spacing 25. Size Jitter 20, Angle Jitter 100, Flip Jitter ON. Texture grunge Depth 60, Hard Mix. Dual Brush noise Multiply. Opacity Jitter 35.

**Calligraphy** — Oval (Roundness 25, Angle 45). Hardness 100, Spacing 2. Brush Pose lock Rotation, or Angle Control = Pen Tilt. Min Diameter 80. Pressure→Size shallow (gamma 0.6). Smoothing 30.

**Marker** — Soft-edge oval Hardness 85, Spacing 1. Build-up ON, Flow 40. Min Opacity 60. Texture light paper Depth 15.

## 5. Tip-capture preprocessing pipeline

1. Crop & deskew to the mark.
2. Grayscale via luminance (0.299/0.587/0.114), not desaturate.
3. Levels: stretch so paper = 255, mark = 0. Auto-levels with 0.5% clip.
4. Despeckle (median radius 1 px).
5. CLAHE local contrast (tile ~1/8 image) — boosts faint pencil.
6. S-curve (NOT hard threshold) to preserve edge AA. Hard threshold only for ink-pen archetype.
7. Invert so mark = white on black (PS alpha convention).
8. Edge feather 0.3–0.8 px Gaussian.
9. Center-of-mass crop, recenter, pad to power-of-two square.
10. Trim transparent border to ~5% padding.
11. Optional: extract internal texture as Dual Brush tip.
12. Save 8-bit grayscale PNG, register via Define Brush Preset.

Expose as a wizard with skip-toggles and live preview after each step.

## 6. Pressure / tilt / velocity curves

- **Pressure → Size**: gamma 0.5–0.7 (concave) for inking; linear for pencils; gamma 1.5–2 for sketching.
- **Pressure → Opacity**: linear or gamma 0.8 for pencil/charcoal; locked at 100 for pens.
- **Pressure → Flow**: gamma 1.2 for paint.
- **Tilt → Roundness**: linear; 0° = full round, 60°+ = 30% round (calligraphic chisel).
- **Tilt → Size**: gamma 1.5, max 1.3× at full tilt (broadside).
- **Velocity → Size**: gamma 0.7 inverse for sumi-e thinning. Off by default.
- **Velocity → Spacing**: avoid — produces dotted strokes mid-hesitation.

Five curve presets per dynamic: Linear, Soft Start, Hard Start, S-curve, Inverse. Krita's editor is the reference.

## 7. Pitfalls

- **Spacing > tip AA edge** → polka-dot strokes. Cap continuous-stroke spacing at 25%.
- **Build-up + high Flow** instantly clips to opaque. Pair Build-up with Flow ≤ 25%.
- **Texture Each Tip ON + low Spacing** is expensive and moire-prone. Default OFF for soft brushes.
- **Hue Jitter > 10%** looks broken. Cap "Color Life" max at 6%.
- **Min Diameter 0% + Pressure→Size** makes brushes vanish mid-stroke. Floor at 5%.
- **Wet Edges + hard tip** produces outline-only strokes. Gate Wet Edges behind Hardness < 60%.
- **Scatter with Count 1** is wasted; couple Count to Scatter in semantic mapping.
- **Smoothing > 50%** introduces lag artists hate. Cap UI at 40%.
- **Protect Texture** is global; warn users when toggling.

## 8. Baseline default brush ("untouched" state)

- Hard round 30 px, Hardness 90, Roundness 100, Angle 0, Spacing 6.
- Shape Dynamics: Min Diameter 10, all jitters 0, Pressure→Size linear.
- Scattering / Texture / Dual / Color Dynamics: off.
- Transfer: Min Opacity 10, Pressure→Opacity linear.
- Wet Edges / Build-up / Noise: off. Smoothing 10. Protect Texture off.

A clean predictable round brush — the "white canvas" semantic sliders perturb.

## Sources

- [Adobe Photoshop User Guide — Brush settings](https://helpx.adobe.com/photoshop/using/adding-dynamic-elements-brushes.html)
- [Adobe Help — Create brush tips from images](https://helpx.adobe.com/photoshop/desktop/apply-painting-techniques/brushes-presets/create-brush-tip-image.html)
- [Krita Manual — Brush Engines](https://docs.krita.org/en/reference_manual/brushes.html)
- Procreate Handbook — Brush Studio (procreate.com/handbook)
- Clip Studio Paint Reference — Sub Tool Detail (clip-studio.com/site/gd_en)
- Escape Motions Rebelle — Brush Properties (escapemotions.com)
- David Revoy Krita brush kit (CC-BY)
- [pslover Ultimate Guide to brush settings](https://pslover.com/guides/the-ultimate-guide-to-photoshop-brush-settings/)
- [PhotoshopEssentials — Brush dynamics](https://www.photoshopessentials.com/basics/photoshop-brushes/brush-dynamics/brush-dynamics-intro/)
