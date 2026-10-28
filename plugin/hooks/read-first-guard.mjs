#!/usr/bin/env node
// PreToolUse (Read|Grep|Glob|Bash) — read the record before the repository, ONCE (DEFAUL-531).
//
// In a linked checkout, a session whose journal holds no Everdict READ receipt (any GET door call,
// `get_task_context`, `search_files`, or the prompt hook's own `list_issues` read) is denied its first Read,
// Grep, Glob or non-door Bash call, with the exact read to run. The second attempt passes regardless (a state
// file), so a user who says "skip it" is never stuck. A door call is never denied.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// HOT PATH: this runs before EVERY Read/Grep/Glob/Bash. Once the gate has fired or been satisfied, a call costs
// one existsSync — the heavier modules are imported only past that point.
const allow = () => process.exit(0);
let input;
try {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
  allow();
}
const session = input?.session_id;
if (typeof session !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(session)) allow();
if (!["Read", "Grep", "Glob", "Bash"].includes(input?.tool_name)) allow();
const dir = path.join(os.homedir(), ".everdict", "sessions", session);
const fired = path.join(dir, "read-first.json");
const satisfied = path.join(dir, "read-first-satisfied.json");
if (existsSync(fired) || existsSync(satisfied)) allow();
if (input.tool_name === "Bash" && /\beverdict-api\b/.test(String(input.tool_input?.command ?? ""))) allow();

const { readPromptState } = await import("./lib/prompt-state.mjs");
const { journalReceipts } = await import("./lib/receipts.mjs");
const { resolveWorkspace } = await import("./lib/workspace.mjs");
const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : process.cwd();
const resolved = resolveWorkspace(cwd);
if (resolved?.kind !== "linked") allow();

// Satisfied by (a) something the prompt hook INJECTED, or (b) a read the session made itself — a journal GET
// or get_task_context / search_files that is not one of the prompt hook's own list_issues calls.
const READ_OPS = new Set(["get_task_context", "search_files"]);
const state = readPromptState(session);
const own = new Set(state.ownReceipts);
const read =
  state.injected.length > 0 ||
  journalReceipts(session).some((r) => !own.has(r.id) && (r.method === "GET" || READ_OPS.has(r.op)));
const mark = (file, body) => {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(body));
    return true;
  } catch {
    return false;
  }
};
if (read) {
  mark(satisfied, { at: new Date().toISOString() });
  allow();
}
// cannot remember that it fired → it must not fire at all, or it could fire forever
if (!mark(fired, { deniedAt: new Date().toISOString() })) allow();

const shown = state.injected;
const repository = resolved.repository ?? "<owner>/<name>";
const read1 =
  shown.length > 0
    ? `everdict-api get_issue --id ${shown[0]}`
    : `everdict-api get_task_context --body '${JSON.stringify({ refs: [{ type: "repository", key: repository }] })}'`;
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: [
        `This session has read nothing from Everdict (workspace '${resolved.workspace}') yet — the record may already hold what you are about to derive.`,
        `Run this first: ${read1}`,
        "This is asked once: the same call again goes through.",
      ].join("\n"),
    },
  }),
);
process.exit(0);
