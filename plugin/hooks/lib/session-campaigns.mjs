// Has THIS session named a change campaign, anywhere it could have — including a subagent it spawned
// (DEFAUL-262, DEFAUL-263)? The old first-change-guard asked only the transcript it was handed and only for
// a tool_use, which meant a campaign named inside a subagent's own transcript (the shape a LOCAL subagent's
// hook call carries) was invisible, and a session CONTINUING a campaign that already declared
// `delegation.required` in an earlier turn's tool_result had no way to learn that fact again.
//
// `sessionCampaigns({ transcriptPath, sessionId })` scans every file `sessionTranscriptFiles` names — the
// session's own main transcript plus every subagent it spawned — because a campaign named only inside a
// subagent's transcript is part of the session's own history of what it declared, exactly as its main
// transcript is. The file-finding itself lives in `lib/session-transcripts.mjs`, shared with the image-push
// grant scanner (DEFAUL-265): two scanners deriving the same harness transcript layout twice is how they drift.
//
// Returns `{ named, delegationRequired }`. `named` is any landed receipt of open_change_campaign,
// get_change_campaign or log_change_round — resolving one of these is how a session says "I know which
// campaign this work belongs to", exactly as opening one does.
//
// ⚠️ `delegationRequired` IS READ FROM THE STORED RESULT, NEVER FROM THE CALL'S ARGUMENTS (DEFAUL-278). It
// used to also read `open_change_campaign`'s own INPUT (`{ delegation: { required: true } }`) — which broke
// the moment the service started defaulting an OMITTED `delegation` to `{required: true}`: a call that named
// no delegation stored one, and the input-side read saw nothing and reported `false`. The result is the only
// place that can answer this, and a receipt carries its call's own result (the shape a CONTINUING
// session — one that only ever calls `get_change_campaign` / `log_change_round` — actually receives it in).
// A missing `delegation` on that result reads as DELEGATED (`required: true`'s effect), same as the service's
// own default; only an explicit `{required: false}` flips it — a `not_code`/`readiness_blocked`/
// `owner_directed` opt-out is the one way a campaign is not delegated.
import { landed, opMatcher, sessionReceipts } from "./receipts.mjs";

// The operations that name a campaign, read from the REST door's receipts (DEFAUL-296) — the old scan keyed on
// `mcp__…everdict…__<tool>` `tool_use` blocks, and so could not see a campaign named over REST.
export const NAMED_CAMPAIGN_OPS = opMatcher(["open_change_campaign", "get_change_campaign", "log_change_round"]);

// `open_change_campaign`/`get_change_campaign` spread the campaign record at the TOP of the result;
// `log_change_round` answers `{ record, round }`. The receipt's projection keeps `delegation` at whichever level
// the response had it, so one reader covers both shapes.
const delegationOf = (result) => result?.delegation ?? result?.record?.delegation;

// ⚠️ DEFAULTS DELEGATED, LIKE THE SERVICE ITSELF (DEFAUL-278). A campaign named with no readable result yet
// — the call was interrupted, or its answer sits outside this transcript's window — carries no opt-out
// either, and an omission must not read as one. Only a stored `{required: false}` (below) flips it back.
export const sessionCampaigns = async ({ transcriptPath, sessionId, home }) => {
  const state = { named: false, delegationRequired: true };
  for (const receipt of await sessionReceipts({ transcriptPath, sessionId, home })) {
    // A receipt that did not land named nothing: a 404 `get_change_campaign` resolved no campaign.
    if (!landed(receipt) || !NAMED_CAMPAIGN_OPS.test(receipt.op)) continue;
    state.named = true;
    const delegation = delegationOf(receipt.result);
    // Absent means delegated (the service's own default); only an explicit opt-out flips it.
    if (delegation !== undefined) state.delegationRequired = delegation.required !== false;
  }
  return state;
};
