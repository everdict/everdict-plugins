# everdict-lite

A light Claude Code plugin for people who want to **use** Everdict: one skill (`everdict-lite:everdict`) that maps
Everdict's features to the `everdict-api` REST door, and `/everdict-lite:setup` to register a credential.

Install from the public repository at a release tag:
`/plugin marketplace add everdict/everdict-plugins#plugin-v<version>`, then `/plugin install everdict-lite@everdict`
(the marketplace is still named `everdict`).

What it does NOT do: no hooks (nothing injected at session start or per prompt, no guards, no Stop check), no MCP
server, no recorded development loop, no `EVERDICT_RECEIPT` line on stderr. For campaigns, rounds and the guards,
install the `everdict` plugin instead.

`bin/`, `hooks/lib/` and `skills/everdict/references/` are copies of `plugin/` written by
`node scripts/sync-plugin-lite.mjs`; edit them in `plugin/`, then sync.
