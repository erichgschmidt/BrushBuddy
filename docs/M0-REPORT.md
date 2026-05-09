# M0 Spike Report

**Status: GREEN (with documented scope cut).**
**Date completed:** 2026-05-09.

## Question the spike answered

> Can we drive Photoshop's brush authoring pipeline (capture, modify, preview) from a UXP plugin via batchPlay, and is the round-trip fast enough to support a real-time hybrid preview architecture?

**Answer: yes for the parts that matter most, no for one specific part. Net: the product is buildable.**

## Findings

### ✅ What works (proven)

| Capability | Path | Latency |
|---|---|---|
| Capture brush tip from selection | `_obj: "defineBrush", name` | ~2–8 s (PS-side cost; one-time) |
| Read full brush + tool state | `_obj: "get"` on `property currentToolOptions of application` | ~10 ms |
| Mutate **tip-level** properties live: spacing, diameter, angle, roundness, hardness, flipX/Y, tip name | `_obj: "set"` on `brush targetEnum` with a `sampledBrush` descriptor (after merging with current to preserve `sampledData`) | **11–24 ms** per change |
| Real-time stroke preview | **Photoshop's own Brush Settings preview area** updates automatically on every brush change. We don't render anything ourselves. | free |

The mutation latency is far below our 600 ms debounced-update budget. A live tip-property cockpit (drag a slider, see PS's preview update) is feasible.

### ❌ What does not work

| Capability | Why |
|---|---|
| Mutate brush **dynamics** ($szVr, useTipDynamics, useScatter, scatterDynamics, $opVr, usePaintDynamics, dualBrush internals, etc.) | `_obj: "set"` on `currentToolOptions` is rejected with `result: -128` regardless of payload shape. We tried 9 distinct target/event combinations (A–I); none accepted dynamics writes. The `set brush targetEnum` path that works for tip fields silently drops dynamics fields. |
| Programmatic proof-stroke (path stroke with current brush) | `_obj: "stroke"` returns `result: -128`. Multiple `using:` enum forms tried. Not blocking — see architecture pivot below. |

### Architectural consequence

The original PRD called for a three-layer hybrid pipeline:
1. Instant Canvas/WebGL preview in our panel.
2. Debounced PS proof on a scratch layer.
3. PS panel sync (bonus).

The spike's findings collapse this into something simpler:

1. **In-panel canvas** for the masking cockpit (tip editing — warp/erode/feather/threshold), driven by our own image-processing pipeline.
2. **PS's native Brush Settings preview area** is Layer 2. When we mutate tip properties via `set brush targetEnum`, PS's preview updates automatically. No proof layer, no path stroke, no scratch document.
3. Dynamics editing is handed off to PS's native panel (which has its own live preview).

## Probe results (full table)

All probes attempted to set the spacing of the current brush to 180%.

| Probe | Form | Result |
|---|---|---|
| A | `set` `[property "spacing" of property "currentToolOptions" of application targetEnum]` | -128 |
| B | `set` `[brush by name]` to full sampledBrush descriptor | -128 |
| C | `set` `[property "spacing" of brush by name]` | -128 |
| D | `set` `[property "spacing" of brush targetEnum]` | -128 |
| E | `set` `[property "brush" of currentToolOptions of application]` to new sampledBrush | -128 |
| F | A + `synchronousExecution: true` | -128 |
| G | Legacy `setd` event id | -128 |
| H | `invokeCommand` with `commandID: 1436` (captured from a Record Action recording) | -128 |
| **I** | **`set` `[brush targetEnum]` to minimal `sampledBrush` `{ spacing }`** | **✓** |

Probe I is our load-bearing primitive going forward. It accepts any subset of `sampledBrush` fields, but only the ones that are real tip-level properties take effect; dynamics fields are silently dropped.

## Implications for v1 scope

### Cuts from the original PRD

- Drop the in-product semantic dynamics sliders (chaos, wetness, graininess, etc. mapped to underlying PS dynamics).
- Drop the in-product Dual Brush Lab as a real-time tool.
- Drop the "Layer 2 debounced PS proof on scratch layer" architecture.
- Drop the proof-stroke verification button.

### Keeps and gains

- Tip Capture flow (defineBrush works perfectly).
- Tip Editor masking cockpit (warp/threshold/feather/erode/etc.) — runs entirely in our canvas, lossless.
- **Live tip-property cockpit** — sliders for spacing, diameter, angle, roundness, hardness, flipX/Y. Sub-30ms updates. PS's preview area shows the result in real time. This alone is a meaningful UX improvement.
- **Archetype `.abr` files bundled with the plugin** — we hand-author canonical Stipple/Hair/Foliage/Grunge/etc. presets in PS once (with full dynamics), save them as `.abr`, ship them with the plugin. User imports once and picks an archetype as a starting point. We then live-edit the tip on top of the chosen archetype's dynamics.
- Dynamics editing remains in PS's native Brush Settings panel — a UX seam, but not a fatal one. Users already do this today.

## Recommendation

**Proceed to M1 with the revised architecture.** The product premise — *"the fastest way to author a custom brush in Photoshop"* — survives the scope cut. The tip-capture + masking-cockpit + live-tip-property loop is genuinely better than the status quo, and it's something nobody else ships.

## Open follow-ups (not blocking)

- Confirm bundled `.abr` files import cleanly into PS via batchPlay automation (or fall back to a "Click here to install archetypes" doc step).
- Investigate whether DOM-level `app.activeBrush?.spacing = ...` exists and behaves differently from batchPlay (low priority — batchPlay path works).
- Recheck dynamics writability when each new PS major lands (Adobe may open this surface eventually).
