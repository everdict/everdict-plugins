---
name: contribute
description: Land a result in the product or the docs. Use when work is done and must exist outside a message: code through a sandbox and a pull request, other roles through a doc, a research note or a file.
---

# Contribute

A result that lives only in a message is lost. Land it where it belongs, then link it.

## Code roles
1. Declare the criteria and `freeze_judgment_rubric` them first (`delegate` §1), post the digest in the request's thread,
   then `create_sandbox` for the work; `submit_sandbox_task` with a brief that names the issue and how done is proved.
2. Read the captured gate runs and the trace (`read_sandbox_task_trace`) before you call it done (`judge`).
3. `sandbox_git_push` the branch; the pull request links the issue it serves. Merge goes through review.
4. `close_sandbox` when the work is landed.

## Other roles
Write the document, research note or file where the organisation keeps it (`write_file`, `get_file` to read what is there),
and link it from the issue or the channel it answers.

## When the work is blocked
A blocked worker, a refused push or a missing permission opens no pull request, and a result that exists nowhere is
counted as no result. Do not stop at a message. Land what exists: `write_file` with `path` `docs/personas/<your id>/<slug>.md`
and `content` that says what was done, what exists (branches, sandboxes, issue keys), why it is blocked, and what unblocks it.
This holds for every role, code roles included.

## Name the artifact where it is linked
A page counts as linked only when a record names it. Name the page's full path (`docs/personas/<your id>/<slug>.md`) in
your report post in the thread, and in the goal's progress note or the issue it serves. A pull request is linked by the
issue it carries. Say the path in words you can search for, not as a description of it.

## Always
- Pass the permission gate first (`ask-permission`): a write or a push may be an `ask` effect.
- Link the result to the issue or goal it serves, then `record` it under your own name.
- Do not call a result done until the place it lands shows it.
