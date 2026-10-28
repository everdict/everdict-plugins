#!/usr/bin/env node
// PreToolUse + PostToolUse — a change to this repository, in a session that has named no change campaign, is
// REFUSED. Every time, not once (DEFAUL-262): a "fires once" guard is a notice on the second call onward, and
// the DEFAUL-185 trial's own sessions treated a campaign opened after their first interrupt as fully declared
// — the settled-marker design just moved that same failure one call later. So this hook keeps NO memory of
// having already spoken; it asks the same question on every call and answers it the same way every time.
//
// Why at the change and not at Stop. The Stop guard asks whether a round EXISTS, and a round can be written
// at the end. MEASURED in the DEFAUL-185 trial — a repository with no Everdict knowledge, the plugin alone:
// session 1 read the SessionStart context, edited at tool call #11, committed and pushed at #21, and made its
// first Everdict call at #23. A criterion written after the work describes the outcome instead of judging it —
// the one place the methodology says ORDER is the point, and the only enforcement was at the end.
//
// WHY THE REPOSITORY DECIDES A Bash CHANGE, NOT THE TOOL NAME. Both trial sessions made their first edit
// through Bash — a python heredoc `open(p,'w').write(…)` — and neither ever used Edit for it. So PreToolUse
// fingerprints the tree and PostToolUse fingerprints it again; a Bash call changed the repository iff the two
// differ (`lib/tree-fingerprint.mjs`, shared with SessionStart and the Stop guard, DEFAUL-205). A HEAD move
// alone is not "the tree differs" (DEFAUL-293): following a remote writes nothing the session authored, so
// `treeChanged` counts one only when it brought in a local-only commit or one HEAD's reflog says was authored.
//
// WHO MADE THE CALL, NOT JUST WHETHER ONE WAS NAMED (DEFAUL-263). A local subagent has no session of its own
// — no brief, no report, no round — so its edits cannot be judged even when the supervisor's session HAS
// named a campaign; and a campaign that declared `delegation: { required: true }` means code work goes to a
// runtime delegate, not to a hand-edit tool in this session, supervisor included. Both refuse the EDIT TOOLS
// (Edit/Write/MultiEdit/NotebookEdit); a Bash call that lands a delegate's own patch — the supervisor's
// integration lane — is not caught by the delegation-required branch, stated as a limit below.
//
// ── LINK FIRST (DEFAUL-270) — A SEPARATE, NARROWER GATE THAT RUNS BEFORE ANY OF THE ABOVE APPLIES ─────
// A checkout `resolveWorkspace` reads as `unlinked` (a git repository, but no workspace resolves for it from
// any source — env, its own declaration, its main worktree's, or the repository cache) has no campaign
// vocabulary to speak of yet: there is nowhere for a round to land. So it gets its own refusal instead — every
// edit tool inside the checkout is denied, and a Bash call that changes anything besides `.everdict/workspace`
// is blocked — with exactly one way out: write that one file (a workspace id, to link, or `none`, to opt
// out). `opted-out` is silent here, like every other guard.
//
// ⚠️ A Bash CALL CAN LINK THE REPOSITORY MID-CALL, so its PostToolUse verdict must be judged by what
// PreToolUse saw, not by what is true a process later. The state this hook stashes between the two carries
// its OWN `kind` (`"unlinked"` or `"linked"`) captured at PreToolUse time; PostToolUse reads that kind back
// rather than re-resolving fresh — otherwise a Bash call that both writes `.everdict/workspace` AND changes
// something else would read as "linked now" at Post and slip through unjudged by either gate.
//
// Kept from the guard this replaces:
//   · only where the repository OPTED IN (`resolveWorkspace`, DEFAUL-261 — reaches a worktree too);
//   · UNKNOWN IS NOT A REFUSAL — no git, no fingerprint → allow;
//   · BREAK-GLASS — `EVERDICT_BREAK_GLASS='<reason>'` lets the change through and the reason is metered.
//
// What it cannot see, stated: a concurrent session changing the same tree between this call's Pre and Post is
// attributed to this call. That over-asks, once, in a shared tree — the narrower wrong. And a supervisor
// under `delegation.required` can still write a file through Bash (the integration lane above) — the guard
// refuses the hand-edit TOOLS, not every path bytes can reach the tree through.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { delegationOrderLines } from "./lib/delegation-order.mjs";
import { sessionCampaigns } from "./lib/session-campaigns.mjs";
import { changedPaths, dirtySnapshot, treeChanged, treeFingerprint } from "./lib/tree-fingerprint.mjs";
import { declarationPathIn, resolveWorkspace } from "./lib/workspace.mjs";

const stdin = await new Promise((resolve) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
  });
  process.stdin.on("end", () => resolve(buf));
});
const silent = () => process.exit(0);

let input = {};
try {
  input = JSON.parse(stdin || "{}");
} catch {
  silent();
}
const event = input.hook_event_name;
if (event !== "PreToolUse" && event !== "PostToolUse") silent();

const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process.cwd();
const resolved = resolveWorkspace(cwd);
if (!resolved || resolved.kind === "opted-out") silent();
const { root } = resolved;
const workspace = resolved.kind === "linked" ? resolved.workspace : undefined;

const session = typeof input.session_id === "string" && input.session_id.length > 0 ? input.session_id : undefined;
if (!session) silent();

const isSubagent = typeof input.agent_id === "string" && input.agent_id.length > 0;
const breakGlass = process.env.EVERDICT_BREAK_GLASS?.trim();
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const stateDir = path.join(os.tmpdir(), "everdict-first-change", session.replace(/[^A-Za-z0-9_-]/g, "_"));

// A meter, never a decision (the Stop guard's DEFAUL-35 rule): one line, failures swallowed.
const meter = (outcome, extra = {}) => {
  try {
    const dir = path.join(os.homedir(), ".everdict");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, "first-change-guard.jsonl"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        workspace,
        session,
        origin: process.env.EVERDICT_STOP_GUARD_ORIGIN?.trim() || undefined,
        tool: input.tool_name,
        outcome,
        ...extra,
      })}\n`,
    );
  } catch {
    // A meter that could not write decides nothing either way — it just leaves the count short.
  }
};

const deny = (lines, outcome) => {
  meter(outcome);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: lines.join("\n"),
      },
    }),
  );
  process.exit(0);
};
const block = (lines, outcome) => {
  meter(outcome);
  process.stdout.write(JSON.stringify({ decision: "block", reason: lines.join("\n") }));
  process.exit(0);
};

const editTarget = () => {
  const target =
    typeof input.tool_input?.file_path === "string"
      ? input.tool_input.file_path
      : typeof input.tool_input?.notebook_path === "string"
        ? input.tool_input.notebook_path
        : undefined;
  return target === undefined ? undefined : path.resolve(cwd, target);
};

const linkFirstLines = (subject) => [
  `${subject}, and this checkout is not linked to an Everdict workspace — so there is nowhere for a`,
  "campaign or a record to land yet. Link it, or say this is not Everdict work, before anything else:",
  "",
  "1. `list_workspaces` — exactly one visible is the answer, no question; with several, the one whose products list this repository; ask only if that still leaves more than one.",
  "2. `mkdir -p .everdict && echo <workspace> > .everdict/workspace`",
  "3. Not Everdict work: `echo none > .everdict/workspace` — silent from then on, and on the record.",
  "4. For a credential: `/everdict:setup`.",
  "",
  "Every edit and Bash change inside this repository is refused until one of those happens — writing",
  "`.everdict/workspace` itself is the one exception. To proceed without it, restart with",
  "EVERDICT_BREAK_GLASS='<reason>' — the reason is recorded.",
];

const gitSays = (args, atRoot) => {
  try {
    return execFileSync("git", ["-C", atRoot ?? cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
};
const repositoryName = () => {
  const firstRemote = gitSays(["remote"], root)?.split("\n")[0]?.trim();
  const remoteUrl = firstRemote ? gitSays(["remote", "get-url", firstRemote], root)?.trim() : undefined;
  return remoteUrl ? (/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(remoteUrl)?.[1] ?? "<owner>/<name>") : "<owner>/<name>";
};

const unnamedLines = (subject) => [
  `${subject}, and this session has named no change campaign in workspace '${workspace}' — so the work has no`,
  "declared criteria to be judged by and no lineage back to what was asked. Declare BEFORE the rest of it:",
  "",
  ...delegationOrderLines(repositoryName()),
  "",
  "This refuses every time until a campaign is named — a declaration made after the work describes the",
  "outcome instead of judging it. To proceed without it, restart with EVERDICT_BREAK_GLASS='<reason>' — the",
  "reason is recorded.",
];
const subagentLines = (subject) => [
  `${subject}, made by a LOCAL SUBAGENT.`,
  "",
  "A local subagent has no session of its own — no brief, no report, no round — so nothing it edits can be",
  "judged or verified independently, even though this session has named a campaign. The remedy is delegation",
  "to the runtime, not a local subagent:",
  "",
  "  /everdict:delegate   — calls everdict-api create_sandbox (profile, issueId, changeCampaignId)",
  "",
  "To proceed without it, restart with EVERDICT_BREAK_GLASS='<reason>' — the reason is recorded.",
];
const delegationRequiredLines = (subject) => [
  `${subject}, and this session's campaign in workspace '${workspace}' declared delegation required.`,
  "",
  "Code work under this campaign goes to a delegate on the runtime, not to a hand-edit tool in this session:",
  "",
  "  /everdict:delegate   — calls everdict-api create_sandbox (profile, issueId, changeCampaignId)",
  "",
  "⚠️ Stated limit: a Bash call that lands the delegate's own patch (a merge, a commit, the supervisor's",
  "integration lane) is not refused by this rule — only the hand-edit tools are. To proceed without it,",
  "restart with EVERDICT_BREAK_GLASS='<reason>' — the reason is recorded.",
];

// ── PreToolUse ───────────────────────────────────────────────────────────────────────────────────────
if (event === "PreToolUse") {
  if (EDIT_TOOLS.has(input.tool_name)) {
    const resolvedTarget = editTarget();
    if (resolvedTarget === undefined) silent();
    const insideRoot = resolvedTarget === root || resolvedTarget.startsWith(root + path.sep);
    if (!insideRoot) silent();

    if (resolved.kind === "unlinked") {
      if (resolvedTarget === declarationPathIn(root)) silent();
      if (breakGlass) {
        meter("break_glass");
        silent();
      }
      deny(linkFirstLines(`An edit to '${resolvedTarget}' inside this unlinked repository`), "denied_unlinked");
    }

    if (breakGlass) {
      meter("break_glass");
      silent();
    }
    const { named, delegationRequired } = await sessionCampaigns({
      transcriptPath: input.transcript_path,
      sessionId: session,
    });
    const subject = `An edit to '${resolvedTarget}' inside this repository`;
    if (!named) deny(unnamedLines(subject), "denied_unnamed");
    if (isSubagent) deny(subagentLines(subject), "denied_subagent");
    if (delegationRequired) deny(delegationRequiredLines(subject), "denied_delegation_required");
    silent();
  }

  if (input.tool_name === "Bash") {
    const before = resolved.kind === "unlinked" ? dirtySnapshot(root) : treeFingerprint(root);
    if (before !== undefined) {
      const callKey = String(input.tool_use_id ?? "last").replace(/[^A-Za-z0-9_-]/g, "_");
      try {
        mkdirSync(stateDir, { recursive: true });
        writeFileSync(path.join(stateDir, `pre-${callKey}.json`), JSON.stringify({ kind: resolved.kind, before }));
      } catch {
        // No pre-record means PostToolUse will not know, and not knowing allows.
      }
    }
  }
  silent();
}

// ── PostToolUse — Bash only (hooks.json) ────────────────────────────────────────────────────────────
if (input.tool_name !== "Bash") silent();
const callKey = String(input.tool_use_id ?? "last").replace(/[^A-Za-z0-9_-]/g, "_");
const preFile = path.join(stateDir, `pre-${callKey}.json`);
let state;
try {
  state = JSON.parse(readFileSync(preFile, "utf8"));
  rmSync(preFile, { force: true });
} catch {
  silent();
}

// ── LINK FIRST'S half of the Bash verdict — judged by what PreToolUse SAW, never by what is true now ──
// `dirtySnapshot` excludes `.everdict/**` (DEFAUL-269 round 2, `lib/tree-fingerprint.mjs`), so a Bash call
// whose ONLY change is `.everdict/workspace` now produces an EMPTY diff — the same shape as no change at
// all — and this no longer needs to name that one path specially, only ask whether the diff is empty.
if (state.kind === "unlinked") {
  const after = dirtySnapshot(root);
  if (after === undefined) silent();
  const changed = changedPaths(state.before, after);
  if (changed.length === 0) silent();
  if (breakGlass) {
    meter("break_glass");
    silent();
  }
  block(linkFirstLines("A Bash call changed this repository"), "interrupted_unlinked");
}

const before = state.before;
const after = treeFingerprint(root);
if (!treeChanged(root, before, after)) silent();

if (breakGlass) {
  meter("break_glass");
  silent();
}
const { named } = await sessionCampaigns({ transcriptPath: input.transcript_path, sessionId: session });
const subject = "A Bash call changed this repository";
if (!named) block(unnamedLines(subject), "interrupted");
if (isSubagent) block(subagentLines(subject), "interrupted_subagent");
// Named, and not a local subagent — allowed even under delegation-required: the supervisor's integration
// lane (landing a delegate's patch, running its own gates) is not a hand-edit and is not refused here.
silent();
