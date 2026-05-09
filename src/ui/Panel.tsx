import { useEffect, useRef, useState } from "react";
import { captureFromSelection, readTipProps, setTipProps, getLastBrushName, TipProps } from "../services/brush";
import { TipEditor } from "./TipEditor";

export function Panel() {
  const [busy, setBusy] = useState(false);
  const [brushName, setBrushName] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: "info" | "ok" | "err" } | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [props, setProps] = useState<TipProps>({
    spacing: 25, diameter: 50, angle: 0, roundness: 100, hardness: 100, flipX: false, flipY: false,
  });

  // Debounce slider commits to PS — fire 50ms after last change.
  const debounceRef = useRef<number | null>(null);
  function commit(next: TipProps) {
    setProps(next);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try { await setTipProps(next); } catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); }
    }, 50);
  }

  async function onCapture() {
    setBusy(true); setStatus({ text: "capturing…", kind: "info" });
    try {
      const name = await captureFromSelection();
      await syncFromActive(name);
      setStatus({ text: `captured: ${name}`, kind: "ok" });
    } catch (e: any) {
      setStatus({ text: e?.message ?? String(e), kind: "err" });
    } finally { setBusy(false); }
  }

  // Read the currently active brush in PS and pull its tip-level props into
  // the sliders. Lets users dial in brushes they didn't capture themselves.
  async function syncFromActive(nameOverride?: string) {
    const cur = await readTipProps();
    setBrushName(nameOverride ?? cur.name);
    setProps({
      spacing: cur.spacing ?? 25,
      diameter: cur.diameter ?? 50,
      angle: cur.angle ?? 0,
      roundness: cur.roundness ?? 100,
      hardness: cur.hardness ?? 100,
      flipX: cur.flipX ?? false,
      flipY: cur.flipY ?? false,
    });
  }

  async function onSync() {
    setBusy(true); setStatus({ text: "syncing…", kind: "info" });
    try {
      await syncFromActive();
      setStatus({ text: "synced from active brush", kind: "ok" });
    } catch (e: any) {
      setStatus({ text: e?.message ?? String(e), kind: "err" });
    } finally { setBusy(false); }
  }

  // Called by the Tip Editor after `commitTipAsBrush` succeeds. The new brush
  // is now the active one — we apply the user's current slider values to it
  // so the dial-in work isn't lost.
  async function onCommittedNewBrush(name: string) {
    setBrushName(name);
    try { await setTipProps(props); }
    catch (e: any) { setStatus({ text: `applied tip but failed to set props: ${e?.message ?? e}`, kind: "err" }); }
  }

  // Restore last brush name on mount.
  useEffect(() => { setBrushName(getLastBrushName()); }, []);

  return (
    <div style={{ padding: 12, fontSize: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>BrushBuddy</div>
        <div style={{ color: "#888", fontSize: 11 }}>
          {brushName ? `active: ${brushName}` : "no brush captured yet"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onCapture} disabled={busy} style={{ ...primaryBtn, flex: 1 }}>
          Capture from selection
        </button>
        <button onClick={onSync} disabled={busy} style={{ ...secondaryBtn, flex: "0 0 auto" }} title="Read tip-level props from PS's currently active brush">
          Sync
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Slider label="Spacing"   value={props.spacing!}   min={1}   max={1000} unit="%"  onChange={(v) => commit({ ...props, spacing: v })} />
        <Slider label="Diameter"  value={props.diameter!}  min={1}   max={2500} unit="px" onChange={(v) => commit({ ...props, diameter: v })} />
        <Slider label="Angle"     value={props.angle!}     min={-180} max={180} unit="°"  onChange={(v) => commit({ ...props, angle: v })} />
        <Slider label="Roundness" value={props.roundness!} min={0}   max={100}  unit="%"  onChange={(v) => commit({ ...props, roundness: v })} />
        <Slider label="Hardness"  value={props.hardness!}  min={0}   max={100}  unit="%"  onChange={(v) => commit({ ...props, hardness: v })} />
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <Toggle label="Flip X" value={props.flipX!} onChange={(v) => commit({ ...props, flipX: v })} />
          <Toggle label="Flip Y" value={props.flipY!} onChange={(v) => commit({ ...props, flipY: v })} />
        </div>
      </div>

      <div style={{ borderTop: "1px solid #3a3a3a", paddingTop: 8 }}>
        <button
          onClick={() => setShowEditor((v) => !v)}
          style={{
            background: "transparent", border: "1px solid #444", color: "#bbb",
            borderRadius: 4, padding: "6px 10px", fontSize: 12, width: "100%", cursor: "pointer",
          }}
        >
          {showEditor ? "▼ Tip Editor" : "▶ Tip Editor (op stack)"}
        </button>
      </div>
      {showEditor && (
        <div style={{ borderTop: "1px solid #2a2a2a", paddingTop: 8 }}>
          <TipEditor onCommitted={onCommittedNewBrush} />
        </div>
      )}

      <div style={{ borderTop: "1px solid #3a3a3a", paddingTop: 8, fontSize: 11, color: "#888", lineHeight: 1.4 }}>
        For dynamics (Shape Dynamics, Scattering, Texture, Transfer, Dual Brush, etc.), use Photoshop's Brush Settings panel (<kbd>F5</kbd>). PS's preview area shows live results.
      </div>

      {status && (
        <div style={{ fontSize: 11, color: status.kind === "err" ? "#ff8080" : status.kind === "ok" ? "#80e080" : "#bbb" }}>
          {status.text}
        </div>
      )}
    </div>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", color: "#bbb", fontSize: 11, marginBottom: 2 }}>
        <span>{props.label}</span>
        <span style={{ color: "#888" }}>{Math.round(props.value)}{props.unit}</span>
      </div>
      <input
        type="range"
        min={props.min} max={props.max} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", color: "#bbb", fontSize: 11, cursor: "pointer" }}>
      <input type="checkbox" checked={props.value} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

const primaryBtn: React.CSSProperties = {
  background: "#1473e6",
  color: "white",
  border: "none",
  borderRadius: 4,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  background: "#3a3a3a",
  color: "#e6e6e6",
  border: "1px solid #555",
  borderRadius: 4,
  padding: "8px 12px",
  fontSize: 12,
  cursor: "pointer",
};
