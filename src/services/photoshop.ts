// Thin wrappers over Photoshop's UXP DOM + batchPlay. Keeps brush logic decoupled
// from the host API surface so we can iterate quickly during the M0 spike.

import { app, action, core } from "photoshop";

export function getActiveDoc() {
  const doc = app.activeDocument;
  if (!doc) throw new Error("No active document.");
  return doc;
}

export async function executeAsModal<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return await core.executeAsModal(fn, { commandName: name });
}

/**
 * batchPlay wrapper. Returns the raw result array. Errors bubble with the
 * offending command's _obj attached to the message so we can tell which
 * descriptor PS rejected.
 */
export async function bp(commands: any[], options: any = {}): Promise<any[]> {
  try {
    const results = await action.batchPlay(commands, options);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r && typeof r === "object") {
        // PS error response shapes:
        //   { _obj: "error", message: "...", result: -128 }   (most common)
        //   { message: "...", number: N }                     (older form)
        const isErr =
          (r as any)._obj === "error" ||
          ((r as any).message && ((r as any).number || (r as any).result));
        if (isErr) {
          const obj = (commands[i] as any)?._obj ?? "(no _obj)";
          const msg = (r as any).message || `result=${(r as any).result}`;
          throw new Error(`PS rejected _obj="${obj}": ${msg}`);
        }
      }
    }
    return results;
  } catch (e: any) {
    const obj = (commands[0] as any)?._obj ?? "(no _obj)";
    if (e && typeof e === "object" && e.message && !String(e.message).includes("_obj=")) {
      e.message = `[${obj}] ${e.message}`;
    }
    throw e;
  }
}

/** Like bp() but swallows PS errors silently — for best-effort sub-steps. */
export async function bpSilent(commands: any[], options: any = {}): Promise<void> {
  try { await bp(commands, options); } catch { /* ignore */ }
}

/** Returns true if the brush tool is the currently active tool. */
export function isBrushToolActive(): boolean {
  try { return app.currentTool?.id === "paintbrushTool"; } catch { return false; }
}

/** Idempotent: only selects the brush tool if it isn't already active. */
export async function ensureBrushTool(): Promise<void> {
  if (isBrushToolActive()) return;
  await bpSilent([{
    _obj: "select",
    _target: [{ _ref: "paintbrushTool" }],
    _options: { dialogOptions: "dontDisplay" },
  }]);
}

export { app, action };
