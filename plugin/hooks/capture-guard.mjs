#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { resolveApiCredential } from "./lib/api-credential.mjs";
import { REBIND_HINT, fetchNextWork, readGoal } from "./lib/goal.mjs";
// Stop — a session that changed code and recorded nothing in Everdict is refused ONCE.
//
// Why a refusal rather than a reminder: the system-of-record decision measured what guidance achieves
// (`docs/architecture/repository.md`, "What was rejected" — "a skill is advisory; a policy
// that must hold needs something that refuses"). A coding session on this machine on 2026-09-16 fixed a
// defect end to end and recorded nothing; nothing asked it to.
//
// Three properties keep the refusal from becoming a trap:
//   · it fires ONCE — `stop_hook_active` is the harness's own loop guard, and a second pass lets the session end;
//   · it fires only where the repository OPTED IN — no `.everdict/workspace` (or EVERDICT_WORKSPACE) means no
//     refusal, because a session that cannot name a workspace has nowhere to record and being told twice is noise;
//   · it has a BREAK-GLASS — `EVERDICT_BREAK_GLASS='<reason>'` lets the session end and reports the reason,
//     so the escape is visible afterwards rather than silent.
//
// The evidence is the transcript for what the session ASKED FOR, and the REPOSITORY for whether code
// changed — see `changedCode` below, which used to read tool names and was wrong in both directions.
import { appendPrRow, owedMerges } from "./lib/pr-journal.mjs";
import { readPromptState } from "./lib/prompt-state.mjs";
import { ReceiptCollector, isSafeSessionId, landed, opMatcher, sessionReceipts } from "./lib/receipts.mjs";
import { readBaseline, treeChanged, treeFingerprint } from "./lib/tree-fingerprint.mjs";
import { resolveWorkspace } from "./lib/workspace.mjs";

const stdin = await new Promise((resolve) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
  });
  process.stdin.on("end", () => resolve(buf));
});

// ⚠️ SET LATE, READ ON EVERY EXIT (DEFAUL-196). Declared here rather than beside its assignment because the
// early `if (!workspace) allow()` runs before that point, and a `let` in between would be a TDZ crash in the
// one path that has no workspace at all — a guard that throws is a guard that stops guarding.
let workspaceMismatch;
const allow = (systemMessage) => {
  // A session writing into the wrong workspace has to hear about it on EVERY ending, not only the refusing
  // ones: the quiet case — everything recorded, allowed, and filed somewhere else — is the dangerous one.
  const message = [workspaceMismatch, systemMessage].filter(Boolean).join(" ") || undefined;
  process.stdout.write(message ? JSON.stringify({ systemMessage: message }) : "{}");
  process.exit(0);
};

let input = {};
try {
  input = JSON.parse(stdin || "{}");
} catch {
  process.exit(0);
}

// The harness sets this on the pass that follows a block. Refusing again here is how a Stop hook becomes an
// infinite loop, so this pass can only ever ALLOW — every exit below it on this pass is an `allow`.
//
// ⚠️ IT USED TO STOP READING HERE, AND THAT IS HOW A DECLINED REFUSAL LEFT NOTHING (DEFAUL-194). Measured on
// the pushed plugin: a session told by its user to skip issues and records was blocked at its first change,
// refused at Stop, obeyed its user — rightly — and ended on this pass. The workspace held nothing; the only
// trace was two lines in the operator's local ledgers. So this pass is now EVALUATED, and a session that
// changed code and recorded nothing files one issue saying so (`fileUnrecorded` below) before it is let go.
const endingPass = input.stop_hook_active === true;

const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process.cwd();
// ONE resolver, reaching worktrees (DEFAUL-261) — the only reader of the workspace declaration. `unlinked`
// and `opted-out` are silent here, like every other non-linked kind: an unlinked checkout has no workspace to
// hold a record accountable to, and the link-first refusal (`first-change-guard.mjs`) is the one that speaks
// for it instead.
const resolvedWorkspace = resolveWorkspace(cwd);
const root = resolvedWorkspace?.kind === "linked" ? resolvedWorkspace.root : undefined;
const workspace = resolvedWorkspace?.kind === "linked" ? resolvedWorkspace.workspace : undefined;
const declaredBy = resolvedWorkspace?.kind === "linked" ? resolvedWorkspace.from : undefined;
if (!workspace) allow();
// `.everdict/goal` (DEFAUL-281) — read once, like the workspace declaration above. `undefined` means this
// checkout carries no goal, and every branch below reads that exactly as it read the pre-DEFAUL-281 world.
const goal = readGoal(root);

// ── A MERGE THE PULL-REQUEST HOOK SAW AND COULD NOT RECORD IS OWED, ONCE (DEFAUL-427) ───────────────────
//
// `pr-record-hook.mjs` records a `gh pr create`/`gh pr merge` on its issue. When it saw a MERGE and could not —
// no bound issue, a refusal, an unknown outcome — it journalled that, and this refuses the ending once, naming the
// pull request. "Once": a `refused` row in the same journal clears it, so the session that cannot or will not record it is
// not held forever (the same rule as this guard's loop guard); a later successful record clears it too.
{
  const owedSession =
    typeof input.session_id === "string" && input.session_id.length > 0
      ? input.session_id
      : typeof input.transcript_path === "string"
        ? path.basename(input.transcript_path).replace(/\.jsonl$/, "")
        : undefined;
  const owed = owedSession === undefined || process.env.EVERDICT_BREAK_GLASS?.trim() ? [] : owedMerges(owedSession);
  if (owed.length > 0 && !endingPass) {
    for (const row of owed) appendPrRow(owedSession, { kind: "refused", url: row.url });
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason: [
          `This session merged ${owed.length === 1 ? "a pull request" : `${owed.length} pull requests`} that is NOT on the request's record in workspace '${workspace}':`,
          "",
          ...owed.map(
            (row) => `  - ${row.url}${row.number ? ` (#${row.number})` : ""} — ${row.reason ?? "not recorded"}`,
          ),
          "",
          "Record it — the merged sha is what ties the request to the code that shipped it:",
          "",
          '    everdict-api record_pull_request --id <issue> --body \'{repository, number, url, state:"merged", mergedSha, source:"gh_cli"}\'',
          "    everdict-api attach_round_pull_request --id <campaign> --seq <round> --body <the same json>   — when a round exists",
          "",
          "(`gh pr view <n> --json number,url,state,mergeCommit,headRefOid,title` gives every field.) This refuses once for each",
          "pull request; ending again lets the session go.",
        ].join("\n"),
      }),
    );
    process.exit(0);
  }
}

// What the session did, read from its own transcript. Unparsable lines are skipped rather than fatal: a
// partial read can only UNDER-report, and under-reporting a code change means not refusing — the safe
// direction for a guard that blocks.
// Asking the workspace what it already knows is the OTHER half, and the one a model skips most reliably:
// SRA-Bench measured weak need awareness — skills were loaded on roughly the same share of tasks whether or
// not the model was failing without them. A session that changed code having never asked is refused for that
// reason, separately from having recorded nothing, because they are different failures with different repairs.
// ⚠️⚠️ ONE DOOR, BECAUSE ONLY ONE OF THEM LEAVES THE MEASUREMENT (DEFAUL-134).
//
// This accepted three tools. Only `get_task_context` files anything: it runs `assembleContext`, which writes
// `knowledge/retrievals/<day>/<session>/assembly-*.json`. `list_knowledge_entries` and `get_knowledge_entry`
// call the entry service and record NOTHING. So a session satisfied this guard through a door that left no
// trace — of the series the comment below calls "the measurement that decides every later question about
// this layer".
//
// MEASURED when this was narrowed: 97 entries in the store, EIGHT assemblies in the workspace's entire
// history, TEN distinct entries ever cited as used, 42 never returned by any assembly at all. Across 69
// closed campaigns. The loop writes an entry per generation and retrieves almost never — and satisfied this
// guard the whole time.
//
// ⚠️ THAT TEN WAS TWELVE IN THE FIRST DRAFT, and the difference is the point. A hand count folded in
// `knowledge/retrievals/2026-09-16/plugin-loop-main.json` — a receipt a session TRANSCRIBED by hand before
// the writer existed, sitting at day level where the writer never puts anything. Two of its citations
// belong to no assembly. The live retrieval-series script (deleted in DEFAUL-802) excluded it and reported it
// separately; the hand count silently merged two corpora.
//
// ⚠️ THE OTHER FIX WAS TO MAKE ALL THREE FILE RECEIPTS, AND IT IS WORSE. `get_knowledge_entry` by id is not
// the same ACT: `get_task_context` asks "what does the workspace know about the things I named" and is
// answered by the workspace; `get_knowledge_entry` asks "give me this one I already chose" and is answered
// by me. Filing the second as a retrieval receipt would push the cited-share towards 100% — a session cites
// what it fetched by name — and the series would look healthier while measuring less. A measurement made
// flattering is worse than one left short.
//
// WHAT NARROWING COSTS, stated rather than skipped: a session that browses with `list_knowledge_entries`
// and reads one with `get_knowledge_entry` is now REFUSED until it also runs the anchored call. That is a
// real cost and it is the point — the anchored call is one tool call, and the refusal names it.
//
// ⚠️ THESE MATCH OPERATION NAMES ON THE REST DOOR'S RECEIPTS, NOT `mcp__…` TOOL NAMES (DEFAUL-296). This guard used
// to recognise an Everdict write only as an `mcp__everdict__<tool>` / `mcp__plugin_everdict_everdict__<tool>`
// `tool_use` block (two spellings of one server, DEFAUL-186), so a session that wrote the same records over REST
// was refused for campaigns it had fully logged, verdicted and closed (DEFAUL-288). The plugin now reaches
// Everdict only through `bin/everdict-api`, which leaves a receipt per call (`lib/receipts.mjs`); the operation
// names are the same vocabulary, and the fields are the REST ones (`changeCampaignId`, `respondsTo`, the path's
// `id`, `disposition`).
const RETRIEVAL_OPS = opMatcher(["get_task_context"]);
// …and the half of the retrieval record only the session can write. The assembly files what it ANSWERED;
// whether any of it was USED is knowable nowhere else, and it is the measurement that decides every later
// question about this layer (is an index worth building, which entries are dead weight, does curation help).
// Asked for at session start, so a session that retrieved and then said nothing about it is a gap with an
// owner rather than an oversight.
// The tool that files it: the platform resolves every cited entry and REFUSES an id it cannot, which a raw
// file write cannot do. A generic `write_file` at the same path still counts — a session that wrote the file
// before this tool existed accounted for itself, and refusing it would punish the older, honest shape.
const USE_OPS = opMatcher(["record_retrieval_use"]);
const WRITE_OPS = opMatcher(["write_file"]);
const USED_PATH = /^knowledge\/retrievals\/[^/]+\/[^/]+\/used\.json$/;
// ── WHAT A RECORD ANSWERS, AND WHY ONE KIND IS NOT ENOUGH ───────────────────────────────────────────
//
// A person who asked for work wants four things in order: what problem · what method · what result · WHAT
// VERIFICATION. Issues and knowledge answer the first and, between them, most of the second and third. None
// of them answers the fourth, because none of them carries a number: `gateRuns` with exit codes and metrics
// live on a change ROUND and nowhere else.
//
// ⚠️ MEASURED 2026-09-18, and this split exists because of it. A session spent hours on nine commits across
// five packages, filed five issues, closed them with resolution notes and wrote four knowledge entries — and
// `lint 0 · test 51/51 · build 51/51`, eight scanners and thirteen neutralizations seen red all ended up in
// git commit bodies, outside Everdict, unqueryable and uncomparable. The guard was satisfied by the first
// `create_issue` and never asked for the rest. It was not a lazy session; it was a guard asking a weaker
// question than the one it exists to force.
const RECORDING_OPS = opMatcher([
  "create_knowledge_entry",
  "create_issue",
  "update_issue",
  "set_issue_status",
  "create_comment",
  "create_task",
  "update_task",
  "open_campaign",
  "log_campaign_round",
  "settle_campaign",
  "campaign_decision",
  "publish_checkpoint",
  "request_verification",
]);

// The CHANGE grade — the unit a code change belongs to, and the only record that carries measurements.
// ⚠️ These three were absent from RECORDING_TOOLS entirely, so a session that ran the change loop perfectly
// was refused for having "recorded nothing", while one that only touched an issue passed. A guard that does
// not recognise the grade it guards is the first thing to fix.
const ROUND_OPS = opMatcher(["log_change_round"]);
const CHANGE_GRADE_OPS = opMatcher(["open_change_campaign", "log_change_round", "close_change_campaign"]);
// ── THE GOAL TABLE'S OWN SIGNAL (DEFAUL-281) — read from the TRANSCRIPT, not the workspace ─────────────
// A round this session logged with no LATER verdict on it. Order-based rather than campaign-matched: the
// last of either kind of call, in transcript order, decides `pendingVerdict` below — narrower than tracking
// per-campaign verdicts (a session running two campaigns at once can read as settled early), the same
// documented narrowing `roundCampaigns`' own window-based reads already carry elsewhere in this file.
const REVIEW_OPS = opMatcher(["review_change_report", "close_change_campaign"]);
// A delegate the session started for a campaign (`create_sandbox` + `change_campaign_id`) and the polls that
// say whether it is still running (`get_sandbox`) — the delegating row of the goal table reads both.
const SANDBOX_CREATE_OPS = opMatcher(["create_sandbox"]);
const SANDBOX_GET_OPS = opMatcher(["get_sandbox"]);

// The one tool name read as a literal rather than through a pattern, and therefore its own needle.
const BASH_TOOL = "Bash";

// ── WHAT A LINE MUST CONTAIN TO MATTER, DERIVED FROM THE MATCHERS (DEFAUL-34) ───────────────────────
//
// The scan below used to `readFileSync` the whole transcript and `JSON.parse` every line of it, at every
// Stop — which is per TURN, not per session. MEASURED on the two largest transcripts on this machine:
// 57 MB → 0.26 s / 207 MB peak RSS, 188 MB → 0.87 s / 579 MB. The cost tracked the file, and the set of
// checkouts that declare a workspace was about to become "all of them".
//
// Streaming fixes the memory; this fixes the parsing. Every flag is set by a `tool_use` block whose `name`
// is one of a known set, so a line containing none of those names cannot change any answer and need not be
// parsed.
//
// ⚠️ THAT IS SOUND ONLY WHILE "the strings a line must contain" and "the names the matchers accept" ARE THE
// SAME SET — so the first is COMPUTED FROM THE SECOND rather than written beside it. Each matcher is an
// `opMatcher` (`lib/receipts.mjs`) and carries the `needle` a transcript line must hold for it to matter — today
// the receipt marker, the one literal every door receipt line contains — and the filter asks for those. A new
// matcher cannot forget its needle, because nobody writes one. A predicate written twice has already diverged
// (rule `protocol` L3), and THIS one would diverge silently: under-reporting means not refusing, which is exactly
// why a needle that stopped covering its matcher would be invisible.
//
// ⚠️ A MATCHER WITH NO NEEDLE TURNS THE FILTER OFF, IT DOES NOT TURN THE GUARD OFF. A Stop hook that dies writes
// no decision, so throwing here would mean the guard stops REFUSING — the exact failure it exists to prevent.
// Without a sound needle there is no sound filter, so the honest degradation is to parse every line: the old
// cost, the same answers. What refuses an unsound matcher is the GATE (`scripts/check-plugin-hooks.mjs` drives
// that case), because a check can fail loudly and a hook can only fail silently.
const needleOf = (matcher) => {
  return matcher.needle;
};
const MATCHERS = [
  RETRIEVAL_OPS,
  USE_OPS,
  WRITE_OPS,
  RECORDING_OPS,
  ROUND_OPS,
  CHANGE_GRADE_OPS,
  REVIEW_OPS,
  SANDBOX_CREATE_OPS,
  SANDBOX_GET_OPS,
];
const needles = MATCHERS.map(needleOf);
const NEEDLES = needles.some((n) => typeof n !== "string" || n === "") ? undefined : [BASH_TOOL, ...new Set(needles)];

let committed = false;
// The campaigns this session logged a round on, by its own transcript (DEFAUL-206) — the only ones it can owe
// an ending. The workspace read below is by TIME WINDOW, and in a workspace several sessions share, a peer's
// round lands in every window.
const roundCampaigns = new Set();
let recorded = false;
let loggedRound = false;
let retrieved = false;
let filedUsed = false;
// ── THE GOAL TABLE'S OWN STATE (DEFAUL-281) ─────────────────────────────────────────────────────────
// `pendingVerdict`: true once a round is logged, false again once a review or close follows it — read in
// transcript ORDER, so what survives to the end of the scan is whether the LAST round this session logged
// still has nothing later judging it. `everdictWriteCount`: every Everdict write this session's transcript
// carries, used only as the goal loop guard's "did anything change since the last refusal" signal — it does
// not gate any existing decision above.
let pendingVerdict = false;
// A `rejected` review that asks for a `revise` is answered only by a LATER round naming it in `respondsTo`;
// until then it is the same debt as a round with no verdict. A `reframe` is answered by a successor campaign,
// which this transcript-order read cannot join, so it settles like any other verdict.
let pendingRevise = false;
let everdictWriteCount = 0;
// Delegations, by campaign: the sandbox each `create_sandbox {changeCampaignId}` started (its id is read from
// the receipt's result), the last status a `get_sandbox` poll of it reported, and how many
// polls found it still running — a running poll is progress for the loop guard, a completed one is not.
const delegations = new Map();
const closedCampaigns = new Set();
// Keys named by the `refs` of a knowledge entry this session wrote — the alternative record for a delegate that
// cannot report (DEFAUL-313): a finding that points at the sandbox or the campaign accounts for the row.
const knowledgeRefIds = new Set();
let runningPolls = 0;
const transcript = typeof input.transcript_path === "string" ? input.transcript_path : undefined;
// The session identity the journal is keyed by: the hook input's own `session_id`, else the transcript's basename
// (the identity every other ledger row in this file uses).
const sessionId =
  typeof input.session_id === "string" && input.session_id.length > 0
    ? input.session_id
    : transcript === undefined
      ? undefined
      : path.basename(transcript).replace(/\.jsonl$/, "");

// ── ONE RECEIPT, APPLIED (DEFAUL-296) ─────────────────────────────────────────────────────────────────────
// Only a receipt that LANDED (2xx) is an effect — a refused round is not a round logged, and a transport failure
// is `unknown`, which this question cannot answer "yes" to. Applied in transcript ORDER, then the journal's
// extras in `at` order, so `pendingVerdict` / `pendingRevise` keep their order-based meaning.
const applyReceipt = (receipt) => {
  if (!landed(receipt)) return;
  const op = receipt.op;
  const body = receipt.body ?? {};
  const params = receipt.pathParams ?? {};
  if (SANDBOX_CREATE_OPS.test(op) && typeof body.changeCampaignId === "string") {
    const id = receipt.result?.id ?? receipt.result?.sandbox?.id;
    delegations.set(body.changeCampaignId, {
      sandboxId: typeof id === "string" ? id : undefined,
      status: undefined,
    });
  }
  if (SANDBOX_GET_OPS.test(op)) {
    const status = receipt.result?.live?.delegate?.status;
    const d = [...delegations.values()].find((x) => x.sandboxId === params.id);
    if (typeof status === "string" && d) {
      d.status = status;
      if (status !== "completed") runningPolls += 1;
    }
  }
  if (op === "create_knowledge_entry" && Array.isArray(body.refs)) {
    for (const ref of body.refs) if (typeof ref?.key === "string") knowledgeRefIds.add(ref.key);
  }
  if (RECORDING_OPS.test(op) || CHANGE_GRADE_OPS.test(op)) {
    recorded = true;
    everdictWriteCount += 1;
  }
  if (ROUND_OPS.test(op)) {
    loggedRound = true;
    pendingVerdict = true;
    // A round that names a verdict in `respondsTo` is the answer to an outstanding revise.
    if (Array.isArray(body.respondsTo) && body.respondsTo.length > 0) pendingRevise = false;
    if (typeof params.id === "string") roundCampaigns.add(params.id);
  }
  if (REVIEW_OPS.test(op)) {
    const revise =
      op === "review_change_report" &&
      body.disposition?.kind === "rejected" &&
      body.disposition.directive?.kind !== "reframe";
    pendingVerdict = false;
    pendingRevise = revise;
    if (op === "close_change_campaign" && typeof params.id === "string") closedCampaigns.add(params.id);
    everdictWriteCount += 1;
  }
  if (RETRIEVAL_OPS.test(op)) retrieved = true;
  if (USE_OPS.test(op)) {
    filedUsed = true;
    everdictWriteCount += 1;
  } else if (WRITE_OPS.test(op) && USED_PATH.test(String(body.path ?? ""))) {
    filedUsed = true;
    everdictWriteCount += 1;
  }
};

const collector = new ReceiptCollector();
if (transcript && existsSync(transcript)) {
  // Streamed, so peak memory is one line rather than one transcript.
  const lines = createInterface({
    input: createReadStream(transcript, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of lines) {
    if (NEEDLES !== undefined && !NEEDLES.some((needle) => line.includes(needle))) continue;
    // The receipts a line carries are found by the collector (Bash tool_results); the commit signal is the
    // command a Bash tool_use ran.
    for (const receipt of collector.fromLine(line)) applyReceipt(receipt);
    if (!line.includes(BASH_TOOL)) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      // ⚠️ THE COMMIT SIGNAL STAYS, AND IT IS NOT REDUNDANT WITH THE REPOSITORY QUERY BELOW. Committing
      // makes the tree CLEAN again, so a session that did the work and landed it would otherwise walk out
      // through the same door as one that did nothing — and that is the session whose record matters most.
      if (
        block?.type === "tool_use" &&
        block.name === BASH_TOOL &&
        /\bgit\s+commit\b/.test(String(block.input?.command ?? ""))
      )
        committed = true;
    }
  }
}
// The journal: receipts the transcript did not carry (stdout AND stderr swallowed, or a subagent's shell).
for (const receipt of collector.fromJournal(sessionId)) applyReceipt(receipt);

// ── DID THIS SESSION CHANGE CODE? ASK THE REPOSITORY (DEFAUL-45) ────────────────────────────────────
//
// This used to be a set of tool NAMES with no path check of any kind, and it was wrong in both directions.
// Both were measured before this changed:
//
//   FALSE POSITIVE  a session whose only writes were `~/.claude/.../memory/*.md` — outside the repository —
//                   was refused for changing code, over a provably clean tree. ⚠️ And that is the damaging
//                   direction: a guard that tells a no-change session to log a round TRAINS ITS READERS TO
//                   FABRICATE ROUNDS, corrupting the one record that carries a measurement.
//   FALSE NEGATIVE  this harness's own guidance routes edits through `sed`/heredocs, and Bash was inspected
//                   only for `git commit` — so `sed -i` on a tracked file with no commit left the flag false
//                   and the guard ALLOWED. The original proxy defect, live on the edit path actually used.
//
// A path filter on tool inputs would not have fixed it either: a `Write` producing byte-identical content is
// not a change, and a Bash edit is a change no tool name reports. Only the repository knows.
//
// ⚠️ `git diff HEAD`, never `git diff` — a lagging shared index makes the second one lie, which this
// repository has already paid for once.
//
// ⚠️ SCOPE — WHOSE CHANGE A DIRTY TREE IS, HALF-ANSWERED. What was dirty BEFORE the session started is no
// longer attributed to it: SessionStart records the tree it found, and `changedCode` below compares against
// that (DEFAUL-205). What a CONCURRENT session changes after this one started is still attributed to whoever
// stops first — a narrower wrong (it over-asks, and only when another writer shares the tree), and
// `EVERDICT_BREAK_GLASS` exists for exactly the case where the answer is "that was not mine".
//
// ⚠️ AND A FAILURE HERE ALLOWS. This hook judges the session it runs in; reading "cannot find out" as guilt
// would let a broken repository, a checkout outside git, or a slow call wedge the session shut. Unknown is
// not a refusal.
const gitSays = (args) => {
  if (!root) return undefined;
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    });
  } catch {
    // ⚠️ BOTH CALLS BELOW EXIT 0 AND PRINT NAMES — deliberately, rather than `--quiet`, whose exit code 1
    // MEANS "there are differences" and would arrive here as a failure. Reading that as "cannot find out"
    // would restore the false negative this whole change is about, so the shape that cannot make that
    // mistake is the one used. Anything reaching this catch is a real failure: no repository, no HEAD yet,
    // a timeout.
    return undefined;
  }
};
// ── AGAINST THE TREE THE SESSION FOUND (DEFAUL-205) ───────────────────────────────────────────────
//
// "Is the tree dirty now" answers a different question from "did this session change it". Measured live: a
// read-only session in a repository whose `.everdict/` was untracked BEFORE it started was refused here for
// changing code — and the install guide creates that file without committing it, so that was every later
// session of such a repository. SessionStart records the tree it found (the same fingerprint the first-change
// guard compares, one module); with that baseline the question is whether the tree LEFT is a different one.
// Without it (a session that started before this, no git at start) the reading below is the old one, which
// can only over-ask — never more permissive than what can be shown.
const tracked = gitSays(["diff", "HEAD", "--name-only"]);
const untracked = gitSays(["ls-files", "--others", "--exclude-standard"]);
const baseline = readBaseline(sessionId, root);
const leftTree = baseline ? treeFingerprint(root) : undefined;
const treeDiffers =
  baseline && leftTree
    ? treeChanged(root, baseline, leftTree)
    : (tracked !== undefined && tracked.trim() !== "") || (untracked !== undefined && untracked.trim() !== "");
const changedCode = treeDiffers || committed;

// ── DID A ROUND GET LOGGED? ASK THE WORKSPACE (DEFAUL-72) ───────────────────────────────────────────
//
// The same proxy as `changedCode` above, one field over: this asked the transcript whether a round was
// RECORDED rather than the workspace whether one EXISTS.
//
// MEASURED 2026-09-20. A session opened a campaign, logged round 1 with eight gate runs and eight answered
// criteria, minted a report, had it approved by an independent actor and closed the campaign `adopted` —
// and was refused, because the round went through `POST /change-campaigns/:id/rounds` from a driver script
// so the tool name never appeared. The remedy the message offered would have created a SECOND round for
// work already recorded.
//
// ⚠️ AND THE SYMMETRIC FALSE PASS IS WORSE: a session that CALLS `log_change_round` and gets a 4xx has the
// tool name in its transcript and passed. The transcript cannot tell a logged round from an attempted one.
// So when the workspace answers, its answer wins in BOTH directions.
//
// ⚠️ SCOPED TO THIS SESSION'S WINDOW. Counting a round logged at any time would let last week's work excuse
// today — the same false pass wearing a different coat. The window is the transcript's own birth time; when
// that is unavailable the workspace's answer is not trusted at all, because "some round exists" is not the
// question.
const sessionStartedAt = (() => {
  if (!transcript) return undefined;
  try {
    const born = statSync(transcript).birthtimeMs;
    return born > 0 ? new Date(born).toISOString() : undefined;
  } catch {
    return undefined;
  }
})();

// ONE resolver for the API base and key (env override, else the linked workspace's registry entry).
const { apiBase, key: apiKey } = resolveApiCredential({ workspace });

// ⚠️ COST, because the sibling request (DEFAUL-34) is about exactly this hook's per-turn cost. This runs
// only for a session that CHANGED CODE — one that did not owes no round, so there is nothing to ask about.
// The list is ordered newest-updated first and asked with a limit, so the common answer arrives in ~13KB
// rather than the ~197KB the unfiltered list costs; only campaigns touched inside the window are opened.
// ⚠️ …AND WHETHER IT WAS CLOSED (DEFAUL-188, DEFAUL-191). Measured in the DEFAUL-185 trial: both sessions that
// were refused for "no round" logged exactly one and left the campaign OPEN — one said so in as many words:
// "the hook only asked for a round, so I did not close it". The guard defines the minimum, and the minimum is
// what gets done. So the same read that finds this session's round also names every campaign it logged on that
// is still open. Owner decision (2026-09-23): the plugin session is its own verifier, so the product's
// evaluation of that verification — a frozen report and an ending the platform checks — is the supervisor's
// last step, not an optional one.
const readWorkspace = async () => {
  if (!apiBase || !sessionStartedAt) return undefined;
  // ⚠️ BOTH NAMES, BECAUSE ONLY ONE OF THEM IS READ (DEFAUL-196). `x-everdict-tenant` is the UNAUTHENTICATED
  // dev fallback (`route-context.ts`, `devTenantHeader`) — under an API key, which is the documented install,
  // it is ignored entirely. So this guard was naming a workspace the server never heard, and then reading
  // back whatever workspace the key belongs to. It agreed with itself about the wrong place.
  const headers = { "x-everdict-tenant": workspace, "x-everdict-workspace": workspace };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const read = async (path) => {
    const res = await fetch(`${apiBase}${path}`, { headers, signal: AbortSignal.timeout(4_000) });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  };
  try {
    // ── WHICH WORKSPACE DID THE SERVER ACTUALLY ANSWER FOR? (DEFAUL-196) ───────────────────────────
    //
    // Naming a workspace the subject cannot act in does not fail — the API falls back to the key's own,
    // deliberately, so the web survives a stale selection. For a machine caller that silence is the whole
    // problem: the session is told it records into X, its writes land in Y, and this guard then READS Y and
    // agrees with itself. `/me` returns the principal, so the resolved workspace is already sayable.
    //
    // ⚠️ Best-effort on purpose. A `/me` that cannot be read must not block a session — the comparison is
    // added information, not a new dependency (the catch below already keeps an unreachable API from
    // becoming "no round").
    let answeredFor;
    try {
      const me = await read("/me");
      if (typeof me?.workspace === "string" && me.workspace.length > 0) answeredFor = me.workspace;
    } catch {
      // leave it unknown — saying nothing is right when we could not ask
    }
    const listed = await read("/change-campaigns?limit=25");
    const campaigns = Array.isArray(listed) ? listed : (listed?.items ?? []);
    const touched = campaigns.filter((c) => typeof c?.updatedAt === "string" && c.updatedAt >= sessionStartedAt);
    let logged = false;
    const leftOpen = [];
    for (const c of touched) {
      const full = await read(`/change-campaigns/${encodeURIComponent(c.id)}`);
      const roundHere = (full?.rounds ?? []).some(
        (round) => typeof round?.judgement?.at === "string" && round.judgement.at >= sessionStartedAt,
      );
      if (!roundHere) continue;
      logged = true;
      // Only a campaign that SAYS it is open, and whose LAST round the product ADOPTED, is owed an ending. A
      // round that came back unmet leaves the campaign legitimately open — the next round is owed, not a close —
      // and refusing that at every turn's Stop would punish exactly the multi-round work this loop exists for.
      // A record without a state or an outcome is not evidence of anything.
      const last = (full?.rounds ?? []).at(-1);
      // ⚠️ AND ONLY IF THIS SESSION LOGGED ON IT (DEFAUL-206). `logged` above may count a peer's round — the
      // soft direction, an allow, and it must stay window-based so a round logged over HTTP still counts
      // (DEFAUL-72). The close obligation is a REFUSAL: measured, a session was refused over a concurrent
      // session's campaign and told to mint and close it — which, obeyed, ends another session's work in
      // flight. A session that logged over HTTP is not named here and is not refused: the soft direction again.
      const id = String(full?.id ?? c.id);
      if (full?.state === "open" && last?.outcome === "adopted" && roundCampaigns.has(id)) leftOpen.push(id);
    }
    return { logged, leftOpen, answeredFor };
  } catch {
    // ⚠️ UNREACHABLE IS NOT "NO ROUND". Falling through to the transcript keeps today's behaviour instead of
    // turning a guard that worked-but-wrongly into one that always allows.
    return undefined;
  }
};
let leftOpen = [];
if (changedCode) {
  const answered = await readWorkspace();
  if (answered !== undefined) {
    loggedRound = answered.logged;
    leftOpen = answered.leftOpen;
    // Named, not merely flagged: WHICH is which, and WHY it happens, because "they differ" is not something
    // a reader can act on. The decision to REFUSE this rather than report it belongs to the owner — the
    // web's fallback is deliberate — so this says so and lets the session continue.
    if (answered.answeredFor !== undefined && answered.answeredFor !== workspace)
      workspaceMismatch = `⚠️ this session resolved workspace '${workspace}' (from ${declaredBy}), but the API answered for '${answered.answeredFor}' — an API key belongs to one workspace and a key naming another is silently re-scoped to its own. Your issues, campaigns and knowledge are landing in '${answered.answeredFor}'. Use a key minted in '${workspace}', or change .everdict/workspace to match.`;
  }
}

// ── THE SERVER IS THE AUTHORITY FOR WHAT A SESSION RECORDED (DEFAUL-1001, distributed spec §8.3) ───────
//
// The transcript and the journal are THIS DISK's account. A member who continues on another machine, or whose journal
// was cleared, is judged by an empty one and told they logged no round they did log. When the local evidence does not
// say the round (or any record) exists, the door's own read does: `GET /sessions/:id/activity`, filed by the server
// under the `x-everdict-session` the writes carried.
//
// Three answers, never two: 200 is the activity, 404 is "the server never saw this session" — NO ACTIVITY, a real
// answer — and anything else (network error, timeout, 5xx, a malformed body) is UNKNOWN. Unknown asks and never
// passes: it leaves the session owing what it owed, and the refusal names the server that could not be read.
const readSessionActivity = async () => {
  if (!apiBase || !isSafeSessionId(sessionId)) return { kind: "skipped" };
  const headers = { "x-everdict-tenant": workspace, "x-everdict-workspace": workspace };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const res = await fetch(`${apiBase}/sessions/${encodeURIComponent(sessionId)}/activity`, {
      headers,
      signal: AbortSignal.timeout(4_000),
    });
    if (res.status === 404) return { kind: "none" };
    if (!res.ok) return { kind: "unknown", why: `answered ${res.status}` };
    const body = await res.json();
    if (!Array.isArray(body?.rounds) || !Array.isArray(body?.records))
      return { kind: "unknown", why: "answered a body that is not a session activity" };
    return {
      kind: "read",
      rounds: body.rounds.length,
      recorded:
        body.rounds.length +
          body.records.length +
          (body.campaignsOpened?.length ?? 0) +
          (body.campaignsClosed?.length ?? 0) >
        0,
    };
  } catch (err) {
    return { kind: "unknown", why: err instanceof Error ? err.message : "unreachable" };
  }
};
let activityUnreadable;
if (changedCode && (!loggedRound || !recorded)) {
  const activity = await readSessionActivity();
  if (activity.kind === "read") {
    if (activity.rounds > 0) loggedRound = true;
    if (activity.recorded) recorded = true;
  } else if (activity.kind === "unknown") {
    activityUnreadable = `⚠️ the session activity at ${apiBase} could not be read (${activity.why}), so what this session recorded from another machine or a cleared journal is UNKNOWN — and an unknown is asked about, never passed.`;
  }
}

// A session that never retrieved owes no `used.json` — there is nothing to report using. The obligation is
// created by the answer, not by the question.
// ── WHAT THIS GUARD COSTS, WRITTEN DOWN (DEFAUL-35) ────────────────────────────────────────────────
//
// The request asks whether the change loop is priced for a nine-commit refactor and charged to a one-line
// fix. The owner's answer was INSTRUMENT FIRST, and the reason is exact: nothing counts how often this
// guard refuses, and nothing counts how often somebody spends the break-glass to get past it. The request
// proposed those two numbers as its own disproof, and today they cannot be produced — so every argument
// about the price is an argument about a quantity nobody has.
//
//   break-glass is frequent  → the price is too high, and people are paying it in the escape hatch
//   refusals are rare        → there is nothing to fix
//
// ⚠️ A LOCAL APPEND, NEVER A NETWORK CALL. This runs at EVERY turn end. DEFAUL-34 took it from 0.87s to
// 0.64s and from a 512MB ceiling to flat memory; buying that back with an HTTP round trip on the hot path
// would be trading a measured win for an unmeasured one. One line appended to a file is microseconds.
//
// ⚠️ AND IT NEVER DECIDES ANYTHING. A failed write is swallowed on purpose: this is a meter, and a meter
// that can refuse a session has stopped being a meter. The counterpart obligation is that nobody may read
// this ledger as authoritative about sessions it never saw — the live stop-guard-series script (deleted in DEFAUL-802) said so.
const meter = (outcome, extra = {}) => {
  try {
    const dir = path.join(os.homedir(), ".everdict");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, "stop-guard.jsonl"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        workspace,
        // ⚠️ WHICH SESSION, BECAUSE THE REQUEST'S OWN QUESTION IS ABOUT SESSIONS AND A ROW IS A TURN.
        // DEFAUL-35 proposed its disproof as "count sessions refused at Stop, count break-glass uses", and
        // the first meter answered neither: it counted DECISIONS, and one session ends many turns. A reader
        // summing rows reports a session that was refused once and then recorded its work as one refusal
        // and several allows, which is the same ledger telling both stories.
        //
        // The transcript's basename is the session id, and taking it HERE is the only place it is known
        // (rule `protocol` L3 — provenance is born at the source; a reader cannot re-derive which turns
        // belonged to one session from timestamps).
        //
        // It is also what makes a row's ORIGIN legible. `scripts/check-plugin-hooks.mjs` drives this guard
        // 11 times per run, and until it was pointed at a throwaway home every gate run appended its
        // fixtures here — 210 such rows on the machine that shipped the meter, against 0 real sessions. A
        // row that cannot name its session cannot be vouched for, and the reader now says so instead of
        // averaging it in.
        session: transcript === undefined ? undefined : path.basename(transcript).replace(/\.jsonl$/, ""),
        // ⚠️ WHO CAUSED THIS ROW, WHEN THE ANSWER IS "A TEST HARNESS" (DEFAUL-176). The paragraph above
        // says a row's origin is legible and it is not: it is INFERRED, from a session id that looks like
        // a fixture name. `scripts/check-plugin-hooks.mjs` asserted it had written nothing here by
        // comparing the file's SIZE across its own run — true with one session on the machine, a coin flip
        // with two, and the flip was measured (exit 0 / 1 / 0 on an unchanged HEAD).
        //
        // A harness that drives this guard sets `EVERDICT_STOP_GUARD_ORIGIN` to a nonce, and the row says
        // so. That turns "did the gate write here" from a question about bytes that everyone shares into
        // one about a mark only this run can make. Unset — every real session — leaves the row exactly as
        // it was.
        //
        // ⚠️ IT LABELS, IT NEVER DECIDES. The env block in that gate clears every variable this hook READS
        // because a gate whose answer depends on whose shell ran it is not a gate; this one may never join
        // that list, so it is read here in the meter and nowhere else.
        origin: process.env.EVERDICT_STOP_GUARD_ORIGIN?.trim() || undefined,
        outcome,
        changedCode,
        recorded,
        retrieved,
        loggedRound,
        filedUsed,
        leftOpen: leftOpen.length,
        ...extra,
      })}\n`,
    );
  } catch {
    // A meter that refuses a session is not a meter. See above.
  }
};

const owesUsed = retrieved && !filedUsed;
// A session that changed code owes the quantitative record too. `recorded` stays required — the round says
// what was run, and the issue and the knowledge say what was asked and what it taught, which a round does not.
const owesRound = changedCode && !loggedRound;
// Unknown (workspace unreachable) leaves `leftOpen` empty — not knowing is not a refusal.
const owesClose = changedCode && leftOpen.length > 0;
// ── A CHANGE THE WORKSPACE HAS NO RECORD OF IS FILED, ONCE (DEFAUL-194) ─────────────────────────────
// "Unrecorded" means the workspace holds NOTHING from this session: no issue, no knowledge, no comment, no
// round. A session that answered its refusal even partly has left something a reader can follow; this is for
// the one that left nothing. It is an AUDIT fact filed by the plugin, not the session's work record, and it
// says so — the user who asked the session to skip the record decided about the session, not about whether
// the repository's workspace may know a change happened.
//
// ⚠️ ONE PER SESSION, read from this hook's own ledger by session id — an interactive session ends many
// turns, and a filing per turn would bury the one that matters.
// ⚠️ A FAILED FILING IS NOT SILENT EITHER: the row says `filed:false` and why, and the next SessionStart in
// this repository hands it to a session that CAN file it (session-start.mjs). The hook carries no credential
// of its own; it uses the resolved credential (env override, else the workspace registry entry), and otherwise defers.
const unrecorded = changedCode && !recorded && !loggedRound;
const session = transcript === undefined ? undefined : path.basename(transcript).replace(/\.jsonl$/, "");
const alreadyFiled = () => {
  try {
    return readFileSync(path.join(os.homedir(), ".everdict", "stop-guard.jsonl"), "utf8")
      .split("\n")
      .some((line) => {
        try {
          const row = JSON.parse(line);
          return row.session === session && typeof row.filed === "boolean";
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
};
// ⚠️ THE FACTS ARE GATHERED ONCE AND TRAVEL BOTH WAYS (DEFAUL-194 round 2). Round 1 put them only in the
// filed issue; the ledger row a deferred filing leaves for the NEXT session carried the END time alone, and
// the notice sent that session looking for commits AFTER it. Live, it could only write that one commit was
// "probably" the session's work. So the row carries exactly what the issue would have: the window's start,
// HEAD, and the commits made in it — an exact record is then a copy, not an inference.
const unrecordedFacts = () => {
  const firstRemote = gitSays(["remote"])?.split("\n")[0]?.trim();
  const remoteUrl = firstRemote ? gitSays(["remote", "get-url", firstRemote])?.trim() : undefined;
  const repository = remoteUrl ? (/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(remoteUrl)?.[1] ?? remoteUrl) : root;
  const head = gitSays(["rev-parse", "HEAD"])?.trim() ?? "unknown";
  const commits = (
    gitSays(["log", "-n", "20", "--format=%H %s", ...(sessionStartedAt ? [`--since=${sessionStartedAt}`] : ["-1"])]) ??
    ""
  )
    .trim()
    .split("\n")
    .filter((line) => line !== "");
  return { repository, head, commits, startedAt: sessionStartedAt };
};
const fileUnrecorded = async (facts, breakGlassReason) => {
  const key = apiKey;
  if (!apiBase)
    return { filed: false, why: "no control plane URL (no EVERDICT_API_URL and no registry entry for the workspace)" };
  if (!key) return { filed: false, why: "no credential (no EVERDICT_API_KEY and no registry entry for the workspace)" };
  const { repository, head } = facts;
  const commits = facts.commits.join("\n");
  const unmet = [
    ...(retrieved ? [] : ["asked the workspace nothing (`get_task_context`)"]),
    "filed no issue, knowledge entry or comment",
    "logged no round, so what was run is not on the record",
  ];
  const description = [
    "**Filed by the Everdict plugin's Stop guard, not by the session.** A session changed this repository, was",
    "refused for leaving no record, and ended without one — so this is the only trace the workspace has of the",
    "change. (DEFAUL-194)",
    "",
    `- repository: \`${repository}\``,
    `- session: \`${session ?? "unknown"}\`${sessionStartedAt ? ` (started ${sessionStartedAt})` : ""}`,
    `- HEAD at the end: \`${head}\``,
    ...(breakGlassReason ? [`- ended through EVERDICT_BREAK_GLASS — reason: ${breakGlassReason}`] : []),
    "",
    "Commits made in the session's window:",
    "",
    commits === ""
      ? "(none — the change is uncommitted in the working tree)"
      : commits
          .split("\n")
          .map((l) => `- \`${l}\``)
          .join("\n"),
    "",
    "What the record is missing:",
    "",
    ...unmet.map((u) => `- ${u}`),
    "",
    "To account for it: link these commits to the request they served (or file that request), and log the",
    "round that verifies them — or close this issue saying why no record is owed.",
  ].join("\n");
  try {
    const res = await fetch(`${apiBase}/issues`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-everdict-tenant": workspace,
        "x-everdict-workspace": workspace,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        title: `Unrecorded change in ${repository}: a session changed code and ended without a record`,
        description,
        status: "todo",
        priority: "high",
        // The owner brief and the request's source (DEFAUL-527/523) — the door refuses an issue without them. This
        // issue is filed by the guard, not asked for by anyone: the source is `agent`, and the brief says only
        // what the guard knows. Risk is `medium` BECAUSE nobody declared the change, and the reason says so.
        requestSource: { kind: "agent" },
        brief: {
          // No repository here: it can be a long path, and the door caps the summary at 300 characters.
          summary: "A session changed code and ended without leaving a record of it.",
          why: "Nothing on the record says what was changed or why, so the owner cannot see or judge the change.",
          change: "Nothing changes by filing this. It makes an unrecorded code change visible in the workspace.",
          risk: {
            level: "medium",
            reason:
              "Nobody declared this change, so its effect is unknown — the guard can only say that code changed and no issue, knowledge entry or round was written.",
          },
          reversible: { value: true, how: "The commits listed in the description can be reverted." },
          decided:
            "The Stop guard filed this itself instead of asking anyone, so the change is not lost; an agent picking it up should link the commits to the request they served or close this saying why none is owed.",
        },
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return { filed: false, why: `the control plane answered ${res.status}` };
    const created = await res.json();
    return { filed: true, issue: String(created?.identifier ?? created?.id ?? "an issue") };
  } catch (err) {
    return {
      filed: false,
      why: `the control plane could not be reached (${err instanceof Error ? err.name : "error"})`,
    };
  }
};
const unrecordedNotice = (filing) =>
  filing.filed
    ? `everdict: this session changed code and ended with nothing on the record — filed ${filing.issue} in workspace '${workspace}' so the change is visible there.`
    : `everdict: this session changed code and ended with nothing on the record, and it could not be filed (${filing.why}). The next session in this repository will be asked to record it.`;

const breakGlass = process.env.EVERDICT_BREAK_GLASS?.trim();

// ── THE GOAL LOOP GUARD'S OWN LEDGER (DEFAUL-281) — a sibling of the meter above, never a decision ─────
// Persists the consecutive-refusal streak PER SESSION, keyed off `everdictWriteCount` (every Everdict write
// this session's transcript carries so far, recomputed from scratch on every Stop pass): the streak resets
// the moment that count has grown since the last goal refusal, because a growing count is the definition of
// "something changed in between". A failed write here costs the loop guard its memory, never a session.
const goalGuardLedger = () => path.join(os.homedir(), ".everdict", "goal-guard.jsonl");
const lastGoalGuardRow = (forSession) => {
  try {
    const lines = readFileSync(goalGuardLedger(), "utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.session === forSession) return row;
    }
  } catch {
    // no ledger yet, or unreadable — read as "no prior refusal", the safe direction for a loop guard
  }
  return undefined;
};
const appendGoalGuard = (forSession, extra) => {
  try {
    const dir = path.join(os.homedir(), ".everdict");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      goalGuardLedger(),
      `${JSON.stringify({
        at: new Date().toISOString(),
        workspace,
        session: forSession,
        origin: process.env.EVERDICT_STOP_GUARD_ORIGIN?.trim() || undefined,
        ...extra,
      })}\n`,
    );
  } catch {
    // a ledger that could not write decides nothing either way — see the meter's own law above
  }
};
const GOAL_REFUSAL_LIMIT = 3;
// Wraps a would-be goal refusal with the loop guard: past the limit, WITH NO NEW WRITE IN BETWEEN, it
// converts the refusal into an allow that says why — so a goal bound to a stuck session cannot wedge it shut.
const goalRefusal = (lines, progress = everdictWriteCount) => {
  const prior = lastGoalGuardRow(session);
  const streak = prior?.outcome === "refused" && prior.writesSeen === progress ? (prior.streak ?? 1) + 1 : 1;
  if (streak > GOAL_REFUSAL_LIMIT) {
    appendGoalGuard(session, { outcome: "loop_guard_allow", writesSeen: progress, streak });
    return {
      kind: "allow",
      notice: `everdict: goal loop guard — ${streak - 1} consecutive goal refusals with no new Everdict write in between; allowing this session to stop.`,
    };
  }
  appendGoalGuard(session, { outcome: "refused", writesSeen: progress, streak });
  return { kind: "block", lines };
};

// One campaign, asked of the control plane for the delegation row. `failed` is a third value, never "no round".
const readCampaign = async (id) => {
  if (!apiBase) return { kind: "failed" };
  const headers = { "x-everdict-tenant": workspace, "x-everdict-workspace": workspace };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const res = await fetch(`${apiBase}/change-campaigns/${encodeURIComponent(id)}`, {
      headers,
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return { kind: "failed" };
    const campaign = await res.json();
    return campaign && typeof campaign === "object" ? { kind: "read", campaign } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
};
// The delegate's session, asked of the control plane. `dead` = a state no poll will ever move to `completed`
// (errored, orphaned, closed — or the session no longer exists: 404). `failed` is a third value, never `dead`.
const DEAD_DELEGATE_STATES = new Set(["errored", "orphaned", "closed"]);
const readSession = async (id) => {
  if (!apiBase) return { kind: "failed" };
  const headers = { "x-everdict-tenant": workspace, "x-everdict-workspace": workspace };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  try {
    const res = await fetch(`${apiBase}/sandboxes/${encodeURIComponent(id)}`, {
      headers,
      signal: AbortSignal.timeout(3_000),
    });
    if (res.status === 404) return { kind: "dead", state: "absent (the control plane no longer holds it)" };
    if (!res.ok) return { kind: "failed" };
    const session = await res.json();
    const status = session?.live?.delegate?.status;
    if (typeof status === "string" && DEAD_DELEGATE_STATES.has(status)) return { kind: "dead", state: status };
    return { kind: "read" };
  } catch {
    return { kind: "failed" };
  }
};
// Said ONCE per session and delegate: the ledger row is the marker, so a later pass allows without a word.
const toldDeadDelegate = (key) => {
  try {
    return readFileSync(goalGuardLedger(), "utf8")
      .split("\n")
      .some((line) => {
        try {
          const row = JSON.parse(line);
          return row.session === session && row.outcome === "dead_delegate_told" && row.delegate === key;
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
};
// A round naming the delegate's sandbox session as served — `delegation.runId`, ChangeRoundDelegationSchema — clears the row,
// and so does a campaign that is not open (closed supervised, adopted, ...).
const campaignClearsRow = (campaign, delegation) => {
  if (typeof campaign.state === "string" && campaign.state !== "open") return true;
  const sandbox = delegation.sandboxId;
  if (!sandbox) return false;
  const rounds = Array.isArray(campaign.rounds) ? campaign.rounds : [];
  return rounds.some((r) => r?.delegation?.runId === sandbox);
};

// ── THE DELEGATING ROW (DEFAUL-281, DEFAUL-287) — holds ANY session, goal-bound or not ──────────────────
// Measured (scorecard 43644480, case httpbin-56): a session with no goal delegated, then stopped as
// `allowed_no_change` — it changed no code itself — while its campaign had 0 rounds. Delegation is the default,
// so this is the common path; the row therefore runs ahead of the goal table and outlasts its absence.
const decideDelegation = async () => {
  if (breakGlass) return undefined;
  // A campaign this session started a delegate for, with no round logged on it and not closed.
  // The transcript names the rows; the control plane settles the ones that would refuse. A HEADLESS session cannot "wait" for the delegate: ending the turn ends the session, so the text
  // says to poll now, in this turn. While polls still find the delegate running the loop guard counts them as
  // progress; once it reports completed they no longer are, and the guard can run out on a stuck session.
  const unlogged = [...delegations.entries()].filter(([id]) => !roundCampaigns.has(id) && !closedCampaigns.has(id));
  if (unlogged.length === 0) return undefined;
  // ⚠️ A RECEIPT CAN BE LOST (DEFAUL-288): the door's stderr swallowed with `2>/dev/null` and no journal leaves a
  // round the session DID log invisible here. So before refusing, ask the control plane about exactly the rows
  // that would refuse. A round naming this delegate, or a campaign that is no longer open, clears the row; a read
  // that fails (no credential, network, non-2xx, timeout) NEVER does — the refusal stays and says it is unconfirmed.
  const unconfirmed = [];
  const undelegated = [];
  const dead = [];
  for (const entry of unlogged) {
    if (knowledgeRefIds.has(entry[0]) || (entry[1].sandboxId && knowledgeRefIds.has(entry[1].sandboxId))) continue;
    const read = await readCampaign(entry[0]);
    if (read.kind === "failed") unconfirmed.push(entry[0]);
    else if (!campaignClearsRow(read.campaign, entry[1])) {
      // Still owed a round — unless the delegate can no longer produce one (DEFAUL-313).
      const s = entry[1].sandboxId ? await readSession(entry[1].sandboxId) : { kind: "failed" };
      if (s.kind === "dead") dead.push({ id: entry[0], sandbox: entry[1].sandboxId, state: s.state });
      else undelegated.push(entry);
    }
  }
  const untold = dead.filter((d) => !toldDeadDelegate(d.id));
  for (const d of untold) appendGoalGuard(session, { outcome: "dead_delegate_told", delegate: d.id });
  undelegated.push(...unlogged.filter(([id]) => unconfirmed.includes(id)));
  if (undelegated.length === 0 && untold.length > 0)
    return {
      kind: "block",
      lines: [
        ...untold.map(
          (d) => `The delegate for ${d.id} (sandbox ${d.sandbox}) is ${d.state} — it will never report a round.`,
        ),
        "Polling will not change that, so this is said once and the session may stop. The next moves:",
        "",
        "  - re-delegate: `everdict-api create_sandbox` again with the same changeCampaignId",
        "  - abandon: `everdict-api close_change_campaign --id <campaign>` with state abandoned",
        "  - account for it instead: `create_knowledge_entry` whose refs name the sandbox or the campaign",
        "  - or set EVERDICT_BREAK_GLASS with a reason",
        "",
      ],
    };
  if (undelegated.length === 0) return undefined;
  {
    const named = undelegated.map(([id, d]) => `${id}${d.sandboxId ? ` (sandbox ${d.sandboxId})` : ""}`);
    return goalRefusal(
      [
        `This session delegated ${named.join(", ")} and has not logged a round on it — and the delegate's work is`,
        ...(unconfirmed.length > 0
          ? [
              `(The control plane could not be asked about ${unconfirmed.join(", ")}: their state could not be confirmed.)`,
            ]
          : []),
        "not the verdict. You cannot wait for it: ending this turn ends the session. Poll NOW, in this turn:",
        "",
        `    everdict-api get_sandbox --id ${undelegated[0][1].sandboxId ?? "<sandbox>"}   — until live.delegate.status is completed`,
        "",
        "then save the patch, log the round with `delegationRunId`, and mint → review → close:",
        "",
        "    everdict-api log_change_round --id <campaign> --body @round.json     # with delegationRunId",
        "    everdict-api mint_change_report --id <campaign>",
        "    everdict-api review_change_report --id <report> --body @verdict.json   # reportDigest, disposition, rationale",
        "",
      ],
      everdictWriteCount + runningPolls,
    );
  }
};

// CLAIMED ELSEWHERE: a next_work item whose campaign shows a running delegation (`campaign.delegations.running > 0`)
// that THIS session did not start (its campaign id is not among `ownCampaigns`, the campaigns this session's
// create_sandbox receipts named) is another session's work — naming it would send this one to collide with it.
// An item this session is delegating itself is never claimed. Pure: items + own campaign ids in, partition out.
const splitClaimedWork = (items, ownCampaigns) => {
  const open = [];
  const claimed = [];
  for (const item of items) {
    const c = item?.campaign;
    // Claimed only on a KNOWN running count: `{read:"unknown"}` (a failed ledger read) is NOT skipped — an
    // unreadable claim must not let a session off the goal.
    const elsewhere = c?.delegations?.read === "known" && Number(c.delegations.running) > 0 && !ownCampaigns.has(c?.id);
    (elsewhere ? claimed : open).push(item);
  }
  return { open, claimed };
};

// ── THE GOAL DECISION TABLE ITSELF (DEFAUL-281) — runs only once every check above has cleared ─────────
// A session that still owes a round, a retrieval or a close is refused for THAT first; the goal is the next
// thing owed once nothing else is. `undefined` means "say nothing about the goal" — no goal bound, or
// break-glass, which bypasses this exactly as it bypasses the record checks below.
//
// DEFAUL-868: the checkout is shared, the goal is not. Only the session that bound it is held to it; a binding
// that names no session (written before DEFAUL-868) binds nobody and says how to re-bind.
const decideGoal = async () => {
  if (!goal || breakGlass) return undefined;
  if (goal.session === undefined)
    return {
      kind: "allow",
      notice: `everdict: ${goal.kind} '${goal.id}' is bound in this checkout's .everdict/goal, but the binding names no session, so no session is held to it — ${REBIND_HINT}.`,
    };
  if (goal.session !== sessionId) return undefined;
  const decision = await decideBoundGoal();
  return decision?.kind === "block"
    ? {
        ...decision,
        lines: [
          `(goal ${goal.kind} '${goal.id}' was bound by this session (${goal.session})${goal.boundAt ? ` at ${goal.boundAt}` : ""}; unbind with \`rm .everdict/goal\`.)`,
          "",
          ...decision.lines,
        ],
      }
    : decision;
};
const decideBoundGoal = async () => {
  const key = apiKey;
  if (!apiBase || !key)
    return {
      kind: "allow",
      notice: `everdict: goal ${goal.kind} '${goal.id}' is bound, but next_work could not be reached (no control plane configured) — allowing.`,
    };

  // (a) — read from the TRANSCRIPT, not the workspace: a round this session logged with no LATER verdict.
  if (pendingRevise && !pendingVerdict && roundCampaigns.size > 0)
    return goalRefusal([
      `A review of this session's campaign (${[...roundCampaigns].join(", ")}) rejected the report asking for a revision, and`,
      `this checkout is bound to goal ${goal.kind} '${goal.id}' — a revise is answered only by the next round:`,
      "",
      "    everdict-api log_change_round --id <campaign> --body @round.json     # with respondsTo: <the review's id>",
      "",
      "Then mint → review → close as before. A later round that names no verdict leaves this refusal standing.",
      "",
    ]);
  if (pendingVerdict && roundCampaigns.size > 0)
    return goalRefusal([
      `A campaign this session logged a round on (${[...roundCampaigns].join(", ")}) has no verdict yet, and`,
      `this checkout is bound to goal ${goal.kind} '${goal.id}' — the loop is not done until the round is judged:`,
      "",
      "    everdict-api mint_change_report --id <campaign>",
      "    everdict-api review_change_report --id <report> --body @verdict.json   # reportDigest, disposition, rationale",
      "",
      "Adopted: close the campaign and move the issue done. Rejected: the next round, or a successor campaign.",
      "",
    ]);

  const read = await fetchNextWork({ apiUrl: apiBase, key, workspace, goal });
  if (read.kind !== "read")
    return {
      kind: "allow",
      notice: `everdict: goal ${goal.kind} '${goal.id}' is bound, but next_work could not be read (${read.kind === "absent" ? "not found" : read.why}) — allowing.`,
    };
  const result = read.value;
  if (result?.goal?.status === "completed") return { kind: "allow" };

  // (b) — work_available: name the next issue THIS session can take.
  if (result?.state === "work_available") {
    const { open, claimed } = splitClaimedWork(result.items ?? [], new Set(delegations.keys()));
    if (open.length === 0 && claimed.length > 0)
      return {
        kind: "allow",
        notice: `everdict: goal ${goal.kind} '${goal.id}' has next_work open, but every item is being delegated by another session (${claimed.map((i) => i.issue?.identifier ?? "?").join(", ")}) — allowing.`,
      };
    const first = open[0]?.issue;
    return goalRefusal([
      `This session is bound to ${goal.kind} '${goal.id}' (${result.goal?.name ?? goal.id}), and next_work still`,
      `has something open: ${first ? `**${first.identifier}** — ${first.title}` : "an item next_work named"}.`,
      "",
      "Pick it up — `/everdict:campaign` opens the request and the campaign this next piece of work belongs to.",
      "",
    ]);
  }

  // (c) — nothing_open or empty, and not completed: measure doneWhen, file what is still needed.
  const doneWhen = Array.isArray(result?.goal?.doneWhen) ? result.goal.doneWhen : [];
  return goalRefusal([
    `This session is bound to ${goal.kind} '${goal.id}' (${result?.goal?.name ?? goal.id}), and next_work answers`,
    `'${result?.state}' — every issue on record under it is done or cancelled, and the goal is not yet complete.`,
    "",
    "Measure each `doneWhen` line against the population it describes, not against what already shipped:",
    "",
    ...(doneWhen.length > 0 ? doneWhen.map((line) => `  - [ ] ${line}`) : ["  (the goal names no doneWhen lines)"]),
    "",
    "For every line NOT yet met: file one issue under this goal's project carrying the measurement and its own",
    "done-when (skill `advance_the_goal`). Once every line IS met, complete the goal citing each line's evidence",
    "rather than logging another round with nothing left to do.",
    "",
  ]);
};

// The goal table runs on this pass too: a headless session ends on the pass AFTER a refusal, and an allow here
// would let it walk past the goal table it was just refused by. The loop guard is what bounds it.
if (endingPass) {
  const endingDelegation = await decideDelegation();
  const endingGoal = endingDelegation?.kind === "block" ? endingDelegation : ((await decideGoal()) ?? endingDelegation);
  if (endingGoal?.kind === "block") {
    meter("goal_refused");
    process.stdout.write(JSON.stringify({ decision: "block", reason: endingGoal.lines.join("\n") }));
    process.exit(0);
  }
  if (!unrecorded || alreadyFiled()) allow(endingGoal?.notice);
  const facts = unrecordedFacts();
  const filing = await fileUnrecorded(facts, undefined);
  meter("ended_unrecorded", {
    root,
    ...facts,
    filed: filing.filed,
    ...(filing.filed ? { issue: filing.issue } : { why: filing.why }),
  });
  allow(unrecordedNotice(filing));
}

// ── A READ-ONLY SESSION SHOWN ISSUES AND NAMING NONE OF THEM IS ASKED ONCE (DEFAUL-532) ──────────────
// The prompt hook shows a session the open issues its prompt touches. A session that changed no code and made no
// door call naming any of them has left what it found nowhere. `endingPass` (stop_hook_active) is the once-only
// law: the pass after this block can only allow.
if (!changedCode && !endingPass && isSafeSessionId(sessionId)) {
  const shown = readPromptState(sessionId);
  if (shown.injected.length > 0) {
    const calls = (await sessionReceipts({ transcriptPath: input.transcript_path, sessionId })).filter(
      (r) => r.op !== "list_issues",
    );
    const named = calls.some((r) => {
      const text = JSON.stringify([r.pathParams, r.body]);
      return shown.injected.some((id) => text.includes(id)) || shown.ids.some((id) => text.includes(id));
    });
    if (!named) {
      meter("readonly_question", { shown: shown.injected });
      process.stdout.write(
        JSON.stringify({
          decision: "block",
          reason: `This session was shown ${shown.injected.join(", ")}. Record what it found on one of them (\`everdict-api create_comment\` / \`create_knowledge_entry\` with that ref), or say in one line why not.`,
        }),
      );
      process.exit(0);
    }
  }
}

if (!changedCode || (recorded && retrieved && !owesUsed && !owesRound && !owesClose)) {
  const delegation = await decideDelegation();
  const goalDecision = delegation?.kind === "block" ? delegation : ((await decideGoal()) ?? delegation);
  if (goalDecision?.kind === "block") {
    meter("goal_refused");
    process.stdout.write(JSON.stringify({ decision: "block", reason: goalDecision.lines.join("\n") }));
    process.exit(0);
  }
  meter(changedCode ? "allowed" : "allowed_no_change");
  allow(goalDecision?.notice);
}

if (breakGlass) {
  // Break-glass is a REPORTED escape — so an unrecorded change taken through it is filed with its reason,
  // where the old meter line reported it only to this machine.
  if (unrecorded && !alreadyFiled()) {
    const facts = unrecordedFacts();
    const filing = await fileUnrecorded(facts, breakGlass);
    meter("break_glass", {
      root,
      ...facts,
      breakGlass,
      filed: filing.filed,
      ...(filing.filed ? { issue: filing.issue } : { why: filing.why }),
    });
    allow(`everdict: capture guard bypassed — break-glass reason: ${breakGlass}. ${unrecordedNotice(filing)}`);
  }
  meter("break_glass");
  allow(
    `everdict: capture guard bypassed — break-glass reason: ${breakGlass}. This session's work is not fully ` +
      `on the record in workspace '${workspace}'.`,
  );
}

meter("refused");
process.stdout.write(
  JSON.stringify({
    decision: "block",
    reason: [
      // ⚠️ FIRST LINE ON THE REFUSING PATH TOO (DEFAUL-196). This is where it matters most: the guard is
      // about to name what the session owes IN A WORKSPACE, and if that is not the workspace the session
      // believes it is in, every instruction below points at the wrong place.
      ...(workspaceMismatch ? [workspaceMismatch, ""] : []),
      ...(activityUnreadable ? [activityUnreadable, ""] : []),
      ...(retrieved
        ? []
        : [
            `This session changed code without asking what workspace '${workspace}' already knows.`,
            "",
            "Run the anchored call the session opened with — `get_task_context` with the repository (and the",
            "issue, harness or dataset this work concerns). A convention already decided, a finding that already",
            "names this trap, a decision you are about to re-argue: reading them is cheaper than rediscovering",
            "them. Then say, in what you record, which entries you were given and which ones you used.",
            "",
            "⚠️ `list_knowledge_entries` and `get_knowledge_entry` do NOT satisfy this, and that is deliberate",
            "(DEFAUL-134). They record nothing, so a session that used them leaves no answer to the one question",
            "only a session can answer: of what the workspace offered, what did you use. Measured when this was",
            "narrowed: 8 assemblies across 69 closed campaigns, 10 of 97 entries ever cited.",
            "",
          ]),
      ...(recorded
        ? []
        : [
            `This session changed code but recorded nothing in Everdict (workspace '${workspace}').`,
            "",
            "Record it before stopping — the request this served, and what the work taught:",
            "",
            "1. `create_issue` (or `update_issue` on the one you worked under) — the request and where it stands.",
            "2. `create_knowledge_entry` for each durable claim: `decision` (and what it was chosen against),",
            "   `finding` (a defect's cause, a trap), `convention`. `refs` must name the issue and the repository —",
            '   and `{type:"knowledge", key}` for every entry you built on, or repetition reads as corroboration.',
            '3. `publish_checkpoint` (`role: "executor"`) for your judgement: what you claimed, with the evidence',
            "   you can point at; anything you cannot goes in `hypotheses`.",
            "4. If there is genuinely nothing to record, say which of the two it is and record THAT as a `context`",
            "   entry — a refusal someone can read is a decision; silence is not.",
            "",
          ]),
      ...(owesRound
        ? [
            `This session changed code and logged no round, so what it RAN is not on the record in workspace '${workspace}'.`,
            "",
            "Issues and knowledge answer what was asked and what it taught. Neither carries a measurement, and a",
            "measurement is what the person who asked for the work is actually short of: they want what problem,",
            "what method, what result, and WHAT VERIFICATION. Only a round holds the fourth.",
            "",
            "`/everdict:campaign` opens the request and the campaign this work belongs to. Then:",
            "",
            "    everdict-api log_change_round --id <campaign> --body @round.json",
            "",
            "    round.json: {hypothesis, changes:[{repository, commits:[{sha, at}]}],",
            "                 gateRuns:[{id, command, exitCode, metrics:[{name, value}]}],",
            "                 answers:[{criterionId, answer, how, gateRunIds, detail}], learned}",
            "    A pull request the work went out as is named in its change entry: changes[].pr = {number, url, mergedSha}.",
            "",
            'Carry the gates WITH THEIR NUMBERS — `tests.passed 4279`, not "the suite is green" — because only',
            "the number can be compared to the next round or disagreed with. An `observed` answer must cite a",
            "gate run by id; one that names no measurement is an assertion wearing the other word.",
            "",
            "⚠️ Declare the criteria BEFORE the work where you can. A criterion written afterwards describes the",
            "outcome instead of judging it, and the campaign says so when you open one.",
            "",
            "Nothing to judge — a typo, a comment, a rename? Say so in the round's `hypothesis` and answer the",
            "criteria honestly. A round that records a small change is cheap; a change with no round is invisible.",
            "",
          ]
        : []),
      ...(owesUsed
        ? [
            "This session asked what the workspace knows and never said what it used.",
            "",
            "The assembly filed what it ANSWERED — its path came back in the `receipt` of your",
            "`get_task_context` call. Beside it, write the half only you can know:",
            "",
            `    everdict-api record_retrieval_use --body '{"assemblyPath":"<the receipt.path you got back>",`,
            `                                               "used":["<entry id>"],"outcome":"what the work did with it"}'`,
            "",
            "An empty `used` is a real answer and worth writing: it says the workspace had nothing for this work,",
            "which is the measurement that decides whether the knowledge layer is earning its keep.",
            "",
          ]
        : []),
      ...(owesClose
        ? [
            `The product ADOPTED the round this session logged, and the campaign is still OPEN (${leftOpen.join(", ")})`,
            `in workspace '${workspace}'. A campaign ends on its SUPERVISOR's verdict over the current report — the`,
            "session that set the goal judges the work, whether it did the round itself or a delegate did:",
            "",
            "    everdict-api mint_change_report --id <campaign>   — freeze what the campaign says right now",
            "    everdict-api review_change_report --id <report> --body @verdict.json",
            '      {reportDigest, disposition:{kind:"approved"}, rationale}',
            "                                      — YOUR verdict, on any round: one a delegate ran or one you typed",
            "                                        yourself. No actor comparison refuses it; file it and decide. Escalate",
            "                                        only under a declared condition — review_change_report",
            '                                        disposition:{kind:"escalated", question, askedOf:"<owner>", condition,',
            "                                        why} where condition is one of irreversible_external_effect,",
            "                                        spend_beyond_budget, credential_or_access_missing,",
            "                                        owner_reserved_decision, conflicting_owner_instructions, invariant_loosening — else decide.",
            "                                        An owner's answer (respondsTo) is the verdict the close spends.",
            "    everdict-api close_change_campaign --id <campaign> --body @close.json",
            '      {state:"adopted", roundSeq, reason, knowledge:[<entry ids>]}',
            "                                      — refused without a CURRENT approving verdict, always now.",
            "",
            "Then move the request: `set_issue_status` done with a note naming the commit, the pull request and the campaign. If your",
            "verdict is `rejected` instead, the owed move is the next round (`revise`, naming this verdict in",
            "`respondsTo`) or a successor campaign (`reframe`) — never another round logged with no verdict at all.",
            "",
          ]
        : []),
      "`/everdict:campaign` and `/everdict:record` walk this. To leave without it, restart with",
      "EVERDICT_BREAK_GLASS='<reason>' — the reason is reported instead of the refusal.",
    ].join("\n"),
  }),
);
