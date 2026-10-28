#!/usr/bin/env node
// THE USER-LOCAL CREDENTIAL REGISTRY (DEFAUL-269) — `~/.everdict/workspaces.json`, mode 0600, NEVER in a
// repository. `{ "version": 1, "workspaces": { "<workspaceId>": { "apiUrl", "key" } } }`. This is the only
// module that reads or writes it — `session-start.mjs` (linking a checkout) and `mcp-headers.mjs` (the MCP
// client's headersHelper) both import `readCredentials` from here rather than parsing the file themselves,
// for the same reason `lib/workspace.mjs` is the one reader of `.everdict/workspace`: a predicate written
// twice has already diverged (rule `protocol` L3).
//
// UNREADABLE IS NEVER EMPTY. `readCredentials` returns a three-valued union — `{kind:"read", workspaces}`,
// `{kind:"absent"}` (the file does not exist — the ordinary "never set this up" case), or
// `{kind:"unreadable", why}` (it exists and could not be parsed as this shape) — so a caller can tell "there
// is nothing here" from "something is here and it is broken", the same distinction `lib/workspace.mjs`'s
// `ReadResult`-shaped callers make.
//
// Two CLI subcommands, run directly (`node lib/credentials.mjs <cmd> …`), documented in
// `plugin/commands/setup.md`:
//   add <workspaceId> <apiUrl>       the key on STDIN, never argv — a key in `ps`/shell history/a screen
//                                     recording is a leak this tool must not create. Verified against the
//                                     CHEAPEST authenticated read that answers which workspace a key belongs
//                                     to (`GET /me` — see apps/api/src/api/identity/profile/profile.routes.ts) and
//                                     stored only when that answer equals the workspace id given.
//   import-claude-config             maps every `mcpServers` entry whose name contains "everdict", in both
//                                     `~/.claude.json`'s user scope and every `projects[*].mcpServers`, to
//                                     the workspace its Bearer key answers for.
//
// NEVER PRINT, LOG OR METER A KEY. Every line either name carries prints a workspace id, a count, or an HTTP
// failure reason (`HTTP 401`, an abort's `err.name`) — none of which can contain the bytes of a key.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const registryPath = () => path.join(os.homedir(), ".everdict", "workspaces.json");

// THE HEADLESS CLAUDE TOKEN (DEFAUL-279) — `~/.everdict/claude-token`, mode 0600. `claude setup-token` prints
// a token bound to the owner's own subscription; this is where it lands so `delegation-bootstrap.mjs` can lift
// it into a workspace secret without it ever touching argv, a shell history file or a screen recording.
export const claudeTokenPath = () => path.join(os.homedir(), ".everdict", "claude-token");

export const readCredentials = (file = registryPath()) => {
  if (!existsSync(file)) return { kind: "absent" };
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    return { kind: "unreadable", why: err instanceof Error ? err.message : "could not be read" };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { kind: "unreadable", why: `not valid JSON (${err instanceof Error ? err.message : "parse error"})` };
  }
  const workspaces = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.workspaces : undefined;
  if (!workspaces || typeof workspaces !== "object" || Array.isArray(workspaces))
    return { kind: "unreadable", why: "does not carry a `workspaces` object" };
  return { kind: "read", workspaces };
};

// Mode 0600 on every write — `writeFileSync`'s own `mode` option only applies when the file did not already
// exist, so an existing file with looser permissions would otherwise keep them across an `add`.
export const writeCredentials = (workspaces, file = registryPath()) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ version: 1, workspaces }, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
};

// The cheapest authenticated read that answers "which workspace does this key act in", with no
// `x-everdict-workspace` sent — `applyActiveWorkspace` (apps/api/src/api/route-context.ts) answers for the
// key's OWN workspace when none is named, which is exactly the question being asked.
export const verifyKey = async ({ apiUrl, key, timeoutMs = 4_000 }) => {
  const base = String(apiUrl ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/mcp$/, "");
  if (!base) return { ok: false, why: "no apiUrl" };
  if (!key) return { ok: false, why: "no key" };
  try {
    const res = await fetch(`${base}/me`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    const body = await res.json();
    if (typeof body?.workspace !== "string" || body.workspace.length === 0)
      return { ok: false, why: "the response named no workspace" };
    return { ok: true, workspace: body.workspace };
  } catch (err) {
    return { ok: false, why: err instanceof Error ? err.name : "unreachable" };
  }
};

const readStdin = () =>
  new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => {
      buf += d;
    });
    process.stdin.on("end", () => resolve(buf));
  });

const cmdAdd = async (workspaceId, apiUrl) => {
  if (!workspaceId || !apiUrl) {
    console.error("usage: credentials.mjs add <workspaceId> <apiUrl>   (the key is read from stdin)");
    process.exitCode = 1;
    return;
  }
  const key = (await readStdin()).trim();
  if (!key) {
    console.error('no key on stdin — pipe it in, e.g. `echo "$EVERDICT_API_KEY" | node lib/credentials.mjs add …`');
    process.exitCode = 1;
    return;
  }
  const verified = await verifyKey({ apiUrl, key });
  if (!verified.ok) {
    console.error(`could not verify this key against ${apiUrl}/me (${verified.why}) — not stored`);
    process.exitCode = 1;
    return;
  }
  if (verified.workspace !== workspaceId) {
    console.error(`this key answers for workspace '${verified.workspace}', not '${workspaceId}' as given — not stored`);
    process.exitCode = 1;
    return;
  }
  const current = readCredentials();
  if (current.kind === "unreadable") {
    console.error(`${registryPath()} is unreadable (${current.why}) — refusing to overwrite it`);
    process.exitCode = 1;
    return;
  }
  const workspaces = current.kind === "read" ? { ...current.workspaces } : {};
  workspaces[workspaceId] = { apiUrl, key };
  writeCredentials(workspaces);
  console.log(`stored a credential for workspace '${workspaceId}' (${apiUrl})`);
};

// `~/.claude.json` — user scope's own `mcpServers`, plus every `projects[*].mcpServers`. Neither shape is
// documented; both are read defensively, and a config that carries neither leaves nothing to import rather
// than failing.
const everdictBearerServers = (config) => {
  const found = [];
  const collect = (scope, servers) => {
    for (const [name, server] of Object.entries(servers ?? {})) {
      if (!name.toLowerCase().includes("everdict")) continue;
      const url = typeof server?.url === "string" ? server.url : undefined;
      const authHeader =
        server?.headers && typeof server.headers === "object"
          ? (server.headers.Authorization ?? server.headers.authorization)
          : undefined;
      const bearer = typeof authHeader === "string" ? /^Bearer\s+(\S+)$/i.exec(authHeader.trim())?.[1] : undefined;
      if (!url || !bearer) continue;
      found.push({ scope, name, key: bearer, apiUrl: url.replace(/\/mcp\/?$/, "") });
    }
  };
  collect("user", config?.mcpServers);
  for (const [projectPath, project] of Object.entries(config?.projects ?? {}))
    collect(projectPath, project?.mcpServers);
  return found;
};

const cmdImportClaudeConfig = async () => {
  const claudeConfigPath = path.join(os.homedir(), ".claude.json");
  let config;
  try {
    config = JSON.parse(readFileSync(claudeConfigPath, "utf8"));
  } catch (err) {
    console.error(`could not read ${claudeConfigPath} (${err instanceof Error ? err.message : "error"})`);
    process.exitCode = 1;
    return;
  }
  const current = readCredentials();
  if (current.kind === "unreadable") {
    console.error(`${registryPath()} is unreadable (${current.why}) — refusing to overwrite it`);
    process.exitCode = 1;
    return;
  }
  const workspaces = current.kind === "read" ? { ...current.workspaces } : {};
  const candidates = everdictBearerServers(config);
  const linked = new Set();
  for (const candidate of candidates) {
    const verified = await verifyKey({ apiUrl: candidate.apiUrl, key: candidate.key });
    if (!verified.ok) {
      console.log(`${candidate.scope} "${candidate.name}": could not verify (${verified.why})`);
      continue;
    }
    workspaces[verified.workspace] = { apiUrl: candidate.apiUrl, key: candidate.key };
    linked.add(verified.workspace);
  }
  writeCredentials(workspaces);
  console.log(
    `imported ${linked.size} of ${candidates.length} everdict MCP entr${candidates.length === 1 ? "y" : "ies"} found — workspace(s): ${[...linked].join(", ") || "none"}`,
  );
};

// `claude setup-token | node lib/credentials.mjs add-claude-token` — the token on STDIN, never argv, mirroring
// `add`'s own discipline. Mode 0600, same reasoning as `writeCredentials`: `writeFileSync`'s own `mode` only
// applies when the file did not already exist, so a re-run tightens a looser pre-existing file's mode too.
const cmdAddClaudeToken = async () => {
  const token = (await readStdin()).trim();
  if (!token) {
    console.error(
      "no token on stdin — pipe it in, e.g. `claude setup-token | node lib/credentials.mjs add-claude-token`",
    );
    process.exitCode = 1;
    return;
  }
  const file = claudeTokenPath();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`stored a headless Claude token at ${file} (mode 0600) — never printed`);
};

const isMain = (() => {
  try {
    return typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === "add") await cmdAdd(rest[0], rest[1]);
  else if (cmd === "import-claude-config") await cmdImportClaudeConfig();
  else if (cmd === "add-claude-token") await cmdAddClaudeToken();
  else {
    console.error(
      "usage: credentials.mjs add <workspaceId> <apiUrl>\n       credentials.mjs import-claude-config\n       credentials.mjs add-claude-token",
    );
    process.exitCode = 1;
  }
}
