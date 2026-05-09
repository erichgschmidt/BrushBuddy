import { useEffect, useRef, useState } from "react";
import { captureFromSelection, readTipProps, setTipProps, getLastBrushName, TipProps } from "../services/brush";
import { TipEditor } from "./TipEditor";
import { Section, styles } from "./common";

type Tab = "brush" | "tip";

export function Panel() {
  const [tab, setTab] = useState<Tab>("brush");
  const [busy, setBusy] = useState(false);
  const [brushName, setBrushName] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: "info" | "ok" | "err" } | null>(null);
  const [props, setProps] = useState<TipProps>({
    spacing: 25, diameter: 50, angle: 0, roundness: 100, hardness: 100, flipX: false, flipY: false,
  });

  const debounceRef = useRef<number | null>(null);
  function commit(next: TipProps) {
    setProps(next);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try { await setTipProps(next); } catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); }
    }, 50);
  }

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

  async function onSync() {
    setBusy(true); setStatus({ text: "syncing…", kind: "info" });
    try { await syncFromActive(); setStatus({ text: "synced from active brush", kind: "ok" }); }
    catch (e: any) { setStatus({ text: e?.message ?? String(e), kind: "err" }); }
    finally { setBusy(false); }
  }

  async function onCommittedNewBrush(name: string) {
    setBrushName(name);
    try { await setTipProps(props); }
    catch (e: any) { setStatus({ text: `applied tip but failed to set props: ${e?.message ?? e}`, kind: "err" }); }
  }

  useEffect(() => { setBrushName(getLastBrushName()); }, []);

  return (
    <div style={{ padding: 10, fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>BrushBuddy</div>
        <div style={{ color: "#888", fontSize: 11 }}>
          {brushName ? `active: ${brushName}` : "no brush captured yet"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #3a3a3a" }}>
        <TabBtn active={tab === "brush"} onClick={() => setTab("brush")}>Brush</TabBtn>
        <TabBtn active={tab === "tip"}   onClick={() => setTab("tip")}>Tip Editor</TabBtn>
      </div>

      {tab === "brush" && (
        <BrushTab
          busy={busy}
          props={props}
          onCommitProps={commit}
          onCapture={onCapture}
          onSync={onSync}
        />
      )}

      {tab === "tip" && (
        <TipEditor onCommitted={onCommittedNewBrush} />
      )}

      {status && (
        <div style={{ fontSize: 11, color: status.kind === "err" ? "#ff8080" : status.kind === "ok" ? "#80e080" : "#bbb" }}>
          {status.text}
        </div>
      )}
    </div>
  );
}

function TabBtn(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        flex: 1,
        background: "transparent",
        color: props.active ? "#fff" : "#888",
        border: "none",
        borderBottom: props.active ? "2px solid #1473e6" : "2px solid transparent",
        padding: "6px 0",
        fontSize: 12, fontWeight: 600,
        cursor: "pointer",
      }}
    >{props.children}</button>
  );
}

function BrushTab(props: {
  busy: boolean;
  props: TipProps;
  onCommitProps: (p: TipProps) => void;
  onCapture: () => void;
  onSync: () => void;
}) {
  const { busy, props: p } = props;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={props.onCapture} disabled={busy} style={{ ...styles.primaryBtn, flex: 1 }}>
          Capture from selection
        </button>
        <button onClick={props.onSync} disabled={busy} style={{ ...styles.secondaryBtn, flex: "0 0 auto" }} title="Read tip-level props from PS's currently active brush">
          Sync
        </button>
      </div>

      <Section title="Tip Properties" defaultOpen={true}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Slider label="Spacing"   value={p.spacing!}   min={1}    max={1000} unit="%"  onChange={(v) => props.onCommitProps({ ...p, spacing: v })} />
          <Slider label="Diameter"  value={p.diameter!}  min={1}    max={2500} unit="px" onChange={(v) => props.onCommitProps({ ...p, diameter: v })} />
          <Slider label="Angle"     value={p.angle!}     min={-180} max={180}  unit="°"  onChange={(v) => props.onCommitProps({ ...p, angle: v })} />
          <Slider label="Roundness" value={p.roundness!} min={0}    max={100}  unit="%"  onChange={(v) => props.onCommitProps({ ...p, roundness: v })} />
          <Slider label="Hardness"  value={p.hardness!}  min={0}    max={100}  unit="%"  onChange={(v) => props.onCommitProps({ ...p, hardness: v })} />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Toggle label="Flip X" value={p.flipX!} onChange={(v) => props.onCommitProps({ ...p, flipX: v })} />
            <Toggle label="Flip Y" value={p.flipY!} onChange={(v) => props.onCommitProps({ ...p, flipY: v })} />
          </div>
        </div>
      </Section>

      <Section title="Help">
        <div style={{ fontSize: 11, color: "#888", lineHeight: 1.5 }}>
          For dynamics (Shape Dynamics, Scattering, Texture, Transfer, Dual Brush, etc.), use Photoshop's Brush Settings panel (<kbd>F5</kbd>). PS's preview area shows live results.
        </div>
      </Section>
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
      <input type="range" min={props.min} max={props.max} value={props.value}
             onChange={(e) => props.onChange(Number(e.target.value))} style={{ width: "100%" }} />
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
