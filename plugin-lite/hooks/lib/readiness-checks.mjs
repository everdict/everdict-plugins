// The plugin runs the delegation bootstrap (`lib/delegation-bootstrap.mjs`, the one `/everdict:setup` runs) BEFORE a
// `readiness_blocked` opt-out is accepted (DEFAUL-285) — the logic `readiness-bootstrap-guard.mjs` ran on the MCP
// transport, moved here so the REST door runs it in-process (DEFAUL-295).
//
// MEASURED (trial scorecard 871d7a29, four fresh workspaces): two sessions ran `/everdict:setup` and delegated;
// two never ran it and opened campaigns with `delegation:{required:false, because:"readiness_blocked"}` — one
// calling provisioning "outside this bug-fix request", one claiming setup "cannot complete without the owner
// supplying model credentials" (false: the credential is the runner's lent login). The server refuses that
// opt-out only while readiness answers ready, and readiness WAS blocked only because the bootstrap was skipped.
// The opt-out claims "I could not delegate"; the record cannot tell that from "I did not try". So the plugin
// tries, and the opt-out carries what happened.
//
//   · BEFORE `open_change_campaign` with the opt-out → bootstrap, re-read readiness. Ready → REFUSE (open it
//     delegated). Still blocked → ALLOW, the bootstrap's per-check outcome in the notice for the session to quote.
//   · AFTER `delegation_readiness` answered `blocked` → bootstrap once per session (ledger keyed by the session
//     id), then say the new reading.
//   · UNKNOWN IS NOT A REFUSAL — a bootstrap that throws or an API that cannot be reached ALLOWS, with a notice.
//   · NEVER PRINTS A KEY OR TOKEN — only step ids, the bootstrap's own messages and readiness's check ids/gaps.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readCredentials } from "./credentials.mjs";
import { bootstrapDelegation, defaultIo } from "./delegation-bootstrap.mjs";

export const isReadinessOptOut = (body) =>
  body?.delegation?.required === false && body?.delegation?.because === "readiness_blocked";

const readinessLines = (readiness) => [
  `readiness verdict: ${readiness?.verdict}`,
  ...(readiness?.checks ?? []).map((c) => `  [${c.id}] ${c.state}${c.state !== "ready" && c.gap ? ` — ${c.gap}` : ""}`),
];

const outcomeLines = (result, readiness) => [
  ...(result.steps ?? []).flatMap((s) => [
    `  [${s.id}] ${s.kind === "done" ? "done" : "stopped"}: ${s.detail ?? s.message ?? ""}`,
    ...(s.hint ? [`    ${s.hint}`] : []),
  ]),
  ...(result.kind === "stopped" && !(result.steps ?? []).length ? [`  stopped: ${result.message}`] : []),
  ...(readiness ? readinessLines(readiness) : []),
];

// Run the bootstrap in-process, then read readiness once more from the control plane. `undefined` reading =
// unknown (never folded into "blocked"). `io` is injectable for the door's tests; production is `defaultIo`.
const bootstrap = async ({ workspace, io = defaultIo, credentials = readCredentials() }) => {
  let result;
  try {
    result = await bootstrapDelegation({ workspace, credentials, io });
  } catch (err) {
    return { failed: err instanceof Error ? err.name : "threw" };
  }
  let readiness = result.readiness;
  if (result.kind === "stopped") {
    const credential = credentials.kind === "read" ? credentials.workspaces?.[workspace] : undefined;
    readiness = undefined;
    if (credential?.apiUrl && credential?.key) {
      try {
        const base = String(credential.apiUrl)
          .trim()
          .replace(/\/+$/, "")
          .replace(/\/mcp$/, "");
        const res = await io.fetch(`${base}/workspace/delegation-readiness`, {
          headers: { Authorization: `Bearer ${credential.key}`, "x-everdict-workspace": workspace },
          signal: AbortSignal.timeout(8_000),
        });
        if (res.ok) readiness = await res.json();
      } catch {
        readiness = undefined;
      }
    }
  }
  return { result, readiness };
};

/**
 * BEFORE an `open_change_campaign` whose body is the opt-out. `{decision:"deny", text}` refuses the call;
 * `{decision:"allow", text}` sends it and prints `text` for the session to quote in the opt-out's `detail`.
 */
export const readinessBeforeOptOut = async ({ workspace, io, credentials }) => {
  const ran = await bootstrap({ workspace, io, credentials });
  if (ran.failed !== undefined || (ran.readiness === undefined && ran.result.kind !== "already-ready"))
    return {
      decision: "allow",
      text: `everdict: the plugin tried the delegation bootstrap before accepting this readiness_blocked opt-out and could not finish or verify it${ran.failed ? ` (${ran.failed})` : ""} — the API may be unreachable. The opt-out is allowed; say so in its detail.${ran.result ? `\n${outcomeLines(ran.result).join("\n")}` : ""}`,
    };
  if (ran.result.kind === "already-ready" || ran.readiness.verdict === "ready")
    return {
      decision: "deny",
      text: [
        `Workspace "${workspace}" is now delegation-ready — the plugin ran the /everdict:setup bootstrap for you, so \`readiness_blocked\` no longer holds.`,
        ...outcomeLines(ran.result, ran.readiness),
        "Open the campaign delegated: call `open_change_campaign` again and omit `delegation`, then `/everdict:delegate`.",
      ].join("\n"),
    };
  return {
    decision: "allow",
    text: [
      `everdict: the plugin ran the delegation bootstrap for "${workspace}" before accepting this readiness_blocked opt-out, and readiness is STILL blocked. Quote this outcome in the opt-out's \`detail\`:`,
      ...outcomeLines(ran.result, ran.readiness),
    ].join("\n"),
  };
};

const ledgerFile = () => path.join(os.homedir(), ".everdict", "readiness-bootstrap.jsonl");

/** AFTER `delegation_readiness`. `reading` is the parsed answer. Returns the notice, or `undefined` (say nothing). */
export const readinessAfterRead = async ({ reading, workspace, session, io, credentials }) => {
  if (reading?.verdict !== "blocked") return undefined;
  if (session === undefined) return undefined;
  const file = ledgerFile();
  try {
    const rows = existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
    if (rows.some((l) => l.includes(JSON.stringify(session)))) return undefined;
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), workspace, session })}\n`);
  } catch {
    return undefined; // no ledger, no once-per-session guarantee — say nothing rather than bootstrap on every read
  }
  const ran = await bootstrap({ workspace, io, credentials });
  if (ran.failed !== undefined || ran.readiness === undefined)
    return `everdict: readiness is blocked and the plugin tried /everdict:setup's bootstrap but could not finish or verify it${ran.failed ? ` (${ran.failed})` : ""}.${ran.result ? `\n${outcomeLines(ran.result).join("\n")}` : ""}`;
  return [
    ran.readiness.verdict === "ready"
      ? "everdict: the plugin ran /everdict:setup: readiness is now ready — delegate (`/everdict:delegate`); do not open the campaign with a readiness_blocked opt-out."
      : `everdict: the plugin ran /everdict:setup: readiness is still ${ran.readiness.verdict}. Do what the remaining gap says; a readiness_blocked opt-out must quote this outcome.`,
    ...outcomeLines(ran.result, ran.readiness),
  ].join("\n");
};
