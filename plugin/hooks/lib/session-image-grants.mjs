// WHICH REPOSITORIES, AT WHICH ENDPOINT, THIS SESSION HOLDS A push_image_grant FOR (DEFAUL-265) — the
// authority `image-push-guard.mjs` checks a push's targets against. The grant is minted by the product and
// read from the transcript; this hook calls no API of its own.
//
// `sessionImageGrants({ transcriptPath, sessionId })` scans every file `sessionTranscriptFiles` names — the
// session's own main transcript plus any subagent it spawned, so a grant minted only inside a subagent's
// transcript still authorizes a push the SUPERVISOR makes (the shape the harness hands a local subagent's own
// hook call, same as `session-campaigns.mjs` reads for a named campaign).
//
// Reads receipts exactly as `session-campaigns.mjs` does — one reader (`lib/receipts.mjs`) for both.
//
// Expiry is NOT checked here: an expired grant fails at the registry itself, and re-deriving that judgement
// from a timestamp in a transcript would duplicate what the registry already enforces authoritatively.
import { landed, opMatcher, sessionReceipts } from "./receipts.mjs";

// Read from the REST door's receipts (DEFAUL-296): `push_image_grant` answers `{grant:{endpoint, repositories}}`,
// which the receipt's projection keeps whole (bounded), so no `tool_use_id` join is needed any more.
export const PUSH_IMAGE_GRANT_OPS = opMatcher(["push_image_grant"]);

export const sessionImageGrants = async ({ transcriptPath, sessionId, home }) => {
  const grants = [];
  for (const receipt of await sessionReceipts({ transcriptPath, sessionId, home })) {
    if (!landed(receipt) || !PUSH_IMAGE_GRANT_OPS.test(receipt.op)) continue;
    const grant = receipt.result?.grant;
    const endpoint = typeof grant?.endpoint === "string" ? grant.endpoint : undefined;
    const repositories = Array.isArray(grant?.repositories)
      ? grant.repositories.filter((r) => typeof r === "string")
      : [];
    if (endpoint && repositories.length > 0) grants.push({ endpoint, repositories });
  }
  return grants;
};

// A ref is covered when some grant names its exact host as `endpoint` and its exact `<ns>/<repo>` as one of
// `repositories`. A Docker Hub ref (`ref.host === undefined`) can never match — no grant is ever minted for it.
export const covers = (grants, ref) =>
  ref.host !== undefined && grants.some((g) => g.endpoint === ref.host && g.repositories.includes(ref.repository));
