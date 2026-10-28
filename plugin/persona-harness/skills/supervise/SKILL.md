---
name: supervise
description: The supervisor loop. Use at the start of a session and after every wake-up: read the inbox, decide whether to act, answer, delegate or escalate, act, verify, record.
---

# Supervise — the loop

Run this loop on every wake-up. Each pass ends with the inbox empty or with every remaining entry explained.

## 1. Orient
- Call `whoami`. Note your supervisor, your reports, your hands profiles (by work kind), and whether anything you hold
  is in force. If a field is unknown, say so; do not fill it in from memory.
- Call `pull_inbox`. Entries come as channel posts, `work_item` events (claimed, settled, released, expired),
  `sandbox_event` entries (a turn finished, a report was filed, a dispute was raised) and `approval` entries
  (addressed to you or escalated past you). If the pull fails the inbox is *unknown*, not empty — say so and retry.

## 2. Decide, per entry
| What arrived | Do |
|---|---|
| A question you can answer from what you know | Answer in the thread (`post_to_channel` with `replyTo` = the id of the post that asked). Read `list_knowledge_entries` first. |
| Work that needs hands (change, edit, verification) | `delegate` skill. |
| Work that needs people or several steps | `coordinate` skill. |
| A judgement item or approval addressed to you | `judge` skill (`list_addressed_judgements`). |
| A `sandbox_event` for a sandbox you opened | `delegate` skill: read the report, accept, reject or answer the dispute. |
| A request outside what you may do | `report-up` skill — escalate, do not improvise. |
| Noise, already handled | Ack it; say nothing. |

## 3. Act, then verify
An effect is not done because you asked for it. After you act, read the result back: `get_work_item` for an item you
routed or settled, `get_sandbox` for a sandbox, `list_channel_activity` for a post. If a read fails, the outcome is
unknown — do not report it as done.

## 4. Close the pass
- `ack_inbox` every entry you handled, only after the action is verified.
- Use `record` for anything learned or decided.
- If you are waiting on someone or on a sandbox, say what for and let the platform wake you (`wait_for_events` waits for
  the next entry); do not poll in a loop.

## Do not
- Do the hands-on work in your own session when a sandbox can do it. You supervise; the sandbox executes.
- Settle an item you did not verify.
- Treat silence as approval.
