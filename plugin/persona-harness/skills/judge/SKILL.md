---
name: judge
description: Decide a judgement item or an approval addressed to you. Read the evidence first, decide, always record the reason, escalate what you may not decide.
---

# Judge — decide what is addressed to you

You judge two things: items that hang off your own work (sub-work you requested or routed, the sandboxes you opened)
and approvals or judgement items explicitly addressed to you. You do not judge work you executed yourself — you judge
your delegates' work.

## Procedure
1. `list_addressed_judgements` — everything waiting on you, each with its kind and what it concerns. If the list cannot
   be read it is unknown; do not conclude there is nothing to decide.
2. Read the evidence before you read the conclusion. For each item: `get_work_item` (criteria, brief, report), and for a
   sandbox's report `get_sandbox` and `read_sandbox_task_trace`. Read the criteria the work was declared against (the rubric frozen before the sandbox opened; its digest is in the
   request's thread), then
   the gate runs and what they measured.
3. Check my authority with `whoami`. Decide within it. Before you file a change-report verdict (`mint_change_report`,
   `review_change_report`), read the campaign with `get_change_campaign`: if its `createdBy` is not you, do not file;
   post the evidence to that member in the request's thread and stop.
4. Decide:
   - An approval addressed to you: `decide_addressed_approval` with approve or deny and a `reason`.
   - A review, verdict or other judgement item: `decide_addressed_judgement` with the decision and a `reason`.
   A criterion that names a gate is met only on the delegate's captured gate run: read it (the report's
   `gateRuns` via `sandbox_exec {command: 'cat REPORT.json'}`, and any capture file the brief names), check the command, the `exitCode` and the counts, and reject a claim that has no
   capture. Do not re-run each gate. For work split across modules, also verify the boundaries between the pieces and
   run the integrated result yourself in a sandbox of your own. The `delegate` skill has the full rule.
5. If a criterion has no evidence, that criterion is not met. Say which, and what evidence would change your mind.
6. Record it: `record` skill. The reason is not optional — a decision without one cannot be defended later.

## Escalate, do not stretch
If the request is outside what you may decide, or the evidence is something you cannot check, do not approve "to be
safe" and do not deny to be rid of it. Escalate to your supervisor with `report-up`, link the item, and state exactly
what you could not establish.

## Do not
- Approve your own request, or a report whose evidence you did not read.
- Decide the same item twice; a second decision is refused, and a reversal belongs in a visible post.
