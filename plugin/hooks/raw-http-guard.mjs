#!/usr/bin/env node
// PreToolUse (Bash) — a command that sends HTTP straight to the declared Everdict API goes around the REST door,
// leaves no receipt, and is therefore a write the Stop guard cannot see (DEFAUL-296). Refused, naming the door.
//
// `lib/raw-http.mjs` reads WHAT a command sends (parse only). Like the other guards: only where the repository
// OPTED IN (`lib/workspace.mjs`), and `EVERDICT_BREAK_GLASS='<reason>'` lets it through, said out loud.
// `GET <api>/docs/json` is allowed. BEST-EFFORT — see `RAW_HTTP_SCOPE`: a script file that calls fetch is not seen.
import { resolveApiCredential } from "./lib/api-credential.mjs";
import { RAW_HTTP_SCOPE, isStreamPath, rawHttpToApi } from "./lib/raw-http.mjs";
import { resolveWorkspace } from "./lib/workspace.mjs";

const stdin = await new Promise((resolve) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
  });
  process.stdin.on("end", () => resolve(buf));
});
const silent = () => process.exit(0);

let input = {};
try {
  input = JSON.parse(stdin || "{}");
} catch {
  silent();
}
if (input.hook_event_name !== "PreToolUse" || input.tool_name !== "Bash") silent();

const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process.cwd();
const resolved = resolveWorkspace(cwd);
if (resolved?.kind !== "linked") silent();

const { apiBase } = resolveApiCredential({ workspace: resolved.workspace });
const verdict = rawHttpToApi(command, apiBase);
if (verdict.kind === "none") silent();

const breakGlass = process.env.EVERDICT_BREAK_GLASS?.trim();
if (breakGlass) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: `everdict: the raw-HTTP guard was bypassed by EVERDICT_BREAK_GLASS ("${breakGlass}")`,
    }),
  );
  process.exit(0);
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: [
        `This command sends HTTP (${verdict.sender}) straight to the Everdict API (${verdict.paths.join(", ")}). Go through the door instead, so the call leaves a receipt the hooks can read:`,
        "",
        "  everdict-api <operation> [--<pathParam> <v>]… [--query k=v]… [--body '<json>']",
        "  everdict-api ops [filter]            the operations and their routes",
        "  everdict-api describe <operation>    the body an operation takes",
        "  everdict-api raw <METHOD> <path>     a route the table lacks (still leaves a receipt)",
        "",
        ...(verdict.paths.some(isStreamPath)
          ? [
              "The stream route has one client: `everdict-api watch <subject-pattern>[,…] [--resume] [--kinds k1,k2] [--until <kind>]` — one line per frame, a resumable cursor, honest exit codes. Run it under Monitor (or Bash run_in_background with --until).",
              "",
            ]
          : []),
        "Reading GET /docs/json directly is allowed.",
        `(${RAW_HTTP_SCOPE})`,
      ].join("\n"),
    },
  }),
);
process.exit(0);
