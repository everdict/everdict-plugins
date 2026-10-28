// DOES THIS BASH COMMAND SEND HTTP STRAIGHT TO THE DECLARED EVERDICT API (DEFAUL-296)? Parse only, no I/O.
//
// The REST door (`bin/everdict-api`) leaves a receipt for every call, and the hooks read those receipts. A call
// that goes around the door leaves none — a write the Stop guard cannot see — so `raw-http-guard.mjs` refuses one
// and names the door. `GET <api>/docs/json` is the OpenAPI document `everdict-api describe` itself reads; it
// changes nothing and is allowed.
//
// ⚠️ BEST-EFFORT, AND SAYS SO. Only the command line itself is read: a script FILE that calls `fetch` (or a
// `python`/`ruby` one-liner speaking HTTP) is not seen, nor is a URL assembled from pieces. This keeps the ledger
// honest for the shape a session takes when it is in a hurry (`curl`, `wget`, `http`, an inline `node -e fetch(`),
// it does not make it complete.
export const RAW_HTTP_SCOPE =
  "Best-effort: only the command line is read, so a script file that calls fetch is not seen (nor is a python/ruby one-liner or a URL built from pieces).";

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A command word that sends HTTP: curl, wget, HTTPie (`http`/`https`), xh, or an inline `fetch(`.
const SENDER = /(?:^|[\s;&|(`{])(curl|wget|http|https|xh)(?=\s|$)|\bfetch\s*\(/;

const ALLOWED_PATHS = new Set(["/docs/json"]);

const pathsAfter = (command, needle) => {
  const paths = [];
  const re = new RegExp(escapeRegex(needle), "gi");
  for (const match of command.matchAll(re)) {
    const rest = command.slice(match.index + needle.length);
    const [token] = /^[^\s'"`)]*/.exec(rest);
    paths.push(token.split(/[?#]/)[0].replace(/\/+$/, "") || "/");
  }
  return paths;
};

// The gateway's stream routes (`/stream`, `/stream/ws`): a streaming read the door cannot proxy as one request, so the
// refusal names `everdict-api watch` — the one sanctioned client (DEFAUL-959).
export const isStreamPath = (p) => p === "/stream" || p.startsWith("/stream/");

/**
 * `apiBase`: the declared API URL (may be undefined). Returns `{kind:"none"}` or
 * `{kind:"refuse", sender, paths}` — the paths the command sends to.
 */
export const rawHttpToApi = (command, apiBase) => {
  const sender = SENDER.exec(command);
  if (sender === null) return { kind: "none" };
  const senderName = sender[1] ?? "fetch(";
  // The URL, with and without its scheme (HTTPie takes `localhost:3000/x`), plus the env spellings a shell expands.
  const needles = [
    ...(apiBase ? [apiBase, apiBase.replace(/^https?:\/\//i, "")] : []),
    "${EVERDICT_API_URL}",
    "$EVERDICT_API_URL",
    "${EVERDICT_MCP_URL}",
    "$EVERDICT_MCP_URL",
  ];
  const paths = [...new Set(needles.flatMap((needle) => pathsAfter(command, needle)))];
  if (paths.length === 0) return { kind: "none" };
  if (paths.every((p) => ALLOWED_PATHS.has(p))) return { kind: "none" };
  return { kind: "refuse", sender: senderName, paths: paths.filter((p) => !ALLOWED_PATHS.has(p)) };
};
