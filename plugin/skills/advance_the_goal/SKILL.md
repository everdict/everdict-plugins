---
name: advance_the_goal
description: >-
  Use when a session is bound to a goal and next_work answers nothing_open or empty, or a goal is
  about to be marked complete. Works the goal to its own doneWhen: measure each line first, file
  one issue per unmet line, delegate, judge, complete only on evidence.
---
<!-- generated from everdict methodology seed: id=advance-the-goal version=1.0.0 digest=sha256:06a1a8bf6b874ecfad1bd3474aafd11e3ca2e399d75a7691878f5376c2c7885a — do not edit; run node scripts/generate-plugin-seed-skills.mjs -->

# Advance the goal, not just the issue you were handed

A session bound to a goal (an initiative or a project) that stops the moment its one issue is solved has
answered a narrower question than the one it was given. The goal names `doneWhen` — what the whole
initiative or project needs true — and the loop does not end until every line of it does, or the next thing
that line still needs is on record as an issue somebody can pick up.

## The procedure

1. **Read the goal's `doneWhen`**, line by line, before doing anything else. Each line is a checkable
   statement, not a direction — if it reads as a direction ("improve X"), that is itself a finding: the
   line needs rewriting before it can be measured against.
2. **Measure each line — population first.** For a line like "every checkout resolves a workspace", find
   the actual population (which checkouts, how many, read from where) before asking whether it holds. A
   line marked met on a guess is the same defect `file_the_request`'s own population step exists to catch,
   one level up: here the population is the GOAL's claim, not one issue's.
3. **For every line NOT met, file ONE issue under the goal's project**, carrying: the measurement that
   showed the line unmet (the population, the count, where it was read), and the issue's OWN `doneWhen` —
   a checkable statement narrower than the goal's line, that this one issue can actually finish. A goal
   line spanning five things becomes five issues, not one issue with five acceptance bullets, for the same
   reason `file_the_request` splits a bundled request: an all-or-nothing issue hides which of the five
   shipped.
4. **A spec before a campaign.** Every issue filed this way goes through the same design step any request
   does — a written approach, or a stated reason the change is too small for one — before a change campaign
   opens against it. A goal is not an exemption from that gate; it is the reason there will be several
   requests through it in a row.
5. **Delegate.** Code work under a goal-bound issue is delegated exactly as any other code work is —
   `open_change_campaign` with `delegation: { required: true }` when readiness says ready, then
   `/everdict:delegate`. A goal is a reason to keep finding the NEXT issue, not a reason to hand-edit more
   of them yourself.
6. **Judge each report with a verdict**, same as any change campaign: `adopt` when the round holds,
   `revise` when the next round on the same campaign answers what came back short, `reframe` when the
   report shows the issue itself was wrong and a successor campaign is owed instead. A goal loop that
   accepts every report without judging it is optimizing for issues closed, not for `doneWhen` met.
7. **Complete the goal only with each line's evidence.** `doneWhen` met is not "the issues filed under it
   are closed" — issues get filed and closed for reasons that turn out not to hold. Completing the goal
   means citing, for every line, the measurement that shows it true NOW — the same population read taken
   again, not the reading from step 2 assumed to still be current. Completing (or cancelling) a goal is a
   decision, so the status call carries `reason` — the evidence you cited, in a sentence; without one the
   control plane refuses it. The control plane enforces the evidence too: `set_project_status` /
   `set_initiative_status` to `completed` needs `completion` — one entry per `doneWhen` line, the line verbatim,
   `holds: true`, at least one evidence ref (issue, campaign, scorecard, commit, knowledge…) and a note — and refuses
   a missing or unmatched line by name; `force` does not waive it. `next_work` on a goal with nothing open returns
   `doneWhenStatus` (the lines you must evidence to complete it — a checklist, false until a completion is stored). A goal with NO `doneWhen` is not
   completed: write one from its description (a PATCH of the goal's `doneWhen`), citing the source, and
   complete it in a later step (only `force` plus a `reason` completes one without). EVERY goal status move
   (planned, in progress, paused, completed, cancelled, reopened) carries a `reason`.

## Where this came from

A session picked up an issue filed under an initiative, shipped it, closed it, and stopped — and the
initiative's own `doneWhen` named four things, three of which nothing had ever measured. "One issue
solved" and "the initiative done" were treated as the same event because nothing distinguished them: the
Stop hook asked whether THIS session's work was recorded, never whether the goal it served was finished.
`next_work` now answers that question directly — `work_available` while an issue is still open under the
goal, `nothing_open`/`empty` once none is — and this skill is what a session does with that second answer:
measure the doneWhen it names, and file what is still missing rather than reporting the goal done because
its last-known issue was.

## Then

File what you find with `file_the_request`, declare each new issue's criteria with
`declare_criteria_first`, and when a doneWhen line finally holds, record the evidence with
`write_the_lesson` before citing it on the goal.
