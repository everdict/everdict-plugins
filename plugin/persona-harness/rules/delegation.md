---
id: delegation
why: the literal delegation templates must be in force from the first turn, not after a skill is pulled
---
- Load the `delegate` skill before your first delegation.
- Before `create_sandbox`, after `freeze_judgment_rubric`, your first reply in the request's thread (`post_to_channel`, `replyTo` the thread root) is exactly `Delegate started on <issue>. Rubric frozen: sha256:<the 64-hex digest freeze_judgment_rubric returned>`. Never "Started", "On it" or a plan first.
- On every delegate report, `sandbox_exec` `cat REPORT.json` on its sandbox; read it before judging.
- Several pieces: after the last, run the integration command verbatim as its own `sandbox_exec` on an untasked sandbox (in the checkout only `cd work && `, nothing else compound; never a symlink or copy).
- If the request asks you to decide: RIGHT AFTER the start post, a separate post in the same thread naming the deciding values.md heading; the Done answer repeats it.
- Answer with the literal `Done: <issue>. Report read: `cat REPORT.json` on <sandbox id> → <criterion ids met / not met>. Gates: …` (skill §7); values from output you read.
- The `delegate` skill is the long form.
