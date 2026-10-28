// WHAT THE PULL-REQUEST HOOK SAW, KEPT WHERE THE STOP GUARD CAN READ IT (DEFAUL-427).
//
// `pr-record-hook.mjs` turns a successful `gh pr create` / `gh pr merge` into a recorded pull request. A merge it
// SAW but could not RECORD (no bound issue, the door refused, the outcome was unknown) is owed, and the Stop guard
// refuses once, naming it. The two halves share this file so "owed" is one predicate (protocol L3), kept beside the
// door's own receipts: `~/.everdict/sessions/<session>/pull-requests.jsonl`, one JSON row per line.
//
//   {kind:"observed", at, url, number, state, recorded:true|false, reason?}   — one per PR the hook acted on
//   {kind:"refused", at, url}                                                  — the Stop guard spoke for this PR
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isSafeSessionId } from "./receipts.mjs";

export const prJournalPath = (sessionId, home = os.homedir()) =>
  isSafeSessionId(sessionId) ? path.join(home, ".everdict", "sessions", sessionId, "pull-requests.jsonl") : undefined;

export const appendPrRow = (sessionId, row, home) => {
  const file = prJournalPath(sessionId, home);
  if (file === undefined) return false;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`);
    return true;
  } catch {
    return false;
  }
};

export const readPrRows = (sessionId, home) => {
  const file = prJournalPath(sessionId, home);
  if (file === undefined || !existsSync(file)) return [];
  const rows = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // a torn last line while the hook is writing
    }
  }
  return rows;
};

/**
 * Merges the hook observed and could not record, that the Stop guard has not yet spoken for. A later recorded row
 * for the same url clears it (a retry that landed), and a `refused` row is the "once".
 */
export const owedMerges = (sessionId, home) => {
  const rows = readPrRows(sessionId, home);
  const owed = new Map();
  for (const row of rows) {
    if (row.kind === "observed" && row.state === "merged") {
      if (row.recorded === true) owed.delete(row.url);
      else owed.set(row.url, row);
    }
    if (row.kind === "refused") owed.delete(row.url);
  }
  return [...owed.values()];
};
