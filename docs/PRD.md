# BrushBuddy — Product Requirements (v0.1, draft)

> Living document. This is a first pass to anchor scope and surface disagreement before we build.

## 1. Vision

BrushBuddy turns Photoshop brush authoring from a 5–15 minute, multi-panel chore into a 30–60 second guided flow. Capture a tip, sculpt feel with semantic controls, save and ship.

## 2. Problem statement

Custom brushes are a core tool for illustrators, concept artists, matte painters, texture artists, and photo-bashers. Today, making one in Photoshop requires:

1. Manually preparing a source image (desaturate, level, crop, often invert) outside the brush flow.
2. `Edit > Define Brush Preset` (limited to 2500×2500 px, expects black-on-white luminance).
3. Opening the Brush Settings panel and tabbing through 8 sub-panels (Shape Dynamics, Scattering, Texture, Dual Brush, Color Dynamics, Transfer, Brush Pose, Noise/Wet Edges/Build-up/Smoothing) to dial dozens of sliders, mostly without a live preview that resembles real strokes.
4. Iterating by trial and error because settings are mechanical (Size Jitter %, Angle Jitter °) rather than perceptual ("more chaos").
5. Saving to the preset library, organizing into groups, optionally exporting `.abr`.

The interface predates modern UX patterns; experienced artists tolerate it; new artists give up and download packs. (Sources in [RESEARCH.md](RESEARCH.md).)

## 3. Target users (v1 prioritization)

Ranked by adoption likelihood and willingness to pay:

1. **Concept artists & illustrators** (primary v1 target). Author brushes mid-flow, value speed and feel. Already pay for plugins (Brusherator, BrushBox). Active on Gumroad and r/conceptart.
2. **Brush sellers** (Gumroad creators). Author at scale; would pay for time savings and consistent output. Small but high-LTV segment.
3. **Texture artists / matte painters**. Build kits per-project from photo references — the tip-capture flow is highest-leverage here.
4. **Students and hobbyists** (long-term). Lower willingness to pay; but onboarding ramp matters for word of mouth.

Deprioritized for v1: photo retouchers (rarely author brushes), comic artists (heavily customized rigs already, switching cost high).

## 4. Jobs to be done

- *When I'm sketching and need a specific texture nothing in my library matches, I want to grab any reference image and turn it into a usable brush in under a minute, so I don't break flow.*
- *When I'm starting a new project, I want to build a small kit of consistent brushes from photo references, so the project has a coherent look.*
- *When I make a brush I like, I want to tweak the feel ("less chaotic", "softer falloff") without learning a parameter taxonomy, so I can iterate by intuition.*
- *When I'm selling brush packs, I want to author dozens of variations from a base recipe, so I can produce volume without redoing every slider.*
- *When I want to share a brush with my team or buyers, I want a one-click export to `.abr`, so distribution is trivial.*

## 5. v1 scope (MVP)

### In

- **Tip Capture panel**
  - Capture from current selection, current document, current layer, or pasted image.
  - Auto-pipeline: desaturate → auto-levels → optional invert → optional threshold → center-of-mass crop → optional feather → define preset.
  - Per-step toggle/override; live preview at each stage.
  - Hard size cap honored (2500×2500); auto-downsample with warning.
- **Brush Lab panel** with semantic controls (each maps to underlying batchPlay descriptors):
  - **Chaos** (size jitter + angle jitter + roundness jitter blend)
  - **Spread** (scattering, both axes + count)
  - **Rhythm** (spacing + count jitter)
  - **Softness** (hardness + flow + feather)
  - **Grain** (texture scale + depth + mode)
  - **Wetness** (wet edges + transfer build-up + flow jitter)
  - **Pressure response** (size/opacity/flow control mappings)
- **Live test-stroke area** — synthetic stroke rendered on a scratch layer in PS using the actual brush, refreshed on parameter change (debounced).
- **Archetype templates**: Pencil, Inker, Gouache, Dry Brush, Hair/Fur, Foliage, Stipple, Grunge, Calligraphy, Marker. Each is a parameter recipe (see [RESEARCH.md §4](RESEARCH.md)).
- **Save & export**: save to PS preset library; export selection or session as `.abr` (via PS preset export, not raw file write — see Tech Feasibility).
- **Undo-friendly**: every change is a discrete operation in PS history.

### Out (v1)

- Brush *organization* / library management (BrushBox & Brusherator already do this well; integrate with them later, don't compete).
- Real-time stroke interception or custom brush engine (PS API does not expose this).
- Cross-app export (Procreate `.brushset`, Krita, CSP). Tempting but each is a project of its own.
- AI-generated brushes from text prompts. Interesting v2; not core.
- Cloud sync, marketplace, social features.
- Mobile / Photoshop iPad (UXP support is improving but feature parity is not guaranteed).

## 6. Success metrics

- **North star**: time-to-first-saved-brush from cold open of plugin, measured via in-plugin telemetry (opt-in). Target: median < 60s.
- **Activation**: % of installs that save ≥ 1 brush within 7 days. Target: > 40%.
- **Retention**: weekly active among users who saved ≥ 3 brushes. Target: 30% W4.
- **Quality signal**: average # of dynamics sliders touched per brush (proxy for "did the semantic controls earn their keep" — too low means people just save the captured tip; too high means semantic mapping is failing).

## 7. Non-goals & explicit constraints

- We will NOT reproduce Photoshop's full brush settings UI. If a user needs a setting we don't expose, they go to PS's panel. We expose what 80% of brushes need.
- We will NOT support CEP. UXP only.
- We will NOT ship a feature that depends on undocumented descriptors without a fallback path.

## 8. Risks (top 5)

1. **batchPlay descriptor coverage for brushes is incomplete or fragile.** Mitigation: spike before committing scope; design semantic sliders so each maps to multiple descriptors with graceful degradation.
2. **`.abr` export only works through PS's own preset export, not direct file write.** Mitigation: drive PS export action; if that's also gated, ship "save to library" only in v1.
3. **Adobe ships their own redesigned brush authoring UX.** Mitigation: stay closer to artists' workflow than Adobe will (semantic language, archetype templates, photo capture); compete on focus, not surface area.
4. **Distribution friction via Adobe Marketplace** (review timeline, revenue share). Mitigation: dual-distribute on Gumroad / direct (UXP supports `.ccx` install) for early adopters.
5. **Pen-pressure / tilt curve mapping via batchPlay is gnarly and version-fragile.** Mitigation: expose only well-tested control modes (Off, Pen Pressure, Pen Tilt, Stylus Wheel) without curve editing in v1.

## 9. Milestones

- **M0 — Spike (1–2 weeks).** Standalone UXP plugin that: (a) defines a brush tip from a selection programmatically, (b) sets ≥ 5 brush dynamic descriptors via batchPlay, (c) renders a test stroke on a layer. Goal: prove the core technical bet. Deliverable: spike report — ship it or kill it.
- **M1 — Capture flow (3–4 weeks).** Tip Capture panel with the full preprocessing pipeline and live previews. Save to library.
- **M2 — Brush Lab (4–6 weeks).** Semantic sliders + live test stroke + 5 archetype templates.
- **M3 — Polish + export (2–3 weeks).** Remaining archetypes, `.abr` export path, onboarding, telemetry.
- **M4 — Beta (4 weeks).** 20–50 closed beta artists. Iterate on semantic mapping (most likely place to need rework).
- **M5 — Launch.** Adobe Marketplace + Gumroad direct sale.

## 10. Pricing hypothesis

One-time purchase, **$29–$49** range, aligned with Brusherator / BrushBox precedent ([RESEARCH.md §3](RESEARCH.md)). Free tier or 14-day trial for capture-only flow; semantic Brush Lab and templates behind purchase. Subscription is a worse fit for this segment — artists prefer perpetual licenses for tools they use mid-creative-flow. Re-evaluate after beta data.

## 11. Open questions

- Does our semantic language ("chaos", "wetness") translate across non-English locales? Localization is downstream; English-first.
- Should archetype templates be editable by users and saved as personal recipes? Probably yes in v2; user testing will tell.
- Live test-stroke: render on a hidden scratch document, or on a temporary layer in the user's doc? UX vs. performance tradeoff.
- How do we handle Photoshop iPad (UXP runs there, but capture/touch flows differ)? Out of v1; track demand.
