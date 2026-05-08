import { Component, ReactNode } from "react";

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("[BrushBuddy] error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, fontSize: 12, color: "#ff8080" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>BrushBuddy crashed.</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.error.message)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
