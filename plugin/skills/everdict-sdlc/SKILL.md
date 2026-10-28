---
name: everdict-sdlc
description: >-
  Use at the START and END of any work in a repository naming an Everdict workspace, before changing code, when deciding, on a trap, or when Stop refuses for nothing recorded. Where the record lives: issue, campaign, code, knowledge.
---

# The work's record lives in Everdict, not in this repository

A repository holds its product: code, product documentation, and the conventions of that code. **How the
work was requested, decided, reviewed and remembered accumulates in Everdict** — because a repository of
markdown is per repository, per person, and rots where nothing owns it
(`docs/architecture/repository.md`).

## How an operation is invoked

The operation names below (`create_issue`, `log_change_round`, …) are called by name through the session's door — the
tool of that name, for a persona brain. Request bodies are camelCase. A person's own Claude Code or Codex session
calls the same operations through the shell door; that, the hooks, and the checkout rules are the human-session
appendix, skill `everdict-sdlc-session`.

## The shape — one lineage, four nouns

    issue  ──▶  campaign  ──▶  change      the code that shipped (repo · PR · merged sha)
      ▲            │
      └────────────┴──▶  knowledge  decision · finding · convention · context

Every one of them names the **issue**, so the request is one read away from everything it caused. That is
the property to preserve; the operations are secondary.

| Noun | What it is | Operations |
|---|---|---|
| **issue** | the request — what problem, and why it is worth work | `list_issues` · `create_issue` · `update_issue` · `set_issue_status` |
| **campaign** | the change made under that request, and how it was judged | `open_change_campaign` · `log_change_round` · `close_change_campaign` (code changes) · `open_campaign` (evaluated grade) |
| **knowledge** | what the work taught, as a durable claim | `get_task_context` (the read that RECORDS) · `list_knowledge_entries` · `create_knowledge_entry` |
| **task** | work handed to a teammate or to your future self | `list_tasks` · `create_task` |

⚠️ **`open_change_campaign` REFUSES a request that has not been designed (DEFAUL-264).** `set_issue_chain`
`accept` requires a design — a spec under `docs/specs/**`, or a declined `why` — and the accepted chain is the
record that the design stage ran. This is a SERVER rule, enforced for every client that opens a `change`
campaign, not a step this plugin merely recommends: `draft`, `rejected`, and a chain-less (legacy or
brand-new) issue are all refused alike, naming the issue and `set_issue_chain accept` as the remedy.
`accepted` and `shipped` open; a requirement sub-issue named by a criterion's `judges.issueId` is not gated —
the parent's design covers it. Do the design step (below, "Code work is delegated by default", step 3)
*before* `open_change_campaign`, not after it is refused.

⚠️ **A task names the issue through `refs`, and that is what makes it findable.** Every other noun above has
carried a reference to the request from the start; the task ledger did not, which meant the lane recommended
for handing work to many agents produced work nobody could trace back to a request. So `create_task` takes
`"refs":[{"type":"issue","key":"DEFAUL-40"}]` — type the identifier, it resolves — and
`list_tasks --query refType=issue --query refKey=DEFAUL-40` is the read that answers "what work is already under this request", the one to run BEFORE
creating another. An issue this workspace does not have is refused rather than stored, on both the write and
the read: a reference nothing can resolve is not a weaker reference, it is a join that will never match and
never say why.

⚠️ **A round names the commits it settled, or SAYS WHY IT NAMES NONE.** `log_change_round` takes `changes`,
and it used to default to an empty array — so a caller who mistyped the parameter name got an `adopted`
round, the strongest verdict this system issues, about no change at all. That happened: campaign `c5c3fc52`
round 1 settled six criteria met and named no commit, and its round 2 exists only to carry the sha round 1
dropped. The parameter is **`changes`**, not `changeSet`, and an empty one now needs
`"changesNone":"<why>"` — the measurement-only round is real (a census changes nothing), and the point is
that only YOU can tell it apart from a typo. A delegated round declares neither: its change set comes from
the delegate's report, which must carry `changes` or `changesNone` — a report with neither is refused (DEFAUL-577).

⚠️ **A pull request is part of what shipped — name it.** A round's `changes[]` entry carries the PR beside its commits:
`{"repository":"owner/name","commits":[{"sha":"…","at":"…"}],"pr":{"number":12,"url":"https://github.com/owner/name/pull/12","mergedSha":"<the merge commit>"}}`
(`mergedSha` only once it merged — a PR that was `--auto`-merged or is still open names none). A merge
that happens AFTER the round is logged is attached, never retyped: `attach_round_pull_request` (campaign id, round
`seq`, the pull request). A person's session also has hooks that record a PR it opens; that is in the appendix. `sandbox_git_push` with a pull request records it too.

⚠️ **A follow-up round is measured on at least one gate the round before it ran, or says why not.** Two
rounds of one campaign can be compared only on a gate both ran, and on 2026-09-28 only 13 of 51 did — each
round minted its own ids. So `log_change_round` REFUSES a follow-up whose `gateRuns` share no `id` with the
previous round's, and the refusal names those ids. Reuse the same id for the same check (today's circumstance
goes in `command`); declare `"gatesUnshared":"<why>"` only when the check itself genuinely changed. A first
round is never asked.

**A decision logged after the fact says when it was made.** Rounds and verdicts are stamped with the server's own
time, so a two-round revise scripted in 0.4 s reads as a 0.4 s timeline. `log_change_round` and
`review_change_report` accept an optional `decided_at` (ISO timestamp with offset) — your claim of when you decided.
It is shown beside the recorded time ("recorded later" when they differ by more than a minute) and orders the issue's
Journey; nothing is authorized by it (DEFAUL-435).

⚠️ **A measurement you cite is a workspace file, not a path in `command`.** A gate run may carry
`"artifacts":[{"path","revision","digest"}]` — upload the reviewer's measurement (or any output you read) to the
workspace first, then cite the revision the upload returned and the sha256 hex of its bytes. `log_change_round`
VERIFIES each one and REFUSES a round citing a file that is not there, or whose bytes hash differently (DEFAUL-433).
The frozen report carries the references and the round pages link them; the loop census counts an `observed`
answer whose gate run carries one as `artifactBacked`.

⚠️ **Every round states its cost — exactly one account of it.** Send `"cost":{"usd":…,"source":…}` — `source` is
`session` (a headless run's `total_cost_usd`), `delegation` or `estimate` — or, from an INTERACTIVE session that
cannot see its dollars, `usage`: the tokens it spent since its last round, by model, which the server prices into
an estimate (DEFAUL-251). You need not add them up: a round sent with `costUnknown` is answered once with the
exact `usage` this session's transcript holds. `"costUnknown":"<why>"` is left for a round whose spend nothing
here can see. Never send a made-up zero: a zero is a measurement, and "what did each evolution step cost" is the
number this exists to answer.

⚠️ **Each commit carries its time.** `changes[].commits[]` is `{sha, at}`, and `at` comes from
`git log -1 --format=%cI <sha>`. The round's `declaredAfterWork` (`no` · `yes` · `unknown`) is DERIVED by
comparing those times with when the campaign opened. It is never sent, and an undated commit makes it
`unknown`. Measured on 2026-09-23: every live round that omitted `at` read `unknown`, the honest ones included,
so a campaign opened after the work could not be told apart from one declared before it.

## Open the session by reading, not by typing

Before touching code: **`get_task_context`** and `list_issues` (refs: `{"type":"repository","key":"<owner>/<name>"}`). A convention already decided, a finding that
already names this trap, an open request that already describes this work — reading them is cheaper than
rediscovering them, and rediscovering them is what an unrecorded team does forever.

⚠️ **THE ANCHORED CALL IS THE ONE THE CAPTURE GUARD ACCEPTS, AND IT IS THE ONLY ONE THAT RECORDS (DEFAUL-134).**
`get_task_context` runs the assembly, which files `knowledge/retrievals/<day>/<session>/assembly-*.json` —
what the workspace OFFERED. `list_knowledge_entries` and `get_knowledge_entry` read the same store and file
nothing, so a session that used only those leaves no answer to the one question only a session can answer:
of what you were given, what did you use. `capture-guard` refuses a code change without the anchored call,
and says so by name.

**Three reads, and they answer different questions.** Reach for the one that matches what you can name:

    get_task_context --body     about the ENTITIES YOU NAME (`refs`) — the projection onto an anchor's coordinate.
                                Answers nothing when you can name nothing, which is the state you open in.
    search_files --query pattern=…   NEEDS NO ANCHOR. Case-insensitive over the whole workspace tree: the specs,
                                plans and wiki under `docs/`, and every knowledge entry's BODY, mirrored to
                                `knowledge/<id>.md`. This is the read for "I am about to re-derive something
                                and I do not know what it is called".
    get_issue_lineage --id <issue> --query depth=…   about HOW A REQUEST CAME TO BE — its campaigns, their rounds and commits, the
                                knowledge they produced, and with `depth` the chains BACK: the campaign this
                                one continues, the claim a finding superseded.

⚠️ Searching is not a fallback for failing to anchor. A session at its start genuinely cannot name the
harness, the campaign or the case it is about to touch, and the anchor read is honest about answering
nothing then. Asking it anyway and recording an empty `used` measures the question, not the workspace.

⚠️ **BUT "I CAN NAME NOTHING" IS NOT THE STATE A REPO SESSION OPENS IN, AND THE SERIES SAYS SO.** Of the
eight assemblies this workspace has ever performed, **eight carried a repository anchor and none carried
zero** — the repository is nameable before anything else is, and a person's session-start hook hands that call over
already filled in. So `search_files` is the COMPLEMENT to the anchored read, never the substitute: it
reaches bodies and specs an anchor cannot, and it files nothing, so it cannot be the evidence that you asked.

⚠️ `truncated: true` on a search is a FLOOR, not the set — narrow the `glob` or `path` and ask again.

## One issue per thing asked for — the count is the account

A request is satisfied in pieces, and the reader's first question at the end is **"of the N things I asked
for, how many are done, and why not the rest?"** That number has to be a query, not a sentence in your
report — so it is made of records:

1. **Split the bundle before you build.** Five feedback reports, three acceptance bullets, a list with "and
   also" in it — each becomes a sub-issue (`create_issue` with `parentId`). `list_issues --query parent=<id>` is then
   the count, and each piece carries its own status and its own reason for being open.
2. **Split by what the user would accept separately.** Two reports of the same defect are ONE requirement.
   One report whose fix only removes the confusion — the screen now says why it refuses — is TWO: the
   explanation you shipped, and the thing they actually wanted. Folding the second into the first is how a
   half-answer gets counted as a whole one.
3. **Each requirement gets its own criterion**, `"judges":{"kind":"requirement","issueId":…}`. Criteria about
   the work itself — the gates, no regression, the counterexample seen red — are `{"kind":"quality"}` and
   are never counted as requirements.
4. **Scope each criterion to what this round can finish.** A criterion spanning work you cannot complete
   comes back `not_met` and takes the whole round down with it, hiding everything that did ship. What you
   cannot finish belongs to the next round, to a separate issue, or to `remaining` at a partial close.
5. **Every unmet answer names WHY, from a closed list** — `attempted_and_failed` · `needs_information` ·
   `needs_environment` · `blocked_elsewhere` · `descoped`. Only the first means "do the work again"; the
   rest name something to go and get, and they are invisible if the reason is prose.

`get_change_campaign` then returns the account derived from those records: `requirements.total`,
`requirements.settled`, and each unsettled one with its blockers.

## You are the judge of your own gate — say so in a shape that can be answered

The platform does not run this repository's checks, does not know which of them constitute verification here,
and cannot tell a known flake from a real failure. **You judge.** What Everdict holds is the judgement's
shape, so state it in one:

1. **Declare the criteria when you open the work**, not after it. A criterion assembled from whatever
   happened to pass is a description of the outcome, not a gate.
2. **Answer every one** at the end — `met` · `not met` · `not run`. **`not run` is never `met`**: a check you
   could not reach is recorded `not run` with the reason, not a silence — you decide what that means for
   the change; escalate only under a declared condition.
3. **Mark how you know.** *Observed* = a command ran, and you can name it with its exit code — and it must
   cite a gate run carrying NUMBERS, because an observation that names no measurement is an assertion
   wearing the other word. *Asserted* = you read the code and concluded. Both are legitimate; a reader who
   cannot tell them apart can defend neither.
4. **An empty criteria list is not a pass.** A change that verifies nothing says that.
5. You judge; you do not authorize. Adoption, release and regression watching stay with the platform, and
   your judgement is what they will later confirm or contradict.

**File it with `publish_checkpoint`, `"role":"executor"`** — the platform's own shape for "an actor's claim
about work it did". It enforces what you cannot enforce on yourself: every `confirmedFacts` entry needs at
least one evidence reference (`run` · `scorecard` · `commit` · `issue` · `trace` · `file`), **the call is
refused if a referenced record does not exist**, and the service — not you — stamps whether each reference
resolved. Anything you believe but cannot point at goes in `hypotheses`; claiming it as a fact is the exact
failure that contract exists to prevent. `validationPlan` says how a successor would check you;
`reproduction.command` is the way back in.

**You cannot verify yourself, and should not try.** `assertIndependentVerification` refuses a verdict from
the actor that did the work, from the same run, and from the same session. When the claim matters more than
the cost of checking it, call `request_verification` — an independent verifier reads your evidence inside an
envelope with no write capability, and a `verified` citing a reference nobody read comes back
`inconclusive` with the gap named.

## File what retrieval gave you

The assembly files what it ANSWERED by itself — its path comes back in your `get_task_context` result as
`receipt.path`. Beside it, write the half only you can know:

    record_retrieval_use  assemblyPath: <the receipt.path you got back>
                          used: ["<entry id>"]   outcome: what the work did with it

When you used an entry you also learn whether it held. Say so per entry, instead of a bare id:

    used: [{ id: "<entry id>", outcome: "confirmed" }]
    used: [{ id: "<entry id>", outcome: "contradicted", successor: "<id of the entry that supersedes it>" }]

`confirmed` verifies the entry for you (the same as `verify_knowledge_entry`; only its creator or an admin can).
`contradicted` is refused unless you first record the replacement (`supersedes` the old entry) and name it as
`successor` — a claim you found false must not stay standing with nothing behind it. A bare id still means
"used, nothing more claimed".

The platform resolves every id you cite and **refuses one it cannot** — a measurement built on
unresolvable citations is wrong in a way no later reader can see. **An empty `used` is a real answer** and worth writing: it says the workspace had nothing for this work, which
is the measurement that decides whether this layer is earning its keep. A session that retrieved and then
said nothing about it **is refused when the session ends** — the obligation is created by the answer, not by the question,
so a session that never asked owes nothing.

## Where a piece of information goes

One claim has one home; a copy in a second place is the one that turns false, because the change that updates
the first never touches it. Ask in order and stop at the first yes:

| # | Ask | It goes to |
|---|---|---|
| 1 | Must it change when the code changes? | the **service repository** — its conventions, skills and docs, in the same pull request as the code |
| 2 | Does it end only when someone acts? | an **issue** — a new or known defect, a wait on an outside party (with when to look again), a request |
| 3 | Is it a measurement or a verdict? | the **campaign** — a round, a report |
| 4 | Can it be said as one claim? | a **knowledge entry** — a decision, an accepted design, a finding, a convention, context |
| 5 | Is it a way of working for every task? | a **harness** (a persona's repository) or a workspace **skill** |
| 6 | Is it a long artefact holding many claims? | a **workspace file**, linked from the issue or the entry |

- **A harness or `CLAUDE.md` holds no state.** Decisions in force, known gaps and roadmaps copied into a repository
  are stale from the next change; write the pointer (which read, over which anchor) instead.
- **A wait or an accepted design records when to look again.** Put it in the entry's `revisit`: a date, or an
  issue and the state (`done` | `cancelled`) that should send you back. Coverage then reports the entry `due`,
  naming the condition, instead of reading `current` for 30 days. `verify` does not clear a fired condition; move
  or remove it with an update.
- **A stance is which record exists.** When the owner says "I know, that is on purpose" or "we are waiting on
  them", record it in that turn — a `decision` entry saying it is not a defect, or the waiting issue — so the next
  audit finds it instead of reporting it again.
- **Before you report a defect, look it up**: `get_task_context` over the issue and the repository, and a text
  search over entry bodies for the symbol, key or log line that identifies it. Anchor `get_task_context` by what the
  finding names: a `code_path` (`owner/name:path/to/file`), a `config_key` (`<owner/name or service>:<key>`) or a
  `log_signature` (the literal log phrase). Match is exact. Only what nothing covers is new. When you record an entry
  or file an issue's knowledge, pin it with the same `code_path` / `config_key` / `log_signature` refs, so the next
  audit finds it.
- **A subagent sees nothing you did not hand it.** Put what you assembled into its prompt.

## Close the session by recording

Write one entry per durable claim, not one per session:

- **`decision`** — what was chosen, **and what it was chosen against**. A decision without its rejected
  alternative cannot be revisited, only re-argued.
- **`finding`** — a defect's cause, a trap, a measurement. Name how it was detected, so the next person can
  detect it too.
- **`convention`** — how this service does a thing from now on.
- **`context`** — background a newcomer needs, including a declared refusal ("no knowledge this time,
  because …" is itself a `context` entry).

**Name what you built on.** If an entry, a decision or a convention shaped what you did — or you are
restating it with new evidence — pin it: `"refs":[{"type":"knowledge","key":"<id>"}]`. Five entries that
repeat one claim without naming it look like five confirmations and are one. This edge is also the only
record that the workspace's knowledge was *used*, not merely returned.

**Revise a claim with a successor.** Create the new entry with `"supersedes":"<id>"`: the platform moves the original
to `superseded` in the same write, so it is no longer retrieved beside its successor. Only an `active` original can be
superseded (a missing, already-superseded or deprecated id is refused with its reason), and a superseded entry cannot be
set back to `active`.

Always set `refs` to the issue and the repository (`{type:"issue", key}` and
`{type:"repository", key:"owner/name"}`), and `evidence` to what proves it — a scorecard, a run, a comment.
`"visibility":"workspace"` shares it; the default is a private draft.

## Code work is delegated by default

A session or a local subagent doing the code work directly is the failure this loop exists to prevent
(DEFAUL-260): no session for the change, no brief, no report, no round to compare against the criteria — a
delegate on the runtime is what makes that verification possible at all. Walk the same order every time:

1. `get_task_context` / `list_issues` — the request may already be filed.
2. `create_issue`, one per thing asked.
3. The design: `write_file` a spec to `docs/specs/<slug>-spec.md`, then `set_issue_chain` with
   `move: accept` and `design: {kind: "spec", path: "<path>"}` — or, for a change too small to design,
   `design: {kind: "declined", why: "…"}`.
4. `open_change_campaign` — omit `delegation`: it is delegated by default.
5. `delegation_readiness`. Ready → `create_sandbox` (`profile`, `issueId`, `changeCampaignId`). Blocked → say so; a
   person's session has `/everdict:setup` (appendix).
6. Only when readiness cannot be made ready: re-open with
   `delegation: {required: false, because: "readiness_blocked", detail: "…"}` — refused while ready.

**`open_plan`** is for a SEQUENCE of moves before any of them is a request — several changes you already know
you will make, none of which is an issue yet. It is not required for a single change, and a plan's step still
becomes an issue (step 2 above) once work on it starts.

## Binding a session, guards and the checkout

How a person's session binds to a goal, which guards refuse what, the checkout link and image publishing are human-session
mechanics: skill `everdict-sdlc-session`. A persona brain has none of them; it reads `next_work` when it needs the next unit.

## The line to hold

Record the **claim**, not the diary. "The sheet's content pan gesture swallows a third-party wheel's scroll,
and here is how to tell" is knowledge. "Fixed the time picker" is a commit message, and git already has it.

