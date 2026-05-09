// JSON serialization for the op stack. Source pixels are NOT serialized —
// they're large and tied to PS state. On deserialize, the caller supplies
// the source separately.

import { PixelBuffer } from "./types";
import { Op, OpKind, OpStackState } from "./opstack";

interface SerializedOp {
  id: string;
  kind: OpKind;
  enabled: boolean;
  params: Record<string, any>;
}

interface SerializedStack {
  version: 1;
  ops: SerializedOp[];
}

export function serializeStack(state: OpStackState): string {
  const payload: SerializedStack = {
    version: 1,
    ops: state.ops.map((o) => ({
      id: o.id,
      kind: o.kind,
      enabled: o.enabled,
      params: o.params,
    })),
  };
  return JSON.stringify(payload);
}

export function deserializeStack(json: string, source: PixelBuffer | null): OpStackState {
  const parsed = JSON.parse(json) as SerializedStack;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.ops)) {
    throw new Error("opstack.serial: invalid or unsupported payload");
  }
  const ops: Op[] = parsed.ops.map((o) => ({
    id: o.id,
    kind: o.kind,
    enabled: !!o.enabled,
    params: { ...(o.params || {}) },
  }));
  return { source, ops };
}
