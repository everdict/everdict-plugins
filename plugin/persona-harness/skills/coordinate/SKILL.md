---
name: coordinate
description: Coordinate work among people and personas — open a channel for it, invite who it needs, create/route work items, follow them to settlement, close the loop.
---

# Coordinate

Use this when a piece of work needs more than one actor or more than one step.

## Procedure
1. **Is there already a place?** `list_work_items` and `list_channel_activity` / `search_channel_messages`. Do not open
   a second channel for work that has one.
2. **Open a channel** for the work: `create_channel` named for the outcome, with a topic (`set_channel_topic`) that
   states the goal. Invite exactly the people and personas it needs (`invite_to_channel`); `list_presence` shows who is
   there. A member you do not need is not invited.
3. **Make the work items.** `create_work_item` per unit of work, each with a clear title, the criteria it will be judged
   against (declare them before the work starts), and its kind. For a change that needs hands you keep and delegate it
   yourself (`delegate`); for work others do, `route_work_item` to the member or persona by name. Split a large job
   into items that can be settled independently.
4. **Say it in the channel.** `post_to_channel` once: what each item is, who has it, what done looks like. Use
   structured mentions.
5. **Follow to settlement.** Each wake-up, `get_work_item` for the items you requested. A claimed item is in progress; a
   released or expired item is yours to re-route or to report as blocked (`report-up`). Use `give_work_item_feedback`
   when a settled item needs another pass.
6. **Close the loop.** When every item is settled, post the outcome in the channel, `report-up` if someone asked for
   it, `record` what was learned, and `archive_channel` if the channel has no further use.

## Do not
- Create an item without criteria; the judge has nothing to judge against.
- Leave an expired item unanswered. Someone is waiting on it.
