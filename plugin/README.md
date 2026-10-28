# Everdict — Claude Code / Codex plugin

Bring the [Everdict](https://github.com/everdict/everdict) agent-evaluation runtime into **any**
Claude Code or Codex session. Everdict runs an agent harness (Claude Code, Codex, any CLI, or a
multi-service topology) and **scores** it — repeatably, with regression tracking and leaderboards.

This plugin gives a session that has **no** Everdict context three things:

1. **A REST door to Everdict** — `bin/everdict-api`, one zero-dependency Node script that calls any operation
   (`list_datasets`, `register_harness`, `run_scorecard`, `get_scorecard`, `diff_scorecards`, …) on your control
   plane's HTTP API: `everdict-api <op> --id … --body '{…}'`, with `describe <op>` for a request body and `ops`
   for the list. The plugin needs no MCP server.
2. **The domain context** — the `everdict` skill (domain model + eval workflows) so Claude knows
   *what the entities are* and *how to drive an evaluation end-to-end*, plus `/everdict:setup` and
   `/everdict:eval` commands.
3. **The work's record** — the `everdict-sdlc` skill and five hooks. A checkout links itself: one user-local
   credential per workspace (`~/.everdict/workspaces.json`, `/everdict:setup` or
   `lib/credentials.mjs add|import-claude-config`, never in a repository) is enough for SessionStart to write
   `.everdict/workspace` the first time it opens a repository whose git remote a product in that workspace
   lists — cached, so a second checkout of the same remote resolves offline — and the door sends that workspace's
   credential automatically, no repo needing its own hand-set entry. From a directory that is NOT a linked checkout the door uses the one
   credential the registry holds for the API it calls, records which workspace it acted as on the receipt
   (`identity`), and refuses — naming the candidates — rather than send an anonymous write when it cannot choose.
   **An UNLINKED checkout refuses every edit and Bash change until it is linked or opted out**
   (`echo <workspace> > .everdict/workspace`, or `echo none >` to opt out silently) — the same file
   `EVERDICT_WORKSPACE` can override, resolved for a `git worktree` checkout too, from its MAIN worktree. Once
   linked, the session opens with that service's decisions, conventions and open requests, and **every change
   is refused, every time, until a campaign is named** — a local subagent's edit is refused even after one
   is, and code work is delegated by default, with `/everdict:delegate` (`everdict-api create_sandbox`). **A session that
   changed code and recorded nothing is refused once** at Stop. **A Bash call that publishes an image is
   refused unless every target ref lands in this workspace's Everdict managed image store** — a
   `push_image_grant` this session holds, not a registry brought from elsewhere. `/everdict:campaign` opens
   the request the work serves; `/everdict:record` writes back what it taught. Break-glass:
   `EVERDICT_BREAK_GLASS='<reason>'` — the reason is reported, not swallowed.
   Why: `docs/architecture/repository.md` · `docs/architecture/change-campaigns.md`.

## Install

Install a **pinned release** from the public repository `everdict/everdict-plugins` (the product repository
`everdict/everdict` is private), never a branch or a checkout: a release is the tag `plugin-v<version>`
(`scripts/release-plugin.mjs`), published there by `scripts/publish-plugins.mjs`, so `claude plugin update` compares versions and a branch switch elsewhere on your
machine cannot change your hooks. The Claude Code CLI accepts a git ref after `#` (`owner/repo#ref`; a full git URL
ends in `.git#ref`).

```bash
claude plugin marketplace add everdict/everdict-plugins#plugin-v<version> --scope user
claude plugin install everdict@everdict --scope user
```

A deployment may declare a minimum plugin version; a write from an older plugin is refused with
`updateRequired: true` naming the version. Update to the newest `plugin-v*` tag and re-add the marketplace.

**Maintainers** develop the plugin from a checkout with `--plugin-dir`, per session, and keep no directory
marketplace in their user scope:

```bash
claude --plugin-dir <checkout>/plugin
```

## Configure

The door reads a credential from `~/.everdict/workspaces.json` (one per workspace, mode 0600) or, as an override,
from the environment. Register one, with the key on stdin:

```bash
echo "$EVERDICT_API_KEY" | node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/credentials.mjs" add <workspace-id> "https://everdict.your-company.com"
```

The key needs the **`write`** scope at least: a key minted without `scopes` is `read` (least privilege) and the
door is refused when it files issues, registers content or starts runs. Mint it with
`{"scopes":["write"]}` (`admin` if the session also manages members or keys). (`http://localhost:8787` for local dev.) For CI, `EVERDICT_API_KEY` and `EVERDICT_API_URL` in the environment
are enough. Run `/everdict:setup` for the guided version, then `/everdict:eval` to evaluate the current
project's agent. `skills/everdict-session/references/rest-ops.md` lists every operation with its route.

If you added an `everdict` MCP server by hand (`claude mcp add everdict …`), the plugin no longer needs it and you
may remove it (`claude mcp remove everdict`); `lib/credentials.mjs import-claude-config` first lifts its keys into
the registry. The same door works from **Codex**: it is a Node script, so a Codex session needs no server
registration either.

## What's inside

```
plugin/
├── .claude-plugin/plugin.json   # Claude Code manifest
├── .codex-plugin/
│   └── plugin.json              # Codex manifest (skills only)
├── bin/
│   └── everdict-api             # the REST door: `everdict-api <op> --id … --body '{…}'`, plus ops / describe / raw — the plugin carries no MCP config
├── skills/
│   ├── everdict/
│   │   ├── SKILL.md             # the flagship context: mental model + entities + workflow
│   │   └── references/          # domain-model.md (read on demand)
│   ├── everdict-session/        # human-session appendix to `everdict`: the `everdict-api` door, auth, references/rest-ops.md · workflows.md (DEFAUL-820)
│   ├── everdict-sdlc/SKILL.md   # where the work's record lives: request → campaign → change → knowledge (portable core)
│   └── everdict-sdlc-session/   # human-session appendix to `everdict-sdlc`: door, goal binding, guards, checkout, image publishing (DEFAUL-820)
├── hooks/
│   ├── hooks.json               # SessionStart + UserPromptSubmit + PreToolUse/PostToolUse + Stop
│   ├── session-start.mjs        # resolves/links the checkout to a workspace/service, loads what it knows
│   ├── prompt-context.mjs       # UserPromptSubmit: names the open issues the prompt is about (local Hangul-bigram / Latin-token ranking, family expansion, <= 1,500 chars, each id once per session). It MAKES NETWORK CALLS — `list_issues` through the door, so each leaves a receipt — under a 3 s deadline, and is silent on every failure
│   ├── read-first-guard.mjs     # PreToolUse Read|Grep|Glob|Bash: in a linked checkout, denies ONCE until the session holds an Everdict read receipt; the second attempt passes, a door call is never denied
│   ├── lib/contract.mjs         # the ONE source of the contract lines — SessionStart and the prompt hook's closing line render from it; nothing is written into a repository
│   ├── lib/mcp-detect.mjs       # is an `everdict` MCP server configured (user / local / project scope)? server NAMES only
│   ├── first-change-guard.mjs   # refuses EVERY change made before a campaign is named (and, in an UNLINKED checkout, before it is linked or opted out) — every time, not once; a local subagent's edit and, once delegation is required, the supervisor's own hand-edit tools are refused too, naming /everdict:delegate
│   ├── capture-guard.mjs        # refuses ONCE a session that changed code — against the tree it FOUND — and recorded nothing; files it if it ends anyway; when a goal is bound, also holds the session to next_work (see lib/goal.mjs)
│   ├── image-push-guard.mjs     # refuses a Bash call publishing an image (docker/podman/nerdctl/buildah push, build/buildx --push, bake/compose push, crane, skopeo, oras, regctl) unless every target ref lands in this workspace's Everdict managed image store, covered by a push_image_grant this session holds
│   ├── lib/rest-ops.mjs         # the ONE operation → {method, path} table the door, the parity gate and (next) the receipts import
│   ├── lib/record-checks.mjs    # the door's checks on a round (commit times, documents a round made false) and on where a record landed
│   ├── lib/readiness-checks.mjs # the delegation bootstrap run before a readiness_blocked opt-out and after a blocked reading
│   ├── lib/conventions-feedback.mjs # what a created issue lacks
│   ├── lib/workspace.mjs        # the one workspace resolver every hook imports — linked/opted-out/unlinked/unknown, reaching a worktree's MAIN checkout and the repository cache too
│   ├── lib/credentials.mjs      # the user-local credential registry (~/.everdict/workspaces.json, 0600) — read/write, plus the `add`/`import-claude-config` CLI
│   ├── lib/repository-cache.mjs # ~/.everdict/repositories.json — which workspace a repository linked to, so a second checkout resolves offline
│   ├── lib/link-from-products.mjs # the product-registry link itself — called by session-start.mjs, idempotent
│   ├── lib/session-transcripts.mjs # which files carry this session's history — its main transcript plus any subagent it spawned; shared by every scanner that asks "did this session do X anywhere it could have"
│   ├── lib/session-campaigns.mjs # has this session (or a subagent it spawned) named a campaign, and did it declare delegation required
│   ├── lib/session-image-grants.mjs # which repositories, at which endpoint, this session holds a push_image_grant for
│   ├── lib/image-push.mjs       # what a Bash command publishes, and to which ref — parse only, no I/O
│   ├── lib/delegation-order.mjs # the one declare→design→delegate order every refusal text and SessionStart's own guidance walk
│   ├── lib/goal.mjs             # .everdict/goal — read/write, resolving an initiative/project by id or exact name, and the next_work read (DEFAUL-281)
│   ├── lib/tree-fingerprint.mjs # the one "is this the tree it was" predicate: per call (first-change) and per session (SessionStart → Stop) — plus the finer per-path diff the link-first gate needs; excludes plugin-owned .everdict/** from both
│   └── lib/doc-references.mjs   # which documents still cite a path a round removed (the seed's "a document's owner" gate)
└── commands/
    ├── setup.md                 # /everdict:setup    — connect + auth + register a credential for auto-link
    ├── eval.md                  # /everdict:eval     — guided evaluation of the current project
    ├── campaign.md              # /everdict:campaign — open the request the work serves
    ├── record.md                # /everdict:record   — write back what the session learned
    └── goal.md                  # /everdict:goal     — bind this checkout to an initiative or project
```

## Startup budget, retrieval and the two once-only questions (DEFAUL-528)

- **SessionStart is budgeted**: <= 8,000 characters on every branch, the contract first (index < 1,500); `source: compact|resume` emits identity + contract only (<= 2,000). The long-form loop lives in skill `everdict-sdlc`. `node scripts/check-plugin-hooks.mjs` asserts every branch and source.
- **Prompt-time retrieval** (`prompt-context.mjs`): the specific open issue beats general prose. One `list_issues` per open status through `bin/everdict-api` (receipt in the session journal), ranked locally, the top 3 expanded to their open parent's family. Ids are injected once per session; nothing above threshold, no credential, an API failure or the 3 s deadline all mean no output.
- **Read-first gate** and **read-only Stop question**: each fires at most once per session. The gate denies the first Read/Grep/Glob/non-door Bash until an Everdict read exists; the Stop question blocks once a session that changed no code was shown issues and named none of them in a door call (`stop_hook_active` allows).
- An `everdict` MCP server costs ~4k tokens a session and the plugin is REST-only: SessionStart and `/everdict:setup` name `claude mcp remove everdict -s user|local|project` when one is configured.
