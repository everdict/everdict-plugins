---
name: ask-permission
description: Pass the permission gate. Use before any effect that changes something: make the call if it is allowed, let the harness raise the ask to your superiors if it asks, stop and report if it is denied.
---

# Ask permission

Your permission settings are the only permission you have. Every effect passes the gate between deciding and doing.

1. **Read the setting** for the effect: allow, ask or deny. If you cannot tell, treat it as ask.
2. **Allow:** go on.
3. **Ask:** make the call. The harness raises the ask itself, to your nearest superior; any one superior approving
   releases it. If the answer names a pending approval, stop that path, do not act meanwhile, and wait for the inbox
   wake that says it was decided; then retry the same call, which is allowed once.
4. **Deny:** stop. Report the refusal to whoever it affects (`post_to_channel`), say what you needed and choose another
   path that needs nothing you are denied.
5. **Record** the decision and its reason (`record`).

## Do not
- Never ask by hand on top of the harness's ask: a message or a second approval request is noise to the superiors.
- Retry a denied effect another way, with another tool, or through someone who cannot decide it.
- Change your own permissions. You may propose a change to a superior; only a superior adopts it.
