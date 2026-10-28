---
name: delegate
description: Hand work to a hands sandbox with a brief, supervise its turns, read its report against the criteria, reject it or answer its disputes, settle the work item.
---

# Delegate — hands do the work, you verify it

## 1. Brief before you open
Declare the criteria first: what must be true when this is done, how each will be checked, what evidence counts. A
delegate cannot meet a criterion nobody wrote.

Then, on delegating, in this order:
1. `freeze_judgment_rubric` on your campaign with one item per declared criterion (`statement`, `passBar`, and `scope`:
   `task` for one piece of work, `integration` for the whole). It returns the rubric `version` and `digest`.
2. Post in the thread of the request you were asked in (`post_to_channel`, `replyTo` set to the thread's root) using this
   literal template: `Delegate started on <issue>. Rubric frozen: sha256:<the 64-hex digest exactly as freeze_judgment_rubric returned it>`.
   The first reply IS the literal template, character for character, with the FULL `sha256:` plus 64 hex characters,
   never truncated or paraphrased; no acknowledgement comes before it. WRONG openers, all seen failing: "Started",
   "Issue DEFAUL-… is filed … a frozen rubric", "Taken", "On it", a plan, a digest-less "rubric frozen". If an issue
   must be filed first, file it without posting and name it in the start post; nothing else is posted before it.
3. `create_sandbox` (section 2). A sandbox opened before the freeze was briefed against criteria that can still move.

## 2. Open the sandbox
- `whoami` — take the hands profile for this work kind (change or judgement) from it.
- `create_sandbox` with `profile` set to that hands profile and a `brief`: `goal`, `context` (what the delegate cannot
  see for itself), `references` (the issue, the files), and the criteria with ids. For a work item you hold, send
  `workItemId` instead of a brief (the work item is the brief; `create_sandbox` refuses the two together). Open a
  sandbox only for work you hold.
- Pass `issue` — the id of the issue you were asked to work on. It cannot be combined with `brief`: the brief is then
  assembled from the issue, and your own checks go in `extra_checks`. Without `issue` the pull request that
  `sandbox_git_push` opens is not recorded on your issue (`pullRequestRecord` answers `not_recorded`). If you must type a
  `brief`, give it exactly one reference of type `issue`; the session falls back to that one.
- Size every sandbox — never open one without `resources`. With no size the service default is 8 GiB · 4 cpu, which
  takes a whole delegate PC. Size it from the work: one file, lint, docs, a script, a read-only check — 2 GiB · 1 cpu;
  one area's tests, a typecheck, a build — 4 GiB · 2 cpu; a full test suite, Gradle with Testcontainers, a fresh
  dependency install — 6 GiB · 2 cpu. Pass it as `resources` with `sizing: {basis: "estimate", why}`. `delegation_sizing`
  history is evidence to read, not a size to copy: it recommends from what earlier sessions asked, and measured peaks
  were p50 1.4–3.6 GiB (2026-10-25). Send `basis: "history"` with its run ids in `sizing.evidence` only when you size
  from what those runs consumed.
- When a turn settles `oom`, the size was wrong: re-delegate with a larger `resources.memoryMb` (above the limit the `oom`
  names) and `sizing.why` saying the previous size was killed.
- `create_sandbox` only briefs the worker; it does not run it. The work starts when you `submit_sandbox_task` the
  first task (section 3). Never tell the person a worker is running until that call answered `delivered: "started"` or
  `"queued"`. A sandbox created and never given a task is closed idle, and the thread is told the worker did nothing.
- `get_sandbox` to confirm it is up. A sandbox that did not open is not "slow"; read its state and say what it is.

## 3. Supervise the turns
- `submit_sandbox_task` for each instruction. One instruction per turn; say what to do and what not to touch.
- `read_sandbox_task_trace` to see what it did. `sandbox_exec` only to inspect, never to do the work for it.
- `interrupt_sandbox_task` if it is off course; it answers `outcome: "stopped"` only when the stop was verified, and `"unknown"` (with a `reason`) when it was only requested — check before you re-task. `touch_sandbox` to keep a long session alive. `list_sandboxes` shows
  your open ones; close what you no longer need with `close_sandbox`.
- A `sandbox_event` in your inbox means a turn finished, a report was filed, or a dispute was raised.
- On EVERY report a delegate files (the `sandbox_event` that wakes you), before judging or answering anything:
  `sandbox_exec {id, command: 'cat REPORT.json'}` on that sandbox, then `cat` each gate capture file the report cites and read
  the exit codes. Judge from those reads, never from the report text alone.

If the request asks you to decide, post RIGHT AFTER the start post, as a separate post in the same thread (the start post
unchanged), the `values.md` heading that decided it; the Done answer (section 7) repeats it.

## 4. Read the report against the criteria
For each declared criterion by id: met, not met, or not run — with the evidence it names. Open the gate runs and check
that the numbers are real: a command, an exit code, a count. "Looks fine" is not met. A criterion the delegate skipped
is not met. Judge against the rubric you froze, not a fresh reading: log each round with `log_change_round` carrying
`rubric` `{version, digest}` of the frozen rubric.

### A gate is met only on a capture you read
The delegate owns its quality. It runs each gate as the repository's own command (the one its README or package manifest
names: its test, lint, typecheck or build command), scoped so a clean base exits 0: lint and format on the changed
files, the touched tests first and then the suite. A whole-repository command that already fails on the base can never
meet a criterion, so the scope is chosen, never the exit code argued. One gate per call, so the exit code belongs to that
gate alone. The delegate cites each run in its report's `gateRuns` (command, `exitCode`, counts), and a brief that names a
capture tool for the sandbox adds a captured file you read the same way.
- Read the evidence on the delegate's sandbox: `sandbox_exec {id, command: 'cat REPORT.json'}`, and any capture file the
  brief names. Each gate run names the `command`, its `exitCode` and its counts. A criterion that names a gate is met only
  when a capture for exactly that command shows `exitCode` 0 and counts that match the claim.
- A claim with no capture, a capture of a different command (a single test file for the suite), or a capture with a
  non-zero exit is not met. `reject_delegate_report` with the criterion id and what capture would change your mind.
- Look at the numbers, not the word "green": a suite that reports 0 tests passed proves nothing.

### Several pieces: name the boundaries first, then judge the whole
When the work is split across several delegates or modules:
1. BEFORE the first delegation, name the contracts between the pieces on BOTH sides (the function, type or endpoint,
   by its exact identifier: the producer's function and each consumer that calls it) and put them in every brief's
   `doneWhen` and `context`. The first piece's brief already names the second piece's identifiers: a brief for the
   producer that omits its consumer leaves a boundary nobody wrote, and a piece cannot honour that.
2. After the pieces land, verify each boundary: the producer exposes the named contract and the consumer calls it.
3. When the last piece has landed, before answering, run the integrated result end to end on a sandbox of your own.
   Exactly this, in order:
   (a) open a fresh sandbox with `create_sandbox`, one you never task: NEVER `submit_sandbox_task` to it (a sandbox you
   tasked is a delegate's, not yours);
   (b) check out the landed pieces together there (the merged branch, or each piece's branch merged into one tree);
   (c) after your last delegation, run the integration command verbatim as its own `sandbox_exec` call and read its
   `exitCode` — never inside a compound command (no `&&`, `;`, pipe or `cd` prefix) and never on a delegate's sandbox.
   Say in your report what you ran and what it printed. The delegates' green unit gates do not show that the pieces
   work together.

## 5. Decide
- **Not acceptable →** `reject_delegate_report` with a `reason` the delegate can act on and the `criterion_ids`
  at fault, then `submit_sandbox_task` for the next turn. A rejection binds until a later report answers it.
- **A dispute →** `answer_delegate_dispute` once: `accepted` (the criterion as asked was wrong — say what changes) or
  `declined` (it stands — say why). Both need a response.
- **A round came back `rejected` →** the next round is refused until that round has a verdict, and only the campaign's
  supervisor files it. First `get_change_campaign` and read its `createdBy`. If `createdBy` is not you, the campaign is not
  yours: do not file; post the evidence to the `createdBy` member with `post_to_channel` in the request's thread, and stop.
  If it is you, in this order: `mint_change_report` on your campaign (it returns the report's `id` and
  `digest`), then `review_change_report` with that `report_id` and `report_digest`, `disposition`
  `{kind: "rejected", directive: {kind: "revise", instruction}}` and a rationale, then `log_change_round` with
  `responds_to` set to the verdict id that review returned. Never hand-type a verdict id, and never skip the verdict to log
  the next round.
- **Acceptable →** if the change should reach a branch, `sandbox_git_push` with a reason. Then settle the item.

## 6. Settle
`settle_work_item_from_session` for a change item briefed from this session, naming the session. Then `get_work_item`
to read the settlement back. `close_sandbox` when done. `record` what you learned, `report-up` if someone is waiting.

## Do not
- Say a worker is running because you opened its sandbox. Submit its first task, then say so.
- Settle on the delegate's word. Read its captured gate runs; a claim without one is rejected, and do not re-run each gate yourself.
- Call a multi-module result done on the unit gates alone. Verify the boundaries and run the integration yourself.
- Widen a delegate's task silently; a new scope is a new brief.
- Do the work yourself in `sandbox_exec` because it is faster.

## 7. The answer
Answer with a `post_to_channel` whose `replyTo` is the request's thread, using this literal template (the Integration part
for several pieces only):
`Done: <issue>. Report read: `cat REPORT.json` on <sandbox id> → <criterion ids met / not met>. Gates: <gate id> exit <code> from `cat <capture path>` on <sandbox id>, … Integration: `<command verbatim>` → exit <code> on <untasked sandbox id>`
Every value comes from the `sandbox_exec` output you read after the last report (and after the integration exec). A value
you did not read that way is a read you have not done: do the read first, then answer.
