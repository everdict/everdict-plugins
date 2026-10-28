---
name: triage-findings
description: Before you report a defect from an audit, log sweep or review, look each finding up in what the workspace already recorded and sort it. Only a new defect is reported as one.
---

# Triage findings

An audit, a log sweep or a review returns findings. Reporting one the workspace already decided, tracks or is waiting on
costs the owner a "we already knew", and the next audit repeats it. Look each finding up before you report it.

1. **Give each finding recognition refs.** The thing that lets a later reader recognise it, as refs on the lookup and on
   whatever you record: a `code_path` (the file or function), a `config_key` (the setting, endpoint or table) or a
   `log_signature` (the stable phrase in the log). Add the symptom in a sentence. A finding with none of them cannot be
   found again; say which one you could not get.
2. **Look it up.** Call `get_task_context` with those refs plus the repository the finding is in. Then `list_issues` over
   the open statuses (`todo`, `in_progress`, `in_review`, `regressed`, with a `limit`) and read an umbrella issue's list
   line by line: a finding can be one row of an issue that never names it in the title. Read the decisions and conventions
   the context returned. An entry whose coverage is `due` or `behind` is a claim to check, not a ruling.
3. **Sort it into one class.**
   - **New defect.** Nothing recorded covers it. Report it, and file it with `create_issue`: the recognition refs, the
     symptom, and the counterexample, the observation that fails, written first.
   - **Known defect.** An open issue covers it. Do not file a second one. Add the new evidence as a comment on that
     issue with `create_comment` (resource type `issue`, the issue's identifier): the symptom, the recognition refs and
     where you saw it, so the people reading the issue see it. Say in your report which issue gained it. You do not
     edit the issue itself.
   - **Accepted design.** A decision or convention says it is on purpose. Do not raise it as a defect: name the entry. If
     what you saw suggests the reasons no longer hold, ask the owner, citing the entry; do not decide it yourself.
   - **Waiting on an outside party.** An issue the workspace marks as waiting, or an entry with `revisit`, covers it.
     Check only its revisit condition: has the date passed, has the named issue reached its state? If the wait has no
     condition, ask for one.
4. **Report new defects first,** each with its refs and counterexample, then one line per other class with the ids you
   matched. A finding you could not sort because a read failed is unknown: say so, never "known".
5. **When the owner says they already knew,** the record you missed is the defect. Record the stance in that turn
   (`record`) so the next audit finds it.

## Handing the audit to a subagent
A subagent starts with nothing the workspace knows. Hand it what the lookup returned: the entries and issues that
cover its area, with their ids, and tell it to report each finding with its recognition refs. Do not forward its list to
the owner; triage its findings yourself with the steps above, then report.
