import { useEffect, useRef, useState } from "react";
import { captureFromSelection, readTipProps, setTipProps, getLastBrushName, TipProps } from "../services/brush";

export function Panel() {
  const [busy, setBusy] = useState(false);
  const [brushName, setBrushName] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: "info" | "ok" | "err" } | null>(null);
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
      const cur = await readTipProps();
      setBrushName(name);
      setProps({
        spacing: cur.spacing ?? 25,
        diameter: cur.diameter ?? 50,
        angle: cur.angle ?? 0,
        roundness: cur.roundness ?? 100,
        hardness: cur.hardness ?? 100,
        flipX: cur.flipX ?? false,
        flipY: cur.flipY ?? false,
      });
      setStatus({ text: `captured: ${name}`, kind: "ok" });
    } catch (e: any) {
      setStatus({ text: e?.message ?? String(e), kind: "err" });
    } finally { setBusy(false); }
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

      <button onClick={onCapture} disabled={busy} style={primaryBtn}>
        Capture from selection
      </button>

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
