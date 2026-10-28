---
name: everdict-sdlc-session
description: >-
  Human-session appendix to skill `everdict-sdlc` — for a person's Claude Code or Codex session in a git checkout only, never linked into a persona brain. The `everdict-api` door, goal binding, hooks and guards (Stop, capture, delegation), checkout linking, image publishing.
---

# The work's record, from a person's session in a checkout (appendix)

The portable loop — the lineage, reading first, one issue per request, judging your own gate, recording — is skill
`everdict-sdlc`. This appendix is what only a person's session with a shell and a git checkout has: the door, the
hooks that guard it, and the checkout. A persona brain does not link it (DEFAUL-820).

## How an operation is invoked

The operation names below (`create_issue`, `log_change_round`, …) are all called through the plugin's REST door:
`everdict-api <op> [--id <id>] [--query k=v] --body '{…}'` — `everdict-api describe <op>` prints the request body,
which is camelCase (`references/rest-ops.md` in skill `everdict` lists every operation and its route). For a long
body write the file with a QUOTED heredoc (`<<'JSON'`) and pass `--body @file.json`: an unquoted heredoc executes
the backticks inside it. Every call leaves an `EVERDICT_RECEIPT` line on stderr; that receipt is what the guards
below read.

## Binding a session to a goal

`/everdict:goal <initiative|project id or exact name>` writes `.everdict/goal` at the checkout root — the
same plugin-owned shape as `.everdict/workspace`, never read as a code change. Once bound:

- **SessionStart** names the goal and tells the session to read `next_work` (`--kind <kind> --id <id>`) first, and to work its
  first item — the goal's `doneWhen` and its ranked open issues, in one read.
- **The Stop guard** will not let the session end on "one issue solved" while the goal is not. After every
  existing record check above has cleared, it re-asks `next_work` itself: a campaign this session logged a
  round on with no later verdict is named for mint/review/close; `work_available` names the next issue;
  `nothing_open`/`empty` with the goal not yet complete asks the session to measure each `doneWhen` line and
  file the sub-issues the goal's project still needs (skill `advance_the_goal`); a completed goal allows. A
  loop guard allows the stop after three consecutive goal refusals with no new Everdict write in between, and
  says so — a goal cannot wedge a session shut. `EVERDICT_BREAK_GLASS` bypasses this table exactly as it
  bypasses the record checks, and an unreachable `next_work` allows with a notice rather than blocking blind.

An unbound checkout is unaffected — no goal section at SessionStart, no goal table at Stop.

## What refuses

- **Every change to the repository** is refused while this session has named no change campaign
  (`first-change-guard`) — every time, not once: open the issue and the campaign, declare the criteria, then
  go on. It is judged by the REPOSITORY — a python heredoc or `sed -i` counts as much as an edit — because both
  sessions of the first foreign-repo trial (DEFAUL-185) made their first change through Bash and declared
  their criteria only when Stop refused them, and a campaign opened after the work reads exactly like one
  opened before it. A campaign named only inside a subagent's own transcript still counts.
- A **local subagent's edit** is refused even after a campaign is named — it has no session of its own to be
  judged or verified against — and once a campaign declares `"delegation":{"required":true}`, this session's own
  hand-edit tools (Edit/Write/MultiEdit/NotebookEdit) are refused too. Both name `/everdict:delegate`. A Bash
  call that lands a delegate's own patch (a merge, a commit, the supervisor's integration lane) is not refused
  by either rule — only the hand-edit tools are.
- A call whose record came back with a **`tenant` other than the declared workspace** is interrupted
  (`record-guard`), every time: under an API key the server answers for the key's own workspace whatever the
  session names (DEFAUL-196), so a key minted elsewhere sends a whole session's records somewhere else without
  an error. Stop writing, and tell the user both names — the fix (a key for this workspace, or a different
  `.everdict/workspace`) is theirs.
- A **`log_change_round` whose commits are in this checkout** is refused until each carries its `at` exactly as
  `git log -1 --format=%cI <sha>` gives it (`record-guard`, DEFAUL-203): `declaredAfterWork` is derived from it,
  and a missing or later `at` would make a post-hoc campaign read `unknown` or `no`. A commit the checkout does
  not hold is not checked.
- A **`log_change_round` whose commits REMOVED a path a document still cites** (an `anchors:` entry or a
  backticked path) is refused, naming each document and path (`record-guard`, DEFAUL-177 — the seed's
  "a document's owner" gate). The change has made that document false. Update it in a commit of the round, or —
  when it is right as it stands (it describes the removal, or is rewritten next) — put
  `Docs-unchanged: <doc> — <why>` on its own line in a commit message of the round, and re-send. Only a
  REMOVAL is asked about: whether an edit made a document false is your judgement, and a guard that asked about
  every touched anchor would refuse almost every change (116 of 118, replayed).
- A session whose round the product **ADOPTED** and that left the campaign **open** is refused once at Stop:
  `mint_change_report`, `review_change_report`, then `close_change_campaign`. **A campaign ends on its
  SUPERVISOR's verdict over the current report** (owner decision, 2026-09-28, DEFAUL-277 — supersedes the
  2026-09-23 "the session is its own verifier" call): the session that set the goal is the one that judges the
  work, whether it did the round itself or delegated it. Filing that verdict on a round a DELEGATE ran is not
  reviewing your own work — `roundExecutor` names the delegate's session, not yours, so the door lets it
  through; **a round you typed yourself may be approved or rejected by you too** (DEFAUL-418 lifted the
  different-actor refusals in this lane — the record still classifies a self-judged adoption, it no longer refuses it).
  You may still escalate (`review_change_report` with disposition `escalated`, `askedOf` (which may name yourself), and a declared `condition` + `why`);
  an answer (`respondsTo`) is the verdict the close spends. Every adopting
  close now needs a CURRENT approving verdict unconditionally — there is no shape where minting and closing
  alone are enough. An UNMET round leaves the campaign legitimately open for the next round, and logging round
  N+1 now needs a verdict over round N first: a `revise` you answer in `respondsTo`, or an approval you have
  simply not closed on yet.
- A session that **changed code and recorded nothing is refused once at Stop** — and if it ends anyway
  (its user told it to skip the record, or it used break-glass), the guard **files one issue** in the
  workspace saying a change happened with nothing on the record, naming the commits (DEFAUL-194). Without
  a credential it cannot file, so the NEXT session in the repository is told once and asked to file it.
  Obeying the user is the session's call; whether the workspace may know a change happened is not. The break-glass is
  `EVERDICT_BREAK_GLASS='<reason>'`, and the reason is reported — a visible escape, not a silent one.
- A **Bash call that publishes an image** to a ref this session holds no `push_image_grant` for is refused
  (`image-push-guard`) — see "Publishing an image" below.
- A checkout **links itself** the first time Claude Code opens it: SessionStart asks every workspace a
  user-local credential is registered for (`~/.everdict/workspaces.json`, `/everdict:setup` or
  `lib/credentials.mjs add|import-claude-config`) whether one of its products lists this repository's remote,
  and writes `.everdict/workspace` on exactly one match — never guessed when several match, and a failed
  lookup is named `unknown`, never silently read as "no match". The choice is cached, so a second checkout of
  the same remote resolves offline.
- **An UNLINKED checkout — no auto-link, no `.everdict/workspace`, no `EVERDICT_WORKSPACE` — refuses every
  edit and Bash change**, not just the campaign-naming rule above: `first-change-guard` denies an edit tool
  and blocks a Bash call unless the only thing it changes is `.everdict/workspace` itself. Link it by hand
  (`mkdir -p .everdict && echo <workspace> > .everdict/workspace`) or opt out — `echo none >
  .everdict/workspace` is silent from then on, on the record, and every guard here (including this one) skips
  it. `EVERDICT_WORKSPACE=<id>` still works as a one-off override, for either case.
- Closing an issue (`set_issue_status` with `"status":"done"`) **requires saying how it was evaluated** — the
  product refuses a close without one of `resolution.scorecardId` (the batch that proved it), `note` (what
  settled it: name the commit AND the campaign whose round the product adopted), or `evidenceDeclined`.
  Close it AFTER the campaign's round exists, not before: a request marked done ahead of the round that
  verifies it is a record in an order no reader can reconcile (DEFAUL-188). An issue you cannot say how you
  evaluated stays `in_review`, which is the honest state.
- **Every decision carries its `reason`, and the product refuses one without it** (DEFAUL-526: agents decide, a
  person is asked only under a declared condition, and every decision is history). Send `reason` (what you decided
  and why) on: a reopen or an open → open `set_issue_status` move, an `update_issue` that changes `priority`,
  `projectId`, `parentId` or `assignee`, and EVERY `set_project_status` / `set_initiative_status`
  move (planned, in progress, paused, backlog, completed, cancelled, a reopen — DEFAUL-552). The history
  records it with the old and new value, and a closed issue's resolution (note, `evidenceDeclined`,
  `cancelledBecause`, scorecard) reads back as that decision's reason;
  `get_goal_decisions` reads a goal's decisions back in time order; `get_workspace_attention` reads which finished work
  is worth the owner's attention since their last visit and why (a read — nothing to acknowledge, nobody is asked). `review_change_report` may escalate to a person only with a `condition` —
  one of `irreversible_external_effect`, `spend_beyond_budget`, `credential_or_access_missing`,
  `owner_reserved_decision`, `conflicting_owner_instructions`, `invariant_loosening` — and a `why`; outside those, decide.
- **A goal is completed by evidence, and an issue names its goal** (DEFAUL-524). `set_project_status` /
  `set_initiative_status` to `completed` needs `completion: {lines: [{line, holds: true, evidence: [NodeRef…], note}]}`
  — one entry per `doneWhen` line, the line verbatim, at least one evidence ref each; a missing or unmatched line is
  refused by name and `force` does not waive it. `next_work` on a goal with nothing open returns `doneWhenStatus`
  (the lines to evidence — a checklist, false until completed) and each item carries `why`. A goal with no `doneWhen` is not
  completed in the same step: write it from the description (a PATCH of the goal's `doneWhen`, citing the source), complete it
  later; `force` + `reason` is the only way past. `create_issue` through `everdict-api` needs `projectId`, or
  `noProjectBecause` — one sentence, kept on the issue's history — and is refused before anything is sent otherwise.

## Publishing an image

An image a session builds and pushes lands in **this workspace's Everdict managed image store**, or not at
all. `push_image_grant --body '{"repository":"<name>"}'` mints a short-lived token scoped to `<namespace>/<repository>`
and returns `imagePrefix` — so "pushed to the product" is checkable before the effect, and `image-push-guard`
checks it: a `docker`/`podman`/`nerdctl`/`buildah` push, a `build`/`buildx build --push`, a `crane`/`skopeo`/
`oras`/`regctl` publish is refused unless every target ref is `<grant.endpoint>/<ns>/<repo>` for a grant this
session (main transcript or any subagent) holds. `compose push` and `buildx bake --push` publish whatever a
file names, which this hook cannot read — refused as unresolvable, the same as a shell-variable target
(`docker push "$REF"`), because a target it cannot check is exactly the shape a push to the wrong place would
take to stay invisible.

`everdict image push <local-ref>` is the one-step sanctioned path — it mints the grant, tags and pushes for
you. `--registry <name>` is BYO (a registry you brought) and is refused by the same hook: it is not this
workspace's managed store. Break-glass is `EVERDICT_BREAK_GLASS='<reason>'`, as elsewhere.

## Moved out of SessionStart (pulled on demand)

- **Reference keys**: a commit is `{type:"commit", key:"owner/name@<full 40-char sha>"}`; a checkpoint's `issue` ref takes the issue's id (from `get_issue`), not its identifier. An entry you built on goes in your entry's `refs` as `{type:"knowledge", key}`.
- **File what you were given**: the assembly's path comes back as `receipt.path`; account for what you used with `everdict-api record_retrieval_use --body '{"assemblyPath":"<receipt.path>","used":["<id>"],"outcome":"<one line>"}'`.
- **`open_plan`** is for a SEQUENCE of moves before any of them is a request; a single change needs only the issue and campaign.
- **Code work is delegated by default**: a local subagent's edit is refused even after the campaign is named; once the campaign declares `delegation: { required: true }`, this session's own hand-edit tools are refused too.
- **Before you stop**: `create_knowledge_entry` (`decision` · `finding` · `convention` · `context`) with `refs` naming the issue and repository; a session that changed code and recorded nothing is refused once at Stop (`EVERDICT_BREAK_GLASS='<reason>'` reports instead).
- `everdict-api issue_conventions` — read it before filing anything.
