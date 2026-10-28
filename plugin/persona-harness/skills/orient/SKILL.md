---
name: orient
description: The first state of the loop. Use at the start of every wake-up, before you decide anything: read your values, goals, place in the org, inbox and signals.
---

# Orient

Orient before you decide. A decision made without it serves nothing in particular.

1. **Values.** Read `values.md`. Every decision you make later cites one value from it.
2. **Who you are.** Call `whoami`: your record, your superior and how to reach them, your reports. `get_org_chart` shows the
   chart around you, so you know whom a conversation should include. If a field is unknown, say so; do not fill it in.
3. **Goals.** List your open goals (`persona_goals` with no arguments) and read the plan of each one the wake touches. A superior may have set one since you last ran.
4. **Inbox.** `pull_inbox`. A failed pull is unknown, not empty: say so and retry.
5. **Signals.** Read what changed since you last ran: `list_channel_activity` for the channels you are in, and the work
   items and judgements addressed to you (`list_work_items`, `list_addressed_judgements`).

## An idle wake
An idle wake (your inbox is empty and nobody asked for anything) is not a reason to skip these steps: it is when they matter most. Never answer it from memory. Make the reads before you decide, and before any domain skill or proposal. A domain skill never replaces the orient reads, however short its path to an answer. Each read is a bounded query:
`persona_goals`, `list_issues` with `status` ["todo", "in_progress", "in_review", "regressed"] and `limit` 20, `get_decisions_timeline` with `limit` 20, and `list_knowledge_entries` with `limit` 20 (its `nextCursor` pages on). An unbounded list can overflow the tool result and answer nothing. Then advance your goals as `rules/goals.md` says: each open goal with a plan that is unstarted or stalled gets its next in-authority step and a `persona_goals` note, or a note saying why not; a step beyond your authority goes to `propose`. Then follow `rules/proactive.md`:
propose when a record shows a gap, otherwise say "nothing worth proposing", name the ids or queries you read, and give each open goal's state: moved, blocked or not due. If you
name a record step as unfinished, finish it in this turn or turn it into a progress note on a goal (`record`); do not
leave it until someone asks.

On an idle wake, also tend the knowledge in your scope, inside the same bounds. Read `list_knowledge_entries` with `coverage` "due" and `limit` 20, then the entries you used since you last ran that turned out right or wrong. Handle each one: `verify_knowledge_entry` when it still holds, a successor with `supersedes` when it does not, or a line saying why it stays. File what you used with `record_retrieval_use`: each item is an entry id, or an id with the outcome `confirmed` or `contradicted` (a contradiction names the successor that replaces it).

End orient with one sentence: what happened, which value it touches, which goal it moves. Then decide: communicate
(`converse`), contribute (`contribute`), propose (`propose`), or do nothing and record why (`record`).
