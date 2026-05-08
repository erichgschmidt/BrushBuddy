import { useState, useCallback } from "react";
import {
  captureTipFromSelection,
  applyStippleDynamics,
  applyDualBrush,
  renderProofStroke,
  loopTest,
  cleanupVolatiles,
} from "../services/brush";

type LogEntry = { id: number; ts: string; level: "info" | "ok" | "err"; text: string };

export function Panel() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [cycles, setCycles] = useState(10);

  const append = useCallback((level: LogEntry["level"], text: string) => {
    setLog((prev) => [
      ...prev,
      { id: prev.length, ts: new Date().toLocaleTimeString(), level, text },
    ].slice(-200));
  }, []);

  const run = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    const t0 = performance.now();
    append("info", `→ ${label}`);
    try {
      const result = await fn();
      const dt = (performance.now() - t0).toFixed(0);
      append("ok", `✓ ${label} (${dt}ms)${result !== undefined ? ` ${JSON.stringify(result)}` : ""}`);
    } catch (e: any) {
      const dt = (performance.now() - t0).toFixed(0);
      append("err", `✗ ${label} (${dt}ms): ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [append]);

  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>BrushBuddy — M0 Spike</div>
      <div style={{ color: "#999", marginBottom: 12, lineHeight: 1.4 }}>
        Validate the dummy-brush loop. Make a rectangular selection on a layer with usable
        contrast, then run the buttons in order.
      </div>

      <Section label="1. Capture tip">
        <Btn disabled={busy} onClick={() => run("capture", () => captureTipFromSelection())}>
          Capture tip from selection
        </Btn>
      </Section>

      <Section label="2. Apply dynamics">
        <Btn disabled={busy} onClick={() => run("dynamics", () => applyStippleDynamics())}>
          Apply Stipple dynamics
        </Btn>
        <Btn disabled={busy} onClick={() => run("dual brush", () => applyDualBrush())}>
          Apply Dual Brush (risky)
        </Btn>
      </Section>

      <Section label="3. Render proof stroke">
        <Btn disabled={busy} onClick={() => run("proof stroke", () => renderProofStroke())}>
          Render proof stroke
        </Btn>
      </Section>

      <Section label="4. Loop test">
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span>cycles:</span>
          <input
            type="number"
            min={1}
            max={100}
            value={cycles}
            onChange={(e) => setCycles(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
            style={inputStyle}
          />
        </div>
        <Btn
          disabled={busy}
          onClick={() => run(`loop x${cycles}`, async () => {
            const r = await loopTest(cycles);
            return { median: `${r.medianMs.toFixed(0)}ms`, p95: `${r.p95Ms.toFixed(0)}ms`, samples: r.samplesMs.map(s => +s.toFixed(0)) };
          })}
        >
          Run loop ×{cycles}
        </Btn>
      </Section>

      <Section label="5. Cleanup">
        <Btn disabled={busy} onClick={() => run("cleanup", () => cleanupVolatiles())}>
          Remove proof layer
        </Btn>
      </Section>

      <div style={{ marginTop: 16, borderTop: "1px solid #444", paddingTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ color: "#999" }}>Log</span>
          <button onClick={() => setLog([])} style={{ ...btnStyle, fontSize: 10, padding: "2px 8px" }}>clear</button>
        </div>
        <div style={{ maxHeight: 240, overflow: "auto", fontFamily: "monospace", fontSize: 11, background: "#1c1c1c", borderRadius: 4, padding: 6 }}>
          {log.length === 0 ? <div style={{ color: "#555" }}>(no events yet)</div> : log.map(e => (
            <div key={e.id} style={{ color: e.level === "err" ? "#ff8080" : e.level === "ok" ? "#80e080" : "#bbb", whiteSpace: "pre-wrap" }}>
              [{e.ts}] {e.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section(props: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: "#888", fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{props.label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{props.children}</div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#3a3a3a",
  color: "#e6e6e6",
  border: "1px solid #555",
  borderRadius: 4,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};
const inputStyle: React.CSSProperties = {
  background: "#1c1c1c",
  color: "#e6e6e6",
  border: "1px solid #555",
  borderRadius: 4,
  padding: "2px 6px",
  fontSize: 12,
  width: 60,
};

function Btn(props: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      style={{ ...btnStyle, opacity: props.disabled ? 0.5 : 1, cursor: props.disabled ? "not-allowed" : "pointer" }}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}
