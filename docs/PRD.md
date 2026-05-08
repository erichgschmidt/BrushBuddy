# BrushBuddy — Product Requirements (v0.2, draft)

> Living document. Anchors scope and surfaces disagreement before we build.

## 1. Vision

A **real-time Photoshop brush lab** where artists shape a tip, combine it with texture or dual-brush behavior, see the stroke instantly, and commit it as a native PS preset. The promise: *instant simulated preview, frequent real Photoshop verification.*

Custom-brush authoring shifts from a 5–15 minute multi-panel chore to a 30–60 second guided flow with a live cockpit.

## 2. Problem statement

Custom brushes are a core tool for illustrators, concept artists, matte painters, texture artists, and photo-bashers. Today, making one in Photoshop requires:

1. Manually preparing a source image (desaturate, level, crop, often invert) outside the brush flow.
2. `Edit > Define Brush Preset` (limited to 2500×2500 px, expects black-on-white luminance).
3. Tabbing through 8 sub-panels of the Brush Settings to dial dozens of mechanical sliders, mostly without a live preview that resembles real strokes.
4. Iterating by trial and error because settings are mechanical (Size Jitter %, Angle Jitter °) rather than perceptual ("more chaos").
5. Saving and organizing into groups; optionally exporting `.abr`.

Tutorial videos for "create custom brush from image" routinely run 8–20 minutes for a single brush. (Sources in [RESEARCH.md](RESEARCH.md).)

## 3. Target users (v1 prioritization)

1. **Concept artists & illustrators** (primary v1 target). Author brushes mid-flow, value speed and feel. Already pay for plugins.
2. **Brush sellers** (Gumroad creators). Author at scale.
3. **Texture artists / matte painters**. Build kits per-project from photo references.
4. **Students and hobbyists** (long-term). Word-of-mouth segment.

Deprioritized for v1: photo retouchers (rarely author), comic artists (heavy custom rigs).

## 4. Jobs to be done

- *When I'm sketching and need a specific texture nothing in my library matches, I want to grab any reference image and turn it into a usable brush in under a minute, so I don't break flow.*
- *When I'm starting a project, I want to build a small kit of consistent brushes from photo references, so the project has a coherent look.*
- *When I make a brush I like, I want to tweak the feel ("less chaotic", "softer falloff") without learning a parameter taxonomy.*
- *When I'm selling brush packs, I want to author dozens of variations from a base recipe.*
- *When I want to share, I want one-click `.abr` export.*

## 5. v1 scope (MVP)

### In

- **Tip Capture**
  - From current selection, document, layer, or pasted image.
  - Auto-pipeline: grayscale (luminance) → auto-levels → optional invert → optional S-curve/threshold → center-of-mass crop → optional feather → define preset.
  - Per-step toggle/override; live preview at each stage.
  - 2500×2500 cap honored; auto-downsample with warning.

- **Tip Editor (masking cockpit)** — the source tip is a first-class artifact, edited non-destructively with an op stack:
  - Levels (auto + manual)
  - Curves (S-curve preset, custom)
  - Feather (selection feather + Gaussian)
  - Threshold (hard/soft)
  - Blur / Sharpen
  - Edge erosion (morphological)
  - Noise (additive, multiplicative, blue-noise)
  - Warp / pinch / twist (interactive)
  - Squash / roundness
  - Invert / mirror X / mirror Y
  - Auto-crop / auto-center
  - Every op replayable; toggle to compare before/after.

- **Brush Lab — semantic controls** (each maps to a coordinated curve over multiple PS descriptors; see [BRUSH-TAXONOMY.md §3](BRUSH-TAXONOMY.md)):
  - Chaos · Softness · Wetness · Graininess · Spread · Rhythm · Buildup · Color Life · Tip Variety · Directionality
  - Each slider exposes a "show underlying" disclosure for power users (Krita-style).

- **Dual Brush Lab** (flagship differentiator)
  - Visual composition system: primary tip + secondary tip + composition mode.
  - Live preview of the *interaction* (PS's UI never shows this).
  - Swap primary↔secondary in one click.
  - Dual-specific semantic sliders: more broken / more speckled / more bristly / more stamped / less repetitive / more natural edge.

- **Hybrid preview pipeline** (architectural; see [ARCHITECTURE.md](ARCHITECTURE.md))
  - Layer 1: instant Canvas/WebGL simulated stroke in the panel — drives every slider tick.
  - Layer 2: debounced (~250ms) Photoshop proof — overwrites a `BrushBuddy Live Preview` dummy preset, selects it, renders on a `BrushBuddy Proof` scratch layer.
  - Layer 3 (bonus): native Brush Settings panel may sync — not a guarantee.

- **Archetype templates**: Pencil, Inker, Gouache, Dry Brush, Watercolor Wash, Hair/Fur, Foliage, Stipple, Chalk, Spatter, Grunge, Calligraphy, Marker. Editable, save-as-recipe in v2.

- **Save & export**
  - Save: duplicate Live Preview into a permanent named preset.
  - Export: `.abr` via PS's preset-export action (not direct file write).
  - Cleanup: prune `BrushBuddy Live Preview` and `BrushBuddy Proof` layers on session end.

- **Undo-friendly**: tip-editor ops are local to the panel; PS-side traffic is grouped where possible to avoid polluting the user's history.

### Out (v1)

- Brush *organization* / library management (BrushBox & Brusherator already do this; integrate later, don't compete).
- Real-time stroke interception (PS doesn't expose it).
- Custom brush engine.
- Cross-app export (Procreate `.brushset`, Krita, CSP).
- AI-from-text brush generation. v2 candidate.
- Cloud sync, marketplace, social features.
- Mobile / Photoshop iPad — track demand, not v1.

## 6. Success metrics

- **North star**: time-to-first-saved-brush from cold open. Target median < 60s.
- **Activation**: % of installs that save ≥ 1 brush within 7 days. Target > 40%.
- **Retention**: weekly active among users who saved ≥ 3 brushes. Target 30% W4.
- **Preview-loop health**: 95th-percentile dummy-brush round-trip latency. Target < 600ms.
- **Quality signal**: avg # of semantic sliders touched per saved brush (proxy for "did the semantic mapping earn its keep").

## 7. Non-goals & constraints

- We do NOT reproduce Photoshop's full brush settings UI. If a user needs an exotic setting, they go to PS's panel — the dummy brush is selected so PS's panel may even reflect our state.
- We do NOT support CEP. UXP only.
- We do NOT depend on undocumented descriptors without a documented fallback.
- We do NOT promise pixel-perfect parity between simulated preview and PS proof. Layer 1 is a *guide*, Layer 2 is *truth*.

## 8. Risks (top 7)

1. **Dummy-brush update loop is too slow or pops modals.** Mitigation: M0 spike validates this end-to-end before committing scope. Fallbacks documented in [ARCHITECTURE.md](ARCHITECTURE.md).
2. **batchPlay descriptor coverage for dynamics is incomplete or version-fragile.** Mitigation: design semantic sliders so each maps to multiple descriptors with graceful degradation.
3. **Dual Brush descriptors are particularly gnarly.** Mitigation: spike Dual Brush specifically alongside primary brush in M0; if it fails, ship without Dual Brush Lab in v1 and add later.
4. **`.abr` export only works through PS's own action, not direct file write.** Mitigation: drive PS export action; if also gated, ship "save to library" only.
5. **Adobe ships their own redesigned brush UX.** Mitigation: out-focus them on the artist workflow (semantic language, archetype templates, photo capture, dual brush lab).
6. **Distribution friction via Adobe Marketplace.** Mitigation: dual-distribute on Gumroad / direct (`.ccx` install) for early adopters.
7. **Pen-pressure / tilt curve mapping is fragile.** Mitigation: expose well-tested control modes in v1 (Off / Pen Pressure / Pen Tilt / Stylus Wheel); curve editing is v2.

## 9. Milestones

- **M0 — Spike (1–2 weeks).** Validate the dummy-brush loop end-to-end. See [TECH-FEASIBILITY.md](TECH-FEASIBILITY.md) for the exact spike spec. Kill-or-greenlight gate.
- **M1 — Capture + Tip Editor (3–4 weeks).** Tip Capture pipeline + Tip Editor with the masking-cockpit op stack. Layer-1 canvas preview. Save to library.
- **M2 — Brush Lab + hybrid preview (4–6 weeks).** Semantic sliders, debounced PS proof loop, 5 archetype templates.
- **M3 — Dual Brush Lab (3–4 weeks).** Composition system, dual-specific semantics, swap primary/secondary.
- **M4 — Polish + export (2–3 weeks).** Remaining archetypes, `.abr` export, onboarding, telemetry.
- **M5 — Closed beta (4 weeks).** 20–50 artists. Iterate on semantic mapping (most likely place to need rework).
- **M6 — Launch.** Adobe Marketplace + Gumroad direct.

## 10. Pricing hypothesis

One-time purchase, **$29–$49**, aligned with Brusherator / BrushBox precedent. Free or trial tier for capture + tip-editor only; Brush Lab + Dual Brush Lab + archetype library behind purchase. Subscription is the wrong shape for an in-flow creative tool. Re-evaluate after beta.

## 11. Open questions

- Layer-1 simulated preview fidelity — how close to PS's actual output is "close enough" before the gap becomes a credibility issue?
- Tip editor op stack: cap depth? Persist with the brush as recipe metadata?
- Dummy-brush cleanup strategy across sessions and crashes — leave-behind risk.
- Localization of semantic vocabulary ("chaos", "wetness"). English-first.
- Photoshop iPad — UXP works but capture/touch flows differ. Out of v1; track demand.
