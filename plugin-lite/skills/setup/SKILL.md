---
name: setup
description: Register an Everdict credential for the everdict-api door and verify it.
disable-model-invocation: true
---

# Set up everdict-lite

1. Create an API key in the Everdict web app (Settings → API keys).
2. Register it — the key is read from stdin, never from the command line:
   `node "${CLAUDE_PLUGIN_ROOT}/hooks/lib/credentials.mjs" add <workspace> <api-url>` then paste the key.
3. Verify: `everdict-api get_deployment | jq '{commit, authentication}'` (which deployment answers) and
   `everdict-api list_issues --query limit=1 | jq '.items | length'` (the key reads your workspace).

Exit code 3 means the door could not find out whether the call landed (network, timeout): read before you repeat a
write. Exit 1 with 401/403 means the key or its workspace is wrong — register it again.
