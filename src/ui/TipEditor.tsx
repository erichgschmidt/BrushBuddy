// Tip Editor — non-destructive op-stack editor for the brush tip.
// Wires together: ingest (read pixels) → opstack (apply chain) → canvas preview
// → commit (push back into PS as a new brush).

import { useEffect, useMemo, useRef, useState } from "react";
import { ingestFromSelection } from "../tip/ingest";
import {
  Op, OpKind, OpStackState, addOp, defaultParamsFor, opMeta, removeOp,
  runStackMemoized, setSource, toggleOp, updateOpParams, moveOp,
} from "../tip/opstack";
import { commitTipAsBrush } from "../tip/commit";
import type { PixelBuffer } from "../tip/types";

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compute the final preview buffer (memoized inside opstack).
  const preview = useMemo<PixelBuffer | null>(() => {
    if (!state.source) return null;
    try { return runStackMemoized(state, { useMemo: true }); }
    catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); return null; }
  }, [state]);

  // Render the preview to canvas whenever it changes.
  useEffect(() => {
    const cvs = canvasRef.current; if (!cvs) return;
    if (!preview) { cvs.width = 1; cvs.height = 1; return; }
    cvs.width = preview.width; cvs.height = preview.height;
    const ctx = cvs.getContext("2d"); if (!ctx) return;
    // UXP doesn't expose `ImageData` as a global — use ctx.createImageData and copy.
    const img = ctx.createImageData(preview.width, preview.height);
    img.data.set(preview.data);
    ctx.putImageData(img, 0, 0);
  }, [preview]);

  async function onIngest() {
    setBusy(true); setStatus({ text: "reading pixels…", kind: "info" });
    try {
      const r = await ingestFromSelection();
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
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onIngest} disabled={busy} style={btn}>Ingest from selection</button>
        <button onClick={onCommit} disabled={busy || !preview} style={primaryBtn}>Commit as brush</button>
      </div>

      <div style={{
        background: "#1c1c1c", borderRadius: 4, padding: 8,
        display: "flex", justifyContent: "center", alignItems: "center", minHeight: 120,
      }}>
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: "100%", maxHeight: 220,
            imageRendering: "pixelated",
            background: "repeating-conic-gradient(#222 0 25%, #333 0 50%) 0 0/16px 16px",
          }}
        />
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
        <button onClick={onAdd} disabled={busy || !state.source} style={btn}>+ add</button>
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

const btn: React.CSSProperties = {
  background: "#3a3a3a", color: "#e6e6e6",
  border: "1px solid #555", borderRadius: 4, padding: "6px 10px",
  fontSize: 12, cursor: "pointer", flex: 1,
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
