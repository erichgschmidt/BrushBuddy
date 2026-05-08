# BrushBuddy — Technical Feasibility & First Spike

## Capability matrix

Confidence: **H** = documented or community-confirmed working. **M** = should work via batchPlay, needs confirmation. **L** = unknown / risky.

| Capability | Achievable? | API path | Confidence |
|---|---|---|---|
| Build a docked panel UI | Yes | UXP + Spectrum Web Components | H |
| Read pixel data from selection / layer | Yes | UXP `imaging` API + DOM | H |
| Run image adjustments (levels, threshold, desaturate) | Yes | batchPlay adjustment commands | H |
| Detect bounding box / center-of-mass for crop | Yes | UXP imaging or in-JS pixel scan | H |
| Define a brush preset programmatically | Yes | batchPlay `defineBrush` descriptor (recordable) | M-H |
| Set brush dynamics (Shape Dynamics, Scattering, Texture, Transfer, Dual Brush, Color Dynamics, Brush Pose) | Yes | batchPlay descriptors per panel — recordable via dev mode | M |
| Read existing brush list / current brush | Yes | batchPlay `_property: "brushes"` / `presetManager` | H |
| Select brush by name | Yes (caveat: name collisions) | `_ref: "toolPreset"` | H |
| Render test stroke on a layer | Yes | Create scratch layer + simulate stroke via line action or scripted brush stroke | M |
| Export to `.abr` | Indirect: drive PS's preset export action | batchPlay `export presets` | M-L |
| Read `.abr` directly (custom parser) | Possible but undocumented | None — would have to reverse-engineer | L (don't) |
| Real-time stroke interception | **No** | Not exposed | — |
| Custom brush engine | **No** | Not exposed | — |
| Pen pressure curve editing | Risky | Brush Pose descriptors exist, curves are fragile | L |

## Recommended stack

- **UXP plugin** (Photoshop 2025+, UXP v8.0+).
- **TypeScript** + **React** + **Spectrum Web Components** for native-looking UI.
- **`@adobe-uxp-types/photoshop`** typings.
- **batchPlay** for everything not in the typed DOM API; descriptors captured via PS's developer-mode action recorder (`Plugins > Development > Record Action Commands`) or the community **Alchemist** panel.
- Build with **Vite** or Adobe's UDT (UXP Developer Tool) for hot reload.
- No native code. No CEP fallback.

## First spike (M0) — kill-or-greenlight

Goal: prove the technical core in 1–2 weeks. If any step fails fundamentally, kill or pivot the project.

### Spike scope

A throwaway UXP panel with three buttons:

1. **"Capture tip from selection"**
   - Reads current selection bounds.
   - Runs grayscale → auto-levels via batchPlay.
   - Calls `defineBrush` with the active selection as source.
   - Names it `BrushBuddy-Spike-{timestamp}`.

2. **"Apply test dynamics"**
   - With the most recently defined brush selected, applies a known recipe (e.g. Stipple): size jitter, scattering both-axes, count, spacing.
   - Uses raw batchPlay descriptors recorded ahead of time via PS's dev recorder.

3. **"Render test stroke"**
   - Creates a new layer named `BrushBuddy-Test`.
   - Renders a synthetic stroke (straight line or path-driven) using the active brush.
   - This is the riskiest piece — confirm we can drive PS to actually paint, not just configure.

### Spike success criteria

- All three buttons work end-to-end on PS 2025 (Win + Mac).
- Brush dynamics applied via batchPlay round-trip: open Brush Settings panel after step 2, confirm sliders match.
- Test stroke visibly renders on the layer.
- Total round-trip < 2 seconds for a small (256×256) tip.

### Spike non-goals

- No real UI, no semantic sliders, no archetype templates.
- No `.abr` export.
- No error handling beyond `console.log`.

### Spike risks & what they tell us

| If this fails... | ...the project is |
|---|---|
| `defineBrush` via batchPlay isn't reliably scriptable | Re-evaluate — possibly limit to dynamics-only and skip capture |
| Dynamics descriptors don't round-trip | Significant scope cut, but not fatal — semantic mapping still works on whatever does round-trip |
| Can't programmatically render a test stroke | Lose live preview; fall back to "save and let user paint to test" — UX hit but shippable |
| All three fail | Project is dead. Better to know in 2 weeks than 6 months. |

## After the spike

Greenlight → M1 (Capture flow). See [PRD.md §9](PRD.md).

## Reference plugins to read

- [AdobeDocs/uxp-photoshop-plugin-samples](https://github.com/AdobeDocs/uxp-photoshop-plugin-samples) — official samples.
- [AdobeDocs/uxp-photoshop](https://github.com/AdobeDocs/uxp-photoshop) — API reference repo.
- Alchemist (community action descriptor inspector) — install in our dev PS.
- Existing UXP-ported plugins on Gumroad as live examples of UI patterns.
