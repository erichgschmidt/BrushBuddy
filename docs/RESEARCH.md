# BrushBuddy — Research Notes

Compiled from web research May 2026. Citations inline.

## 1. Photoshop's manual brush-from-image workflow (baseline pain)

The documented happy path ([Adobe helpx](https://helpx.adobe.com/photoshop/desktop/apply-painting-techniques/brushes-presets/create-brush-tip-image.html), [PhotoshopCAFE](https://photoshopcafe.com/tutorials/custom-photoshop-brush/make-custom-brush-in-photoshop.htm), [Astropad](https://astropad.com/blog/how-to-create-custom-brushes/)):

1. Choose source image with good clarity.
2. Manually copy/paste subject onto a new layer.
3. Convert to black & white (subject = black, background = white — *not* off-white or gray, or PS picks up the gray as alpha).
4. Adjust contrast (often via Levels or Curves).
5. Make a selection (rectangular marquee, ≤ 2500×2500 px).
6. Optionally adjust the marquee's Feather setting (0 px = sharp; >0 = soft).
7. `Edit > Define Brush Preset` → name it.
8. Open Brush Settings panel (`F5`) to add dynamics — separate journey, no link from the Define dialog.

Friction points (recurring across tutorials):

- Off-white background bug: PS uses luminance, so any non-pure-white pixel becomes partial alpha. Beginners constantly miss this.
- 2500×2500 cap is silent; large images either fail or get center-cropped without warning.
- Feather is set on the *selection*, not the brush — non-obvious.
- No live preview of the resulting brush against a stroke until you save and paint.
- Brush dynamics are an entirely separate workflow with no continuity from the capture step.

Tutorial videos for "create custom brush from image" routinely run 8–20 minutes for a single brush, most of which is image prep and dynamics tweaking ([Envato Tuts+](https://design.tutsplus.com/tutorials/how-to-make-a-brush-in-photoshop-from-an-image--cms-36326), [Jesús Ramirez YT](https://www.youtube.com/watch?v=ePt0gEOR8Yc)).

## 2. UXP / batchPlay capability for brushes

### Platform state (May 2026)

- CEP is end-of-life. CEP 12 is the last major version; security-only thereafter ([Configurator Reloaded blog](https://configurator.pixelsucht.net/blog/cep-vs-uxp-photoshop-2026/)). PS 2025 stopped showing legacy CEP panels in the UI ([Retouching Academy](https://retouchingacademy.zendesk.com/hc/en-us/articles/40387976264845-Legacy-Extensions-missing-in-Photoshop)).
- UXP v8.0 ships with PS 2025 (v26): Spectrum Web Components, local HTML in Webview, expanded HTMLElement/HTMLForm APIs ([Adobe Tech blog](https://medium.com/adobetech/updates-for-creative-cloud-desktop-extensibility-0dd5c663563e)).
- **Verdict: build UXP only.**

### batchPlay & action descriptors

- `batchPlay` is the escape hatch for everything not yet in the typed UXP API ([BatchPlay Details](https://developer.adobe.com/photoshop/uxp/2022/ps_reference/media/batchplay/)).
- It accepts plain-JSON `actionJSON` descriptors (the `_obj` / `_target` / `_ref` shape).
- Adobe ships a **developer-mode action recorder** (`Plugins > Development > Record Action Commands`) that captures any UI action as actionJSON ([forum thread](https://forums.creativeclouddeveloper.com/t/photoshop-uxp-batchplay-for-beginners/2156)). This is our primary tool for reverse-engineering brush descriptors. The community plugin **Alchemist** does the same live.

### Brush-specific findings

- **Read all brushes**: query `_property: "brushes"` against the application or `_property: "presetManager"` ([forum thread](https://forums.creativeclouddeveloper.com/t/how-to-get-all-brush-or-tool-presets/7168)).
- **Select by name**: `_ref: "toolPreset", _name: "..."` works but PS does **not disambiguate duplicate names** — there's no GUID for brush presets (unlike patterns). UX implication: enforce unique brush names in our save dialog.
- **Define Brush Preset** is a recordable command; the resulting actionJSON descriptor is what we'll reproduce.
- **Brush settings (dynamics)** — every slider in the Brush Settings panel produces a recordable descriptor. Coverage in the wild is very high; the open question is which combinations are version-stable.
- **Limitations** ([forum thread on min brush opacity](https://forums.creativeclouddeveloper.com/t/setting-minimum-brush-opacity/3104)): some niche settings have inconsistent descriptor names across PS versions; our spike must enumerate which ones we depend on.

### `.abr` file format

- Not officially documented. Internally it serializes ActionDescriptors ([Adobe Community thread](https://community.adobe.com/t5/photoshop/where-to-find-abr-brushes-file-format-specification/td-p/3537426)).
- At least two format generations exist; first two bytes = major version ([fileformats wiki](http://fileformats.archiveteam.org/wiki/Photoshop_brush)).
- Reverse-engineerable but non-trivial. **Decision: don't write `.abr` directly. Drive PS's own preset export action.** Less control, less risk.

## 3. Competitive landscape

### Brush *managers* (well-served space)

| Plugin | Focus | Approx price | Note |
|---|---|---|---|
| [Brusherator](https://kritskiy.gumroad.com/l/brusherator) | Brush + tool preset panel, alternates, hotkeys | one-time, ~$20 | "Flexible but not intuitive" feedback; UI dated ([polycount](https://polycount.com/discussion/179622/brusherator-for-photoshop-cc-a-panel-with-brushes-and-more)) |
| [BrushBox](https://derrickbarth.gumroad.com/l/brushbox) | Folder-organized brush manager, easier UX | one-time, ~$15–25 | "Easy to use, makes organization easy" ([Plugin Swirl review](https://pluginswirl.com/brushbox-review-solid-brush-management-plugin/)) |
| GrutBrushes panel | Curated brushes + management | bundled with brushes | Sells the brushes, not the tool |

**These are organization tools, not authoring tools.** None of them help you *make* a brush from scratch or tune dynamics intuitively. That's our gap.

### Adjacent reference points

- **Procreate Brush Studio** is the best-of-class authoring UX in the industry: live preview, semantic-feeling sliders, archetype-based defaults. Its model (single doc-style editor with a strip of categories and a permanent test-stroke area) is worth stealing structurally — though Procreate's brush engine is different ([Krita Artists thread](https://krita-artists.org/t/what-brushes-you-want-krita-to-replicate-that-is-in-other-software-procreate-clip-studio-paint-etc/33931)).
- **Krita** has more raw customization than Procreate but mediocre discoverability — UI is a pile of tabs, similar problem to PS but open-source.
- **Clip Studio** sits between: many parameters, more curated presets, Japanese-design-pattern panels.
- Brushes are not portable across these apps without conversion plugins ([Procreate→Krita converter](https://invent.kde.org/freyalupen/procreate-to-krita-brush-converter)). Cross-app export is a market opportunity but a separate project.

### Pricing benchmarks

- Brush *packs* on Gumroad: $0 (with tips) to $10–20 typical, premium up to ~$30 ([Gumroad illustration brushes](https://gumroad.com/drawing-and-painting/digital-illustration/illustration-brushes/photoshop)).
- Brush *plugins* (managers): one-time $15–30.
- General PS plugin market: $20–80 one-time for focused tools; subscription only common for AI/large tool suites.

**Recommendation: $29–$49 one-time, possibly with a free capture-only tier.** Subscription is the wrong shape for an in-flow creative tool.

## 4. Brush parameter taxonomy & archetype recipes

### Photoshop's brush settings panels

Sourced from [pslover.com Ultimate Guide](https://pslover.com/guides/the-ultimate-guide-to-photoshop-brush-settings/), [Photoshop Essentials](https://www.photoshopessentials.com/basics/photoshop-brushes/brush-dynamics/brush-dynamics-intro/), [Adobe helpx](https://helpx.adobe.com/photoshop/using/adding-dynamic-elements-brushes.html), [99designs](https://99designs.com/blog/design-tutorials/photoshop-brush-panel-tutorial/):

| Panel | Key parameters | Perceptual axis |
|---|---|---|
| Brush Tip Shape | Size, hardness, spacing, angle, roundness, flip X/Y | Base shape & rhythm |
| Shape Dynamics | Size jitter, min diameter, angle jitter, roundness jitter, control modes | Chaos in shape |
| Scattering | Scatter %, both axes, count, count jitter | Spread / spray |
| Texture | Pattern, scale, brightness, contrast, mode, depth, depth jitter | Grain / surface |
| Dual Brush | Secondary tip + its own settings | Compound texture |
| Color Dynamics | Foreground/background jitter, hue, saturation, brightness, purity jitter | Color variation |
| Transfer | Opacity jitter, flow jitter, wetness, mix | Wetness / buildup |
| Brush Pose | Tilt X/Y, rotation, pressure overrides | Stylus mapping |
| Other toggles | Noise, Wet Edges, Build-up, Smoothing, Protect Texture | Quality flags |

### Semantic-control mapping (BrushBuddy hypothesis)

| Semantic slider | Underlying parameters |
|---|---|
| **Chaos** | size jitter + angle jitter + roundness jitter (weighted blend) |
| **Spread** | scatter % + both axes + count |
| **Rhythm** | spacing + count jitter |
| **Softness** | hardness + flow + (selection feather at capture time) |
| **Grain** | texture depth + scale + contrast |
| **Wetness** | wet edges + transfer flow jitter + build-up |
| **Pressure response** | size/opacity/flow control mappings → Pen Pressure |
| **Direction lock** | angle control → Direction (vs. jitter) |

This is a hypothesis; user testing in beta is where it lives or dies.

### Archetype recipes (starting points)

Drawn from the recipes in [pslover.com](https://pslover.com/guides/the-ultimate-guide-to-photoshop-brush-settings/) and [Photoshop Essentials' Scattering guide](https://www.photoshopessentials.com/basics/photoshop-brushes/brush-dynamics/scattering/):

- **Pencil**: small hard tip, low spacing (1–5%), Shape Dynamics size jitter ~10% w/ Pen Pressure, slight angle jitter, transfer flow jitter ~20%, no scattering.
- **Inker**: hard round tip, spacing 1%, opacity & flow on Pen Pressure, no jitter, smoothing on.
- **Gouache**: textured tip, spacing 10–15%, mild size jitter, Texture (canvas) depth ~30%, transfer wetness on.
- **Dry brush**: textured tip, spacing 5%, size jitter 20%, Texture depth high (50%+) with high contrast, transfer flow jitter 30%.
- **Hair / fur**: thin elongated tip, spacing 1%, angle control = Direction, low size jitter; optional dual brush.
- **Foliage**: leaf-shape tip, spacing 50–80%, angle jitter 100%, scatter both-axes 200–400%, count 1–3, color dynamics hue 5–15%.
- **Stipple**: round tip small, spacing 100%+, size jitter 100%, scatter 250%+ both axes, count 1.
- **Grunge**: textured tip, large, spacing 25%, opacity jitter on, transfer wetness on, dual brush noise.
- **Calligraphy**: oval tip (roundness 30%), angle fixed, spacing 1%, size & opacity on Pen Pressure, no jitter.
- **Marker**: soft round tip, spacing 1%, low flow, build-up on, transfer flow ~50%.

### Tip-capture preprocessing pipeline (recommended)

1. Source → grayscale.
2. Auto-Levels (or user-controlled Levels) to maximize black/white separation.
3. Optional invert (if subject is light on dark).
4. Optional threshold for hard-edged silhouette tips.
5. Center-of-mass crop with margin padding (avoids off-center stamping in PS).
6. Hard cap at 2500×2500; downsample with Lanczos if larger.
7. Selection feather (0–15 px depending on softness intent).
8. `Define Brush Preset`.

## 5. Distribution

- **Adobe Marketplace** (formerly Exchange): primary discovery, requires plugin review (~1–3 week turnaround historically), revenue share applies. ([Adobe plug-ins page](https://helpx.adobe.com/photoshop/kb/plugins.html)).
- **Gumroad / direct**: UXP plugins can be installed via `.ccx` (Creative Cloud package). Lower friction for early adopters and beta.
- **Recommendation: dual-distribute.** Marketplace for credibility and discovery; Gumroad for early beta + direct sales without revenue share.

## 6. Open research questions (to resolve before/during M0 spike)

1. Which brush descriptors are stable across PS 2024 → 2026? Specifically Transfer wetness, Dual Brush sub-descriptors, Brush Pose tilt mapping.
2. Can we drive the `.abr` export action programmatically, and does it round-trip dynamics faithfully?
3. Live test-stroke performance: how fast can we synthesize a debounced stroke on parameter change without flicker?
4. UXP `imaging` API — is it sufficient for our preprocessing pipeline (levels, threshold, feather, downsample) without round-tripping through PS adjustment layers?
5. Are there iPad-specific UXP brush limitations? (Out of v1, but flag for v2.)

---

**Sources index**
- [Adobe UXP Photoshop API reference](https://developer.adobe.com/photoshop/uxp/2022/ps_reference/)
- [BatchPlay Details](https://developer.adobe.com/photoshop/uxp/2022/ps_reference/media/batchplay/)
- [photoshopAction descriptors](https://developer.adobe.com/photoshop/uxp/2022/ps_reference/media/photoshopaction/)
- [AdobeDocs/uxp-photoshop GitHub](https://github.com/AdobeDocs/uxp-photoshop)
- [UXP for CEP Devs guide](https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_for_you/uxp_for_cep_devs/)
- [CEP vs UXP 2026 (Configurator Reloaded)](https://configurator.pixelsucht.net/blog/cep-vs-uxp-photoshop-2026/)
- [Adobe Tech blog: CC Desktop Extensibility updates](https://medium.com/adobetech/updates-for-creative-cloud-desktop-extensibility-0dd5c663563e)
- [Forum: How to get all brush/tool presets](https://forums.creativeclouddeveloper.com/t/how-to-get-all-brush-or-tool-presets/7168)
- [Forum: BatchPlay for beginners](https://forums.creativeclouddeveloper.com/t/photoshop-uxp-batchplay-for-beginners/2156)
- [Forum: Setting minimum brush opacity](https://forums.creativeclouddeveloper.com/t/setting-minimum-brush-opacity/3104)
- [Adobe helpx: Create brush tips from images](https://helpx.adobe.com/photoshop/desktop/apply-painting-techniques/brushes-presets/create-brush-tip-image.html)
- [Adobe helpx: Add dynamic elements to brushes](https://helpx.adobe.com/photoshop/using/adding-dynamic-elements-brushes.html)
- [pslover Ultimate Guide to brush settings](https://pslover.com/guides/the-ultimate-guide-to-photoshop-brush-settings/)
- [PhotoshopEssentials: Brush dynamics intro](https://www.photoshopessentials.com/basics/photoshop-brushes/brush-dynamics/brush-dynamics-intro/)
- [PhotoshopCAFE: Custom brush from photo](https://photoshopcafe.com/tutorials/custom-photoshop-brush/make-custom-brush-in-photoshop.htm)
- [.abr format community thread](https://community.adobe.com/t5/photoshop/where-to-find-abr-brushes-file-format-specification/td-p/3537426)
- [fileformats.archiveteam.org: Photoshop brush](http://fileformats.archiveteam.org/wiki/Photoshop_brush)
- [Brusherator (Gumroad)](https://kritskiy.gumroad.com/l/brusherator)
- [BrushBox (Gumroad)](https://derrickbarth.gumroad.com/l/brushbox)
- [Plugin Swirl: BrushBox review](https://pluginswirl.com/brushbox-review-solid-brush-management-plugin/)
- [Polycount: Brusherator discussion](https://polycount.com/discussion/179622/brusherator-for-photoshop-cc-a-panel-with-brushes-and-more)
- [Krita Artists: Brushes from Procreate/CSP](https://krita-artists.org/t/what-brushes-you-want-krita-to-replicate-that-is-in-other-software-procreate-clip-studio-paint-etc/33931)
