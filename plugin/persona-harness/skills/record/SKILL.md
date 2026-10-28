---
name: record
description: Turn what you learned into a knowledge entry linked to the item, and make sure what you decided carries its reason on the decisions timeline.
---

# Record

Work that is not recorded is lost when this session ends. Record before you stop.

## What you learned → a knowledge entry
1. Search first: `list_knowledge_entries`. Update (`update_knowledge_entry`) rather than duplicate.
2. `create_knowledge_entry` with a title that states the finding, a body that says what was observed, how you know, and
   when it stops being true, and a link to the work item or issue it came from. One finding per entry.
3. Distinguish what you observed from what you inferred. Say which.
4. `get_work_item_brief_knowledge` shows what an item's brief already carried; do not restate it.

## Where it goes
One claim has one home; a copy in a second place is the one that turns false. Ask in order and stop at the first yes:
the **service repository** if it must change when the code does; an **issue** if it ends only when someone acts; the
**campaign** if it is a measurement or a verdict; a **knowledge entry** if it is one claim (a decision, an accepted
design, a finding, a convention); a **harness** or a workspace skill if it is a way of working for every task; a
**workspace file** if it is a long artefact holding many claims, linked from the issue or the entry. If you have the
sdlc skill, its "Where a piece of information goes" table is the full version; use it instead of copying it here.
A harness holds no state: decisions in force, known defects and roadmaps copied into a repository are stale from the next
change. Write the pointer, which read over which anchor, instead.

## A stance the owner states
When the owner says a thing is known, accepted or waiting on someone, record it in that turn as the record that holds
it: a `decision` entry saying it is not a defect, or the issue that tracks the wait. A stance nobody wrote down is
reported again. A wait or an accepted design carries `revisit` conditions (a date, or an issue and the state that should
send you back) and recognition refs (`code_path`, `config_key`, `log_signature`) so the next audit matches it.
Revising a claim is a new entry with `supersedes` naming the old one; the platform retires the original, so do not
edit a decision into saying the opposite.

## What you decided → a reason
Every decision you make through `decide_addressed_approval`, `decide_addressed_judgement`, `reject_delegate_report`,
`answer_delegate_dispute` or a settlement carries a `reason`. Write the reason in the call: what you looked at, what it
showed, why that decides it. A decision without a reason cannot be defended, and a reason written afterwards is a
different thing. Link the decision to its item.

## An unfinished record step
An unfinished record step (the knowledge entry for what you just contributed, a decision's reason) is done in this turn. If it cannot be, turn it into a progress note on one of your goals (`persona_goals`, then `update_knowledge_entry` on the goal entry) saying what is left. Never leave it until someone asks; "I'm leaving it until a superior asks" is the failure this section exists to prevent.

## What would a successor need?
If you were replaced tomorrow: the open items and who has them, what you were waiting for, what you had tried that
failed, and the one thing that is easy to get wrong. Put that in a knowledge entry titled with the work it concerns.

## Do not
- Record a guess as a finding.
- Paste a secret or token into an entry.

## Goals and the loop
The last state before idle is record. Under your own name, note which goal the pass moved and by how much
(`update_knowledge_entry` on the goal entry), what you chose not to do and why, and what you are waiting for.
