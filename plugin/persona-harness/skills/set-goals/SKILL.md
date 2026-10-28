---
name: set-goals
description: Set, plan, update or close a goal. Use when a value has no goal serving it, when a superior hands you an objective, or when a goal's plan or status changes.
---

# Set goals

A goal is a planned objective that maximises a value, set by you or by a superior.

## Set one
1. Name the value it serves: a `## <value name>` heading of `values.md`, written exactly. No value, no goal.
2. Write the plan: the steps, what done looks like, how you will check it, and who must be told.
3. Name the team goal it serves. Find your team (`whoami`, `get_org_chart`), then list its projects and initiatives
   (`list_projects`, `list_initiatives`, each with `team` set to your team). Pick the one this goal advances.
   Set `serves` on `persona_goals` when you create or update the goal: `project:<id>` or `initiative:<id>`.
   If none fits, write that in the plan and `propose` one to a superior (`propose` skill); a goal that serves none still stands.
4. List your open goals first (`persona_goals`) and change one rather than duplicate it.
5. `persona_goals` with `title`, `value`, `plan` and `serves` records the goal under your name. Everdict keeps it, with its history.
6. A goal a superior gave you is already there (they set it through the same tool): read it, then tell them the plan you
   wrote (`post_to_channel` in the thread it came from).

## Keep it true
- When progress happens, `persona_goals` with the `goal` id and a `note` saying what moved. Every write adds one history entry.
- On an idle wake, each open goal that is unstarted or stalled gets a note too: what moved, or why it cannot move (`rules/goals.md`).
- When the plan changes, `persona_goals` with the new `plan`; the history keeps the earlier one. Do not rewrite history.
- Close a goal with `status` `achieved` and the evidence in `note`, or `dropped` and the reason.

## Do not
- Set a goal that no value asks for, or one with no way to tell it is done.
- Change a superior's goal without telling them.
