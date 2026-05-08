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
 * batchPlay wrapper. Returns the raw result array. Errors bubble.
 * Pass {synchronousExecution:true} via options if a caller needs that.
 */
export async function bp(commands: any[], options: any = {}): Promise<any[]> {
  return await action.batchPlay(commands, options);
}

export { app, action };
