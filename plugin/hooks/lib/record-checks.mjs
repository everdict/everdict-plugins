// The two checks `record-guard.mjs` ran on the MCP transport, moved here so the REST door
// (`bin/everdict-api`) runs them in-process (DEFAUL-295) — the hook script itself is gone, this is its logic.
//
// WHERE (DEFAUL-202, after every call). Under an API key the server answers for the KEY's workspace whatever the
// session names — deliberately, so the web survives a stale selection (DEFAUL-196) — and a whole session's
// issues, campaigns and knowledge can land in a workspace the repository never chose. Every record a call
// returns carries `tenant`, so the FIRST write already shows where it went. `tenantWarning` says so: the call
// has happened, so this is a message and not a refusal, and it repeats on every mismatched call.
//
// WHEN (DEFAUL-203, before `log_change_round`). A round's `declaredAfterWork` is derived from each commit's `at`
// against when the campaign opened (DEFAUL-187). `at` was whatever the caller typed: omitted, a post-hoc campaign
// reads `unknown` exactly like an honest one that forgot; typed later than the commit, it reads `no`. The server
// cannot read git; the door can. So a commit that RESOLVES in this checkout must carry its own time — missing or
// contradicted, the call is refused with the right value to re-send, BEFORE the request is sent.
//
// Keeping it from becoming a trap:
//   · only where the repository OPTED IN (a `linked` workspace — the caller passes `resolved`);
//   · UNKNOWN IS NOT A REFUSAL — a sha this checkout does not hold passes untouched and keeps its home in
//     `unknown`; a response it cannot parse says nothing;
//   · a refusal names the exact values to send, so it costs one call, never a wedge;
//   · BREAK-GLASS — `EVERDICT_BREAK_GLASS='<reason>'` lets the round through, and the reason is metered.
//
// WHAT IT MADE FALSE (DEFAUL-177). A commit the checkout holds REMOVED a path a document still cites: refused
// naming each document and path, unless a commit of the round declares `Docs-unchanged: <doc> — <why>`.
// WHAT IT COST (DEFAUL-251). A round that says `costUnknown` from a session whose transcript can see the tokens is
// asked, once per session and campaign, to send them as `usage` — only when the caller can name the transcript
// (`transcriptPath`); a door that cannot find it says nothing (unknown is not a refusal).
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { referencesTheRoundRemoved } from "./doc-references.mjs";
import { usageSinceLastRound } from "./transcript-usage.mjs";

const gitSays = (args, root) => {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
  } catch {
    return undefined;
  }
};

// A meter, never a decision (the Stop guard's DEFAUL-35 rule): one line, failures swallowed.
const meter = ({ workspace, session, op }, outcome, extra = {}) => {
  try {
    const dir = path.join(os.homedir(), ".everdict");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, "record-guard.jsonl"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        workspace,
        session,
        origin: process.env.EVERDICT_STOP_GUARD_ORIGIN?.trim() || undefined,
        tool: op,
        outcome,
        ...extra,
      })}\n`,
    );
  } catch {
    // See above.
  }
};

// The round's documents, read in ONE git process: a repository has hundreds of them, and a process per file
// would put seconds between a session and its round.
const blobsAt = (rev, paths, root) => {
  if (paths.length === 0) return [];
  let out;
  try {
    out = execFileSync("git", ["-C", root, "cat-file", "--batch"], {
      input: `${paths.map((p) => `${rev}:${p}`).join("\n")}\n`,
      stdio: ["pipe", "pipe", "ignore"],
      timeout: 20_000,
      maxBuffer: 1 << 28,
    });
  } catch {
    return undefined;
  }
  const docs = [];
  let at = 0;
  for (const p of paths) {
    const nl = out.indexOf(10, at);
    if (nl < 0) return undefined;
    const header = out.subarray(at, nl).toString("utf8").split(" ");
    at = nl + 1;
    if (header[1] !== "blob") continue; // `missing` — not a document at this revision
    const size = Number(header[2]);
    docs.push({ path: p, markdown: out.subarray(at, at + size).toString("utf8") });
    at += size + 1;
  }
  return docs;
};

/**
 * Before `create_issue` (DEFAUL-524). An issue filed through the door names its goal (`projectId`) or says why it
 * has none (`noProjectBecause`): 85 of 509 issues sat in no project because nothing asked. `body` is the REST body;
 * returns the refusal message, or `undefined` to send. Blank is the same silence as absent. The API stores the
 * reason as `history` detail on `created`; the web form is a person's door and is not asked.
 */
export const issueGoalRefusal = ({ body }) => {
  const named = typeof body?.projectId === "string" && body.projectId.trim() !== "";
  const because = typeof body?.noProjectBecause === "string" && body.noProjectBecause.trim() !== "";
  if (named || because) return undefined;
  return "create_issue needs `projectId` (the goal this work serves — `everdict-api raw GET /projects`) or `noProjectBecause` (one sentence on why no project covers it). Nothing was sent.";
};

/**
 * Before `log_change_round`. `resolved` is a `linked` result of `resolveWorkspace`; `body` is the REST body
 * (camelCase); `campaignId` is the path's `id`. Returns the refusal message, or `undefined` to send.
 */
export const roundRefusal = ({ resolved, body, campaignId, session, transcriptPath, op = "log_change_round" }) => {
  const { workspace, root } = resolved;
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  const wrong = [];
  const held = [];
  for (const entry of changes) {
    for (const commit of Array.isArray(entry?.commits) ? entry.commits : []) {
      const sha = typeof commit?.sha === "string" ? commit.sha : "";
      if (!/^[0-9a-f]{7,64}$/i.test(sha)) continue;
      // Not held here → not ours to judge. `cat-file -e` both resolves an abbreviation and proves a commit.
      if (gitSays(["cat-file", "-e", `${sha}^{commit}`], root) === undefined) continue;
      held.push(sha);
      const actual = gitSays(["log", "-1", "--format=%cI", sha], root);
      if (!actual) continue;
      const claimed = typeof commit.at === "string" ? commit.at : undefined;
      // The INSTANT is what the derivation compares; `+09:00` and `Z` spellings of it are the same time.
      if (claimed !== undefined && Date.parse(claimed) === Date.parse(actual)) continue;
      wrong.push({ repository: entry.repository, sha, claimed, actual });
    }
  }

  // ── WHAT IT MADE FALSE: documents citing a path this round's commits removed ────────────────────
  const removed = new Set();
  const declared = new Map();
  for (const sha of held) {
    for (const line of (gitSays(["show", "--format=", "--name-status", "-M", sha], root) ?? "").split("\n")) {
      const [status, from] = line.split("\t");
      if (status === "D" || status?.startsWith("R")) removed.add(from);
    }
    for (const m of (gitSays(["log", "-1", "--format=%B", sha], root) ?? "").matchAll(
      /^Docs-unchanged:\s*(\S+)\s+[—–-]+\s*(\S.*)$/gm,
    ))
      declared.set(m[1], m[2]);
  }
  let orphaned = [];
  if (removed.size > 0) {
    const after = new Set((gitSays(["ls-tree", "-r", "--name-only", "HEAD"], root) ?? "").split("\n").filter(Boolean));
    // UNKNOWN IS NOT A REFUSAL: a tree or a document this door could not read says nothing about the round.
    const docs = blobsAt(
      "HEAD",
      [...after].filter((p) => p.endsWith(".md")),
      root,
    );
    if (after.size > 0 && docs !== undefined)
      orphaned = referencesTheRoundRemoved({ after, removed, docs }).filter((f) => !declared.has(f.doc));
  }

  // ── WHAT IT COST: a round that says it cannot see its cost, from a session whose transcript can (DEFAUL-251) ─
  //
  // `costUnknown` was the honest answer for an interactive session until the round could carry its TOKENS, which
  // the transcript has. Asked ONCE per session and campaign: re-sending `costUnknown` after seeing the usage is a
  // decision (the work was done elsewhere), not an oversight. A delegated round is left alone — its cost is the
  // delegate's, and this transcript holds the supervisor's tokens.
  let unseenUsage;
  if (
    typeof body?.costUnknown === "string" &&
    body.cost === undefined &&
    body.usage === undefined &&
    body.delegationRunId === undefined &&
    typeof transcriptPath === "string"
  ) {
    const safe = (v) => String(v ?? "none").replace(/[^A-Za-z0-9_-]/g, "_");
    const shownDir = path.join(os.tmpdir(), "everdict-record-guard");
    const shown = path.join(shownDir, `${safe(session)}-${safe(campaignId)}-usage-shown`);
    if (!existsSync(shown)) {
      try {
        const usage = usageSinceLastRound(readFileSync(transcriptPath, "utf8").split("\n"));
        if (usage !== undefined && usage.length > 0) {
          unseenUsage = usage;
          mkdirSync(shownDir, { recursive: true });
          writeFileSync(shown, JSON.stringify(usage));
        }
      } catch {
        // UNKNOWN IS NOT A REFUSAL: a transcript this door could not read says nothing about the round.
      }
    }
  }

  if (wrong.length === 0 && orphaned.length === 0 && unseenUsage === undefined) return undefined;
  const at = { workspace, session, op };
  const breakGlass = process.env.EVERDICT_BREAK_GLASS?.trim();
  if (breakGlass) {
    meter(at, "break_glass", {
      commits: wrong.length,
      orphaned: orphaned.length,
      usage: unseenUsage !== undefined,
      reason: breakGlass,
    });
    return undefined;
  }
  if (wrong.length > 0)
    meter(at, "refused_commit_time", { commits: wrong.map(({ sha, claimed, actual }) => ({ sha, claimed, actual })) });
  if (orphaned.length > 0)
    meter(at, "refused_orphaned_citation", {
      documents: orphaned.map((f) => ({ doc: f.doc, refs: f.dead.map((d) => d.ref) })),
    });
  const timeLines =
    wrong.length === 0
      ? []
      : [
          "Not logged yet: this round's commits must carry the time the REPOSITORY gives them. The record derives",
          "from it whether the criteria were declared before the work (`declaredAfterWork`), so a missing `at`",
          "reads `unknown` and a wrong one reads a different answer. These commits are in this checkout, so their",
          "time is known — re-send the call with each `at` exactly as below (`git log -1 --format=%cI <sha>`):",
          "",
          ...wrong.map(
            ({ repository, sha, claimed, actual }) =>
              `  ${repository ?? "?"}@${sha}: at "${actual}"${claimed === undefined ? " (was missing)" : ` (was "${claimed}")`}`,
          ),
          "",
          "A commit this checkout does not hold is not checked; it keeps whatever you send.",
        ];
  const docLines =
    orphaned.length === 0
      ? []
      : [
          ...(timeLines.length > 0 ? [""] : []),
          "Not logged yet: this round's commits REMOVED paths that documents still cite, so those documents now",
          "describe something that is gone (the seed's \"a document's owner\" gate, DEFAUL-177):",
          "",
          ...orphaned.flatMap((f) => [
            `  ${f.doc}`,
            ...f.dead.map((d) => `    ${d.kind === "anchor" ? "anchors" : "cites"} \`${d.ref}\``),
          ]),
          "",
          "Update each document in a commit of this round, or — when it is right as it stands (it describes the",
          "removal, or is rewritten next) — add a line to a commit message of this round:",
          "  Docs-unchanged: <doc> — <why>",
          "and re-send the call.",
        ];
  if (unseenUsage !== undefined) meter(at, "asked_for_usage", { models: unseenUsage.map((u) => u.model) });
  const costLines =
    unseenUsage === undefined
      ? []
      : [
          ...(timeLines.length + docLines.length > 0 ? [""] : []),
          "Not logged yet: this round says it cannot see its cost (`costUnknown`), but this session's transcript",
          "records the tokens it spent since its last round. Send them as `usage` INSTEAD of `costUnknown` — the",
          "server prices them into `cost {source: estimate}` through its own table (replay bar D, DEFAUL-251):",
          "",
          `  usage: ${JSON.stringify(unseenUsage)}`,
          "",
          "If these tokens are not this round's (the work was done elsewhere), re-send `costUnknown` as it was —",
          "this is asked once per campaign.",
        ];
  return [...timeLines, ...docLines, ...costLines].join("\n");
};

// Only the response's OWN record is evidence of where this call wrote — a list's items can legitimately belong
// elsewhere (shared templates), so nested collections are not read.
const tenantOf = (record) => {
  if (!record || typeof record !== "object" || Array.isArray(record)) return undefined;
  for (const candidate of [record, record.record, record.campaign, record.report]) {
    const tenant = candidate && typeof candidate === "object" ? candidate.tenant : undefined;
    if (typeof tenant === "string" && tenant.length > 0) return tenant;
  }
  return undefined;
};

/**
 * After any call that answered a record. `resolved` is a `linked` result of `resolveWorkspace`; `record` is the
 * parsed response. Returns the warning, or `undefined` when the record landed where the checkout declares.
 */
export const tenantWarning = ({ resolved, record, session, op }) => {
  const { workspace, from: declaredBy } = resolved;
  const landed = tenantOf(record);
  // `_shared` records belong to no workspace.
  if (landed === undefined || landed.startsWith("_") || landed === workspace) return undefined;
  meter({ workspace, session, op }, "tenant_mismatch", { landed });
  return [
    `⚠️ That record landed in workspace '${landed}', but this repository records into '${workspace}' (from ${declaredBy}).`,
    "The server answered for the workspace of the credential the door used: an API key belongs",
    "to one workspace, and one naming another is re-scoped to its own without an error. Everything this session",
    `writes goes to '${landed}' until that changes — and the Stop guard would then read '${landed}' too.`,
    "",
    "Stop writing to Everdict and tell the user, with both names. The fix is theirs to choose:",
    `  · use a key minted for '${workspace}' (POST /keys with \`x-everdict-workspace: ${workspace}\`), or`,
    `  · if '${landed}' is where this service belongs, write '${landed}' into .everdict/workspace.`,
    `What was already written is in '${landed}'; say which records, so they can be moved or re-filed.`,
  ].join("\n");
};
