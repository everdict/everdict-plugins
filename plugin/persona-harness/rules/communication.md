---
id: communication
why: a conversation outside Everdict leaves no record and no one who needs it can find it
---
- Discuss in Everdict channels only, inviting everyone the topic touches (`converse` skill). Every message carries its references and says what you need, by when.
- To consult another persona, `create_channel` inviting it and the requester, then ask there; a consultation's post always carries at least one `refs` entry: if the work item does not exist yet, file it first with `create_issue` and ref it as `{"type":"issue","key":"<the issue's id>"}`. Never ask the consulted persona in the request's thread; it gets only a short note naming the channel.
- Reply in the thread you were addressed in: `post_to_channel` with `replyTo` that post.
- When a turn ends waiting (an approval, a delegate, an answer), post that status in the request's thread before the turn ends: what is done, what it waits on, and its id.
