// THE ONE RESOLVER FOR "the API base and key for this checkout" (DEFAUL-281 round 3). A hook used to read
// `EVERDICT_API_KEY` from its own environment and treat unset as "not configured" — but a real session
// carries no such variable: the key lives in `~/.everdict/workspaces.json` under the linked workspace
// (`lib/credentials.mjs`), which is what `mcp-headers.mjs` and `delegation-bootstrap.mjs` already use. So every
// check gated on the env var was silently off in exactly the sessions it exists for.
//
// Order: `EVERDICT_API_KEY` / `EVERDICT_API_URL` (or the MCP client's `EVERDICT_MCP_URL`) are an OVERRIDE; the
// registry entry for the linked workspace is the default. `undefined` fields mean "not configured" — the caller
// decides what that costs, and a corrupt registry is the same `undefined` (nothing to authenticate with).
import { readCredentials } from "./credentials.mjs";

const trimBase = (url) =>
  (url ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/mcp$/, "");

export const resolveApiCredential = ({ workspace, env = process.env, credentials } = {}) => {
  const entry = (() => {
    if (!workspace) return undefined;
    const read = credentials ?? readCredentials();
    return read.kind === "read" ? read.workspaces?.[workspace] : undefined;
  })();
  const envKey = env.EVERDICT_API_KEY?.trim();
  const registryKey = typeof entry?.key === "string" ? entry.key.trim() : "";
  const envBase = trimBase(env.EVERDICT_API_URL) || trimBase(env.EVERDICT_MCP_URL);
  const registryBase = typeof entry?.apiUrl === "string" ? trimBase(entry.apiUrl) : "";
  return {
    apiBase: envBase || registryBase || undefined,
    key: envKey || registryKey || undefined,
  };
};

// ── THE DOOR'S CREDENTIAL, WHEN THE CHECKOUT IS NOT LINKED (DEFAUL-404) ──────────────────────────────────────
//
// `resolveApiCredential({workspace: undefined})` answers "no key", and a door that sends no `Authorization`
// header to a deployment that does not require one is answered as the anonymous `dev` — six campaigns, their
// rounds and criteria were written that way from a scratch directory, and it surfaced only when a review refused
// for want of a verifier. So the door asks the registry itself when there is no link and no key in the
// environment, and the answer is one of three values, never a silent absence:
//
//   chosen   exactly one registered credential for the API being called — used, and named on the receipt;
//   refused  the registry is unreadable, or holds several candidates — the call is refused BEFORE it is sent,
//            naming the candidates (workspace ids, never keys) so the caller can say which;
//   none     nothing registered at all — the ordinary "never set this up" case, which the door has always sent
//            without a credential and now says so on the receipt (`identity.source: "none"`).
//
// `identity` is what a receipt records: the workspace and where the choice came from. It never carries the key.
export const resolveDoorCredential = ({ workspace, env = process.env, credentials } = {}) => {
  const base = resolveApiCredential({ workspace, env, credentials });
  const envKey = env.EVERDICT_API_KEY?.trim();
  if (workspace)
    return { ...base, workspace, identity: { workspace, source: envKey ? "env" : base.key ? "linked" : "none" } };
  if (envKey) return { ...base, identity: { workspace: null, source: "env" } };

  const read = credentials ?? readCredentials();
  if (read.kind === "absent") return { ...base, identity: { workspace: null, source: "none" } };
  if (read.kind === "unreadable")
    return {
      ...base,
      identity: { workspace: null, source: "none" },
      refusal: `this checkout is not linked to a workspace and ~/.everdict/workspaces.json cannot be read (${read.why}), so no credential can be chosen — the call would be made anonymously. Fix the file, link the checkout (\`echo <workspace> > .everdict/workspace\`), or set EVERDICT_API_KEY.`,
    };
  const candidates = Object.entries(read.workspaces).filter(
    ([, entry]) =>
      typeof entry?.key === "string" &&
      entry.key.trim() !== "" &&
      (!base.apiBase || (typeof entry.apiUrl === "string" && trimBase(entry.apiUrl) === base.apiBase)),
  );
  if (candidates.length === 0) return { ...base, identity: { workspace: null, source: "none" } };
  if (candidates.length > 1)
    return {
      ...base,
      identity: { workspace: null, source: "none" },
      refusal: `this checkout is not linked to a workspace and ~/.everdict/workspaces.json holds ${candidates.length} credentials${base.apiBase ? ` for ${base.apiBase}` : ""} (${candidates.map(([id]) => id).join(", ")}), so none can be chosen — the call would be made anonymously. Name one: \`EVERDICT_WORKSPACE=<workspace> everdict-api …\` or link the checkout (\`echo <workspace> > .everdict/workspace\`).`,
    };
  const [[chosen, entry]] = candidates;
  return {
    apiBase: base.apiBase || (typeof entry.apiUrl === "string" ? trimBase(entry.apiUrl) : "") || undefined,
    key: entry.key.trim(),
    workspace: chosen,
    identity: { workspace: chosen, source: "registry" },
  };
};
