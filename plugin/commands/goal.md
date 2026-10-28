---
description: Use to bind this checkout's sessions to an initiative or project: the goal SessionStart names and Stop holds you to.
argument-hint: "<initiative|project id or exact name>"
---

Bind this checkout to a goal: `$ARGUMENTS`.

## What this does

Resolves the argument against this workspace's initiatives and projects — by id first, then by an EXACT
name match — and writes `.everdict/goal` at the checkout root as `{"kind", "id", "session", "boundAt"}`, the record id rather than
its identifier (a pin's key is the record id; an identifier alone matches nothing once it has to be resolved).

The binding belongs to the session that set it (`EVERDICT_SESSION_ID`, exported by SessionStart): the checkout is
shared, the goal is not. Another session opened in the same checkout is neither told it is bound nor refused at
Stop for it, and the refusal the binder gets names the binding session and the time. A file written before this
(no `session`) binds nobody — re-run this command from the session that should be held to it.

Once bound, `session-start.mjs` names the goal and its `doneWhen` at the start of every session opened in
this checkout, and `capture-guard.mjs` (the Stop hook) will not let a session end while `everdict-api next_work` still has
something to do under it — the next issue while there is one, filing what `doneWhen` still needs once there
is nothing left. See skill `advance_the_goal`.

## Run it

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/goal.mjs" bind "$ARGUMENTS"
```

This needs a linked workspace and a registered credential — `/everdict:setup` first if either is missing.

- Resolves as an **id** against both `/initiatives/:id` and `/projects/:id` first; only when neither answers
  does it fall back to an exact-name search over each kind's list. Two ids that both resolve, or two names
  that both match, is reported as **ambiguous** — bind by id instead of guessing which one was meant.
- `.everdict/goal` is plugin-owned, exactly like `.everdict/workspace`: writing or changing it is never read
  as "this session changed the repository" by the tree fingerprint or the first-change guard.

## To change or clear the goal

Re-run this command with a different id or name to rebind, or remove the file to unbind:

```bash
rm .everdict/goal
```

An unbound checkout behaves exactly as it did before this command existed — SessionStart says nothing about
a goal, and the Stop guard's decision table does not run.
