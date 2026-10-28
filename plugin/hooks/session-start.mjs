#!/usr/bin/env node
// SessionStart — hand the session the service it is about to change, before it changes it.
//
// The hook carries NO credential and makes no network call: it resolves the checkout to a workspace and a
// repository and then tells the session which Everdict reads to run. The REST door (`bin/everdict-api`) is what
// holds the credential, and it is the session's own call that presents it — so a hook that runs on a machine
// with no Everdict configured degrades to a sentence, never to a failed request.
//
// Resolution order, most explicit first. A workspace is never guessed: an unresolved repository is told so,
// because a default workspace would write one team's work into another's trust zone.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contractLines } from "./lib/contract.mjs";
import { readCredentials } from "./lib/credentials.mjs";
import { REBIND_HINT, readGoal } from "./lib/goal.mjs";
import { linkFromProducts } from "./lib/link-from-products.mjs";
import { detectEverdictMcp, mcpLine } from "./lib/mcp-detect.mjs";
import { methodologyContextLines, methodologyLedgerField, resolveMethodology } from "./lib/methodology.mjs";
import { bundledSeedSkills } from "./lib/plugin-seed.mjs";
import { isSafeSessionId } from "./lib/receipts.mjs";
import { recordBaseline } from "./lib/tree-fingerprint.mjs";
import { resolveWorkspace } from "./lib/workspace.mjs";

const stdin = await new Promise((resolve) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
  });
  process.stdin.on("end", () => resolve(buf));
});

// ── THE DOOR, REACHABLE FROM THE SESSION'S BASH (DEFAUL-296) ──────────────────────────────────────────────
// The plugin reaches Everdict through `bin/everdict-api`, which leaves a receipt per call; the receipt journal is
// keyed by `EVERDICT_SESSION_ID`. Claude Code offers `CLAUDE_ENV_FILE` to a SessionStart hook: what is written
// there is sourced before the session's Bash calls. Both are exported through it when it is provided.
//
// ⚠️ WHETHER A LIVE CLIENT HONOURS `CLAUDE_ENV_FILE` IS NOT ASSUMED HERE. This gate proves the hook WRITES the
// file; that a session's Bash calls source it is a property of the client (see the campaign report for what was
// measured). So the door's ABSOLUTE path is printed in the context regardless, and a session without the export
// still reaches it. The journal is the copy that survives a swallowed stdout — it needs the id, and without the
// export the door falls back to its stderr line alone.
const doorDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin");
const doorPath = path.join(doorDir, "everdict-api");
const shellQuote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
const exportDoorEnv = (sessionId) => {
  const file = process.env.CLAUDE_ENV_FILE?.trim();
  if (!file) return "no CLAUDE_ENV_FILE";
  const lines = [
    ...(isSafeSessionId(sessionId) ? [`export EVERDICT_SESSION_ID=${shellQuote(sessionId)}`] : []),
    `export PATH=${shellQuote(doorDir)}:"$PATH"`,
  ];
  try {
    appendFileSync(file, `${lines.join("\n")}\n`);
    return undefined;
  } catch (err) {
    return `CLAUDE_ENV_FILE could not be written (${err instanceof Error ? err.message : "error"})`;
  }
};

const emit = async (context) => {
  const door = [
    "",
    `- REST door: \`${doorPath}\` (\`everdict-api\` on PATH when this session's shell honours the environment file${
      envExportProblem ? ` — not exported here: ${envExportProblem}, so call it by this absolute path` : ""
    })`,
  ].join("\n");
  // ⚠️ EXIT ONLY WHEN THE WRITE HAS DRAINED. `process.exit(0)` straight after `write` cuts a PIPED stdout at 8192
  // bytes (measured: `node session-start.mjs | wc -c` → 8192 of 10739), and the context is longer than that — the
  // truncated JSON loses its tail, which is where the door's absolute path is printed. A file redirect hides it.
  const payload = JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `${context}${door}` },
  });
  await new Promise((resolve) => process.stdout.write(payload, resolve));
  process.exit(0);
};

let input = {};
try {
  input = JSON.parse(stdin || "{}");
} catch {
  // A malformed payload is the harness's problem, not the session's — say nothing rather than crash it.
  process.exit(0);
}
const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process.cwd();
const envExportProblem = exportDoorEnv(typeof input.session_id === "string" ? input.session_id : undefined);

const git = (...args) => {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return undefined;
  }
};

const root = git("rev-parse", "--show-toplevel");
// The tree this session FOUND (DEFAUL-205): the Stop guard judges "did this session change code" against it,
// so a file that was already untracked — `.everdict/workspace` itself, in a repository that never committed
// it — is not the session's change. Recorded before anything else can return; a failure records nothing,
// and nothing means the Stop guard reads the tree as it is.
recordBaseline(typeof input.session_id === "string" ? input.session_id : undefined, root);
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
// NOT `origin` unconditionally: this repository's own remote is named `everdict`, and the first fixture run
// of this hook reported "no git remote" for the checkout it was written in. A repository with remotes has a
// name for them; assuming the conventional one is how a resolver reports absence for a present thing.
const firstRemote = git("remote")?.split("\n")[0]?.trim();
const originUrl =
  git("remote", "get-url", "origin") ?? (firstRemote ? git("remote", "get-url", firstRemote) : undefined);
const repository = originUrl ? (/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(originUrl)?.[1] ?? undefined) : undefined;

// A branch commonly carries the request it serves (`fix/DEFAUL-1-…`, `DIGO-7G-…`). It is a HINT, not an
// anchor: a pin's key for an issue is the record id, so the identifier has to be resolved before it can be
// asked with — which the session does, because the hook makes no calls of its own.
const issueHint = branch ? (/\b[A-Z][A-Z0-9]*-\d+\b/.exec(branch)?.[0] ?? undefined) : undefined;

// WHAT THIS CHECKOUT IS AT (DEFAUL-54). Half of the drift question; the other half is what the DEPLOYMENT is
// built from, and only the deployment knows that. The hook does not — and must not — fetch it: carrying no
// credential is what lets a machine with no Everdict configured degrade to a sentence rather than a failed
// request. So the hook states its half and names the one read that answers the other.
const head = git("rev-parse", "HEAD");

// ...and the comparison is only meaningful where this checkout IS Everdict's source (DEFAUL-189). Anywhere
// else the deployment's commit is a sha this repository never had, and a session told to `merge-base` it
// spends a turn learning nothing — measured in the foreign-repo trial. The source is recognised by what it
// publishes, not by its name or remote: its marketplace lists the `everdict` plugin. A repository that
// publishes its own plugin has a marketplace too, so the plugin's NAME is the test.
const isEverdictSource = (() => {
  const manifest = root ? path.join(root, ".claude-plugin", "marketplace.json") : undefined;
  if (!manifest || !existsSync(manifest)) return false;
  try {
    const plugins = JSON.parse(readFileSync(manifest, "utf8"))?.plugins;
    return Array.isArray(plugins) && plugins.some((p) => p?.name === "everdict");
  } catch {
    // An unreadable manifest answers "not shown to be the source": the paragraph is advice, and withholding
    // it costs one comparison, while emitting it in a foreign repository costs a wasted turn.
    return false;
  }
})();

// ONE resolver, reaching worktrees (DEFAUL-261, `lib/workspace.mjs`): a `git worktree add` checkout of a
// repository whose MAIN worktree declares `.everdict/workspace` resolves it too, and names WHERE it came
// from — `.everdict/workspace` alone would have been silent in every such worktree, which measured as ~150
// of 151 checkouts of one opted-in repository resolving nothing.
//
// ── A CHECKOUT LINKS ITSELF TO THE WORKSPACE WHOSE PRODUCT LISTS IT (DEFAUL-269) ────────────────────
// This is the only HOOK making the product-lookup call (`lib/link-from-products.mjs`, shared with
// `mcp-headers.mjs` — round 2: the headersHelper needs the same answer and cannot wait for SessionStart to
// have run first). Every other guard here carries no credential and makes no call of its own.
// Read ONCE and carried everywhere this session needs "does a credential exist" — the auto-link attempt
// below and the methodology lookup further down both need it, and a caller that already read the registry
// for one reason must not read it again for another (rule `protocol` L3, the same reason `linkFromProducts`
// takes it as a parameter rather than reading the file itself).
const credentials = readCredentials();
let resolved = resolveWorkspace(cwd);
let linkOutcome;
if (resolved?.kind === "unlinked") {
  linkOutcome = await linkFromProducts({ root: resolved.root, repository: resolved.repository, credentials });
  if (linkOutcome?.linked) resolved = linkOutcome.linked;
}
const workspace = resolved?.kind === "linked" ? resolved.workspace : undefined;
const workspaceFrom = resolved?.kind === "linked" ? resolved.from : undefined;

const LINK_FIRST_LINES = [
  "1. `list_workspaces` — exactly one visible is the answer, no question; with several, the one whose products list this repository; ask only if that still leaves more than one.",
  "2. `mkdir -p .everdict && echo <workspace> > .everdict/workspace`",
  "3. Not Everdict work: `echo none > .everdict/workspace` — silent from then on, and on the record.",
  "4. For a credential: `/everdict:setup`.",
];

if (resolved?.kind === "opted-out") {
  await emit(
    [
      "# Everdict — this repository has opted out",
      "",
      "`.everdict/workspace` says `none`: nothing about this session is recorded, and no hook here refuses a",
      "change — including the first one, which every UNLINKED checkout otherwise would.",
    ].join("\n"),
  );
}

if (resolved?.kind === "unlinked") {
  const notes = [];
  if (linkOutcome?.matches?.length > 1) {
    notes.push(
      `Several workspaces list this repository: ${linkOutcome.matches.map((m) => `**${m.workspaceId}** (product ${m.product})`).join(", ")}.`,
      "Not linked automatically — several matches means guessing, which is exactly what this never does. Pick one below.",
      "",
    );
  }
  if (linkOutcome?.unknown?.length > 0) {
    notes.push(
      "Could not check whether these workspaces list this repository (their own lookup failed — **unknown**, never",
      `read as "no match"): ${linkOutcome.unknown.join(", ")}.`,
      "",
    );
  }
  await emit(
    [
      "# Everdict — this checkout is not linked to a workspace",
      "",
      `This repository (${repository ?? "no git remote"}) does not resolve to an Everdict workspace, so`,
      "**every edit and Bash change inside it is refused until it is** — writing `.everdict/workspace` itself",
      "is the one exception. Link it, or say this is not Everdict work:",
      "",
      ...notes,
      ...LINK_FIRST_LINES,
    ].join("\n"),
  );
}

if (!workspace) {
  await emit(
    [
      "# Everdict — not resolved for this checkout",
      "",
      `This repository (${repository ?? "no git remote"}) names no Everdict workspace, so nothing about this`,
      "session will be recorded and the Stop guard will not hold you to it.",
      "",
      "To put this repository's work on the record, pick its workspace (the only one `list_workspaces` shows, else the one whose products list this repository) and write it:",
      "",
      "    mkdir -p .everdict && echo '<workspace-id>' > .everdict/workspace",
      "",
      "(or export EVERDICT_WORKSPACE=<workspace-id> for a one-off). `everdict-api list_workspaces` shows what exists.",
    ].join("\n"),
  );
}

// ── THE STORE FIRST, THE PLUGIN'S SEED AS FALLBACK (DEFAUL-271 part 3) ───────────────────────────────
// `workspace` is defined from here on — both earlier branches `emit` (which exits) when it is not. One
// lookup, `~/.everdict/skills/<workspace>/**` written when it resolves from the store, and one row on the
// same meter `capture-guard.mjs` writes to, so "what did this session run with" is answerable from one file.
// ── A SESSION BOUND TO A GOAL IS TOLD SO, BEFORE IT DOES ANYTHING ELSE (DEFAUL-281) ────────────────────
// No network call: `.everdict/goal` names an id, and everything else about the goal — its name, its
// `doneWhen`, what `next_work` answers — is a READ the session makes itself, the same law as the workspace
// link above carrying no credential here. `/everdict:goal` writes the file; this only reads it.
const checkoutGoal = workspace ? readGoal(root) : undefined;
// DEFAUL-868: the checkout is shared, the goal is not — only the session that bound it is told it is bound.
const goal =
  checkoutGoal && typeof input.session_id === "string" && checkoutGoal.session === input.session_id
    ? checkoutGoal
    : undefined;
const goalSection = goal
  ? [
      `## This session is bound to a goal — ${goal.kind} \`${goal.id}\``,
      "",
      "Before anything else, read what it is and what is next under it:",
      "",
      "```",
      `everdict-api next_work --kind ${goal.kind} --id ${goal.id}`,
      "```",
      "",
      "That answers the goal's name and `doneWhen`, and ranks its open issues — work its FIRST item. `state`",
      "`work_available` means pick up what it names; `nothing_open` or `empty` means the goal's `doneWhen` still",
      "needs issues filed under it (see skill `advance_the_goal`) or, with every line's evidence in hand, the",
      'goal completed. The Stop guard will not let this session end on "one issue solved" while this goal is',
      "not — it re-asks `next_work` itself before agreeing to stop.",
      "",
    ]
  : checkoutGoal && checkoutGoal.session === undefined
    ? [
        `## This checkout carries an old goal binding — ${checkoutGoal.kind} \`${checkoutGoal.id}\``,
        "",
        `It names no session, so no session is held to it; ${REBIND_HINT}.`,
        "",
      ]
    : [];

const bundledSeed = bundledSeedSkills();
const methodology = await resolveMethodology({ workspace, credentials, bundled: bundledSeed });
try {
  const dir = path.join(os.homedir(), ".everdict");
  mkdirSync(dir, { recursive: true });
  appendFileSync(
    path.join(dir, "stop-guard.jsonl"),
    `${JSON.stringify({
      at: new Date().toISOString(),
      workspace,
      session: typeof input.session_id === "string" ? input.session_id : undefined,
      outcome: "session_start",
      origin: process.env.EVERDICT_STOP_GUARD_ORIGIN?.trim() || undefined,
      methodology: methodologyLedgerField(methodology),
    })}\n`,
  );
} catch {
  // Same law as the meter in capture-guard.mjs: a local append that never decides anything, so a failed
  // write here costs a row, never a session.
}

// ── A CHANGE AN EARLIER SESSION COULD NOT GET ON THE RECORD (DEFAUL-194) ─────────────────────────────
// The Stop guard files an issue when a session changed this repository and ended with nothing recorded. When
// it could not — no control plane URL, no EVERDICT_API_KEY, the plane unreachable — it wrote `filed:false` to
// the local ledger and deferred to the next session, which HAS the door. This is that hand-off. Local
// file only: this hook still makes no network call and carries no credential.
// ⚠️ ONCE: a row is marked surfaced as it is shown, so the next session start does not repeat it. A reminder
// that recurs every session is noise, and noise is what gets skipped.
const ledgerFile = path.join(os.homedir(), ".everdict", "stop-guard.jsonl");
const unfiled = (() => {
  if (!root || !existsSync(ledgerFile)) return [];
  let rows;
  try {
    rows = readFileSync(ledgerFile, "utf8")
      .split("\n")
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
  const surfaced = new Set(rows.filter((r) => r.outcome === "surfaced_unfiled").map((r) => r.of));
  const since = Date.now() - 14 * 24 * 60 * 60 * 1000;
  return rows
    .filter(
      (r) =>
        r.filed === false &&
        r.workspace === workspace &&
        r.root === root &&
        typeof r.session === "string" &&
        !surfaced.has(r.session) &&
        Date.parse(r.at) >= since,
    )
    .slice(-5);
})();
if (unfiled.length > 0) {
  try {
    mkdirSync(path.dirname(ledgerFile), { recursive: true });
    for (const r of unfiled)
      appendFileSync(
        ledgerFile,
        `${JSON.stringify({
          at: new Date().toISOString(),
          workspace,
          root,
          outcome: "surfaced_unfiled",
          of: r.session,
          origin: process.env.EVERDICT_STOP_GUARD_ORIGIN?.trim() || undefined,
        })}\n`,
      );
  } catch {
    // Marking failed: the reminder may show again. Over-telling, never under-telling.
  }
}
const unfiledSection =
  unfiled.length === 0
    ? []
    : [
        "## ⚠️ Earlier sessions changed this repository and nothing is on the record",
        "",
        "The Stop guard could not file these itself (no credential or no reachable control plane), so this session",
        "is the only way the workspace will learn of them. For each, `everdict-api create_issue` (with `requestSource: {kind: agent}` and a `brief` that says honestly this change was never declared — risk `medium` for that reason) with exactly the facts below —",
        "the guard recorded them at the time, so copy them rather than reconstructing them from git — then",
        "account for it like any other change:",
        "",
        ...unfiled.flatMap((r) => [
          `- session \`${r.session}\` — started ${r.startedAt ?? "(unknown)"}, ended ${r.at}, HEAD \`${r.head ?? "unknown"}\`${r.repository ? ` in \`${r.repository}\`` : ""}${r.breakGlass ? ` — ended through break-glass: ${r.breakGlass}` : ""}${r.why ? ` — not filed: ${r.why}` : ""}`,
          ...(Array.isArray(r.commits) && r.commits.length > 0
            ? r.commits.map((c) => `    - commit \`${c}\``)
            : ["    - no commits in its window (the change was left uncommitted in the working tree)"]),
        ]),
        "",
        "This is shown once.",
        "",
      ];

const driftSection = isEverdictSource
  ? [
      "## ⚠️ First, check you are not being handed an older contract than your code",
      "",
      "```",
      "everdict-api get_deployment",
      "```",
      "",
      head ? `Your checkout is at \`${head}\`.` : "This checkout's HEAD could not be read.",
      "",
      '⚠️ **The dangerous case is a deployment BEHIND you, and it is an ANCESTOR of your HEAD — so "is it a commit',
      'I have?" answers *yes* for exactly the case that bites.* Compare them like this:',
      "",
      "```",
      "git merge-base --is-ancestor <commit> HEAD   # exit 0 AND <commit> != HEAD  →  the deployment is BEHIND",
      "```",
      "",
      "Behind means the service you are about to call is OLDER than your code: a defect you just fixed can still be",
      "live, and a route you expect may be absent. **Say the deployment is behind — do not",
      "re-open the finding.** Measured 2026-09-18: four merged, gated, pushed fixes were invisible to a session,",
      "and two findings were nearly re-opened on that basis. If `commit` is NOT an ancestor, the deployment is on",
      "a different line than your checkout. `commit: null` means the image carries no stamp at all — neither",
      "agreement nor staleness, and nothing you can compare.",
      "",
      "`get_deployment` also lists `runners` — each self-hosted runner's build with `same` / `behind` / `unknown`.",
      "A control-plane deploy does not redeploy a runner: one marked `behind` still executes the old harness and",
      "job-runner code, so its cases do not carry the fixes the deployment reports. Say so, and have the runner",
      "rebuilt and restarted before you trust a measurement taken on it (DEFAUL-434).",
      "",
    ]
  : [];

const mcpScope = detectEverdictMcp(root);
const identity = [
  "# Everdict is this project's system of record",
  "",
  `- workspace: **${workspace}** (from ${workspaceFrom})`,
  `- repository: **${repository ?? "unknown"}**${branch ? ` · branch \`${branch}\`` : ""}`,
  "",
  ...contractLines({ workspace, repository, issueHint }),
];
// compact / resume: the conversation already holds the rest — the contract comes back without the essay.
if (input.source === "compact" || input.source === "resume") await emit(identity.join("\n"));

await emit(
  [
    ...identity,
    ...(mcpLine(mcpScope) ? ["", mcpLine(mcpScope)] : []),
    "",
    ...goalSection,
    ...unfiledSection,
    ...driftSection,
    "## How an operation is invoked",
    "",
    "`everdict-api <op> [--id <id>] [--query k=v] [--body '{…}' | @file]`; `everdict-api describe <op>` shows a body,",
    "`everdict-api ops [filter]` lists operations. Exit 3 = outcome UNKNOWN: read before repeating a write.",
    "",
    "## The loop (full text: skill `everdict-sdlc`)",
    "",
    "1. `everdict-api open_change_campaign --body @campaign.json` — criteria declared BEFORE the work; then `everdict-api delegation_readiness`.",
    "2. Change, verify, then `everdict-api log_change_round --id <campaign> --body @round.json` with numbers; commits as `{sha, at}`",
    "   (`git log -1 --format=%cI <sha>`). A non-adopted round asks for the NEXT round on the same campaign.",
    `   Every record's \`tenant\`, and it must be **${workspace}**.`,
    "3. Adopted: `everdict-api mint_change_report --id <campaign>`, `close_change_campaign`, `set_issue_status` done. Later work: `continues`.",
    "4. Before you stop: `everdict-api create_knowledge_entry` (refs: the issue and the repository) — or `/everdict:record`.",
    "",
    "## Pull more when you need it",
    "",
    "- `/everdict:campaign` opens issue + campaign; `/everdict:delegate` hands code work to a delegate; `/everdict:record` records.",
    "- Skill `everdict-sdlc` holds the full loop: supervisor steps, reference keys, retrieval use, `search_files`, stop rules.",
    ...(issueHint === undefined
      ? ["- `everdict-api list_issues` — the work probably belongs to an open request."]
      : []),
    ...(methodologyContextLines(methodology).length > 0 ? ["", ...methodologyContextLines(methodology)] : []),
  ].join("\n"),
);
