# BrushBuddy

A Photoshop UXP plugin: a **real-time brush lab** where artists shape a brush tip, sculpt feel with semantic controls, see the stroke instantly, and commit it as a native Photoshop preset.

> **Status:** Pre-development. Scoping and feasibility phase. See [docs/PRD.md](docs/PRD.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/RESEARCH.md](docs/RESEARCH.md), [docs/TECH-FEASIBILITY.md](docs/TECH-FEASIBILITY.md), [docs/BRUSH-TAXONOMY.md](docs/BRUSH-TAXONOMY.md).

## The promise

**Instant simulated preview, frequent real Photoshop verification.**

BrushBuddy doesn't replace Photoshop's brush engine. It's a brush-design cockpit that prepares tips, simulates strokes in real time inside the panel, and commits native PS brushes when the result feels right.

## The problem

Photoshop's brush authoring UX is a tabbed wall of sliders (Shape Dynamics, Scattering, Texture, Dual Brush, Transfer, Color Dynamics, Brush Pose, Noise…) with no live semantic preview, no guided workflow, and a tedious manual prep pipeline for capturing a tip from an image. Existing plugins (BrushBox, Brusherator) focus on *organizing* brushes — *authoring* is the gap.

## Core workflow

1. **Capture** a source tip from a layer, selection, image, texture, stroke, or imported asset.
2. **Edit the tip live** with masking-style tools — feather, threshold, levels, blur, sharpen, edge erosion, noise, warp/pinch/twist, squash/roundness, invert, mirror, auto-crop, auto-center.
3. **Preview** the stroke instantly inside the BrushBuddy panel (Canvas/WebGL).
4. **Sculpt feel** with semantic controls — chaos, softness, wetness, graininess, spread, rhythm, buildup, color life…
5. **Verify** — a debounced "Live Preview" dummy brush in Photoshop renders a real proof stroke on a scratch layer ~250ms after you pause.
6. **Dual Brush Lab** — a visual composition system for combining a primary mark with a secondary texture/gate/cutter, the most under-served corner of PS's brush engine.
7. **Save** as a permanent named PS preset; export as `.abr` via PS's own export action.

## Why now

- CEP is end-of-life. UXP v8 (PS 2025) has the surface we need.
- AI brushes haven't displaced custom-brush authoring for serious illustrators.
- Brush *consumption* (Gumroad packs) is healthy; brush *creation tools* are a gap.

## Tech direction

- **UXP** plugin (Photoshop 2025+, UXP v8.0+).
- TypeScript + React + Spectrum Web Components.
- HTML Canvas / WebGL for the in-panel real-time preview.
- `batchPlay` for brush descriptors.
- Hybrid preview pipeline — see [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Roadmap

The first milestone is a narrow technical spike to validate the **dummy-brush update loop** — overwrite a temporary preset, select it, render a proof stroke, measure round-trip latency. Everything depends on that loop being smooth enough. See [docs/PRD.md](docs/PRD.md) and [docs/TECH-FEASIBILITY.md](docs/TECH-FEASIBILITY.md).
