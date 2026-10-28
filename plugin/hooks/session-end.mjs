#!/usr/bin/env node
// SessionEnd — undo the host-runner pairings THIS session made (DEFAUL-836). `delegation-bootstrap.mjs` records a
// pairing in the session's own state only when the workspace had no compute; a pairing the session merely found
// is never recorded, so it is never undone. Silent on any failure: a session end must not be blocked by this.
import { readCredentials } from "./lib/credentials.mjs";
import { defaultIo, endSessionPairings } from "./lib/delegation-bootstrap.mjs";
import { isSafeSessionId } from "./lib/receipts.mjs";

const stdin = await new Promise((resolve) => {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
  });
  process.stdin.on("end", () => resolve(buf));
});

try {
  const input = JSON.parse(stdin || "{}");
  if (isSafeSessionId(input.session_id)) {
    const ended = await endSessionPairings({
      session: input.session_id,
      credentials: readCredentials(),
      io: defaultIo,
    });
    for (const f of ended.failed) console.error(`everdict: could not unpair ${f.workspace}: ${f.message}`);
  }
} catch {
  // never block the end of a session
}
