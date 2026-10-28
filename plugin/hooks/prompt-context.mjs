#!/usr/bin/env node
// UserPromptSubmit — name the open Everdict issues the prompt is about, ONCE each (DEFAUL-530).
//
// Specific beats general: prose at session start does not move behaviour; the record the user's words point at
// does. The read goes through the REST door (`bin/everdict-api list_issues`), so it leaves a receipt in the
// session journal like any other read. Ranking is local (`lib/issue-match.mjs`).
//
// FAILS OPEN AND SILENT: a deadline of 3s, no credential, a non-2xx, an unparsable answer — exit 0 with no
// output (and one ledger row). It never blocks a prompt past its deadline and never prints on failure.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextReadLine } from "./lib/contract.mjs";
import { families, rank } from "./lib/issue-match.mjs";
import { promptStatePath, readPromptState } from "./lib/prompt-state.mjs";
import { isSafeSessionId, receiptsInText } from "./lib/receipts.mjs";
import { resolveWorkspace } from "./lib/workspace.mjs";

const DEADLINE_MS = 3000;
const BUDGET = 1500;
const STATUSES = ["backlog", "todo", "in_progress", "in_review"];
const door = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "everdict-api");

const ledger = (reason, extra = {}) => {
  try {
    const dir = path.join(os.homedir(), ".everdict");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, "prompt-context.jsonl"),
      `${JSON.stringify({ at: new Date().toISOString(), outcome: "prompt_context_silent", reason, ...extra })}\n`,
    );
  } catch {
    // a local append that decides nothing
  }
};
const silent = (reason, extra) => {
  if (reason) ledger(reason, extra);
  process.exit(0);
};

let input;
try {
  input = JSON.parse(
    await new Promise((resolve) => {
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (d) => {
        buf += d;
      });
      process.stdin.on("end", () => resolve(buf));
    }),
  );
} catch {
  silent();
}
const cwd = typeof input?.cwd === "string" && input.cwd !== "" ? input.cwd : process.cwd();
const prompt = typeof input?.prompt === "string" ? input.prompt : "";
const session = input?.session_id;
if (prompt.trim() === "" || !isSafeSessionId(session)) silent();
const resolved = resolveWorkspace(cwd);
if (resolved?.kind !== "linked") silent();

const stateFile = promptStatePath(session);
const state = readPromptState(session);

// One door call per status; all in parallel, all killed at the deadline.
// The ids of the receipts these calls leave: the gate must not count the hook's OWN reads as the session's.
const children = [];
const ownReceipts = [];
const listStatus = (status) =>
  new Promise((resolve) => {
    const child = spawn(door, ["list_issues", "--query", `status=${status}`, "--query", "limit=200"], {
      cwd,
      env: { ...process.env, EVERDICT_SESSION_ID: session },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(child);
    let err = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => {
      err += d;
      for (const r of receiptsInText(err)) if (!ownReceipts.includes(r.id)) ownReceipts.push(r.id);
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => {
      if (code !== 0) return resolve(undefined);
      try {
        const items = JSON.parse(out)?.items;
        resolve(Array.isArray(items) ? items : undefined);
      } catch {
        resolve(undefined);
      }
    });
  });
const timer = new Promise((resolve) => setTimeout(() => resolve("deadline"), DEADLINE_MS));
const answered = await Promise.race([Promise.all(STATUSES.map(listStatus)), timer]);
// Written on EVERY exit past the door, silent or not: a read this hook made is never the session's own.
const remember = (extra = {}) => {
  try {
    mkdirSync(path.dirname(stateFile), { recursive: true });
    writeFileSync(
      stateFile,
      JSON.stringify({
        injected: state.injected,
        ids: state.ids,
        ...extra,
        ownReceipts: [...new Set([...state.ownReceipts, ...ownReceipts])],
      }),
    );
    return true;
  } catch {
    return false;
  }
};
if (answered === "deadline") {
  for (const child of children) child.kill("SIGKILL");
  remember();
  silent("deadline");
}
if (answered.some((a) => a === undefined)) {
  remember();
  silent("door_failed");
}
const open = answered
  .flat()
  .filter((i) => i && typeof i.id === "string" && typeof i.identifier === "string" && typeof i.title === "string");

const ranked = rank(prompt, open).filter((r) => !state.injected.includes(r.issue.identifier));
if (ranked.length === 0) {
  remember();
  silent();
}
const fams = families(ranked, open);

const cut = (title) => (title.length > 110 ? `${title.slice(0, 109)}…` : title);
const lineOf = (issue, matched) => `- ${issue.identifier} ${issue.status} — ${cut(issue.title)}${matched ? " ←" : ""}`;
const head = `Open Everdict issues this prompt touches (workspace ${resolved.workspace}):`;
const shown = [];
const shownIds = [];
const lines = [];
const closingLength = nextReadLine("ACME-0000").length + 8;
let used = head.length + closingLength + 2;
const add = (issue, matched) => {
  const line = lineOf(issue, matched);
  // EVERY id already injected is skipped — family roots and children too, not only ranked matches.
  if (used + line.length + 1 > BUDGET || shown.includes(issue.identifier) || state.injected.includes(issue.identifier))
    return;
  used += line.length + 1;
  lines.push(line);
  shown.push(issue.identifier);
  shownIds.push(issue.id);
};
for (const f of fams) {
  add(f.root, f.matched.has(f.root.id));
  for (const kid of f.children) add(kid, f.matched.has(kid.id));
}
if (lines.length === 0) {
  remember();
  silent();
}
if (!remember({ injected: [...state.injected, ...shown], ids: [...state.ids, ...shownIds] }))
  silent("state_unwritable");
const closing = nextReadLine(shown[0]);
const payload = JSON.stringify({
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: [head, ...lines, closing].join("\n") },
});
await new Promise((resolve) => process.stdout.write(payload, resolve));
process.exit(0);
