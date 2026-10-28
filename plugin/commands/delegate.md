---
description: Use to hand an issue to a delegate: register the account it runs as, then supervise it.
argument-hint: "[issue identifier, or nothing to just register]"
---

Set this member up to delegate work to a sandboxed coding agent, and then do it. What they named:
`$ARGUMENTS`.

Every operation below is a call to the REST door — `everdict-api <op> [--id …] [--query k=v] --body '{…}'`
— and `everdict-api describe <op>` prints the body an operation takes (bodies are camelCase). For a long body
write the file with a QUOTED heredoc (`cat > body.json <<'JSON' … JSON`, then `--body @body.json`): an unquoted
heredoc executes the backticks inside it.

A delegate is a Claude Code (or Codex) running in a container with the repository cloned in and a brief
beside it. It runs as **an account you register once** — yours, not the workspace's — and it reports back
against criteria it was given. Everything below is one-time except the last section.

## 1. Is there already an identity?

```
everdict-api list_capabilities --query type=cli-identity
```

A `cli-identity` whose `createdBy` is this member and whose `spec.cli` matches the CLI they will delegate to
is all they need — skip to §4. Two of them for one CLI is a refusal by design (nobody should guess which of
someone's accounts does the work), so if there are two, ask which one and delete the other with
`everdict-api delete_capability --id <id> --version <version>`.

## 2. Get a headless token

⚠️ **This is the one step you cannot do for them.** `claude setup-token` needs a terminal — it opens a
browser round-trip — so ask the user to run it themselves. In Claude Code they can type it directly:

```
! claude setup-token
```

It prints a token starting `sk-ant-oat…`. Tell them to paste it back.

**Why a headless token rather than their live login.** The file at `~/.claude/.credentials.json` is the
session their own terminal is using; copying it into a container means one revocation, one expiry and one
rate limit shared between the two, and no way to tell afterwards which one did what. A `setup-token` token
is a second credential on the same subscription, and revoking it costs the member nothing.

**Codex** has no equivalent command: its credential IS a file (`~/.codex/auth.json`). Register that file's
contents as the secret and put it in the identity's `home` instead of `env` (§3).

## 3. Register it

⚠️ **The token goes into the SecretStore and nowhere else.** Never write it into a file you author, never
echo it back, never put it in the capability spec — the spec holds the secret's NAME.

```
everdict-api set_secret --name CLAUDE_CODE_OAUTH_TOKEN --body @secret.json     # {"value":"<what they pasted>","scope":"user"}
everdict-api save_capability --id my-claude --body @identity.json
```

with `identity.json` written through a quoted heredoc:

```json
{
  "name": "My Claude Code login",
  "description": "Headless token for delegated Claude Code sessions",
  "visibility": "private",
  "spec": {
    "type": "cli-identity",
    "cli": "claude-code",
    "env": { "CLAUDE_CODE_OAUTH_TOKEN": { "secretRef": "CLAUDE_CODE_OAUTH_TOKEN", "scope": "user" } },
    "home": []
  }
}
```

(`secret.json` holds the token: write it with a quoted heredoc, `chmod 600` it and delete it after the call —
the door records a secret-bearing body with its values redacted, but the file is yours to clean up.)

`"visibility": "private"` is the point, not a default: a workspace-visible identity is something a caller
NAMES on purpose, never something that gets picked for somebody else's work.

**Settings files, if they want them.** `home` reproduces files under the container's `$HOME`. Worth
carrying: `~/.claude/settings.json` (model preference, permissions, hooks). ⚠️ NOT `~/.claude.json` — it is
hundreds of kilobytes of this machine's project history, conversation state and OAuth tokens for
unrelated servers, and none of it means anything in a fresh container. Read the file before offering it and
say what is in it.

## 4. Check the lane is even available

If `everdict-api create_sandbox` answers that sandboxes are not configured, delegation is off on this
deployment and nothing above helps. Tell the user to ask their operator to set `EVERDICT_SANDBOX_DRIVER` (and
the per-agent cap `EVERDICT_SANDBOX_MAX_PER_AGENT`, which defaults to 1). An unconfigured lane reads exactly
like an unbuilt feature, which is why this check is written down.

A delegate also needs a **delegation profile** — WHO does the work (image, which agent, model, standing
instructions). `everdict-api list_capabilities --query type=delegation`; if there is none, the member's operator or a
teammate registers one with `save_capability`.

## 5. Delegate the issue

Prefer naming the issue over typing a brief. The brief is then ASSEMBLED from the record — the description,
the commits already linked to it, the issues it points at, and what this workspace has learned — and the
parts a hand-typed brief drops first are exactly the ones nobody notices missing.

```
everdict-api create_sandbox --body @sandbox.json
```

```json
{
  "profile": { "id": "<the delegation profile>" },
  "issueId": "<issue id>",
  "changeCampaignId": "<the OPEN change campaign this work belongs to>",
  "extraChecks": ["<anything you will check that the repo's own gates will not>"],
  "repo": { "git": "<the repository>", "ref": "<branch>" },
  "resources": { "memoryMb": 4096, "cpus": 2 },
  "sizing": { "basis": "estimate", "why": "<what the work runs, and why this size fits it>" },
  "ttlSec": 3600
}
```

⚠️ **Size every sandbox — never open one without `resources`.** With no size and a profile that names none, the
service default is 8 GiB · 4 cpu, which takes a whole 15 GB delegate PC, and the pool's slots are counted by it. Size
it from the work: one file, lint, docs, a script, a read-only check — 2 GiB · 1 cpu; one area's tests, a typecheck,
a build — 4 GiB · 2 cpu; a full test suite, Gradle with Testcontainers, a fresh dependency install — 6 GiB · 2 cpu.
`delegation_sizing` is evidence to read, not a size to copy: it recommends from what earlier sessions ASKED, and
measured peaks are far below that (p50 1.4–3.6 GiB across the digo and everdict repositories, 2026-10-25). A turn that
settles `oom` is the one reason to ask for more: re-delegate above the limit the `oom` names and say so in `sizing.why`.

(`everdict-api describe create_sandbox` lists every field.) A `create_sandbox` that exits 3 is UNKNOWN, not
failed: the door never retries a write, so read before you repeat it — a second attempt is a second sandbox.

⚠️ **Name the campaign.** With `changeCampaignId` the delegate's finish line IS that campaign's criteria, ids
kept, so the round you log from it (`delegationRunId`) joins every answer. Without it the delegate is briefed
on generic issue criteria (`issue-symptom-gone`, `supervisor-N`), and every one of its answers reads
`unanswered` against the campaign. That happened on the first real delegated round (DEFAUL-257).

Then confirm what it was actually told, because a brief nobody read is the commonest way a delegation goes
wrong quietly:

```
everdict-api sandbox_exec --id <sandbox> --body '{"command":"cat BRIEF.md"}'
```

`sandbox_exec` runs in the PARENT of the checkout, so `BRIEF.md` is right there; the delegate itself, working in the checkout, reads it as `../BRIEF.md`.

## 6. Supervise it

Hand over the work and watch:

- `everdict-api submit_sandbox_task --id <sandbox> --body '{"task":"…"}'` — starts a turn, or queues for the next
  boundary if it is busy. The answer says which (`delivered: "started" | "queued"`).
- the same with `"delivery":"message"` — something it should know that does not deserve a derailment.
  Queues; starts nothing.
- `everdict-api interrupt_sandbox_task --id <sandbox> --body '{"reason":"…"}'` — it is solving the wrong
  problem. Stops the TURN and keeps the container, the working directory and the conversation; the delegate
  takes the next instruction immediately. This is not `close_sandbox`, which destroys all of it. The answer is
  `{outcome, reason?, state}`: `outcome: "stopped"` means the compute cancelled the turn and a check found no delegate
  process left; `outcome: "unknown"` (with a `reason`) means the stop was only REQUESTED — look at `get_sandbox` and the
  task trace before you re-task it, because the delegate may still be working.
- `everdict-api read_sandbox_task_trace --id <sandbox> --taskId <taskRunId>` — live while the turn runs.
- `everdict-api watch ws.<t>.sandbox.<sandbox> --resume --kinds sandbox.report_filed,sandbox.ended --until sandbox.report_filed` —
  follow the delegate instead of polling `get_sandbox` (run under Monitor, or Bash `run_in_background`). Always give
  `--kinds`; never watch `ws.<t>.>`. Exit `3` is unknown, not quiet; exit `5` means re-read the state, then re-arm.
- `everdict-api get_sandbox --id <sandbox>` — `live.delegate` says what it IS: `running` · `interrupted` · `completed` (with its
  report) · `errored` · `orphaned`.

## 7. ⚠️ Get the work OUT before you do anything else

```
everdict-api sandbox_exec --id <sandbox> --body '{"command":"cd work && git format-patch -1 --stdout"}'
```

Save that patch. Do this **before** you read the report, not after.

Everything the delegate produced lives in a container that dies with its TTL, with a redeploy, or with a
crash — and `everdict-api sandbox_git_push` is the only other way out, which writes to somebody's repository and therefore
waits on a human. When it opens a pull request it now RECORDS it — open, on the session's issue, and attached to the campaign's
latest round — and its answer says `pullRequestRecord: recorded | not_recorded` with the reason. While it waits, the work is exposed.

This is written down because it was paid for: on 2026-09-18 a delegate's 275-line commit was lost to a
redeploy that happened between reading its report and deciding what to do about it. The report survived only
because it had already been copied out; the code had not been.

## 8. Read the report, and record what it taught

A finished delegate writes `REPORT.json`; it arrives on `everdict-api get_sandbox` as `live.delegate.report`. Read the
per-criterion answers, not just the summary — a report that skipped two of five criteria reads exactly like
one that met three.

⚠️ **The delegate does not record anything in Everdict, and that is deliberate.** It has no door and
no credential here; a delegate that could close its own issue or settle its own campaign would be grading
its own exam. So the recording is YOURS: take its `learned` into an `everdict-api create_knowledge_entry` naming the issue
and the repository, and decide yourself what its answers mean for the issue's status.

**Land its work as a round — do not retype it.** If the delegate's work went out as a pull request, the round's change set carries it
(`changes[].pr`), and a merge you make afterwards is `attach_round_pull_request`, not a new round.

```
everdict-api log_change_round --id <the change campaign> --body @round.json
```

```json
{
  "delegationRunId": "<the sandbox session id>",
  "hypothesis": "<what you believed>",
  "answers": [ "… YOUR answer to every criterion the campaign declared …" ],
  "boundary": { "class": "preserve|tighten|loosen", "reversible": { "value": true }, "touched": [], "rationale": "<why>" }
}
```

`boundary` is YOUR judgment of whether the change keeps, tightens or loosens a boundary. On an evidence-policy-3/4
campaign the round door refuses a round without it (DEFAUL-1560): an unjudged round would park its close as a
loosening. If you cannot judge it, escalate instead of logging. A round 1 logged before this rule can gain the
judgment from a repair round (`changesNone`, `boundary`, every answer `how: carried, carriedFrom: 1`) — the carried
answers cite round 1's counterexample runs (DEFAUL-1562).

(Send no `cost`: a delegated round's cost is the sum of the session's turn runs in the run ledger, recorded by Everdict — `costUnknown` with the reason when a turn is unmetered — and a `cost` that disagrees is refused, DEFAUL-402.)

**When the delegate session is lost** (closed, errored or orphaned — never while it is live) and you finished the
work yourself, log the round with `"takeover": {"lostSession": "<the lost session id>", "reason": "<why>"}` and
your own `changes`, and send no `delegationRunId`. The round is recorded as your work, never the delegate's
(DEFAUL-609); a live session refuses it — interrupt it first.

Everdict reads that session's brief and report itself, so the commits and the delegate's gate runs come from
the report rather than from your keyboard, and the round records what the delegate said about **every**
declared criterion — a skipped one becomes `{"kind":"unanswered"}` instead of a gap you have to count. Add your
own verification gate in `gateRuns` under its own id; reusing the delegate's is refused.

`answers` stays yours. The round carries both verdicts side by side, and it comes back `rejected` whenever
yours says so — a report claiming everything met cannot adopt itself.

⚠️ Prefer to do this **while the session is still live**. The report is also kept on the session's row: a test
(DEFAUL-653) shows the round door's reader returns the filed report of a released session from its row (that a round is then logged is not itself tested end to end). What is
refused is a session whose row never recorded a settlement (it died with the process that held it — unknown) or one
this workspace does not have. A delegate whose report no round has recorded is held past its TTL (up to twice the
TTL) rather than torn down, but past that cap it is released.

A campaign is delegated by default — leave `delegation` off when you open it, and a round that then names no
session is refused, rather than quietly filed as one you typed yourself. Working it by hand instead needs
`"delegation":{"required":false,"because":"not_code"|"readiness_blocked"|"owner_directed","detail":"…"}` on the
open, and `readiness_blocked` is refused while `delegation_readiness` answers ready.

Close the session (`close_sandbox`) after the change has LANDED — merged, and its round logged — not when the report arrives.
A completed delegate stays alive and addressable until you do, so a finding that only shows on the merged tree, or a merge
conflict at landing, goes back to the same box as a follow-up turn ("that is nearly right, now do this") without a new
container and a fresh clone. While the report is unconsumed the idle sweep holds the box; once a round has consumed it only
activity does, so a wait longer than the idle window (`EVERDICT_DELEGATION_IDLE_RELEASE_SEC`, default 900 s) between the round
and landing needs `touch_sandbox`, which stamps activity without shortening the deadline.

## 9. Judge it — a campaign ends on YOUR verdict, not on the round

A delegated round's campaign still needs a supervisor's verdict before it can close, and this is the one
door where **you may file it**: `assertReviewable`'s independence check compares your identity against the
round's *executor*, and for a delegated round the executor is `delegation:<the sandbox session id>` — never
you, whoever logged it. Since DEFAUL-418 the door no longer refuses a verdict from the actor that executed the
round, so you may also judge a round you typed yourself; reviewing a round the delegate ran is still the
separation this flow is built to give you, and the record keeps classifying a self-judged adoption.

```
everdict-api mint_change_report --id <the change campaign>
everdict-api review_change_report --id <report id from the mint> --body @verdict.json
everdict-api close_change_campaign --id <the change campaign> --body @close.json
```

```json
{
  "reportDigest": "<from the mint above>",
  "disposition": { "kind": "approved" },
  "rationale": "<what you checked, and why it holds>"
}
```

`disposition` may instead be `{"kind":"rejected","directive":{"kind":"revise"|"reframe"|"explore",…}}`. The close body
is `{"state":"adopted","roundSeq":<n>,"reason":"…","knowledge":["<entry id>"]}`.

Every adopting close needs a CURRENT approving verdict now, unconditionally — minting and closing alone are no
longer enough, whether or not the campaign declared `review`. If your verdict is `rejected` with `revise`,
the delegate's next round answers it in `respondsTo` (this file's step 6, repeated); with `explore` (`{"kind":"explore","why":"…","hypotheses":["…"]}` — not good enough, and you are NOT choosing the move) the next round names it in `respondsTo` AND states `chosenHypothesis` (`{hypothesis, why}`); with `reframe`, close
this campaign and open a successor naming the verdict in `authorizedBy` instead of trying again here.

⚠️ Approving your own round and then closing it yourself is allowed (DEFAUL-418 lifted the DEFAUL-120 refusal;
for a delegated round the WORK was never yours either). The close records this as `independence: { kind: "supervised" }` rather than refusing it: a
reader a year from now sees that the approver and the closer were the same actor, and why that was fine.
