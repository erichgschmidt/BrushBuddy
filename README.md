# BrushBuddy

A Photoshop UXP plugin that streamlines custom brush authoring — capture a tip from any image, dial in dynamics with intuitive semantic controls, save the preset. End to end in under a minute, instead of the current multi-panel slog.

> **Status:** Pre-development. Scoping and feasibility phase. See [docs/PRD.md](docs/PRD.md), [docs/RESEARCH.md](docs/RESEARCH.md), and [docs/TECH-FEASIBILITY.md](docs/TECH-FEASIBILITY.md).

## The problem

Photoshop's brush authoring UX is a tabbed wall of sliders (Shape Dynamics, Scattering, Texture, Dual Brush, Transfer, Color Dynamics, Brush Pose, Noise…) with no live semantic preview, no guided workflow, and a tedious manual prep pipeline for capturing a tip from an image. Existing plugins (BrushBox, Brusherator) focus on *organizing* brushes — the *authoring* side is underserved.

## The bet

A focused panel that:
1. **Captures** a brush tip from any selection or image with one click (auto threshold/level/center/feather).
2. **Dials in** dynamics through perceptual sliders ("chaos", "softness", "graininess", "wetness") that map to combinations of underlying parameters, plus a live test-stroke area.
3. **Templates** common archetypes (pencil, gouache, hair, foliage, stipple, grunge) as starting points.
4. **Saves** to PS preset library and exports `.abr` for sharing.

## Why now

- CEP is being phased out; UXP is Adobe's go-forward platform with active investment.
- AI brushes / Fresco brushes haven't displaced custom-brush authoring for serious illustrators.
- Brush *consumption* (Gumroad packs) is a healthy market; brush *creation tools* are a gap.

## Tech direction (provisional)

- **UXP** plugin (not CEP — see [TECH-FEASIBILITY.md](docs/TECH-FEASIBILITY.md))
- TypeScript + React + Spectrum Web Components
- `batchPlay` for brush descriptors not exposed in the typed API
- Photoshop 2025+ (UXP v8.0)

## Roadmap

See [docs/PRD.md](docs/PRD.md) for milestones. First milestone is a **technical spike**: prove we can programmatically define a brush tip + non-trivial dynamics via batchPlay. Everything else depends on that.
