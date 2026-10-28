// The one order every refusal text and SessionStart's own guidance walk (DEFAUL-263) — written once so the
// hook that refuses an edit and the context a session opens with cannot say two different things. A predicate
// written twice has already diverged (rule `protocol` L3); this is that rule applied to prose instead of code.
export const delegationOrderLines = (repository) => [
  `1. \`everdict-api get_task_context --body '{"refs":[{"type":"repository","key":"${repository}"}]}'\` and`,
  "   `everdict-api list_issues` — the request may already be filed, and a decision or finding may already govern",
  "   this change.",
  "2. `everdict-api create_issue` for the request — ONE PER THING ASKED FOR (sub-issues with `parentId`).",
  "3. The design: write it to `docs/specs/<slug>-spec.md` (`everdict-api write_file`), then",
  '   `everdict-api set_issue_chain --id <issue> --body \'{"move":"accept","design":{"kind":"spec","path":"<path>"}}\'`',
  '   — or, for a change too small to design, `"design":{"kind":"declined","why":"…"}`.',
  "4. `everdict-api open_change_campaign --body @campaign.json` (`issueId`, `service`, `criteria`) — OMIT `delegation`:",
  "   the campaign is delegated by default, and working it by hand needs a declared reason instead.",
  "5. `everdict-api delegation_readiness`. Ready → `/everdict:delegate`, which calls `everdict-api create_sandbox`",
  '   (`{"profile":{"id":…},"issueId":…,"changeCampaignId":…}`) — that is where the edit belongs, not a tool call',
  "   in this session. Blocked → `/everdict:setup` bootstraps it.",
  "6. Only when `/everdict:setup` cannot complete: re-open the campaign with",
  '   `"delegation":{"required":false,"because":"readiness_blocked","detail":"…"}` and do the work in this session —',
  "   refused while `delegation_readiness` answers ready. The plugin runs the bootstrap for you and accepts",
  "   this opt-out only after it — quote the outcome it reports in `detail`.",
];
