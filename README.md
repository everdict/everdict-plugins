# Everdict plugins

The Claude Code plugins for [Everdict](https://github.com/everdict/everdict), the agent-harness evaluation runtime.
This repository is generated from `everdict/everdict` at `plugin-v0.3.165` (81b4dd0127e83c67f338c8b997bacc5951b146b2) by `scripts/publish-plugins.mjs`;
do not edit it by hand — a change here is overwritten by the next release.

- `everdict` (`plugin/`) — the `everdict-api` REST door, the domain and workflow skills, and hooks that keep the
  work recorded.
- `everdict-lite` (`plugin-lite/`) — the same door and one skill, no hooks: use Everdict without the recorded
  development loop.

## Install

```bash
claude plugin marketplace add everdict/everdict-plugins#plugin-v0.3.165 --scope user
claude plugin install everdict@everdict --scope user        # or: everdict-lite@everdict
```

Then run `/everdict:setup <api-url>` (or `/everdict-lite:setup`) inside Claude Code.

Issues: everdict/everdict-plugins. License: Apache-2.0 (`LICENSE`).
