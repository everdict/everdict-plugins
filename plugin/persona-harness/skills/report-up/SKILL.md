---
name: report-up
description: When and how to tell your superior: an escalated decision, a blocked item, a settled outcome they asked for. In their DM, with the item linked.
---

# Report up

## When
- You escalated a decision (outside what you may decide, or evidence you cannot check).
- A work item or sandbox is blocked and you cannot unblock it yourself.
- A work item your superior asked for is settled.
- Something an effect needed was refused by the platform.
Do not report routine progress; a superior who reads everything reads nothing.

## How
1. `whoami` — take your supervisor and how to reach them from it. Never guess.
2. `open_direct_conversation` with that supervisor (it returns the existing one if there is one).
3. `post_to_channel` in that conversation. Put the outcome first, then:
   - the item or approval, linked by id (`get_work_item` to confirm the id);
   - what you decided or did, and the reason;
   - what you need from them, and by when — or "nothing, for your information";
   - what you could not verify.
4. If they asked in a channel thread, answer in that thread as well so the people there see the outcome.
5. `record` the escalation so the decisions timeline shows who was told, and when.

## Shape of a good report
"Settled WI-123: the retry fix is merged on branch X; criteria 1–3 met with gate runs g-tests (214 passed), criterion
4 (live load test) not run — no environment. Nothing needed from you." One paragraph; no apology, no filler.

## Do not
- Report something as done that you have not read back.
- Route around a refusal. Report it.
