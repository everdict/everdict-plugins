---
name: everdict
description: Use Everdict from this session — evaluate an agent harness on a dataset, read scorecards and traces, compare versions, look up issues and knowledge — through the `everdict-api` REST door. Use when the user asks to run, score, compare or look something up in Everdict.
---

# Everdict (lite)

Everdict runs any agent harness, scores it, and gives a defensible verdict. The model: a **dataset** of cases ×
a **harness@version** on a **runtime** → each case's **trace** → **graders/judges** → a **scorecard**.

## The door
- `everdict-api <op> --id <id> --query k=v --body @file.json` — one REST call; the JSON response is on stdout.
- `everdict-api ops <word>` finds an operation; `everdict-api describe <op>` prints `{op,method,path,pathParams,operation}`,
  where `operation` is its OpenAPI entry: the body schema is `.operation.requestBody.content["application/json"].schema`,
  the query parameters `.operation.parameters`.
- Not on PATH? Use `"${CLAUDE_PLUGIN_ROOT}/bin/everdict-api"`. No credential yet? Run `/everdict-lite:setup`.
- Exit codes: 0 ok · 1 refused by the server · 2 bad usage · 3 **unknown** — the call may have landed; read before repeating a write.

## Feature map
| Area | What you can do | Operations |
| --- | --- | --- |
| Connect & check | which deployment, which workspaces | `get_deployment`, `list_workspaces` |
| Evaluate an agent | datasets, harnesses, runtimes, scorecards | `list_datasets`, `create_dataset`, `register_harness`, `list_harnesses`, `list_runtimes`, `run_scorecard`, `get_scorecard`, `cancel_scorecard` |
| Compare & regressions | diff two scorecards, list past ones | `diff_scorecards`, `list_scorecards` |
| Judges & models | LLM judges and the models they use | `list_judges`, `create_judge`, `list_models`, `create_model` |
| Single runs & traces | one case, its result and trace | `submit_run`, `get_run`, `list_runs`, `cancel_run` |
| Issues & knowledge | read and file work, read what was learned | `list_issues`, `get_issue`, `create_issue`, `list_knowledge_entries`, `create_knowledge_entry` |

Anything else: `everdict-api ops <word>` (e.g. `ops image`, `ops sandbox`).

## Recipes
**Evaluate my CLI agent.**
1. `everdict-api describe register_harness | jq '.operation.requestBody.content["application/json"].schema'` — what a harness body takes; register a command harness with `register_harness --body @harness.json`.
2. `everdict-api list_datasets | jq '.[] | {id, latestVersion, caseCount}'` — pick a small dataset.
3. `run_scorecard --body @scorecard.json` (its body schema: `describe run_scorecard`, same jq path), then poll
   `everdict-api get_scorecard --id <id> | jq '{status, terminal, headlinePassRate, verdict}'` until `terminal` is true.

**Compare two versions.**
`everdict-api diff_scorecards --query baseline=<a> --query candidate=<b> | jq '{comparability, overlap, broke: ([.caseTransitions[] | select(.change == "broke")] | length)}'`
— read `comparability` first: `none` means the two do not compare, not that nothing changed.

**Look something up.**
`everdict-api list_issues --query limit=10 | jq '.items[] | {identifier, title, status}'`.

## Keep tool output small
A tool result stays in the context for the rest of the session. Project every read with `jq` to the fields you
need; pass `--query limit=…`; prefer summary reads to full ones; pipe `describe <op>` through `jq` to the body
schema; never run `ops` without a filter.

## More
Detail on demand: `references/domain-model.md`, `references/workflows.md`, `references/rest-ops.md`.
Want the recorded development loop (campaigns, rounds, guards, hooks)? Install the `everdict` plugin instead.
