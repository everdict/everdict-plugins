#!/usr/bin/env node
// PostToolUse — Bash only. A SUCCESSFUL `gh pr create` or `gh pr merge` reaches the issue it served (DEFAUL-427).
//
// Measured on the live deployment (2026-10-01): 413 rounds, 984 commits, ZERO pull requests recorded. The PR is
// opened and merged with `gh` in the agent's own shell, so the plugin — which observes that shell — is the one
// place that can record it without the agent remembering to.
//
// ⚠️ IT DOES NOT TRUST PARSED PROSE. What `gh pr create` printed, or how `gh pr merge` was spelled, says only
// WHICH pull request to ask about. The facts — its number, state, head and merge commit — come from
// `gh pr view <ref> --json …`, the forge's own answer (provenance at the source, protocol L3). `gh pr merge
// --auto` merges nothing yet, and the view says OPEN, so it is recorded as open and never owed as a merge.
//
// RECORDING GOES THROUGH THE DOOR (`bin/everdict-api`), so it leaves a receipt like every other write:
//   record_pull_request   on the issue of the session's change campaign (read from the campaign, not guessed)
//   attach_round_pull_request   on that campaign's LATEST round, when it has one
// Exit 3 is `unknown` — the write may or may not have landed, and it is never retried blind: the issue is READ
// first, and only a PR it does not carry is reported as unrecorded.
//
// NOTHING HERE IS SILENT. No bound issue, an unreadable `gh`, a refusal, an unknown outcome: each is said to the
// agent as hook output, and a MERGE left unrecorded is journalled (`lib/pr-journal.mjs`) so the Stop guard
// refuses once, naming it.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { appendPrRow } from "./lib/pr-journal.mjs";
import { landed, sessionReceipts } from "./lib/receipts.mjs";
import { NAMED_CAMPAIGN_OPS } from "./lib/session-campaigns.mjs";
import { resolveWorkspace } from "./lib/workspace.mjs";

const stdin = await new Promise((resolve) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
  });
  process.stdin.on("end", () => resolve(buf));
});
const silent = () => process.exit(0);
const tell = (lines) => {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: lines.join("\n") } }),
  );
  process.exit(0);
};

let input = {};
try {
  input = JSON.parse(stdin || "{}");
} catch {
  silent();
}
if (input.hook_event_name !== "PostToolUse" || input.tool_name !== "Bash") silent();
const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
if (!/\bgh\b/.test(command) || !/\bpr\b/.test(command)) silent();

// A call that did not succeed opened and merged nothing.
const response = input.tool_response ?? {};
const code = response.exit_code ?? response.exitCode ?? response.code;
if (typeof code === "number" && code !== 0) silent();
if (response.interrupted === true || response.is_error === true) silent();
const stdoutText = typeof response === "string" ? response : String(response.stdout ?? response.output ?? "");

// ── which `gh pr …` calls this command made ─────────────────────────────────────────────────────────────
const tokenize = (segment) => {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (let m = re.exec(segment); m !== null; m = re.exec(segment)) tokens.push(m[1] ?? m[2] ?? m[3]);
  return tokens;
};
// Only a command that RUNS `gh` counts: split on shell operators OUTSIDE quotes and here-doc bodies, and require the
// segment's first word (after `VAR=x` assignments) to be `gh` — `gh pr merge` inside another command's argument is text.
const segmentsOf = (text) => {
  const src = text.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, "");
  const out = [];
  let cur = "";
  let quote;
  for (let k = 0; k < src.length; k++) {
    const c = src[k];
    if (quote !== undefined) {
      cur += c;
      if (c === "\\" && quote === '"') cur += src[++k] ?? "";
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === "\\") {
      cur += c + (src[++k] ?? "");
    } else if (c === ";" || c === "\n" || c === "|" || c === "&") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
};
const calls = [];
for (const segment of segmentsOf(command)) {
  const tokens = tokenize(segment);
  while (tokens.length > 0 && /^[A-Za-z_]\w*=/.test(tokens[0])) tokens.shift();
  if (tokens[0] !== "gh") continue;
  const rest = tokens.slice(1);
  let repo;
  const positional = [];
  let auto = false;
  let sub;
  let i = 0;
  // `gh -R owner/name pr merge …` and `gh pr merge -R owner/name …` both name the repository.
  for (; i < rest.length; i++) {
    const t = rest[i];
    if (t === "-R" || t === "--repo") repo = rest[++i];
    else if (t.startsWith("--repo=")) repo = t.slice("--repo=".length);
    else if (t === "--auto") auto = true;
    else if (t.startsWith("-")) {
      // another flag: its value (if any) is not a PR reference — only the known value-taking ones consume one
      if (
        [
          "-t",
          "--title",
          "-b",
          "--body",
          "-B",
          "--base",
          "-H",
          "--head",
          "--match-head-commit",
          "-F",
          "--body-file",
          "-A",
          "--author-email",
          "-r",
          "--reviewer",
          "-a",
          "--assignee",
          "-l",
          "--label",
          "-m",
          "--milestone",
          "-p",
          "--project",
        ].includes(t)
      )
        i++;
    } else if (rest[i] === "pr" && sub === undefined && rest[i + 1] !== undefined) {
      sub = rest[++i];
    } else if (sub !== undefined) positional.push(t);
  }
  if (sub === "create" || sub === "merge") calls.push({ sub, repo, ref: positional[0], auto });
}
if (calls.length === 0) silent();

const session = typeof input.session_id === "string" && input.session_id.length > 0 ? input.session_id : undefined;
const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process.cwd();
const resolved = resolveWorkspace(cwd);
if (!resolved || resolved.kind === "opted-out") silent();

const DOOR = process.env.EVERDICT_API_BIN || path.join(import.meta.dirname, "..", "bin", "everdict-api");
const door = (args) =>
  spawnSync(process.execPath, [DOOR, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 90_000,
    env: { ...process.env, ...(session ? { EVERDICT_SESSION_ID: session } : {}) },
  });
const doorJson = (result) => {
  try {
    return JSON.parse(result.stdout || "null");
  } catch {
    return undefined;
  }
};

// The workspace's issue identifier form.
const IDENTIFIER = /\b[A-Z][A-Z0-9]*-\d+\b/g;
const notices = [];
const journal = (row) => {
  if (session !== undefined) appendPrRow(session, { kind: "observed", ...row });
};

// ── the session's bound campaign, then its issue and rounds — READ from the campaign, not from a receipt's guess
const boundCampaignId = async () => {
  let id;
  for (const receipt of await sessionReceipts({ transcriptPath: input.transcript_path, sessionId: session })) {
    if (!landed(receipt) || !NAMED_CAMPAIGN_OPS.test(receipt.op)) continue;
    id = receipt.pathParams?.id ?? receipt.result?.record?.id ?? receipt.result?.id ?? id;
  }
  return id;
};

for (const call of calls) {
  const repoFlags = call.repo ? ["--repo", call.repo] : [];
  // Which PR to ask about: the url `gh pr create` printed, or the reference `gh pr merge` was given — a REFERENCE,
  // never the facts. No reference means the current branch's, which is what `gh pr view` itself defaults to.
  const printed = call.sub === "create" ? /https?:\/\/\S+\/pull\/\d+/.exec(stdoutText)?.[0] : undefined;
  const ref = printed ?? call.ref;
  const FIELDS = "number,url,state,headRefOid,mergeCommit,mergedAt,title,body";
  const viewWith = (fields) =>
    spawnSync("gh", ["pr", "view", ...(ref ? [ref] : []), ...repoFlags, "--json", fields], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
    });
  // `baseRepository` is not a JSON field on every gh (2.45 refuses the whole call): ask without it when told so —
  // the repository then comes from the PR url, or `gh repo view`.
  let view = viewWith(`${FIELDS},baseRepository`);
  const withoutBase = view.status !== 0 && /Unknown JSON field.*baseRepository/s.test(view.stderr ?? "");
  if (withoutBase) view = viewWith(FIELDS);
  let pr;
  try {
    pr = view.status === 0 ? JSON.parse(view.stdout) : undefined;
  } catch {
    pr = undefined;
  }
  if (pr === undefined || typeof pr.number !== "number" || typeof pr.url !== "string") {
    const why = `\`gh pr view\` could not read it (${(view.stderr || "no answer").trim().split("\n")[0]})`;
    notices.push(
      `everdict: a \`gh pr ${call.sub}\` succeeded but the pull request could not be read back, so it is NOT recorded — ${why}. Record it with \`everdict-api record_pull_request\`.`,
    );
    if (call.sub === "merge" && !call.auto)
      journal({ url: ref ?? "(current branch)", number: 0, state: "merged", recorded: false, reason: why });
    continue;
  }
  const state = { OPEN: "open", MERGED: "merged", CLOSED: "closed" }[String(pr.state).toUpperCase()];
  const mergedSha = pr.mergeCommit?.oid;
  if (state === undefined || (state === "merged" && typeof mergedSha !== "string")) {
    const why = `the forge answered state ${pr.state} ${state === "merged" ? "with no merge commit" : ""}`.trim();
    notices.push(`everdict: pull request #${pr.number} (${pr.url}) is NOT recorded — ${why}.`);
    journal({ url: pr.url, number: pr.number, state: state ?? "unknown", recorded: false, reason: why });
    continue;
  }
  // The repository and host from the forge's own address — the one the `url` field already carries.
  const parsedUrl = /^https?:\/\/([^/]+)\/([^/]+\/[^/]+)\/pull\/\d+/.exec(pr.url);
  const base = pr.baseRepository;
  let repository =
    (typeof base?.nameWithOwner === "string" ? base.nameWithOwner : undefined) ??
    (typeof base?.owner?.login === "string" && typeof base?.name === "string"
      ? `${base.owner.login}/${base.name}`
      : undefined) ??
    parsedUrl?.[2];
  if (repository === undefined && withoutBase) {
    const repo = spawnSync("gh", ["repo", "view", ...repoFlags.slice(1), "--json", "nameWithOwner"], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
    });
    try {
      const name = repo.status === 0 ? JSON.parse(repo.stdout)?.nameWithOwner : undefined;
      if (typeof name === "string" && name.includes("/")) repository = name;
    } catch {}
  }
  const host = parsedUrl?.[1] !== undefined && parsedUrl[1] !== "github.com" ? parsedUrl[1] : undefined;
  const owed = (why) => {
    notices.push(`everdict: pull request #${pr.number} (${pr.url}) is NOT recorded on its issue — ${why}`);
    journal({ url: pr.url, number: pr.number, state, recorded: false, reason: why });
  };
  if (repository === undefined) {
    owed("its repository could not be read from the forge's answer.");
    continue;
  }
  const body = {
    repository,
    ...(host ? { host } : {}),
    number: pr.number,
    url: pr.url,
    state,
    ...(typeof pr.headRefOid === "string" && pr.headRefOid ? { headSha: pr.headRefOid } : {}),
    ...(state === "merged" ? { mergedSha, ...(typeof pr.mergedAt === "string" ? { mergedAt: pr.mergedAt } : {}) } : {}),
    ...(typeof pr.title === "string" && pr.title ? { title: pr.title.slice(0, 500) } : {}),
    source: "gh_cli",
  };

  // The issue is the one the PULL REQUEST names (DEFAUL-864): its title, else its body. The session's open campaign
  // is a guess about what the agent is doing, and a merge issued from another issue's session landed on the wrong one.
  const named = (text) => [...new Set(String(text ?? "").match(IDENTIFIER) ?? [])];
  const identifiers = named(pr.title).length > 0 ? named(pr.title) : named(pr.body);
  if (identifiers.length === 0) {
    notices.push(
      `everdict: pull request #${pr.number} (${pr.url}) names no issue in its title or body, so it is NOT recorded. Name one (DEFAUL-N) and record it: \`everdict-api record_pull_request --id <issue> --body '<json>'\`.`,
    );
    continue;
  }
  const json = JSON.stringify(body);
  const campaignId = await boundCampaignId();
  const campaignRead = campaignId === undefined ? undefined : door(["get_change_campaign", "--id", campaignId]);
  const campaign = campaignRead?.status === 0 ? doorJson(campaignRead) : undefined;
  for (const identifier of identifiers) {
    const issueRead = door(["get_issue", "--id", identifier]);
    const issue = issueRead.status === 0 ? doorJson(issueRead) : undefined;
    if (issue === undefined || issue === null || typeof issue.id !== "string") {
      owed(
        `${identifier}, the issue it names, could not be read (${(issueRead.stderr || "").trim().split("\n")[0] || `exit ${issueRead.status}`}).`,
      );
      continue;
    }
    const issueId = issue.id;
    const wrote = door(["record_pull_request", "--id", issueId, "--body", json]);
    let recorded = wrote.status === 0;
    let reason;
    if (wrote.status === 3) {
      // UNKNOWN is not failure and not success: READ before anything else, never write again blind.
      const again = door(["get_issue", "--id", issueId]);
      const links = again.status === 0 ? doorJson(again)?.links : undefined;
      const carried = Array.isArray(links)
        ? links.find((l) => l.type === "pull_request" && l.id === `${repository}#${pr.number}`)
        : undefined;
      if (carried !== undefined && carried.state === state) recorded = true;
      else
        reason = `the write had an UNKNOWN outcome (transport failure) and reading issue ${issueId} ${
          Array.isArray(links) ? "does not show it" : "failed too"
        } — it may or may not have landed; read the issue before recording it again.`;
    } else if (wrote.status !== 0) {
      reason = `the door refused it (exit ${wrote.status}): ${(wrote.stderr || wrote.stdout || "").trim().split("\n")[0]}`;
    }
    if (!recorded) {
      owed(reason ?? "the door did not record it.");
      continue;
    }
    // A round belongs to its campaign's issue: attach only when that is the issue the PR names.
    const rounds = Array.isArray(campaign?.rounds) ? campaign.rounds.length : 0;
    let attached = "";
    if (rounds > 0 && campaign.issueId === issueId) {
      const attach = door(["attach_round_pull_request", "--id", campaignId, "--seq", String(rounds), "--body", json]);
      attached =
        attach.status === 0
          ? ` and attached to round ${rounds} of campaign ${campaignId}`
          : ` — but attaching it to round ${rounds} ${attach.status === 3 ? "had an UNKNOWN outcome" : "failed"} (exit ${attach.status}); the issue link is recorded`;
    }
    journal({ url: pr.url, number: pr.number, state, recorded: true });
    notices.push(`everdict: recorded pull request #${pr.number} (${state}) on issue ${identifier}${attached}.`);
  }
}
if (notices.length > 0) tell(notices);
silent();
