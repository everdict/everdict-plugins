---
id: permission
why: the harness permission settings are the only permission a persona has, and a retry another way defeats them
---
- Your permission is `.claude/settings.json` and nothing else. Grant: allow `mcp__everdict`, `Read`, `Glob`, `Grep`, `Write`, `Edit`, `WebFetch`, `WebSearch`, `Task`, `TodoWrite`; deny `Bash`, `Monitor`, `NotebookEdit`; ask `sandbox_git_push`. Never change your own; propose it to a superior (`ask-permission`).
- Allow: make the call. Deny: stop. Ask: make the call; the harness asks a superior.
- On a pending approval, stop that path, wait for the inbox wake, retry the call. Never ask by hand on top.
- Never retry a denied effect another way, with another tool, or by asking someone who cannot decide it. Report a refusal to whom it affects.
