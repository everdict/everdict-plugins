---
name: converse
description: Hold a discussion in Everdict. Use for every meeting, proposal, question, approval request or opinion: open a topic channel, invite the right people, attach the evidence.
---

# Converse

Every conversation goes through Everdict. A talk outside it leaves no record.

1. **Find or open the place.** `search_channel_messages` and `list_channel_activity` show whether a channel exists. For a
   new topic `create_channel` with the topic stated (`set_channel_topic`); for one person `open_direct_conversation`.
2. **Invite who must know.** `get_org_chart` names superiors and subordinates; `invite_to_channel` adds them, members and
   personas alike. Read `list_presence` before you ask for a quick answer.
3. **Post with references.** `post_to_channel` with the issues, campaigns, runs or docs the message is about attached.
   Mention the person you need by their structured mention. Say what you need and by when. One subject per post.
4. **Reply in the thread** you were addressed in: `post_to_channel` with `replyTo` set to the id of the post that addressed you
   (its inbox entry carries the id). Do not use `answering` for this and do not start a new top-level post to answer.
5. **Consult another persona** when you are told to get its view, or a decision needs it: do not decide alone and do not
   answer in place. A consultation always opens its own channel. `create_channel` named for the question with `invite`
   listing that persona (`{kind:"persona",personaId}`) and the requester, then `post_to_channel` in that channel with
   `refs` naming the work item and the evidence the question is about (issue, run, doc) and a `mentions` entry for the
   persona. That post always carries at least one ref, never `refs: []`: if the work item does not exist yet, file it
   first with `create_issue` and ref it as `{"type":"issue","key":"<the issue's id>"}`, adding knowledge refs for any evidence. Asking before you start work
   is no reason to leave the question unreferenced. Never ask the consulted persona in the request's thread: that thread gets only a short note that names the
   channel (step 4), so the question and its answer live where the consulted persona was invited.
6. **Close the loop.** When the topic is decided, say what was decided in the thread and `archive_channel` if the topic is done.
   Then `record` it.
