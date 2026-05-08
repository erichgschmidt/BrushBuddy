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
    // Some PS errors don't throw; they appear as a `message` on the result.
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r && typeof r === "object" && (r as any).message && (r as any).number) {
        const obj = (commands[i] as any)?._obj ?? "(no _obj)";
        throw new Error(`PS rejected _obj="${obj}": ${(r as any).message}`);
      }
    }
    return results;
  } catch (e: any) {
    // If the error doesn't already carry context, prepend the first _obj.
    const obj = (commands[0] as any)?._obj ?? "(no _obj)";
    if (e && typeof e === "object" && e.message && !String(e.message).includes("_obj=")) {
      e.message = `[${obj}] ${e.message}`;
    }
    throw e;
  }
}

export { app, action };
