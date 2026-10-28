#!/usr/bin/env node
// `.everdict/goal` — binds a checkout (and every session opened in it) to a GOAL: an initiative or a project
// whose `doneWhen` says when the work under it is finished (DEFAUL-280, DEFAUL-281). Same shape as
// `lib/workspace.mjs`'s `.everdict/workspace`: one file at the checkout root, one reader, written by a plugin
// script rather than hand-edited.
//
// `{ "kind": "initiative" | "project", "id": "<record id>", "session": "<binder>", "boundAt": "<ISO time>" }`
// (DEFAUL-868): the checkout is SHARED by every session opened in it, but a goal belongs to the one session
// that bound it — `session` names it and the Stop guard holds only that session. A file with no `session`
// (bound by a plugin before DEFAUL-868) binds nobody: it cannot say whose it is, so no session is refused on its
// account, and the session-start/Stop notices say to re-run the bind. The `id` is the RECORD id, never the identifier a person
// types: a pin's key for a goal is the same shape `next_work` and `get_issue` already use (rule `protocol`
// L3 — provenance is born at the source, an identifier alone matches nothing once it has to be resolved).
//
// Read by `session-start.mjs` (no network call — it only names what is bound) and `capture-guard.mjs` (which
// resolves `next_work` over it). Bound by `/everdict:goal`, via this file's CLI.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readCredentials } from "./credentials.mjs";
import { resolveWorkspace } from "./workspace.mjs";

// THE ONE PLACE THE DECLARATION'S PATH IS BUILT — mirrors `lib/workspace.mjs`'s `declarationPathIn`, so the
// tree fingerprint's `.everdict/**` exclusion and the first-change guard's "nowhere for a record to land yet"
// exception both reach this file without re-deriving `.everdict/goal` a second time.
export const goalPathIn = (root) => path.join(root, ".everdict", "goal");

// Absent or unreadable both read as "no goal bound" — a session with no goal is the ordinary case, not an
// error, and a hook that treated a malformed file as fatal would stop guarding the moment it could not parse
// its own optional input.
export const readGoal = (root) => {
  if (!root) return undefined;
  const file = goalPathIn(root);
  if (!existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.kind === "initiative" || parsed.kind === "project") &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    )
      return {
        kind: parsed.kind,
        id: parsed.id,
        ...(typeof parsed.session === "string" && parsed.session.length > 0 ? { session: parsed.session } : {}),
        ...(typeof parsed.boundAt === "string" && parsed.boundAt.length > 0 ? { boundAt: parsed.boundAt } : {}),
      };
  } catch {
    // malformed — read as unbound rather than thrown, same law as every other plugin-owned declaration file
  }
  return undefined;
};

// A binding without a binder is the defect DEFAUL-868 fixed, so the writer refuses to produce one.
export const writeGoal = (root, goal) => {
  if (typeof goal.session !== "string" || goal.session.length === 0)
    throw new Error("a goal binding must name the session that binds it");
  const file = goalPathIn(root);
  mkdirSync(path.dirname(file), { recursive: true });
  const boundAt = goal.boundAt ?? new Date().toISOString();
  writeFileSync(file, `${JSON.stringify({ kind: goal.kind, id: goal.id, session: goal.session, boundAt })}\n`);
  return file;
};

const apiBaseOf = (apiUrl) =>
  String(apiUrl ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/mcp$/, "");

// ── REST — the same shape every other plugin script calls the control plane with ────────────────────────
async function restGet(fetchImpl, base, urlPath, key, workspace) {
  try {
    const res = await fetchImpl(`${base}${urlPath}`, {
      headers: { Authorization: `Bearer ${key}`, "x-everdict-workspace": workspace },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 404) return { kind: "absent" };
    if (!res.ok) return { kind: "unknown", why: `HTTP ${res.status} GET ${urlPath}` };
    return { kind: "read", value: await res.json() };
  } catch (err) {
    return { kind: "unknown", why: err instanceof Error ? err.name : "unreachable" };
  }
}

const itemsOf = (result) =>
  result.kind === "read" ? (Array.isArray(result.value) ? result.value : (result.value?.items ?? [])) : undefined;

// Resolves `<initiative|project id or exact name>` against the REST API — an id first (cheap, no listing:
// `GET /initiatives/:id` and `GET /projects/:id` in parallel), falling back to an EXACT name match across
// each kind's list only when neither id lookup answers. Three-valued, like every read a decision rests on
// (rule `protocol` L2): `found` | `absent` | `ambiguous` (more than one goal answers) | `unknown` (a read
// failed — never folded into `absent`, which would send a session filing a duplicate goal under a name that
// already exists).
export async function resolveGoalInput({ fetchImpl = globalThis.fetch, apiUrl, key, workspace, input }) {
  const base = apiBaseOf(apiUrl);
  const [initiativeById, projectById] = await Promise.all([
    restGet(fetchImpl, base, `/initiatives/${encodeURIComponent(input)}`, key, workspace),
    restGet(fetchImpl, base, `/projects/${encodeURIComponent(input)}`, key, workspace),
  ]);
  if (initiativeById.kind === "read" && projectById.kind === "read")
    return {
      kind: "ambiguous",
      matches: [
        { kind: "initiative", id: input, name: initiativeById.value?.name },
        { kind: "project", id: input, name: projectById.value?.name },
      ],
    };
  if (initiativeById.kind === "read")
    return { kind: "found", goal: { kind: "initiative", id: input, name: initiativeById.value?.name } };
  if (projectById.kind === "read")
    return { kind: "found", goal: { kind: "project", id: input, name: projectById.value?.name } };
  if (initiativeById.kind === "unknown" || projectById.kind === "unknown")
    return { kind: "unknown", why: initiativeById.why ?? projectById.why };

  const [initiatives, projects] = await Promise.all([
    restGet(fetchImpl, base, "/initiatives?limit=200", key, workspace),
    restGet(fetchImpl, base, "/projects?limit=200", key, workspace),
  ]);
  if (initiatives.kind === "unknown" || projects.kind === "unknown")
    return { kind: "unknown", why: initiatives.why ?? projects.why };
  const matches = [
    ...(itemsOf(initiatives) ?? [])
      .filter((i) => i?.name === input)
      .map((i) => ({ kind: "initiative", id: i.id, name: i.name })),
    ...(itemsOf(projects) ?? [])
      .filter((p) => p?.name === input)
      .map((p) => ({ kind: "project", id: p.id, name: p.name })),
  ];
  if (matches.length === 1) return { kind: "found", goal: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", matches };
  return { kind: "absent" };
}

// `GET /goals/:kind/:id/next-work` (DEFAUL-280) — the one read both `capture-guard.mjs`'s decision table and
// this file's own CLI status output need, so it is derived once here rather than re-composed at each call site.
export async function fetchNextWork({ fetchImpl = globalThis.fetch, apiUrl, key, workspace, goal }) {
  const base = apiBaseOf(apiUrl);
  return restGet(fetchImpl, base, `/goals/${goal.kind}/${encodeURIComponent(goal.id)}/next-work`, key, workspace);
}

// ── `node goal.mjs bind "<initiative|project id or exact name>"` ───────────────────────────────────────
// Documented in `plugin/commands/goal.md`. Resolves through the checkout's already-linked workspace and its
// credential (`lib/workspace.mjs` + `lib/credentials.mjs`) — a goal cannot be bound before the checkout is.
async function runCli(argv) {
  const [cmd, input] = argv;
  if (cmd !== "bind" || !input) {
    console.error('usage: goal.mjs bind "<initiative|project id or exact name>"');
    process.exitCode = 1;
    return;
  }
  const session = process.env.EVERDICT_SESSION_ID?.trim();
  if (!session) {
    console.error(
      "no EVERDICT_SESSION_ID in this shell — a goal binds the session that sets it, and this one cannot name itself. Re-run with EVERDICT_SESSION_ID=<this session's id>.",
    );
    process.exitCode = 1;
    return;
  }
  const resolved = resolveWorkspace(process.cwd());
  if (!resolved || resolved.kind !== "linked") {
    console.error("no linked workspace — link this checkout first (see /everdict:setup) before binding a goal.");
    process.exitCode = 1;
    return;
  }
  const credentials = readCredentials();
  const credential = credentials.kind === "read" ? credentials.workspaces?.[resolved.workspace] : undefined;
  if (!credential?.apiUrl || !credential?.key) {
    console.error(`no credential registered for workspace "${resolved.workspace}" — see /everdict:setup.`);
    process.exitCode = 1;
    return;
  }
  const result = await resolveGoalInput({
    apiUrl: credential.apiUrl,
    key: credential.key,
    workspace: resolved.workspace,
    input,
  });
  if (result.kind === "absent") {
    console.error(
      `no initiative or project matches "${input}" (by id or exact name) in workspace "${resolved.workspace}".`,
    );
    process.exitCode = 1;
    return;
  }
  if (result.kind === "ambiguous") {
    console.error(
      `"${input}" matches more than one goal: ${result.matches.map((m) => `${m.kind}:${m.id}${m.name ? ` (${m.name})` : ""}`).join(", ")} — bind by id instead.`,
    );
    process.exitCode = 1;
    return;
  }
  if (result.kind === "unknown") {
    console.error(`could not resolve "${input}": ${result.why}`);
    process.exitCode = 1;
    return;
  }
  const file = writeGoal(resolved.root, { ...result.goal, session });
  console.log(
    `bound ${result.goal.kind} "${result.goal.name ?? result.goal.id}" (${result.goal.id}) for session ${session} — wrote ${file}. Other sessions in this checkout are not held to it.`,
  );
}

const isMain = (() => {
  try {
    return typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) await runCli(process.argv.slice(2));

// How a session is told its checkout carries a goal it is not bound by (DEFAUL-868) — one sentence, built once.
export const REBIND_HINT =
  'to hold this session to it, re-bind from this session: node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/goal.mjs" bind "<goal id>" (/everdict:goal)';
