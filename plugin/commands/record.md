---
description: Use before stopping: record this session's decisions, findings and conventions, linked to the request that caused them.
argument-hint: "[what to record, if you want to narrow it]"
---

Write this session's durable claims into Everdict. Narrowing (if any): `$ARGUMENTS`.

## 1. Decide what is actually durable

Re-read what this session did and separate:

- **claims that outlive it** — a cause, a trap, a decision and its rejected alternative, a convention;
- **the diary** — what you tried, in what order. Git and the transcript already hold that; it is not knowledge.

If nothing durable happened, say so and record THAT as a `context` entry naming the reason. A refusal
someone can read is a decision; silence is not.

## 2. Write one entry per claim

`everdict-api create_knowledge_entry --body @entry.json` for each (write the file with a QUOTED heredoc,
`<<'JSON'` — an unquoted one executes the backticks in your prose), with:

- `kind`: `decision` (include what it was chosen against) · `finding` (include how it was detected) ·
  `convention` · `context`
- `title`: the claim itself, in one line — not a topic
- `body`: the mechanism, the evidence, the caveats
- `refs`: the issue and the repository (`{type:"issue", key}`, `{type:"repository", key:"owner/name"}`), plus
  `{type:"knowledge", key:"<id>"}` for every entry this one was built on or restates — without that edge,
  repetition reads as corroboration
- `evidence`: what proves it — a scorecard, a run, a comment
- `visibility`: `"workspace"` unless the user wants a draft

## 3. Judge the criteria you declared

Answer every criterion from the issue — `met` · `not met` · `not run` — with `everdict-api publish_checkpoint`
(`"role":"executor"`; `describe publish_checkpoint` for the body). A criterion you can point at is a `confirmedFacts` entry with its evidence refs (the
commit, the run, the issue); one you concluded by reading is a `hypothesis`. The platform refuses a fact
whose reference does not exist and stamps which references resolved, so the split is not yours to fudge.
Fill `validationPlan` (how a successor checks this) and `reproduction.command`.

If the claim matters more than the cost of checking it, follow with `everdict-api request_verification --id <checkpoint>` — you cannot
verify your own work, and the platform refuses the attempt.

`not run` is never `met`, and an empty criteria list is not a pass. If the gates were red and you are
shipping anyway, that is a judgement too — write it as one, with the reason.

## 4. Close the loop on the request

`everdict-api update_issue --id <issue>` (a priority/project/parent/assignee change needs `reason`) or `everdict-api create_comment` on the issue: what landed, the commit, the pull request (`gh pr create`/`gh pr merge` are recorded on the issue by the plugin; if the notice said it could not, run `everdict-api record_pull_request`), and what is still open.
`everdict-api set_issue_status --id <issue> --body '{"status":"done","resolution":{…}}'` only with the evidence it requires — otherwise leave it `in_review` and say why.

## 5. Report

List what you wrote and where, so the user can follow the lineage from the request.
