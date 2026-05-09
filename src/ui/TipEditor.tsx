// Tip Editor — non-destructive op-stack editor for the brush tip.
// Wires together: ingest (read pixels) → opstack (apply chain) → canvas preview
// → commit (push back into PS as a new brush).

import { useEffect, useMemo, useRef, useState } from "react";
import { ingestFromSelection, ingestFromActiveLayer, ingestFromFile } from "../tip/ingest";
import {
  Op, OpKind, OpStackState, addOp, defaultParamsFor, opMeta, removeOp,
  runStackMemoized, setSource, toggleOp, updateOpParams, moveOp,
} from "../tip/opstack";
import { commitTipAsBrush } from "../tip/commit";
import { probeStamp } from "../tip/stampProbe";
import { pixelBufferToObjectUrl } from "../tip/png";
import {
  generatePerlin, generateWorley, generateVoronoi, generateCanvasWeave,
} from "../tip/generators";
import type { PixelBuffer } from "../tip/types";

type GeneratorKind = "perlin" | "worley" | "voronoi" | "canvas";

interface GenParams {
  kind: GeneratorKind;
  size: number;
  scale: number;     // perlin/canvas: feature size; worley/voronoi: cell size
  detail: number;    // perlin: octaves; worley: jitter*100; voronoi: jitter*100; canvas: jitter*100
  variant: number;   // perlin: persistence*100; worley: 0=F1 1=F2 2=F2-F1; voronoi: 0=value 1=edges; canvas: contrast*100
  seed: number;
}

function runGenerator(p: GenParams): PixelBuffer {
  const size = Math.max(16, Math.min(2500, p.size | 0));
  switch (p.kind) {
    case "perlin":
      return generatePerlin({
        width: size, height: size,
        scale: p.scale, octaves: Math.max(1, Math.min(8, Math.round(p.detail))),
        persistence: p.variant / 100, lacunarity: 2, seed: p.seed,
      });
    case "worley": {
      const modes = ["F1", "F2", "F2-F1"] as const;
      return generateWorley({
        width: size, height: size,
        cellSize: p.scale, jitter: p.detail / 100,
        mode: modes[Math.max(0, Math.min(2, Math.round(p.variant)))],
        seed: p.seed,
      });
    }
    case "voronoi":
      return generateVoronoi({
        width: size, height: size,
        cellSize: p.scale, jitter: p.detail / 100,
        mode: p.variant >= 50 ? "edges" : "value",
        seed: p.seed,
      });
    case "canvas":
      return generateCanvasWeave({
        width: size, height: size,
        pitch: p.scale, jitter: p.detail / 100,
        contrast: p.variant / 100, seed: p.seed,
      });
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
  const [gen, setGen] = useState<GenParams>({
    kind: "perlin", size: 256, scale: 32, detail: 4, variant: 50, seed: 1,
  });
  const [showGen, setShowGen] = useState(false);

  // Compute the final preview buffer (memoized inside opstack).
  const preview = useMemo<PixelBuffer | null>(() => {
    if (!state.source) return null;
    try { return runStackMemoized(state, { useMemo: true }); }
    catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); return null; }
  }, [state]);

  // Encode preview to a PNG Blob URL whenever it changes.
  // (UXP's canvas 2D context lacks ImageData/createImageData, so we use <img>.)
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

  async function onIngest(source: "selection" | "layer" | "file") {
    setBusy(true); setStatus({ text: "reading pixels…", kind: "info" });
    try {
      const r =
        source === "selection" ? await ingestFromSelection() :
        source === "layer"     ? await ingestFromActiveLayer() :
                                 await ingestFromFile();
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

  function onAdd() {
    const op: Omit<Op, "id"> = { kind: addPick, enabled: true, params: defaultParamsFor(addPick) };
    setState((s) => addOp(s, op));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button onClick={() => onIngest("selection")} disabled={busy} style={smBtn}>from selection</button>
        <button onClick={() => onIngest("layer")}     disabled={busy} style={smBtn}>from layer</button>
        <button onClick={() => onIngest("file")}      disabled={busy} style={smBtn}>from file…</button>
        <button onClick={() => setShowGen((v) => !v)} disabled={busy} style={smBtn}>
          {showGen ? "▼ generate" : "▶ generate"}
        </button>
      </div>

      {showGen && (
        <div style={{ background: "#1c1c1c", border: "1px solid #3a3a3a", borderRadius: 4, padding: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(["perlin", "worley", "voronoi", "canvas"] as GeneratorKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setGen((g) => ({ ...g, kind: k }))}
                style={{
                  ...smBtn,
                  background: gen.kind === k ? "#1473e6" : "#3a3a3a",
                  border: gen.kind === k ? "1px solid #1473e6" : "1px solid #555",
                }}
              >{k}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 4, alignItems: "center", fontSize: 11 }}>
            <span style={{ color: "#888" }}>size</span>
            <input type="range" min={32} max={1024} step={16} value={gen.size}
                   onChange={(e) => setGen((g) => ({ ...g, size: Number(e.target.value) }))} />
            <span style={{ color: "#bbb", width: 36, textAlign: "right" }}>{gen.size}</span>

            <span style={{ color: "#888" }}>{gen.kind === "canvas" ? "pitch" : gen.kind === "perlin" ? "scale" : "cell"}</span>
            <input type="range" min={2} max={256} step={1} value={gen.scale}
                   onChange={(e) => setGen((g) => ({ ...g, scale: Number(e.target.value) }))} />
            <span style={{ color: "#bbb", width: 36, textAlign: "right" }}>{gen.scale}</span>

            <span style={{ color: "#888" }}>{gen.kind === "perlin" ? "octaves" : "jitter"}</span>
            <input type="range" min={gen.kind === "perlin" ? 1 : 0} max={gen.kind === "perlin" ? 8 : 100} step={1} value={gen.detail}
                   onChange={(e) => setGen((g) => ({ ...g, detail: Number(e.target.value) }))} />
            <span style={{ color: "#bbb", width: 36, textAlign: "right" }}>{gen.detail}</span>

            <span style={{ color: "#888" }}>{
              gen.kind === "perlin" ? "persist" :
              gen.kind === "worley" ? "mode" :
              gen.kind === "voronoi" ? "mode" :
              "contrast"
            }</span>
            <input type="range"
                   min={0}
                   max={gen.kind === "worley" ? 2 : 100}
                   step={1}
                   value={gen.variant}
                   onChange={(e) => setGen((g) => ({ ...g, variant: Number(e.target.value) }))} />
            <span style={{ color: "#bbb", width: 60, textAlign: "right" }}>{
              gen.kind === "worley" ? (["F1", "F2", "F2-F1"][Math.round(gen.variant)] ?? "F1") :
              gen.kind === "voronoi" ? (gen.variant >= 50 ? "edges" : "value") :
              gen.variant
            }</span>

            <span style={{ color: "#888" }}>seed</span>
            <input type="number" value={gen.seed}
                   onChange={(e) => setGen((g) => ({ ...g, seed: Number(e.target.value) || 0 }))}
                   style={{ background: "#1c1c1c", color: "#e6e6e6", border: "1px solid #555", borderRadius: 3, padding: "2px 4px", fontSize: 11 }} />
            <button onClick={() => setGen((g) => ({ ...g, seed: Math.floor(Math.random() * 1e6) }))}
                    style={{ ...smBtn, padding: "2px 6px", fontSize: 10 }}>🎲</button>
          </div>
          <button
            onClick={() => {
              try {
                const buf = runGenerator(gen);
                setState((s) => setSource(s, buf));
                setStatus({ text: `generated ${gen.kind} ${gen.size}×${gen.size}`, kind: "ok" });
              } catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); }
            }}
            style={{ ...smBtn, background: "#1473e6", color: "white", border: "1px solid #1473e6" }}
          >Generate as source</button>
        </div>
      )}
      <button
        onClick={async () => {
          setBusy(true); setStatus({ text: "probing stamp events…", kind: "info" });
          try {
            const r = await probeStamp();
            const winners = r.filter((x) => x.ok).map((x) => x.label);
            setStatus({
              text: winners.length
                ? `stamp probe: WINNERS = ${winners.join(", ")} — see devtools console for full results`
                : `stamp probe: no event accepted (${r.length} tried). Console has details.`,
              kind: winners.length ? "ok" : "err",
            });
          } catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); }
          finally { setBusy(false); }
        }}
        disabled={busy}
        style={{ ...smBtn, fontSize: 10, opacity: 0.7 }}
        title="Spike: see if PS will accept a programmatic single brush dab. Required to extract tip pixels from arbitrary brushes."
      >debug: probe stamp events</button>
      <button onClick={onCommit} disabled={busy || !preview} style={primaryBtn}>Commit as brush</button>

      <div style={{
        background: "repeating-conic-gradient(#222 0 25%, #333 0 50%) 0 0/16px 16px",
        borderRadius: 4, padding: 8,
        display: "flex", justifyContent: "center", alignItems: "center", minHeight: 120,
      }}>
        {previewUrl
          ? <img src={previewUrl} style={{ maxWidth: "100%", maxHeight: 220, imageRendering: "pixelated" }} />
          : <div style={{ color: "#555", fontSize: 11 }}>no preview</div>}
      </div>
      {preview && (
        <div style={{ color: "#888", fontSize: 11, textAlign: "center" }}>
          {preview.width} × {preview.height}
        </div>
      )}

      <div style={{ display: "flex", gap: 4 }}>
        <select value={addPick} onChange={(e) => setAddPick(e.target.value as OpKind)} style={select} disabled={!state.source}>
          {OP_KINDS.map((k) => <option key={k} value={k}>{opMeta(k).label}</option>)}
        </select>
        <button onClick={onAdd} disabled={busy || !state.source} style={smBtn}>+ add</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {state.ops.length === 0 && (
          <div style={{ color: "#555", fontSize: 11, fontStyle: "italic" }}>
            {state.source ? "no ops yet — add one above" : "ingest a tip to start"}
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

      {status && (
        <div style={{ fontSize: 11, color: status.kind === "err" ? "#ff8080" : status.kind === "ok" ? "#80e080" : "#bbb" }}>
          {status.text}
        </div>
      )}
    </div>
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
    <div style={{
      background: props.op.enabled ? "#2a2a2a" : "#1c1c1c",
      border: "1px solid #3a3a3a",
      borderRadius: 4, padding: 6, fontSize: 11,
      opacity: props.op.enabled ? 1 : 0.55,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input type="checkbox" checked={props.op.enabled} onChange={props.onToggle} title="enable/disable" />
        <span style={{ flex: 1, fontWeight: 600 }}>{props.index + 1}. {meta.label}</span>
        <button onClick={props.onMoveUp}  disabled={props.index === 0}                 style={iconBtn} title="move up">↑</button>
        <button onClick={props.onMoveDown} disabled={props.index === props.total - 1}  style={iconBtn} title="move down">↓</button>
        <button onClick={props.onRemove}  style={iconBtn} title="remove">✕</button>
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
        <input
          type="number"
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
          style={{ ...numInput, width: 64 }}
        />
      </label>
    );
  }
  if (t === "string") {
    return (
      <label style={{ display: "flex", gap: 4, alignItems: "center", color: "#bbb" }}>
        <span style={{ color: "#888" }}>{props.name}</span>
        <input
          type="text"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          style={{ ...numInput, width: 80 }}
        />
      </label>
    );
  }
  return null;
}

const smBtn: React.CSSProperties = {
  background: "#3a3a3a", color: "#e6e6e6",
  border: "1px solid #555", borderRadius: 4, padding: "5px 8px",
  fontSize: 11, cursor: "pointer", flex: 1, minWidth: 0,
};
const primaryBtn: React.CSSProperties = {
  background: "#1473e6", color: "white",
  border: "none", borderRadius: 4, padding: "6px 10px",
  fontSize: 12, fontWeight: 600, cursor: "pointer", flex: 1,
};
const iconBtn: React.CSSProperties = {
  background: "transparent", color: "#bbb",
  border: "1px solid #444", borderRadius: 3, padding: "0 6px",
  fontSize: 11, cursor: "pointer", lineHeight: "18px",
};
const select: React.CSSProperties = {
  flex: 1, background: "#1c1c1c", color: "#e6e6e6",
  border: "1px solid #555", borderRadius: 4, padding: "4px 6px", fontSize: 11,
};
const numInput: React.CSSProperties = {
  background: "#1c1c1c", color: "#e6e6e6",
  border: "1px solid #555", borderRadius: 3, padding: "2px 4px", fontSize: 11,
};
