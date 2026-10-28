#!/usr/bin/env node
// PreToolUse (Bash) — an image a session publishes lands in THIS WORKSPACE's Everdict managed image store, or
// not at all (DEFAUL-265, docs/specs/image-push-lands-in-the-managed-store-spec.md).
//
// The product already HAS a store: `push_image_grant {repository}` mints a short-lived token scoped to
// `<namespace>/<repository>` and returns `imagePrefix`. So "pushed to the product" is checkable before the
// effect — a push is legitimate iff EVERY target ref it publishes is `<grant.endpoint>/<ns>/<repo>` and this
// session (main transcript or any subagent) holds a push_image_grant tool_result covering it. Measured before
// this hook existed: a plain `docker push ghcr.io/…`, a `buildx --push`, a `compose push` passed every plugin
// hook — the guard constrains a path rarely taken, and refuses it when it is taken to the wrong place.
//
// `lib/image-push.mjs` reads WHAT a command publishes (parse only, no I/O); `lib/session-image-grants.mjs`
// reads WHOM this session is authorized for (transcript only, no API call — the grant is the authority, minted
// by the product). This hook is the one place they meet.
//
// Keeping it from becoming a trap, as the other guards do:
//   · only where the repository OPTED IN (`lib/workspace.mjs`);
//   · a target this hook cannot read (a shell variable, a compose/bake file) is REFUSED, not ignored — an
//     unresolvable target is exactly the shape a push to the wrong place would take to stay invisible;
//   · BREAK-GLASS — `EVERDICT_BREAK_GLASS='<reason>'` lets any push through, and the reason is metered;
//   · expiry is not checked — an expired grant fails at the registry, which is the authoritative check for it.
//
// STATED LIMITS: a push inside a script FILE this command merely invokes is not seen — only the Bash command
// line itself is read; a delegate running in a sandbox with no plugin installed runs with no guard at all.
import { appendFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { imagePushTargets } from "./lib/image-push.mjs";
import { covers, sessionImageGrants } from "./lib/session-image-grants.mjs";
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
const parse = imagePushTargets(command);
if (parse.kind === "none") silent();

const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : process.cwd();
// `unlinked` and `opted-out` are silent here, like every other non-linked kind (see capture-guard.mjs).
const resolved = resolveWorkspace(cwd);
if (resolved?.kind !== "linked") silent();
const { workspace } = resolved;

// A meter, never a decision (the Stop guard's DEFAUL-35 rule): one line, failures swallowed.
const meter = (outcome, extra = {}) => {
  try {
    const dir = path.join(os.homedir(), ".everdict");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, "image-push-guard.jsonl"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        workspace,
        session: input.session_id,
        origin: process.env.EVERDICT_STOP_GUARD_ORIGIN?.trim() || undefined,
        outcome,
        ...extra,
      })}\n`,
    );
  } catch {
    // A meter that could not write decides nothing either way — it just leaves the count short.
  }
};

const breakGlass = process.env.EVERDICT_BREAK_GLASS?.trim();
if (breakGlass) {
  meter("break_glass", { reason: breakGlass, parse: parse.kind });
  silent();
}

const deny = (lines, outcome, extra = {}) => {
  meter(outcome, extra);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: lines.join("\n"),
      },
    }),
  );
  process.exit(0);
};

// The runnable remedy every denial carries: mint the grant, log in with it, tag, push — or the one-step form.
const remedyLines = () => [
  "",
  "To publish into this workspace's Everdict managed image store:",
  '  1. push_image_grant { repository: "<name>" }  → imagePrefix, grant.token',
  "  2. docker login <endpoint> -u everdict --password-stdin   (grant.token from step 1 as the password —",
  '     "everdict" is the fixed username the managed store\'s grant always uses; the token is what authorizes)',
  "  3. docker tag <local> <imagePrefix><name>:<tag>",
  "  4. docker push <imagePrefix><name>:<tag>",
  "",
  "Or the one-step form: `everdict image push <local-ref>` (no --registry).",
];

if (parse.kind === "sanctioned") {
  meter("sanctioned_cli");
  silent();
}

if (parse.kind === "refused") {
  deny([parse.why, ...remedyLines()], "denied_byo");
}

if (parse.kind === "unresolvable") {
  deny(
    [`This command publishes an image, but the target cannot be read: ${parse.why}`, ...remedyLines()],
    "denied_unresolvable",
  );
}

// ── parse.kind === "targets" — every ref must be covered by a grant this session holds ─────────────
const grants = await sessionImageGrants({ transcriptPath: input.transcript_path, sessionId: input.session_id });
const uncovered = parse.refs.filter((ref) => !covers(grants, ref));
if (uncovered.length === 0) {
  meter("granted", { refs: parse.refs.map((r) => r.ref) });
  silent();
}

deny(
  [
    "This push is not authorized into this workspace's Everdict managed image store:",
    "",
    ...uncovered.map(
      (ref) =>
        `  ${ref.ref}${ref.host === undefined ? " (not this store — Docker Hub)" : " — no push_image_grant covers it"}`,
    ),
    ...remedyLines(),
  ],
  "denied_ungranted",
  { uncovered: uncovered.map((r) => r.ref) },
);
