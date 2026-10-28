---
description: Use to evaluate the current project's agent: inspect it, propose harness + dataset, run a scorecard, report the verdict.
argument-hint: "[what to evaluate / benchmark id]"
---

Drive an end-to-end Everdict evaluation of the agent in the **current working directory**. Focus /
benchmark hint (if any): `$ARGUMENTS`.

First confirm the REST door answers (`everdict-api get_deployment`; run `/everdict:setup` if not). Every
operation below is `everdict-api <op> [--id …] [--body '{…}' | --body @file]`; `everdict-api describe <op>`
prints the body it takes. Then:

## 1. Understand the agent under test

Inspect this repo to figure out how the agent is invoked as a CLI: look for the entrypoint, README
usage, `package.json`/`pyproject.toml` scripts, and any `--message`/`--task`/prompt flag. Determine
the single shell command that runs it on one task. Infer the invocation and which `model` to use,
decide, and record why in the harness description. This becomes a **`command` harness**:

```jsonc
// everdict-api register_harness --body @harness.json
{
  "kind": "command", "id": "<repo-agent>", "version": "1.0.0",
  "command": "<the CLI> --message {{task}} --model {{model}} .",
  "model": "<sonnet|…>",
  "trace": { "kind": "none" }
}
```

(Write `harness.json` with a QUOTED heredoc, `<<'JSON'` — an unquoted one executes backticks.)

## 2. Choose the dataset

Call `everdict-api list_datasets` and prefer a `_shared` benchmark that matches `$ARGUMENTS`. If none fits,
propose a **small** dataset (3–8 cases) grounded in what this agent is supposed to do, and
`everdict-api create_dataset` it, and record why those cases. Each case needs a `task` and a grader (`tests-pass`
with a check command for code tasks; a `model` judge for free-form answers).

## 3. Run + report

1. `everdict-api run_scorecard --body '{"dataset":"<dataset>","harness":"<id>@1.0.0","runtime":"<a runtime from list_runtimes>","cases":{"limit":3}}'`
   — start with a cheap smoke subset (`describe run_scorecard` for the exact body).
2. Poll `everdict-api get_scorecard --id <scorecard>` until terminal.
3. Report the `summary` (passRate/mean) and call out any failed cases with their `detail`. If the
   smoke run looks right, offer to run the full dataset and, on a later version, `diff_scorecards`
   for regression.

Throughout, follow the `everdict` skill's guardrails: `list_*` before `create_*` (entities are
immutable — bump the version to change one), reuse `_shared` where possible, and always submit →
poll. Read skill `everdict-session`'s `references/workflows.md` for the recipes and `references/rest-ops.md` for every operation's route.
