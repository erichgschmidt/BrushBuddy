# BrushBuddy — Technical Feasibility & First Spike

## Capability matrix

Confidence: **H** = documented or community-confirmed working. **M** = should work via batchPlay, needs confirmation. **L** = unknown / risky.

| Capability | Achievable? | API path | Confidence |
|---|---|---|---|
| Build a docked panel UI | Yes | UXP + Spectrum Web Components | H |
| Read pixel data from selection / layer | Yes | UXP `imaging` API + DOM | H |
| Run image adjustments (levels, threshold, desaturate) | Yes | batchPlay adjustment commands | H |
| Detect bounding box / center-of-mass for crop | Yes | UXP imaging or in-JS pixel scan | H |
| Tip-editor non-destructive op stack (warp, erode, noise…) | Yes | Custom JS/WebGL on tip pixel buffer | H |
| Layer-1 simulated stroke preview (Canvas/WebGL) | Yes | Custom renderer in the panel | H |
| Define a brush preset programmatically | Yes | batchPlay `defineBrush` (recordable) | M-H |
| Overwrite an existing preset (for `BrushBuddy Live Preview` dummy) | Likely | batchPlay define-with-same-name | **M — spike target** |
| Set brush dynamics (Shape, Scattering, Texture, Transfer, Color Dynamics, Brush Pose) | Yes | batchPlay descriptors per panel | M |
| Set Dual Brush descriptors | Yes, fragile | batchPlay sub-descriptors | **M-L — spike target** |
| Read current brush list / current brush | Yes | batchPlay `_property: "brushes"` / `presetManager` | H |
| Select brush by name | Yes (caveat: name collisions) | `_ref: "toolPreset"` | H |
| Render proof stroke on a layer | Yes | Create scratch layer + scripted stroke | **M — spike target** |
| Full debounced loop (write → select → draw) ≤ 600 ms | Likely | batched batchPlay calls | **M — spike target** |
| Avoid modal dialogs on preset overwrite | Likely | descriptor flags | **M — spike target** |
| Group operations cleanly in PS history | Possibly | history-state grouping | **L — spike target** |
| Native Brush Settings panel reflects dummy brush | Bonus | side effect of preset selection | L |
| Export to `.abr` | Indirect: drive PS's preset export action | batchPlay `export presets` | M-L |
| Read/write `.abr` directly | Don't | Undocumented; reverse-engineer at high cost | L (skip) |
| Real-time stroke interception | **No** | Not exposed | — |
| Custom brush engine inside PS | **No** | Not exposed | — |
| Pen pressure / tilt curve editing | Risky | Brush Pose exists; curves fragile | L (v2) |

## Recommended stack

- **UXP plugin** (Photoshop 2025+, UXP v8.0+).
- **TypeScript** + **React** + **Spectrum Web Components** for native-feeling UI.
- **HTML Canvas / WebGL** for the Layer-1 simulated preview.
- **`@adobe-uxp-types/photoshop`** typings.
- **batchPlay** for everything not in the typed DOM API; descriptors captured via PS's developer-mode action recorder (`Plugins > Development > Record Action Commands`) or the community **Alchemist** panel.
- Build with **Vite** or Adobe's UDT (UXP Developer Tool) for hot reload.
- No native code. No CEP fallback.

## First spike (M0) — kill-or-greenlight

Goal: prove the **hybrid preview pipeline's load-bearing piece — the dummy-brush loop** — in 1–2 weeks. If it fails, the product premise needs revision.

### Spike scope

A throwaway UXP panel, no real UI. Five buttons:

1. **Capture tip from selection** — read selection, run grayscale + auto-levels via batchPlay, call `defineBrush` with name `BrushBuddy Live Preview` (overwrite if exists).
2. **Apply primary dynamics** — apply a known recipe (Stipple) via batchPlay: size jitter, scatter both-axes, count, spacing.
3. **Apply Dual Brush** — set a dual-brush secondary tip + descriptors. *This is the riskiest single descriptor we depend on; spike it explicitly.*
4. **Render proof stroke** — create or reuse a `BrushBuddy Proof` layer, render a synthetic stroke (path-driven or scripted line) using the active brush.
5. **Loop test** — programmatically run buttons 1→4 in sequence ten times with varying parameters. Measure end-to-end wall time per cycle.

### Spike success criteria

| Test | Threshold |
|---|---|
| All five buttons work end-to-end on PS 2025 (Win + Mac) | required |
| Overwriting `BrushBuddy Live Preview` doesn't accumulate library cruft | required |
| No modal dialogs appear on overwrite | required |
| Dynamics descriptors round-trip (open Brush Settings panel, sliders match) | required |
| Dual Brush descriptor round-trips | desired (degrades scope if not) |
| Proof stroke visibly renders | required |
| Loop test 95p cycle latency | < 600 ms |
| User undo doesn't unwind painting work because of our internal traffic | required (or document & warn) |

### Spike non-goals

- No real UI, no semantic sliders, no archetype templates, no tip editor.
- No `.abr` export.
- No error handling beyond `console.log`.
- No Layer-1 simulated preview yet — that's separate, lower-risk work.

### Spike risks → product impact

| If this fails... | ...the project is |
|---|---|
| `defineBrush` overwrite pops modals | Ship without auto-debounce; manual "Proof" button only — UX hit, shippable |
| Dynamics don't round-trip | Significant scope cut; semantic mapping uses only what does round-trip |
| Dual Brush descriptors don't round-trip | Drop Dual Brush Lab from v1; revisit in v2. Hurts differentiation but doesn't kill product |
| Loop latency > 600 ms after optimization | Drop debounced auto-update; ship Proof button only |
| Can't programmatically render a stroke | Lose Layer-2 entirely; ship "save and let user paint to test" — substantial UX hit |
| Preset overwrite leaves cruft we can't prune | Suffix with timestamp, prune on session start — minor UX wart |
| All of the above fail | Project is dead. Better to know in 2 weeks than 6 months. |

## After the spike

Greenlight → M1 (Capture + Tip Editor). See [PRD.md §9](PRD.md).

## Reference plugins to read

- [AdobeDocs/uxp-photoshop-plugin-samples](https://github.com/AdobeDocs/uxp-photoshop-plugin-samples) — official samples.
- [AdobeDocs/uxp-photoshop](https://github.com/AdobeDocs/uxp-photoshop) — API reference repo.
- Alchemist (community action-descriptor inspector) — install in dev PS for reverse-engineering descriptors.
- Existing UXP-ported Gumroad plugins as live UI references.
