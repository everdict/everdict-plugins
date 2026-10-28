// THE RECEIPT — WHAT A DOOR CALL LEAVES BEHIND, AND THE ONE READER OF IT (DEFAUL-296).
//
// `bin/everdict-api` is the only way the plugin reaches Everdict, so every write a session makes passes through
// it. Each call that reaches the server settles into ONE receipt, written to two places:
//
//   1. stderr, as the single line `EVERDICT_RECEIPT <json>` — a Bash tool result carries stderr, so the receipt
//      lands in the transcript even when stdout is piped to `jq`/`head`;
//   2. `~/.everdict/sessions/<session_id>/receipts.jsonl`, when `EVERDICT_SESSION_ID` is set — the copy a
//      swallowed stdout AND stderr (`2>/dev/null`) cannot take away.
//
// Every hook that used to look for an `mcp__…everdict…__<tool>` `tool_use` block reads these instead, through
// `ReceiptCollector` below: transcript lines first, in transcript order, then journal receipts the transcript did
// not carry, in `at` order, deduplicated by `id`. ONE reader, so a predicate is never written twice (protocol L3).
//
// ⚠️ A RECEIPT IS EVIDENCE OF WHAT THE DOOR DID, NOT AN AUTHORITY. It is a line of text a session's own shell can
// print; a hook that reads it decides what to ASK of the session (a round, a verdict), never what the server
// accepts. A forged receipt can only under-refuse, which is the direction these guards already fail in.
//
// ⚠️ ONLY A 2xx RECEIPT IS AN EFFECT. A 409 refused round is not "a round logged"; a `status: "unknown"` (transport
// failure) may or may not have landed, and a guard that asks "was it recorded" cannot answer yes to that.
// `landed(receipt)` is the one predicate for it.
import { randomUUID } from "node:crypto";
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { sessionTranscriptFiles } from "./session-transcripts.mjs";

/** The literal every receipt line starts with — and the needle every transcript pre-filter derives from. */
export const RECEIPT_MARKER = "EVERDICT_RECEIPT";

/** Ops whose request BODY is recorded with every value redacted (keys are kept). Listed so a gate can name them. */
export const REDACTED_BODY_OPS = Object.freeze([
  "set_secret",
  "set_workspace_image_registry",
  "probe_workspace_image_registry",
]);

const REDACTED = "[redacted]";
const redactValues = (node) => {
  if (Array.isArray(node)) return node.map(redactValues);
  if (node && typeof node === "object")
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, redactValues(v)]));
  return node === null || node === undefined ? node : REDACTED;
};

// ── the bounded projection of a request body (DEFAUL-305) ────────────────────────────────────────────────────
// The same allowlist discipline as `result`: a 16k-character brief or a whole `write_file` document must not become
// one stderr line in the model's context. Each entry is a dotted path a hook READS off `receipt.body`;
// Keep it in step with those readers by hand: the check that derived the set was deleted in DEFAUL-802.
export const BODY_FIELDS = Object.freeze([
  "changeCampaignId",
  "respondsTo",
  "disposition.kind",
  "disposition.directive.kind",
  "path",
  // What the plugin-trial grader reads (DEFAUL-314): a ref's type+key, the ids a retrieval used, the outcome text.
  "refs",
  "used",
  "outcome",
]);
const BODY_CLIP = 200;
const BODY_LIST_MAX = 50;

const projectMember = (v) => {
  if (typeof v === "string") return v.slice(0, BODY_CLIP);
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const out = {};
  for (const key of ["type", "key"]) if (typeof v[key] === "string") out[key] = v[key].slice(0, BODY_CLIP);
  return out;
};

const projectLeaf = (value) => {
  if (typeof value === "string") return value.slice(0, BODY_CLIP);
  if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  // A list keeps its LENGTH (a reader asks "is it non-empty"); its string members are clipped, an object member
  // keeps only its string `type` and `key` (a ref's identity), the rest are nulled.
  if (Array.isArray(value)) return value.slice(0, BODY_LIST_MAX).map(projectMember);
  return undefined;
};

export const projectBody = (body, fields = BODY_FIELDS) => {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const out = {};
  for (const field of fields) {
    const keys = field.split(".");
    let node = body;
    for (const key of keys) node = node !== null && typeof node === "object" ? node[key] : undefined;
    const value = projectLeaf(node);
    if (value === undefined) continue;
    let target = out;
    for (const key of keys.slice(0, -1)) target = target[key] ??= {};
    target[keys.at(-1)] = value;
  }
  return out;
};

// ── the bounded projection of a response ────────────────────────────────────────────────────────────────────
// Only what a hook decides on. An allowlist, so a secret in a response (`get_image_push_credentials`) cannot ride
// into a transcript, and so a receipt stays a line, not a document.
const clip = (value) => (typeof value === "string" ? value.slice(0, 200) : undefined);
const SCALARS = ["id", "tenant", "identifier", "state", "status", "kind"];
const scalarsOf = (node) => {
  const out = {};
  for (const key of SCALARS) {
    const value = clip(node?.[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
};
const delegationOf = (node) =>
  typeof node?.delegation?.required === "boolean" ? { required: node.delegation.required } : undefined;

export const projectResult = (parsed) => {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const out = scalarsOf(parsed);
  const delegation = delegationOf(parsed);
  if (delegation) out.delegation = delegation;
  const delegateStatus = clip(parsed.live?.delegate?.status);
  if (delegateStatus !== undefined) out.live = { delegate: { status: delegateStatus } };
  const dispositionKind = clip(parsed.disposition?.kind);
  if (dispositionKind !== undefined) out.disposition = { kind: dispositionKind };
  // `log_change_round` answers `{ record, round }`; `create_sandbox` may nest its row.
  for (const key of ["record", "round", "sandbox"]) {
    const nested = parsed[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const inner = { ...scalarsOf(nested) };
      const nestedDelegation = delegationOf(nested);
      if (nestedDelegation) inner.delegation = nestedDelegation;
      if (Object.keys(inner).length > 0) out[key] = inner;
    }
  }
  const endpoint = clip(parsed.grant?.endpoint);
  if (endpoint !== undefined && Array.isArray(parsed.grant?.repositories)) {
    out.grant = {
      endpoint,
      repositories: parsed.grant.repositories
        .filter((r) => typeof r === "string")
        .slice(0, 50)
        .map((r) => r.slice(0, 200)),
    };
  }
  return out;
};

// ── writing ─────────────────────────────────────────────────────────────────────────────────────────────────
/** `outcome` is the door's `send` result: `{kind:"response", status, text}` or `{kind:"transport", cause}`. */
export const buildReceipt = (
  call,
  outcome,
  parseText = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  },
) => ({
  v: 1,
  id: randomUUID(),
  at: new Date().toISOString(),
  op: call.op ?? null,
  method: call.method,
  path: call.path,
  pathParams: call.pathParams ?? {},
  body:
    call.body !== undefined && REDACTED_BODY_OPS.includes(call.op) ? redactValues(call.body) : projectBody(call.body),
  // WHO the call acted as — `{workspace, source}` from the door's credential resolution (DEFAUL-404), never the
  // key. `null` for a caller that did not say.
  identity: call.identity ?? null,
  // The approval id the call carried (`--approval`, DEFAUL-676) — a reference to a member's approval, never a secret.
  approval: call.approval ?? null,
  status: outcome.kind === "response" ? outcome.status : "unknown",
  result: outcome.kind === "response" ? (projectResult(parseText(outcome.text)) ?? null) : null,
});

export const receiptLine = (receipt) => `${RECEIPT_MARKER} ${JSON.stringify(receipt)}`;

// A session id is a path segment; anything that could climb out of the sessions directory is not journaled.
const SAFE_SESSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const isSafeSessionId = (id) => typeof id === "string" && SAFE_SESSION.test(id);
export const journalPath = (sessionId, home = os.homedir()) =>
  isSafeSessionId(sessionId) ? path.join(home, ".everdict", "sessions", sessionId, "receipts.jsonl") : undefined;

/** Writes both copies (the stderr line only when `printLine`: everdict-lite has no hook to read it, PLT-100). A
 *  journal that cannot be written is said on stderr; the call's own answer is never lost. */
export const emitReceipt = (receipt, { sessionId, stderr = process.stderr, home, printLine = true } = {}) => {
  if (printLine) stderr.write(`${receiptLine(receipt)}\n`);
  if (sessionId === undefined) return;
  const file = journalPath(sessionId, home);
  if (file === undefined) {
    stderr.write(
      `everdict-api: EVERDICT_SESSION_ID "${sessionId}" is not a safe path segment — the journal copy was skipped\n`,
    );
    return;
  }
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(receipt)}\n`);
  } catch (err) {
    stderr.write(
      `everdict-api: the receipt journal could not be written (${err instanceof Error ? err.message : "error"})\n`,
    );
  }
};

// ── reading ─────────────────────────────────────────────────────────────────────────────────────────────────
export const landed = (receipt) => typeof receipt.status === "number" && receipt.status >= 200 && receipt.status < 300;

const isReceipt = (value) =>
  value !== null &&
  typeof value === "object" &&
  value.v === 1 &&
  typeof value.id === "string" &&
  typeof value.method === "string" &&
  typeof value.path === "string";

const textsOf = (block) => {
  const content = block?.content;
  if (typeof content === "string") return [content];
  return Array.isArray(content) ? content.flatMap((b) => (typeof b?.text === "string" ? [b.text] : [])) : [];
};

/** The receipts a block of tool-result text carries: one per `EVERDICT_RECEIPT <json>` row, never a row that merely mentions the marker. */
export const receiptsInText = (text) => {
  const found = [];
  for (const row of text.split("\n")) {
    const at = row.indexOf(`${RECEIPT_MARKER} `);
    if (at < 0) continue;
    try {
      const parsed = JSON.parse(row.slice(at + RECEIPT_MARKER.length + 1));
      if (isReceipt(parsed)) found.push(parsed);
    } catch {
      // a line that merely mentions the marker
    }
  }
  return found;
};

/** The receipts one transcript line carries — only from a `tool_result` block, never from a command's own text. */
export const receiptsInLine = (line) => {
  if (!line.includes(RECEIPT_MARKER)) return [];
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return [];
  }
  const content = entry?.message?.content;
  if (!Array.isArray(content)) return [];
  const found = [];
  for (const block of content) {
    if (block?.type !== "tool_result") continue;
    for (const text of textsOf(block)) found.push(...receiptsInText(text));
  }
  return found;
};

export const journalReceipts = (sessionId, home) => {
  const file = journalPath(sessionId, home);
  if (file === undefined || !existsSync(file)) return [];
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const row of text.split("\n")) {
    if (row.trim() === "") continue;
    try {
      const parsed = JSON.parse(row);
      if (isReceipt(parsed)) out.push(parsed);
    } catch {
      // a torn last line while the door is writing
    }
  }
  return out;
};

/**
 * Deduplicating reader. `fromLine` yields a transcript line's receipts the collector has not yet handed out;
 * `fromJournal` yields the journal's receipts the transcript did not carry, in `at` order.
 */
export class ReceiptCollector {
  #seen = new Set();

  fromLine(line) {
    return receiptsInLine(line).filter((r) => this.#take(r));
  }

  /** The receipts in a block of tool-result text that the collector has not yet handed out. */
  fromText(text) {
    return receiptsInText(text).filter((r) => this.#take(r));
  }

  fromJournal(sessionId, home) {
    return journalReceipts(sessionId, home)
      .filter((r) => this.#take(r))
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  #take(receipt) {
    if (this.#seen.has(receipt.id)) return false;
    this.#seen.add(receipt.id);
    return true;
  }
}

/** A matcher over op names. Its `needle` is what a transcript line must contain for the matcher to matter. */
export const opMatcher = (ops) => {
  const names = new Set(ops);
  return Object.freeze({ ops: names, needle: RECEIPT_MARKER, test: (op) => typeof op === "string" && names.has(op) });
};

/**
 * Every receipt this session holds, anywhere it could: its main transcript and every subagent's (transcript order),
 * then the journal's extras (`at` order). What `session-campaigns` and `session-image-grants` read.
 */
export const sessionReceipts = async ({ transcriptPath, sessionId, home }) => {
  const collector = new ReceiptCollector();
  const out = [];
  for (const file of sessionTranscriptFiles({ transcriptPath, sessionId })) {
    if (!existsSync(file)) continue;
    const lines = createInterface({
      input: createReadStream(file, { encoding: "utf8" }),
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    for await (const line of lines) out.push(...collector.fromLine(line));
  }
  out.push(...collector.fromJournal(sessionId, home));
  return out;
};
