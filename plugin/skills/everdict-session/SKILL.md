---
name: everdict-session
description: >-
  Human-session appendix to skill `everdict` — for a person's Claude Code or Codex session only, never linked into a persona brain. The `everdict-api` shell door, auth, the route list and shell recipes (image push, scorecard runs).
---

# Everdict from a person's session — the `everdict-api` door (appendix)

This appendix is for a person's Claude Code / Codex session with a shell. A persona brain has no shell door and
does not link it (DEFAUL-820); the portable core is skill `everdict`.

## How an operation is invoked from a shell

An **operation** is a name — `list_datasets`, `register_harness`, `run_scorecard`, … — and every one is called the
same way:

```bash
everdict-api <op> [--<pathParam> <value>]… [--query k=v]… [--body '{…}' | --body @file.json]
everdict-api describe <op>     # its summary, parameters and request body — read it before you send a body
everdict-api ops [filter]      # every operation and its route
```

The response JSON is on stdout; bodies are camelCase. For a long body write the file with a **quoted** heredoc
(`cat > body.json <<'JSON' … JSON`) — an unquoted one executes the backticks inside it. Exit `3` means the
outcome is **unknown** (the connection dropped): read before you repeat a write. If `everdict-api` is not on
PATH, SessionStart printed its absolute path. `references/rest-ops.md` lists every operation with its route.

## Following Everdict without polling — `everdict-api watch`

`everdict-api watch <subject-pattern>[,…] [--after <pos> | --resume] [--kinds k1,k2] [--until <kind>[:<field>=<value>]] [--json]`
streams the facts under a subject, one line per frame (`pos kind subject - message`), and persists a cursor after
each flushed line (`~/.everdict/watch/<session>/<sha1(patterns)>.cursor`). It has no total timeout; after 45 s of
silence it reconnects and resumes from the cursor. Run it under **Monitor** so every line is a notification:

```text
Monitor{command: "everdict-api watch ws.<t>.campaign.<C>.> --resume --kinds sandbox.report_filed,sandbox.posted,campaign.judged --until change_campaign.closed", timeout_ms: 1800000}
```

Re-arm with `--resume` when Monitor expires — nothing is lost. A single "tell me when X" is Bash
`run_in_background` with `--until`. **Always pass `--kinds`**; never watch the whole workspace (`ws.<t>.>`), which
is a firehose Monitor suppresses. Exit codes: `0` `--until` matched · `2` refused before connecting (bad pattern,
another workspace, no credential) · `3` could not connect in 5 attempts (**unknown**, not "no events") · `5`
`resync` (the cursor is older than retention: re-read the state through its door, then re-arm with the printed
`--after`) · `6` the credential was refused mid-stream. `withheld` and `lagging` lines mean a frame was skipped or
the stream is catching up — read the record through its door. Do not `curl` the stream route: the guard refuses it.

## Connecting & auth

The door talks to the user's Everdict control plane with an **API key** (`ak_…`): one user-local credential per
workspace in `~/.everdict/workspaces.json`, or `EVERDICT_API_KEY` + `EVERDICT_API_URL` in the environment. The
key is never printed and never lives in a repository.

If the door does not answer (`everdict-api get_deployment`): run **`/everdict:setup`**; guided evaluation of the
current project is **`/everdict:eval`**. No MCP server is involved — one added by hand (`claude mcp add
everdict …`) is no longer needed and may be removed. The same door works from Codex: it is a Node script.

## References

- `references/rest-ops.md` — every operation with its method and route (generated from the plugin's op table).
- `references/workflows.md` — copy-pasteable recipes: command-harness eval, regression diff, adding a judge, scoring
  external traces, leaderboards, and the environment-image push (§7).
