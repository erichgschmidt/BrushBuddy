// Tip Editor — non-destructive op-stack editor for the brush tip.
// Wires together: ingest (read pixels) / vector / generators / composer /
// analyze → opstack (apply chain) → commit (push back into PS as a new brush).

import { useEffect, useMemo, useRef, useState } from "react";
import { ingestFromSelection, ingestFromActiveLayer, ingestFromFile } from "../tip/ingest";
import {
  Op, OpKind, OpStackState, addOp, defaultParamsFor, opMeta, removeOp,
  runStackMemoized, setSource, toggleOp, updateOpParams, moveOp,
} from "../tip/opstack";
import { commitTipAsBrush } from "../tip/commit";
import { pixelBufferToObjectUrl } from "../tip/png";
import {
  generatePerlin, generateWorley, generateVoronoi, generateCanvasWeave,
} from "../tip/generators";
import { VECTOR_PRESETS, PRESET_NAMES, rasterizeShape, type VectorShape } from "../tip/vector";
import { compose, diverge, settle, DEFAULT_VARIATION, preserveRange, type LayoutKind, type BlendMode } from "../tip/composer";
import {
  extractMarks, computeFingerprint, summarizeFingerprint,
  regeneratePlacements, DEFAULT_MULTIPLIERS,
  type Fingerprint, type Mark, type Multipliers,
} from "../tip/analyze";
import { gaussianBlur, autoCrop, threshold } from "../tip/processing";
import { Section, styles } from "./common";
import type { PixelBuffer } from "../tip/types";

type GeneratorKind = "perlin" | "worley" | "voronoi" | "canvas";

interface GenParams {
  kind: GeneratorKind;
  size: number;
  scale: number;
  detail: number;
  variant: number;
  seed: number;
}

function runGenerator(p: GenParams): PixelBuffer {
  const size = Math.max(16, Math.min(2500, p.size | 0));
  switch (p.kind) {
    case "perlin":
      return generatePerlin({ width: size, height: size, scale: p.scale, octaves: Math.max(1, Math.min(8, Math.round(p.detail))), persistence: p.variant / 100, lacunarity: 2, seed: p.seed });
    case "worley": {
      const modes = ["F1", "F2", "F2-F1"] as const;
      return generateWorley({ width: size, height: size, cellSize: p.scale, jitter: p.detail / 100, mode: modes[Math.max(0, Math.min(2, Math.round(p.variant)))], seed: p.seed });
    }
    case "voronoi":
      return generateVoronoi({ width: size, height: size, cellSize: p.scale, jitter: p.detail / 100, mode: p.variant >= 50 ? "edges" : "value", seed: p.seed });
    case "canvas":
      return generateCanvasWeave({ width: size, height: size, pitch: p.scale, jitter: p.detail / 100, contrast: p.variant / 100, seed: p.seed });
  }
}

const OP_KINDS: OpKind[] = [
  "alphaFromLuminance", "autoLevels", "levels", "threshold",
  "gaussianBlur", "unsharpMask", "erode", "dilate", "noise",
  "mirrorX", "mirrorY", "invert", "desaturate",
  "autoCrop", "autoCenter", "resize", "pad",
];

interface Status { text: string; kind: "info" | "ok" | "err" }

export function TipEditor(props: { onCommitted?: (brushName: string) => void }) {
  const [state, setState] = useState<OpStackState>({ source: null, ops: [] });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [addPick, setAddPick] = useState<OpKind>("alphaFromLuminance");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  const [gen, setGen] = useState<GenParams>({ kind: "perlin", size: 256, scale: 32, detail: 4, variant: 50, seed: 1 });
  const [vecPreset, setVecPreset] = useState<string>("circle");
  const [vecSize, setVecSize] = useState(256);
  const [comp, setComp] = useState<{
    layout: LayoutKind; count: number; posJit: number;
    scaleMin: number; scaleMax: number; rotJit: number; follow: boolean;
    pathPreset: string; seed: number;
    blend: BlendMode;
    preserveRange: boolean;
  }>({ layout: "scatter", count: 16, posJit: 0, scaleMin: 0.6, scaleMax: 1.0, rotJit: 90, follow: false, pathPreset: "circle", seed: 1, blend: "over", preserveRange: false });
  const [history, setHistory] = useState<PixelBuffer[]>([]);

  // Analyze state
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [fingerprint, setFingerprint] = useState<Fingerprint | null>(null);
  const [multipliers, setMultipliers] = useState<Multipliers>(DEFAULT_MULTIPLIERS);
  const [analyzeSeed, setAnalyzeSeed] = useState(1);

  const preview = useMemo<PixelBuffer | null>(() => {
    if (!state.source) return null;
    try { return runStackMemoized(state, { useMemo: true }); }
    catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); return null; }
  }, [state]);

  useEffect(() => {
    if (lastUrlRef.current) { try { URL.revokeObjectURL(lastUrlRef.current); } catch { /* ignore */ } }
    if (!preview) { setPreviewUrl(null); lastUrlRef.current = null; return; }
    try {
      const url = pixelBufferToObjectUrl(preview);
      lastUrlRef.current = url;
      setPreviewUrl(url);
    } catch (e: any) {
      setStatus({ text: `preview encode failed: ${e?.message ?? e}`, kind: "err" });
    }
  }, [preview]);

  function pushHistory(buf: PixelBuffer) { setHistory((h) => [...h, buf].slice(-8)); }

  async function onIngest(source: "selection" | "layer" | "file") {
    setBusy(true); setStatus({ text: "reading pixels…", kind: "info" });
    try {
      const r = source === "selection" ? await ingestFromSelection() :
                source === "layer"     ? await ingestFromActiveLayer() :
                                         await ingestFromFile();
      const cur = state.source;
      if (cur) pushHistory(cur);
      setState((s) => setSource(s, r.buffer));
      setStatus({ text: `ingested: ${r.sourceLabel}`, kind: "ok" });
    } catch (e: any) {
      setStatus({ text: e?.message ?? String(e), kind: "err" });
    } finally { setBusy(false); }
  }

  async function onCommit() {
    if (!preview) { setStatus({ text: "nothing to commit — ingest a tip first", kind: "err" }); return; }
    setBusy(true); setStatus({ text: "committing as brush…", kind: "info" });
    try {
      const r = await commitTipAsBrush(preview, "BrushBuddy Tip");
      setStatus({ text: `committed: ${r.brushName}`, kind: "ok" });
      props.onCommitted?.(r.brushName);
    } catch (e: any) {
      setStatus({ text: e?.message ?? String(e), kind: "err" });
    } finally { setBusy(false); }
  }

  function onUseVector() {
    const shape: VectorShape = VECTOR_PRESETS[vecPreset];
    const buf = rasterizeShape(shape, vecSize, vecSize);
    if (state.source) pushHistory(state.source);
    setState((s) => setSource(s, buf));
    setStatus({ text: `vector → ${vecPreset} ${vecSize}×${vecSize}`, kind: "ok" });
  }

  function onGenerate() {
    try {
      const buf = runGenerator(gen);
      if (state.source) pushHistory(state.source);
      setState((s) => setSource(s, buf));
      setStatus({ text: `generated ${gen.kind} ${gen.size}×${gen.size}`, kind: "ok" });
    } catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); }
  }

  function getCanvasSize(): number {
    if (state.source) return Math.max(state.source.width, state.source.height);
    return 256;
  }

  function onStamp() {
    if (!state.source) { setStatus({ text: "no source — pick one first", kind: "err" }); return; }
    const size = getCanvasSize();
    try {
      let out = compose(state.source, {
        width: size, height: size,
        layout: comp.layout, count: comp.count, seed: comp.seed,
        variation: { ...DEFAULT_VARIATION, positionJitterPx: comp.posJit, scaleMin: comp.scaleMin, scaleMax: comp.scaleMax, rotationJitterDeg: comp.rotJit, rotationFollowTangent: comp.follow },
        vectorShape: comp.layout === "vectorPath" ? VECTOR_PRESETS[comp.pathPreset] : null,
        lineFrom: { x: 0.1, y: 0.5 }, lineTo: { x: 0.9, y: 0.5 },
        blend: comp.blend,
      });
      if (comp.preserveRange) out = preserveRange(state.source, out);
      pushHistory(state.source);
      setState((s) => setSource(s, out));
      setStatus({ text: `stamped ×${comp.count} via ${comp.layout} (${comp.blend}${comp.preserveRange ? ", range-preserved" : ""})`, kind: "ok" });
    } catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); }
  }

  function onDiverge() {
    if (!state.source) return;
    pushHistory(state.source);
    setState((s) => setSource(s, diverge(state.source!, { seed: comp.seed })));
    setStatus({ text: "diverged", kind: "ok" });
  }
  function onSettle() {
    if (!state.source) return;
    let out = settle(state.source, { seed: comp.seed });
    out = gaussianBlur(out, { radiusPx: 2 });
    out = threshold(out, { value: 96, soft: 8 });
    out = autoCrop(out, { paddingPx: 4 });
    pushHistory(state.source);
    setState((s) => setSource(s, out));
    setStatus({ text: "settled", kind: "ok" });
  }
  function onStepBack() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setState((s) => setSource(s, prev));
      return h.slice(0, -1);
    });
  }

  function onAnalyze() {
    if (!state.source) { setStatus({ text: "ingest or generate a source first", kind: "err" }); return; }
    setBusy(true);
    try {
      const ms = extractMarks(state.source);
      const fp = computeFingerprint(ms, state.source.width, state.source.height);
      setMarks(ms);
      setFingerprint(fp);
      setStatus({ text: `analyzed: ${ms.length} marks`, kind: ms.length > 0 ? "ok" : "err" });
    } catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); }
    finally { setBusy(false); }
  }

  function onStampFromFingerprint() {
    if (!state.source || !fingerprint) { setStatus({ text: "analyze first", kind: "err" }); return; }
    const size = getCanvasSize();
    const tipPx = Math.max(state.source.width, state.source.height);
    const placements = regeneratePlacements(fingerprint, multipliers, { width: size, height: size, seed: analyzeSeed, sourceTipSize: tipPx });
    try {
      const out = compose(state.source, {
        width: size, height: size,
        layout: "fingerprint", count: placements.length, seed: analyzeSeed,
        variation: { ...DEFAULT_VARIATION },
        fingerprintPlacements: placements,
        blend: "max",
      });
      pushHistory(state.source);
      setState((s) => setSource(s, out));
      setStatus({ text: `regenerated ${placements.length} marks`, kind: "ok" });
    } catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); }
  }

  function onAdd() {
    const op: Omit<Op, "id"> = { kind: addPick, enabled: true, params: defaultParamsFor(addPick) };
    setState((s) => addOp(s, op));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Source row — always visible */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button onClick={() => onIngest("selection")} disabled={busy} style={styles.smBtn}>from selection</button>
        <button onClick={() => onIngest("layer")}     disabled={busy} style={styles.smBtn}>from layer</button>
        <button onClick={() => onIngest("file")}      disabled={busy} style={styles.smBtn}>from file…</button>
      </div>

      {/* Preview — always visible */}
      <div style={{ background: "repeating-conic-gradient(#222 0 25%, #333 0 50%) 0 0/16px 16px", borderRadius: 4, padding: 8, display: "flex", justifyContent: "center", alignItems: "center", minHeight: 120 }}>
        {previewUrl
          ? <img src={previewUrl} style={{ maxWidth: "100%", maxHeight: 220, imageRendering: "pixelated" }} />
          : <div style={{ color: "#555", fontSize: 11 }}>no source — ingest, generate, or pick a vector</div>}
      </div>
      {preview && (
        <div style={{ color: "#888", fontSize: 11, textAlign: "center" }}>{preview.width} × {preview.height}</div>
      )}

      {/* Commit — always visible */}
      <button onClick={onCommit} disabled={busy || !preview} style={styles.primaryBtn}>Commit as brush</button>

      <Section title="Vector source">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {PRESET_NAMES.map((name) => (
              <button key={name} onClick={() => setVecPreset(name)}
                style={{ ...styles.smBtn, flex: "0 0 auto", background: vecPreset === name ? "#1473e6" : "#3a3a3a", border: vecPreset === name ? "1px solid #1473e6" : "1px solid #555" }}>
                {name}
              </button>
            ))}
          </div>
          <RowSlider label="size" value={vecSize} min={32} max={1024} step={16} onChange={setVecSize} />
          <button onClick={onUseVector} style={{ ...styles.smBtn, background: "#1473e6", color: "white", border: "1px solid #1473e6" }}>Rasterize as source</button>
        </div>
      </Section>

      <Section title="Generators (Perlin / Worley / Voronoi / Canvas)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["perlin", "worley", "voronoi", "canvas"] as GeneratorKind[]).map((k) => (
              <button key={k} onClick={() => setGen((g) => ({ ...g, kind: k }))}
                style={{ ...styles.smBtn, background: gen.kind === k ? "#1473e6" : "#3a3a3a", border: gen.kind === k ? "1px solid #1473e6" : "1px solid #555" }}>{k}</button>
            ))}
          </div>
          <RowSlider label="size" value={gen.size} min={32} max={1024} step={16} onChange={(v) => setGen((g) => ({ ...g, size: v }))} />
          <RowSlider label={gen.kind === "canvas" ? "pitch" : gen.kind === "perlin" ? "scale" : "cell"} value={gen.scale} min={2} max={256} onChange={(v) => setGen((g) => ({ ...g, scale: v }))} />
          <RowSlider label={gen.kind === "perlin" ? "octaves" : "jitter"} value={gen.detail} min={gen.kind === "perlin" ? 1 : 0} max={gen.kind === "perlin" ? 8 : 100} onChange={(v) => setGen((g) => ({ ...g, detail: v }))} />
          <RowSlider label={gen.kind === "perlin" ? "persist" : gen.kind === "worley" ? "mode" : gen.kind === "voronoi" ? "mode" : "contrast"}
                     value={gen.variant} min={0} max={gen.kind === "worley" ? 2 : 100}
                     onChange={(v) => setGen((g) => ({ ...g, variant: v }))}
                     valueLabel={gen.kind === "worley" ? (["F1", "F2", "F2-F1"][Math.round(gen.variant)] ?? "F1") : gen.kind === "voronoi" ? (gen.variant >= 50 ? "edges" : "value") : String(gen.variant)} />
          <SeedRow value={gen.seed} onChange={(v) => setGen((g) => ({ ...g, seed: v }))} />
          <button onClick={onGenerate} style={{ ...styles.smBtn, background: "#1473e6", color: "white", border: "1px solid #1473e6" }}>Generate as source</button>
        </div>
      </Section>

      <Section title="Composer (feedback loop)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["scatter", "grid", "line", "vectorPath"] as LayoutKind[]).map((k) => (
              <button key={k} onClick={() => setComp((c) => ({ ...c, layout: k }))}
                style={{ ...styles.smBtn, background: comp.layout === k ? "#1473e6" : "#3a3a3a", border: comp.layout === k ? "1px solid #1473e6" : "1px solid #555" }}>{k}</button>
            ))}
          </div>
          {comp.layout === "vectorPath" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {PRESET_NAMES.map((name) => (
                <button key={name} onClick={() => setComp((c) => ({ ...c, pathPreset: name }))}
                  style={{ ...styles.smBtn, flex: "0 0 auto", fontSize: 10, padding: "3px 6px", background: comp.pathPreset === name ? "#1473e6" : "#3a3a3a", border: comp.pathPreset === name ? "1px solid #1473e6" : "1px solid #555" }}>{name}</button>
              ))}
            </div>
          )}
          <RowSlider label="count"   value={comp.count}  min={1}    max={64}  onChange={(v) => setComp((c) => ({ ...c, count: v }))} />
          <RowSlider label="pos jit" value={comp.posJit} min={0}    max={200} onChange={(v) => setComp((c) => ({ ...c, posJit: v }))} />
          <RowSlider label="scale min" value={Math.round(comp.scaleMin * 100)} min={5} max={200} onChange={(v) => setComp((c) => ({ ...c, scaleMin: v / 100 }))} />
          <RowSlider label="scale max" value={Math.round(comp.scaleMax * 100)} min={5} max={200} onChange={(v) => setComp((c) => ({ ...c, scaleMax: v / 100 }))} />
          <RowSlider label="rot jit°"  value={comp.rotJit} min={0} max={360} onChange={(v) => setComp((c) => ({ ...c, rotJit: v }))} />
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#bbb", fontSize: 11 }}>
            <input type="checkbox" checked={comp.follow} onChange={(e) => setComp((c) => ({ ...c, follow: e.target.checked }))} />
            rotate to follow path tangent
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "65px 1fr", gap: 4, alignItems: "center", fontSize: 11 }}>
            <span style={{ color: "#888" }}>blend</span>
            <select
              value={comp.blend}
              onChange={(e) => setComp((c) => ({ ...c, blend: e.target.value as BlendMode }))}
              style={selectStyle}
            >
              <option value="over">over (natural alpha blend)</option>
              <option value="max">max / lighten (accumulates light)</option>
              <option value="min">min / darken (accumulates dark)</option>
              <option value="average">average (mean of stamps)</option>
              <option value="sum">sum (additive, clipped)</option>
            </select>
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#bbb", fontSize: 11 }}>
            <input type="checkbox" checked={comp.preserveRange}
                   onChange={(e) => setComp((c) => ({ ...c, preserveRange: e.target.checked }))} />
            preserve range (remap output to source's brightness envelope)
          </label>
          <SeedRow value={comp.seed} onChange={(v) => setComp((c) => ({ ...c, seed: v }))} />
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={onStamp}    disabled={busy || !state.source} style={{ ...styles.smBtn, background: "#1473e6", color: "white", border: "1px solid #1473e6" }}>Stamp</button>
            <button onClick={onSettle}   disabled={busy || !state.source} style={styles.smBtn}>Settle</button>
            <button onClick={onDiverge}  disabled={busy || !state.source} style={styles.smBtn}>Diverge</button>
            <button onClick={onStepBack} disabled={busy || history.length === 0} style={styles.smBtn}>↶ back ({history.length})</button>
          </div>
          {history.length > 0 && (
            <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "2px 0" }}>
              {history.map((h, i) => (
                <HistoryThumb key={i} buf={h} onClick={() => {
                  setHistory((arr) => arr.slice(0, i));
                  setState((s) => setSource(s, h));
                }} />
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section title="Analyze (extract → fingerprint → regenerate)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={onAnalyze} disabled={busy || !state.source} style={styles.smBtn}>
            Analyze current source
          </button>
          {fingerprint && marks && (
            <div style={{ background: "#1c1c1c", border: "1px solid #333", borderRadius: 4, padding: 6, fontSize: 10, color: "#bbb", lineHeight: 1.5 }}>
              <div style={{ color: "#80e080", marginBottom: 3, fontWeight: 600 }}>{marks.length} marks detected</div>
              {summarizeFingerprint(fingerprint).map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
          {fingerprint && (
            <>
              <div style={{ color: "#888", fontSize: 10, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>Multipliers (1× = match reference)</div>
              <RowSlider label="density"     value={Math.round(multipliers.density   * 100)} min={5}  max={400} onChange={(v) => setMultipliers((m) => ({ ...m, density: v / 100 }))}     valueLabel={multipliers.density.toFixed(2) + "×"} />
              <RowSlider label="size"        value={Math.round(multipliers.size      * 100)} min={5}  max={400} onChange={(v) => setMultipliers((m) => ({ ...m, size: v / 100 }))}        valueLabel={multipliers.size.toFixed(2) + "×"} />
              <RowSlider label="size spread" value={Math.round(multipliers.sizeSpread * 100)} min={0}  max={400} onChange={(v) => setMultipliers((m) => ({ ...m, sizeSpread: v / 100 }))} valueLabel={multipliers.sizeSpread.toFixed(2) + "×"} />
              <RowSlider label="alignment"   value={Math.round(multipliers.alignment * 100)} min={0}  max={400} onChange={(v) => setMultipliers((m) => ({ ...m, alignment: v / 100 }))}   valueLabel={multipliers.alignment.toFixed(2) + "×"} />
              <RowSlider label="rotate°"     value={multipliers.rotateDeg}                    min={-180} max={180} onChange={(v) => setMultipliers((m) => ({ ...m, rotateDeg: v }))}        valueLabel={multipliers.rotateDeg + "°"} />
              <RowSlider label="clustering"  value={Math.round(multipliers.clustering * 100)} min={0}  max={400} onChange={(v) => setMultipliers((m) => ({ ...m, clustering: v / 100 }))}  valueLabel={multipliers.clustering.toFixed(2) + "×"} />
              <RowSlider label="opacity"     value={Math.round(multipliers.opacity   * 100)} min={5}  max={400} onChange={(v) => setMultipliers((m) => ({ ...m, opacity: v / 100 }))}     valueLabel={multipliers.opacity.toFixed(2) + "×"} />
              <SeedRow value={analyzeSeed} onChange={setAnalyzeSeed} />
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={onStampFromFingerprint} disabled={busy} style={{ ...styles.smBtn, background: "#1473e6", color: "white", border: "1px solid #1473e6" }}>
                  Stamp from fingerprint
                </button>
                <button onClick={() => setMultipliers(DEFAULT_MULTIPLIERS)} style={styles.smBtn}>reset</button>
              </div>
            </>
          )}
        </div>
      </Section>

      <Section title="Op Stack">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <select value={addPick} onChange={(e) => setAddPick(e.target.value as OpKind)} style={selectStyle} disabled={!state.source}>
              {OP_KINDS.map((k) => <option key={k} value={k}>{opMeta(k).label}</option>)}
            </select>
            <button onClick={onAdd} disabled={busy || !state.source} style={styles.smBtn}>+ add</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {state.ops.length === 0 && (
              <div style={{ color: "#555", fontSize: 11, fontStyle: "italic" }}>
                {state.source ? "no ops yet — add one above" : "ingest a source first"}
              </div>
            )}
            {state.ops.map((op, i) => (
              <OpRow
                key={op.id} op={op} index={i} total={state.ops.length}
                onToggle={() => setState((s) => toggleOp(s, op.id))}
                onRemove={() => setState((s) => removeOp(s, op.id))}
                onMoveUp={() => setState((s) => moveOp(s, op.id, Math.max(0, i - 1)))}
                onMoveDown={() => setState((s) => moveOp(s, op.id, Math.min(state.ops.length - 1, i + 1)))}
                onParamChange={(name, value) => setState((s) => updateOpParams(s, op.id, { [name]: value }))}
              />
            ))}
          </div>
        </div>
      </Section>

      {status && (
        <div style={{ fontSize: 11, color: status.kind === "err" ? "#ff8080" : status.kind === "ok" ? "#80e080" : "#bbb" }}>
          {status.text}
        </div>
      )}
    </div>
  );
}

// ---------- helpers ----------

function RowSlider(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; valueLabel?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "65px 1fr 50px", gap: 4, alignItems: "center", fontSize: 11 }}>
      <span style={{ color: "#888" }}>{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={props.step ?? 1} value={props.value}
             onChange={(e) => props.onChange(Number(e.target.value))} />
      <span style={{ color: "#bbb", textAlign: "right" }}>{props.valueLabel ?? props.value}</span>
    </div>
  );
}

function SeedRow(props: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "65px 1fr auto", gap: 4, alignItems: "center", fontSize: 11 }}>
      <span style={{ color: "#888" }}>seed</span>
      <input type="number" value={props.value}
             onChange={(e) => props.onChange(Number(e.target.value) || 0)}
             style={styles.numInput} />
      <button onClick={() => props.onChange(Math.floor(Math.random() * 1e6))}
              style={{ ...styles.smBtn, padding: "2px 6px", fontSize: 10, flex: "0 0 auto" }}>🎲</button>
    </div>
  );
}

function HistoryThumb(props: { buf: PixelBuffer; onClick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    try { u = pixelBufferToObjectUrl(props.buf); setUrl(u); } catch { /* ignore */ }
    return () => { if (u) try { URL.revokeObjectURL(u); } catch { /* ignore */ } };
  }, [props.buf]);
  return (
    <button onClick={props.onClick} style={{ flex: "0 0 auto", padding: 0, border: "1px solid #444", background: "transparent", cursor: "pointer", borderRadius: 3 }}>
      {url ? <img src={url} style={{ width: 40, height: 40, display: "block", imageRendering: "pixelated" }} /> : <div style={{ width: 40, height: 40 }} />}
    </button>
  );
}

function OpRow(props: {
  op: Op; index: number; total: number;
  onToggle: () => void; onRemove: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
  onParamChange: (name: string, value: any) => void;
}) {
  const meta = opMeta(props.op.kind);
  return (
    <div style={{ background: props.op.enabled ? "#2a2a2a" : "#1c1c1c", border: "1px solid #3a3a3a", borderRadius: 4, padding: 6, fontSize: 11, opacity: props.op.enabled ? 1 : 0.55 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input type="checkbox" checked={props.op.enabled} onChange={props.onToggle} />
        <span style={{ flex: 1, fontWeight: 600 }}>{props.index + 1}. {meta.label}</span>
        <button onClick={props.onMoveUp}   disabled={props.index === 0}                style={iconBtn}>↑</button>
        <button onClick={props.onMoveDown} disabled={props.index === props.total - 1}  style={iconBtn}>↓</button>
        <button onClick={props.onRemove}  style={iconBtn}>✕</button>
      </div>
      {Object.keys(props.op.params).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {Object.entries(props.op.params).map(([name, value]) => (
            <ParamInput key={name} name={name} value={value} onChange={(v) => props.onParamChange(name, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ParamInput(props: { name: string; value: any; onChange: (v: any) => void }) {
  const t = typeof props.value;
  if (t === "boolean") {
    return (
      <label style={{ display: "flex", gap: 4, alignItems: "center", color: "#bbb" }}>
        <input type="checkbox" checked={props.value} onChange={(e) => props.onChange(e.target.checked)} />
        {props.name}
      </label>
    );
  }
  if (t === "number") {
    return (
      <label style={{ display: "flex", gap: 4, alignItems: "center", color: "#bbb" }}>
        <span style={{ color: "#888" }}>{props.name}</span>
        <input type="number" value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} style={{ ...styles.numInput, width: 64 }} />
      </label>
    );
  }
  if (t === "string") {
    return (
      <label style={{ display: "flex", gap: 4, alignItems: "center", color: "#bbb" }}>
        <span style={{ color: "#888" }}>{props.name}</span>
        <input type="text" value={props.value} onChange={(e) => props.onChange(e.target.value)} style={{ ...styles.numInput, width: 80 }} />
      </label>
    );
  }
  return null;
}

const iconBtn: React.CSSProperties = {
  background: "transparent", color: "#bbb",
  border: "1px solid #444", borderRadius: 3, padding: "0 6px",
  fontSize: 11, cursor: "pointer", lineHeight: "18px",
};
const selectStyle: React.CSSProperties = {
  flex: 1, background: "#1c1c1c", color: "#e6e6e6",
  border: "1px solid #555", borderRadius: 4, padding: "4px 6px", fontSize: 11,
};
