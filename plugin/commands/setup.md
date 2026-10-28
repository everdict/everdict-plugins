---
description: Use first in a project: connect Claude Code to an Everdict control plane (credential + REST door) and verify it answers.
argument-hint: "[everdict-api-url]"
---

Help the user connect this project's Claude Code to their Everdict control plane through the plugin's **REST
door** (`everdict-api`) and confirm it answers. The control plane's API URL argument (if given): `$ARGUMENTS`.
The plugin needs no MCP server — it reaches Everdict over the plain HTTP API alone.

## 0. Register a credential, so checkouts can link themselves

One user-local credential per workspace (`~/.everdict/workspaces.json`, mode 0600 — never in a repository)
is enough: a checkout whose git remote is a service repository of a product in that workspace links itself the
first time Claude Code opens there (`.everdict/workspace` is written for you, and the choice is cached so a
second checkout of the same remote resolves offline), and the door sends that workspace's credential
automatically.

## 1. Determine the API URL

It is the control plane's HTTP API base — no `/mcp` suffix — e.g.:
- Local dev: `http://localhost:8787`
- A deployment: `https://everdict.your-company.com`

If `$ARGUMENTS` is empty, ask the user for it (or confirm `http://localhost:8787` for local dev).

## 2. Authenticate

Get an `ak_…` API key from the Everdict web app (Account → API keys) or from your admin, then register it:

```bash
echo "$EVERDICT_API_KEY" | node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/credentials.mjs" add <workspace-id> "<api-url>"
```

The key is read from **stdin**, never a command-line argument — verified against the cheapest
authenticated read (`GET /me`) and stored only when it answers for the workspace id given. For CI or a
one-off, `EVERDICT_API_KEY` and `EVERDICT_API_URL` in the environment override the registry.

Already added an `everdict` server by hand (`claude mcp add everdict …`) in a few projects? The plugin no
longer needs it, and you may remove it (`claude mcp remove everdict`). Before you do, lift its keys into the
registry in one pass — this maps every `everdict`-named entry in `~/.claude.json` (user scope and every
project) to the workspace its key answers for, and prints only workspace ids and counts, never a key:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/credentials.mjs" import-claude-config
```

**A checkout with no product listing it** is `unlinked`: SessionStart says so, and every edit and
Bash change inside it is refused until it is linked or opted out (the refusal names the same three
options):

```bash
everdict-api list_workspaces                                      # to see what exists
mkdir -p .everdict && echo <workspace-id> > .everdict/workspace   # link it by hand
echo none > .everdict/workspace                                   # not Everdict work — opts out, silently
```

## 2b. Check for a configured `everdict` MCP server

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/mcp-detect.mjs" "$(git rev-parse --show-toplevel)"   # prints a line if an `everdict` MCP server is configured
```

If it prints a line, run the `claude mcp remove everdict -s <scope>` it names: the plugin is REST-only and that
server costs ~4k tokens in every session.

## 3. Verify

- Run `everdict-api get_deployment` (the plugin's `bin/` is on PATH once SessionStart has exported it; otherwise
  call the absolute path SessionStart printed). A JSON answer proves the URL and the key.
- Run `everdict-api list_datasets` or `everdict-api list_runtimes` — a successful response (even an empty
  list) proves the workspace and role. A `FORBIDDEN` means your role lacks the action; exit 3 means the URL
  is wrong or the control plane is unreachable. `everdict-api ops` lists every operation.

## 4. Make this workspace delegation-ready (one step)

A fresh workspace fails every `delegation_readiness` check the first time — no delegation profile, no
compute that can hold a session, no credential an agent can run under. What supplies each of those usually
already exists on the OWNER's machine; it just needs to be lent to this workspace once:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/delegation-bootstrap.mjs"
```

A throwaway workspace (a probe or an eval case) must undo the pairing on teardown, or the host runner keeps
lease-polling it forever (DEFAUL-836): `node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/delegation-bootstrap.mjs" --unpair [workspace]`
revokes the workspace's `<workspace>-bootstrap` runners and deletes its token file.

Run with no arguments, it bootstraps the checkout's LINKED workspace (see step 0). It:

1. Stops immediately, saying so, if the workspace is already ready.
2. Saves a seed delegation profile (`delegate-default`) if none exists — the image comes from
   `~/.everdict/delegation.json`'s `"image"` field, or from the `default` workspace's own `delegate-everdict`
   profile when you have a credential registered for a workspace literally named `default`; otherwise it
   stops and tells you which to set up.
3. Pairs a workspace runner if this workspace has no compute, and writes the token to
   `~/.everdict/runner/tokens/<workspace>.token` (mode 0600) — **one host runner process serves every linked
   workspace** (`everdict runner`, rescanning that directory every ~30s), so you never provision a runner
   per workspace. It never starts that process for you; if none is running yet it tells you to run
   `everdict runner` (or start it with `--lend-claude-login-to-sessions` to also supply the credential step
   below in the same command).
4. For the credential, it relies on the host runner's lent login when one advertises
   `claude-login-session` (nothing to do); otherwise, if you have registered a headless token once —
   ```bash
   claude setup-token | node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/credentials.mjs" add-claude-token
   ```
   (the token is read from stdin, stored at `~/.everdict/claude-token` mode 0600, never printed) — it turns
   that into a workspace secret and a `cli-identity`. With neither available it stops and prints the one
   command above.

Nothing secret is ever printed or written into a repository.

## 5. Next

Once connected, run **`/everdict:eval`** to evaluate this project's agent, or just ask me to
"evaluate my agent with Everdict" — the `everdict` skill has the full domain model and workflows.
