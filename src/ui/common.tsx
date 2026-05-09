// Shared UI primitives used by Panel and TipEditor.

import { ReactNode, useState } from "react";

/** Collapsible section with a clickable header. Defaults to collapsed. */
export function Section(props: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!!props.defaultOpen);
  return (
    <div style={{ borderTop: "1px solid #2a2a2a" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", textAlign: "left",
          background: "transparent", border: "none",
          color: "#bbb", fontSize: 11, padding: "6px 0",
          cursor: "pointer", fontWeight: 600,
          letterSpacing: 0.3,
        }}
      >
        {open ? "▼" : "▶"} {props.title}
      </button>
      {open && <div style={{ paddingBottom: 8 }}>{props.children}</div>}
    </div>
  );
}

export const styles = {
  smBtn: {
    background: "#3a3a3a", color: "#e6e6e6",
    border: "1px solid #555", borderRadius: 4, padding: "5px 8px",
    fontSize: 11, cursor: "pointer", flex: 1, minWidth: 0,
  } as React.CSSProperties,
  primaryBtn: {
    background: "#1473e6", color: "white",
    border: "none", borderRadius: 4, padding: "8px 12px",
    fontSize: 12, fontWeight: 600, cursor: "pointer",
  } as React.CSSProperties,
  secondaryBtn: {
    background: "#3a3a3a", color: "#e6e6e6",
    border: "1px solid #555", borderRadius: 4, padding: "8px 12px",
    fontSize: 12, cursor: "pointer",
  } as React.CSSProperties,
  numInput: {
    background: "#1c1c1c", color: "#e6e6e6",
    border: "1px solid #555", borderRadius: 3, padding: "2px 4px", fontSize: 11,
  } as React.CSSProperties,
};
