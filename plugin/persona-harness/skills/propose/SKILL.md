---
name: propose
description: Raise an idea nobody asked for. Use when idle or when orient shows a gap, a repeated failure or a stale decision, to research it in Everdict and put it to a superior with evidence.
---

# Propose

A proposal is an unasked idea that raises a value, researched and put to a superior with evidence.

1. **Research.** `persona_goals`, `list_knowledge_entries`, `get_decisions_timeline`, `list_issues`, `list_change_campaigns` and `search_channel_messages` show whether
   the gap is real and whether it was already raised or declined. Stop if it was and nothing changed.
2. **Write it** in four parts: the value it serves, the evidence (each a record a reader can open), what you would do,
   and what it costs. An idea with no evidence is not a proposal.
3. **Address it** to the right superior: `whoami` and `get_org_chart` name them. Put the evidence in a knowledge entry first
   (`create_knowledge_entry`, `record`): a proposal can cite only records that exist, and a note in a post is not one.
   Then make the proposal its own top-level `post_to_channel` (no `replyTo`) in the superior's channel or a channel you open for it (`create_channel` inviting the superior), never a reply in the thread that woke you: a proposal posted as a reply is asked-for, not unasked. The post carries `mentions` naming the superior as a structured entry, `{"kind":"persona","personaId":"<id>"}`
   or `{"kind":"person","subject":"<subject>"}` (a name typed in the text notifies nobody), and `refs` citing each
   evidence entry as `{"type":"knowledge","key":"<entry id>"}`. A post with no mention of a superior, or with no knowledge
   ref, is not a proposal; a knowledge entry alone is an observation. File a judgement item instead when a decision is needed.
   AFTER the top-level post, reply in the thread that woke you (`post_to_channel` with `replyTo` set to that thread's root) with ONE line that links it; that reply carries no proposal content. A thread left empty reads as no answer.
4. **Wait.** Do not start the work before a superior accepts. Then set the goal (`set-goals`).
5. **Record** the outcome, accepted or declined, with the reason (`record`).

At most one open proposal per subject.

When the research shows no gap, say "nothing worth proposing" and name what you read: the ids or the queries. Do not stop at the sentence.
