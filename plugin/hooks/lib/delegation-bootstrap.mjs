#!/usr/bin/env node
// ── ONE-STEP BOOTSTRAP: A FRESH WORKSPACE BECOMES DELEGATION-READY (DEFAUL-279) ──────────────────────────
//
// `delegation_readiness` names three gates a workspace must clear before any agent can be handed work:
// a delegation PROFILE, COMPUTE that can hold a session, and a CREDENTIAL the agent runs under. Each one is
// something the owner's OWN machine can already supply — a profile pinned to an image the owner already runs,
// a self-hosted runner paired from this same machine (now that `everdict runner` serves many workspaces from
// one process, DEFAUL-279), and either the machine's own Claude login lent to sessions
// (`--lend-claude-login-to-sessions`) or a headless token the owner registered once. What was missing was not
// any of these — it was ONE STEP that supplies whichever of the three a fresh workspace has never had.
//
// This is that step, run for the checkout's LINKED workspace (`lib/workspace.mjs` + the credential
// `lib/credentials.mjs` already reads). It reads `GET /workspace/delegation-readiness` once (DEFAUL-278: the
// same REST route `delegation_readiness` itself calls through, so this no longer needs its own MCP client),
// then answers each gate that is not already `ready` — through the REST API, like every other plugin script.
//
// NEVER PRINTS OR LOGS A KEY OR TOKEN, and never writes one into a repository — every value handled here is
// either read from a 0600 file under `~/.everdict/` or written to one.
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { claudeTokenPath, readCredentials } from "./credentials.mjs";
import { isSafeSessionId } from "./receipts.mjs";
import { resolveWorkspace } from "./workspace.mjs";

// The mount target `apps/cli/src/login-mounts.ts`'s `--lend-claude-login-to-sessions` binds the machine's
// Claude config dir to, inside a SANDBOX SESSION container — a literal shared between the two only because
// this script has no dependency on that TypeScript package (plugin hooks run in any checkout, most of which
// never built it).
export const SESSION_LOGIN_TARGET = "/claude";
export const DELEGATE_PROFILE_ID = "delegate-default";
export const CLAUDE_OAUTH_SECRET_NAME = "CLAUDE_CODE_OAUTH_TOKEN";
export const CLI_IDENTITY_ID = "delegate-claude-code";

export const delegationConfigPath = () => path.join(os.homedir(), ".everdict", "delegation.json");
export const tokensDir = () => path.join(os.homedir(), ".everdict", "runner", "tokens");

const apiBaseOf = (apiUrl) =>
  String(apiUrl ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/mcp$/, "");

const authHeaders = (key, workspace) => ({ Authorization: `Bearer ${key}`, "x-everdict-workspace": workspace });

// ── REST — the same shape every other plugin script calls the control plane with ────────────────────────
async function restCall(fetchImpl, method, base, urlPath, key, workspace, body) {
  try {
    const res = await fetchImpl(`${base}${urlPath}`, {
      method,
      headers: {
        ...authHeaders(key, workspace),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { kind: "unknown", why: `HTTP ${res.status} ${method} ${urlPath}` };
    if (res.status === 204) return { kind: "read", value: undefined };
    return { kind: "read", value: await res.json() };
  } catch (err) {
    return { kind: "unknown", why: err instanceof Error ? err.name : "unreachable" };
  }
}

// ── THE STANDING BRIEF EVERY delegate-default DELEGATION CARRIES ───────────────────────────────────────
const STANDING_INSTRUCTIONS = [
  "# Delegate profile: delegate-default",
  "",
  "You are a delegate working inside a sandbox session, not a human at a terminal. Before making any change:",
  "1. Read `get_task_context` for the issue/campaign this session names, and `list_issues` for anything",
  "   already filed that governs this change.",
  "2. Declare criteria first (`declare_criteria_first`) and file the request before editing.",
  "3. Follow this repository's own CLAUDE.md / AGENTS.md — its conventions win over anything generic here.",
  "4. Report back through the delegation's own reporting tool; do not resolve or close the issue yourself.",
].join("\n");

// ── STEP a: read delegation readiness once, through the REST route (DEFAUL-278) ─────────────────────────
async function getReadiness(io, credential, workspace) {
  return restCall(
    io.fetch,
    "GET",
    apiBaseOf(credential.apiUrl),
    "/workspace/delegation-readiness",
    credential.key,
    workspace,
  );
}

const checkState = (readiness, id) => readiness?.checks?.find((c) => c.id === id)?.state;

// ── STEP b: the seed delegation profile ───────────────────────────────────────────────────────────────
//
// Image priority: `~/.everdict/delegation.json`'s own `image` first (an explicit local override); else the
// image of the `default` workspace's own `delegate-everdict` profile, when the credential registry holds a
// credential for a workspace literally named `default` (the registry's own bootstrap anchor); else this step
// cannot proceed, and says so rather than inventing a placeholder image nothing can pull.
async function resolveDelegationImage(io, credentials) {
  const configPath = delegationConfigPath();
  if (io.exists(configPath)) {
    try {
      const config = JSON.parse(io.readFile(configPath));
      if (typeof config?.image === "string" && config.image.length > 0)
        return { kind: "found", image: config.image, from: configPath };
    } catch (err) {
      return { kind: "unreadable", why: err instanceof Error ? err.message : "not valid JSON", path: configPath };
    }
  }
  const defaultCredential = credentials.kind === "read" ? credentials.workspaces?.default : undefined;
  if (!defaultCredential?.apiUrl || !defaultCredential?.key) return { kind: "absent" };
  const base = apiBaseOf(defaultCredential.apiUrl);
  const read = await restCall(
    io.fetch,
    "GET",
    base,
    "/capabilities/delegate-everdict",
    defaultCredential.key,
    "default",
  );
  if (read.kind !== "read") return { kind: "unknown", why: read.why };
  const image = read.value?.spec?.image;
  if (typeof image !== "string" || image.length === 0) return { kind: "unknown", why: "no spec.image on record" };
  return { kind: "found", image, from: "the default workspace's delegate-everdict profile" };
}

async function ensureProfile(io, credential, workspace, credentials) {
  const image = await resolveDelegationImage(io, credentials);
  if (image.kind !== "found") {
    return {
      kind: "stopped",
      message:
        image.kind === "unreadable"
          ? `${image.path} is not valid JSON (${image.why}) — fix or remove it.`
          : `no delegation image configured — set "image" in ${delegationConfigPath()}, or register a credential for a workspace named "default" that already holds a "delegate-everdict" profile.`,
    };
  }
  const spec = {
    type: "delegation",
    harness: { id: "claude-code" },
    image: image.image,
    env: { CLAUDE_CONFIG_DIR: SESSION_LOGIN_TARGET },
    workDir: "work",
    instructions: STANDING_INSTRUCTIONS,
    instructionsFile: "CLAUDE.md",
  };
  const saved = await restCall(
    io.fetch,
    "PUT",
    apiBaseOf(credential.apiUrl),
    `/capabilities/${DELEGATE_PROFILE_ID}`,
    credential.key,
    workspace,
    { name: "Delegate (default)", description: "The seed delegation profile bootstrapped for this workspace.", spec },
  );
  if (saved.kind !== "read")
    return { kind: "stopped", message: `could not save the ${DELEGATE_PROFILE_ID} profile: ${saved.why}` };
  return { kind: "done", detail: `saved delegation profile "${DELEGATE_PROFILE_ID}" (image from ${image.from}).` };
}

// ── PAIRINGS THIS SESSION MADE (DEFAUL-836) ──────────────────────────────────────────────────────────
const sessionPairingsPath = (session, home) => path.join(home, ".everdict", "sessions", session, "pairings.json");

const readSessionPairings = (session, home) => {
  try {
    const parsed = JSON.parse(readFileSync(sessionPairingsPath(session, home), "utf8"));
    return Array.isArray(parsed?.workspaces) ? parsed.workspaces.filter((w) => typeof w === "string") : [];
  } catch {
    return [];
  }
};

function recordSessionPairing({ id, home }, workspace) {
  const file = sessionPairingsPath(id, home);
  mkdirSync(path.dirname(file), { recursive: true });
  const workspaces = [...new Set([...readSessionPairings(id, home), workspace])];
  writeFileSync(file, JSON.stringify({ workspaces }), { mode: 0o600 });
}

// SessionEnd: undo every pairing THIS session made. A workspace whose unpair did not complete stays on record
// (and is reported) so a retry still knows it; the record is removed only when none is left.
export async function endSessionPairings({ session, home = os.homedir(), credentials, io, tokenDir }) {
  const owned = readSessionPairings(session, home);
  const unpaired = [];
  const failed = [];
  for (const workspace of owned) {
    const result = await unpairDelegation({
      workspace,
      credentials,
      io,
      tokenFile: path.join(tokenDir ?? tokensDir(), `${workspace}.token`),
    });
    if (result.kind === "unpaired") unpaired.push(workspace);
    else failed.push({ workspace, message: result.message });
  }
  if (owned.length > 0) {
    const file = sessionPairingsPath(session, home);
    if (failed.length === 0) unlinkSync(file);
    else writeFileSync(file, JSON.stringify({ workspaces: failed.map((f) => f.workspace) }), { mode: 0o600 });
  }
  return { unpaired, failed };
}

// ── STEP c: compute — pair a workspace runner ─────────────────────────────────────────────────────────
async function ensureCompute(io, credential, workspace) {
  const paired = await restCall(
    io.fetch,
    "POST",
    apiBaseOf(credential.apiUrl),
    "/workspace/runners",
    credential.key,
    workspace,
    {
      label: `${workspace}-bootstrap`,
    },
  );
  if (paired.kind !== "read" || typeof paired.value?.token !== "string")
    return {
      kind: "stopped",
      message: `could not pair a workspace runner: ${paired.kind === "read" ? "no token returned" : paired.why}`,
    };

  const dir = io.tokenDir ?? tokensDir();
  const hadRunnerAlready = io.readdir(dir).some((f) => f.endsWith(".token"));
  io.mkdir(dir);
  io.chmodDir(dir, 0o700);
  const file = path.join(dir, `${workspace}.token`);
  io.writeFile(file, `${paired.value.token}\n`, 0o600);
  // Owned by this session from here on: the SessionEnd hook unpairs it (DEFAUL-836). Only reached when the
  // workspace had no compute, so a pairing the session merely found is never recorded and never undone.
  if (io.session) recordSessionPairing(io.session, workspace);

  const hint = hadRunnerAlready
    ? undefined
    : `no host runner detected on this machine yet — start one: \`everdict runner\` (or the standalone \`everdict-runner\` binary). It rescans ${dir} every ~30s and picks this token up with no restart.`;
  return {
    kind: "done",
    detail: `paired a workspace runner and wrote its token to ${file}.`,
    hostRunnerRunning: hadRunnerAlready,
    ...(hint ? { hint } : {}),
  };
}

// ── STEP c2: wait for the host runner to pick the new token up (DEFAUL-286) ───────────────────────────
//
// The runner's `claude-login-session` capability (the credential) exists only once its loop for this workspace
// has connected, which happens after it notices the token file. Re-reading readiness the instant the token is
// written therefore reads "credential missing" on a healthy machine. Poll until compute and credential leave
// missing/unknown, or the budget runs out — and say which, rather than letting a caller read the too-early state.
export const RUNNER_POLL_INTERVAL_MS = 3_000;
export const RUNNER_POLL_TIMEOUT_MS = 90_000;
const unsettled = (readiness) =>
  ["compute", "credential"].filter((id) => ["missing", "unknown", undefined].includes(checkState(readiness, id)));

async function awaitRunnerConnection(io, credential, workspace, wait) {
  const intervalMs = wait?.intervalMs ?? RUNNER_POLL_INTERVAL_MS;
  const timeoutMs = wait?.timeoutMs ?? RUNNER_POLL_TIMEOUT_MS;
  const sleep = wait?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const maxPolls = Math.max(1, Math.floor(timeoutMs / intervalMs));
  let last;
  for (let polls = 1; polls <= maxPolls; polls++) {
    await sleep(intervalMs);
    const read = await getReadiness(io, credential, workspace);
    if (read.kind === "read") {
      last = read.value;
      if (unsettled(last).length === 0) return { kind: "connected", polls, readiness: last };
    }
  }
  return { kind: "timed-out", polls: maxPolls, seconds: Math.round((maxPolls * intervalMs) / 1000), readiness: last };
}

// ── STEP d: credential — the lent login, else a registered headless token ────────────────────────────
async function hostRunnerLendsLogin(io, credential, workspace) {
  const roster = await restCall(
    io.fetch,
    "GET",
    apiBaseOf(credential.apiUrl),
    "/workspace/runners",
    credential.key,
    workspace,
  );
  if (roster.kind !== "read") return false; // unknown reads as "not proven" — fall through to the token path
  const runners = Array.isArray(roster.value?.runners) ? roster.value.runners : [];
  return runners.some((r) => Array.isArray(r?.capabilities) && r.capabilities.includes("claude-login-session"));
}

async function ensureCredential(io, credential, workspace) {
  if (await hostRunnerLendsLogin(io, credential, workspace))
    return { kind: "done", detail: "the host runner already lends its Claude login to sessions — nothing to do." };

  const tokenPath = claudeTokenPath();
  if (!io.exists(tokenPath))
    return {
      kind: "stopped",
      message: `no credential available — either start the host runner with --lend-claude-login-to-sessions, or register a headless token once: \`claude setup-token | node ${path.join(path.dirname(fileURLToPath(import.meta.url)), "credentials.mjs")} add-claude-token\`.`,
    };
  const token = io.readFile(tokenPath).trim();
  if (!token)
    return { kind: "stopped", message: `${tokenPath} is empty — re-run \`claude setup-token | … add-claude-token\`.` };

  // A subscription login belongs to the member who logged in (DEFAUL-1155): it is registered in the CALLER's personal scope
  // and the identity references that personal secret. A workspace-scope copy would be lent to every member, which the
  // control plane no longer resolves as a subscription credential.
  const set = await restCall(
    io.fetch,
    "PUT",
    apiBaseOf(credential.apiUrl),
    `/secrets/${CLAUDE_OAUTH_SECRET_NAME}`,
    credential.key,
    workspace,
    { value: token, scope: "user" },
  );
  if (set.kind !== "read")
    return { kind: "stopped", message: `could not set the ${CLAUDE_OAUTH_SECRET_NAME} secret: ${set.why}` };

  const identitySpec = {
    type: "cli-identity",
    cli: "claude-code",
    env: { [CLAUDE_OAUTH_SECRET_NAME]: { secretRef: CLAUDE_OAUTH_SECRET_NAME, scope: "user" } },
    home: [],
  };
  const saved = await restCall(
    io.fetch,
    "PUT",
    apiBaseOf(credential.apiUrl),
    `/capabilities/${CLI_IDENTITY_ID}`,
    credential.key,
    workspace,
    {
      name: "Delegate Claude Code identity",
      description: "Headless token registered by its own member, in that member's personal scope.",
      spec: identitySpec,
    },
  );
  if (saved.kind !== "read")
    return { kind: "stopped", message: `could not save the ${CLI_IDENTITY_ID} identity: ${saved.why}` };
  return { kind: "done", detail: `registered a cli-identity ("${CLI_IDENTITY_ID}") from the local headless token.` };
}

// ── THE DECISION TABLE (DEFAUL-279 §3) ────────────────────────────────────────────────────────────────
//
// `io` bundles every side effect (fetch, fs, chmod) so the whole table is drivable against a fake API and a
// fake filesystem with no network and no disk. Never throws — every branch that cannot proceed returns
// `{kind:"stopped", message}` instead, because a bootstrap script that crashes with a stack trace is worse
// than one that names the one command left to run.
export async function bootstrapDelegation({ workspace, credentials, io, wait }) {
  if (credentials.kind !== "read")
    return {
      kind: "stopped",
      message:
        credentials.kind === "unreadable"
          ? `credential registry unreadable: ${credentials.why}`
          : "no credential registered for this workspace — see /everdict:setup.",
    };
  const credential = credentials.workspaces?.[workspace];
  if (!credential?.apiUrl || !credential?.key)
    return { kind: "stopped", message: `no credential registered for workspace "${workspace}" — see /everdict:setup.` };

  const readiness = await getReadiness(io, credential, workspace);
  if (readiness.kind !== "read")
    return { kind: "stopped", message: `could not read delegation_readiness: ${readiness.why}` };
  if (readiness.value?.verdict === "ready") return { kind: "already-ready", readiness: readiness.value };

  const steps = [];
  if (checkState(readiness.value, "profile") !== "ready") {
    const result = await ensureProfile(io, credential, workspace, credentials);
    steps.push({ id: "profile", ...result });
    if (result.kind === "stopped") return { kind: "stopped", message: result.message, steps };
  }
  if (checkState(readiness.value, "compute") !== "ready") {
    const result = await ensureCompute(io, credential, workspace);
    steps.push({ id: "compute", ...result });
    if (result.kind === "stopped") return { kind: "stopped", message: result.message, steps };
  }
  let credentialState = checkState(readiness.value, "credential");
  const pairedStep = steps.find((s) => s.id === "compute" && s.kind === "done");
  if (pairedStep?.hostRunnerRunning) {
    const waited = await awaitRunnerConnection(io, credential, workspace, wait);
    if (waited.kind === "connected") {
      pairedStep.detail += ` The runner connected after ${waited.polls} readiness poll(s).`;
      credentialState = checkState(waited.readiness, "credential");
    } else {
      const still = unsettled(waited.readiness);
      pairedStep.detail += ` The runner had not connected after ${waited.seconds}s (still not ready: ${still.join(", ") || "readiness unreadable"}) — readiness below may be stale; re-run once it connects.`;
    }
  }
  if (credentialState !== "ready") {
    const result = await ensureCredential(io, credential, workspace);
    steps.push({ id: "credential", ...result });
    if (result.kind === "stopped") return { kind: "stopped", message: result.message, steps };
  }

  // Step e: re-read and report each check, so "done" is what the control plane now sees, not what this
  // script assumed its own writes would produce.
  const after = await getReadiness(io, credential, workspace);
  if (after.kind !== "read")
    return { kind: "stopped", message: `could not re-read delegation_readiness: ${after.why}`, steps };
  return { kind: "bootstrapped", readiness: after.value, steps };
}

// ── THE INVERSE: UNPAIR ON TEARDOWN (DEFAUL-836) ───────────────────────────────────────────────────────
//
// `ensureCompute` pairs the host runner into a workspace and writes `<workspace>.token`; the one host process
// then lease-polls that workspace for as long as the file exists. A throwaway workspace (a scorecard case's
// `pt-*`) never came back to undo it, so 20 dead pairings kept polling. This revokes the workspace's
// `<workspace>-bootstrap` runners and removes the token file (the runner stops that loop on its next rescan).
// The token file goes only after the revokes were answered, and an unreadable roster keeps it — "cannot find
// out" is reported, never read as "nothing to unpair".
export async function unpairDelegation({ workspace, credentials, io, tokenFile }) {
  const credential = credentials.kind === "read" ? credentials.workspaces?.[workspace] : undefined;
  if (!credential?.apiUrl || !credential?.key)
    return { kind: "stopped", message: `no credential registered for workspace "${workspace}" — cannot unpair.` };
  const base = apiBaseOf(credential.apiUrl);
  const roster = await restCall(io.fetch, "GET", base, "/workspace/runners/owned", credential.key, workspace);
  if (roster.kind !== "read") return { kind: "stopped", message: `could not read the runner roster: ${roster.why}` };
  const label = `${workspace}-bootstrap`;
  const mine = (Array.isArray(roster.value?.runners) ? roster.value.runners : []).filter((r) => r?.label === label);
  const revoked = [];
  for (const runner of mine) {
    const gone = await restCall(
      io.fetch,
      "DELETE",
      base,
      `/workspace/runners/${encodeURIComponent(runner.id)}`,
      credential.key,
      workspace,
    );
    if (gone.kind !== "read")
      return { kind: "stopped", message: `could not revoke runner ${runner.id}: ${gone.why}`, revoked };
    revoked.push(runner.id);
  }
  const file = tokenFile ?? path.join(tokensDir(), `${workspace}.token`);
  if (io.exists(file)) io.unlink(file);
  return { kind: "unpaired", revoked };
}

// ── THE DEFAULT `io` — real fetch, real filesystem ───────────────────────────────────────────────────
export const defaultIo = {
  fetch: (...args) => globalThis.fetch(...args),
  exists: (p) => existsSync(p),
  readFile: (p) => readFileSync(p, "utf8"),
  writeFile: (p, content, mode) => {
    writeFileSync(p, content, { mode });
    chmodSync(p, mode);
  },
  unlink: (p) => unlinkSync(p),
  mkdir: (dir) => mkdirSync(dir, { recursive: true }),
  chmodDir: (dir, mode) => {
    try {
      chmodSync(dir, mode);
    } catch {
      // best-effort — a directory this process does not own the mode of is not this script's to fix
    }
  },
  readdir: (dir) => {
    try {
      return readdirSync(dir);
    } catch {
      return []; // the directory not existing yet is the ordinary "no runner paired here before" case
    }
  },
};

// ── A RUNNABLE ENTRY (`node delegation-bootstrap.mjs [workspace]`) ──────────────────────────────────────
// Documented in `plugin/commands/setup.md`. The workspace is the checkout's LINKED one (`lib/workspace.mjs`)
// unless given explicitly — the plugin already knows which workspace a checkout belongs to.
async function runCli(rawArgv) {
  const unpair = rawArgv.includes("--unpair");
  const argv = rawArgv.filter((a) => a !== "--unpair");
  const explicit = argv[0];
  const resolved = explicit ? { kind: "linked", workspace: explicit } : resolveWorkspace(process.cwd());
  if (!resolved || resolved.kind !== "linked") {
    console.error("no linked workspace — pass one explicitly, or link this checkout first (see /everdict:setup).");
    process.exitCode = 1;
    return;
  }
  const credentials = readCredentials();
  if (unpair) {
    const undone = await unpairDelegation({ workspace: resolved.workspace, credentials, io: defaultIo });
    if (undone.kind === "stopped") {
      console.error(`✗ ${undone.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`✓ unpaired ${resolved.workspace}: revoked ${undone.revoked.length} runner(s), token file removed.`);
    return;
  }
  const sessionId = process.env.EVERDICT_SESSION_ID?.trim();
  const io = isSafeSessionId(sessionId) ? { ...defaultIo, session: { id: sessionId, home: os.homedir() } } : defaultIo;
  const result = await bootstrapDelegation({ workspace: resolved.workspace, credentials, io });
  for (const step of result.steps ?? []) {
    console.log(`${step.kind === "done" ? "✓" : "…"} [${step.id}] ${step.detail ?? step.message ?? ""}`);
    if (step.hint) console.log(`  ${step.hint}`);
  }
  if (result.kind === "already-ready") {
    console.log(`✓ ${resolved.workspace} is already delegation-ready — nothing to do.`);
    return;
  }
  if (result.kind === "stopped") {
    console.error(`✗ ${result.message}`);
    process.exitCode = 1;
    return;
  }
  for (const check of result.readiness?.checks ?? [])
    console.log(
      `${check.state === "ready" ? "✓" : "✗"} [${check.id}] ${check.state}${check.gap ? ` — ${check.gap}` : ""}`,
    );
  console.log(
    result.readiness?.verdict === "ready"
      ? `✓ ${resolved.workspace} is now delegation-ready.`
      : `verdict: ${result.readiness?.verdict}`,
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
