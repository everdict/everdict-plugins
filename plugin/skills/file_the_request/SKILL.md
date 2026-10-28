---
name: file_the_request
description: >-
  Use when filing any request that will become work, or before opening a change campaign. Quote
  the owner, measure the population, file one issue per thing asked with checkable 'Done when',
  design before the campaign.
---
<!-- generated from everdict methodology seed: id=file-the-request version=1.3.1 digest=sha256:a76117a2d59871c17998577efa1dcfecf13cf48df84909626d004d87ceceb8e7 — do not edit; run node scripts/generate-plugin-seed-skills.mjs -->

# File the request the way the record can use

A request that arrives as a paragraph of prose is retyped by every reader who needs a number out of it: how
many things were asked, how big is each, is it done yet. Filing turns the paragraph into records a query can
answer, and it starts with the paragraph itself, not with your summary of it.

## The procedure

1. **Quote the owner.** Open the issue's description with the asker's own words, not your paraphrase of
   them. A paraphrase already carries the interpretation the rest of the filing is supposed to test; the
   quote is the thing every later reading is checked against.
2. **Measure before you file.** State, in the open: the population you are counting, the count itself, where
   each instance was read from (a query, a search, a file you opened), and — when your first attempt at the
   count was wrong — the reading you started with and the corrected one, both left in the text. A request
   filed on a guessed count either overshoots (five issues for one ask) or undershoots (three asks folded
   into one issue that can only ever answer all-or-nothing); a corrected count left visible is what tells the
   next reader the number was earned rather than assumed.
3. **Read the workspace's conventions once, before filing.** Call `issue_conventions` and fill every field it
   marks `required` from the workspace's own vocabulary: labels by their descriptions, the product service
   you are changing, the active project, the usual assignee. Pass `context: {repository}` to `create_issue`,
   naming the repository of the checkout you are in. A workspace with no vocabulary yet says so — then there
   is nothing to invent, and a field left empty is the honest filing. After `create_issue`, read
   `conventions.missing` in the result and apply the candidates it names with `update_issue` (a change of `projectId`, `parentId`, `assignee` or `priority` is a decision — send `reason` with it); the fields in
   `conventions.suggested` are not required but the workspace has a vocabulary for them — link them too.
   `create_issue` also REFUSES a filing that omits two things, naming the field. `requestSource` says where the
   request came from: `{kind: "owner", words}` with the owner's verbatim words when the owner asked,
   `{kind: "agent"}` when you started it on your own judgement, `{kind: "external", ref}` for another system,
   `{kind: "unknown"}` when you cannot say — absent is never read as the owner. `brief` is the plain-language
   account for the person who owns the product: a one-line `summary`, `why`, `change` (what changes for them),
   `risk: {level, reason}` (a level is refused without its reason, and "low" is not a default), `reversible`,
   and `decided` (what you decided and why — not a question). Add `ask` only when one of the workspace's
   declared conditions for asking a person holds. The description below stays the engineering record.
   Name the goal the work serves with `projectId`; when no project covers it, send `noProjectBecause` (one
   sentence, recorded on the issue's history) — the issue door refuses a `create_issue` with neither.
4. **One issue per thing asked, filed as sub-issues.** Split a bundled request before creating anything: each
   distinct ask gets its own issue, filed under the parent that named it (a `parentId` on the child, never a
   bullet inside one issue's body), so the parent's own list of children is the account of how many were
   asked and how many are done — a number a query can take, not a sentence someone has to re-read to
   recompute.
5. **"Done when" is a checkable statement, never a direction.** "Improve the search" cannot be answered yes
   or no; "a search for a name that appears only in a comment returns zero results" can. Write each Done-when
   line so a stranger with no other context could run it and get an answer.
6. **Design before the campaign, not after it is refused.** Write the design — a short document describing
   the approach — to a file in the workspace, then move the request's chain to `accept`, naming that file's
   path as the design (`{kind: "spec", path}`), or accept it with `{kind: "declined", why}` — the one-line
   reason the change is too small to warrant a separate document. A change campaign opened over a request
   with neither is refused: the record would show work with no design behind it, which is indistinguishable
   from work nobody thought about before starting.

## Where this came from

Three requests filed against one workspace all took this shape: the description opened with the owner's own
words, then a measured population — not a guess — with its count, its source, and the reading that had been
wrong before it was corrected in the open. Each was split into one issue per thing actually asked for, and
each closed on statements a stranger could check rather than on a direction to "make it better". All three
needed a design — a spec, or a stated reason there was none — before the change campaign against them could
open at all: the platform now refuses a campaign opened over a request nobody designed, naming the missing
step by name rather than letting the work start and the design catch up later.

A separate filing skipped the measurement and guessed at how many places a defect appeared. The guess was
wrong in both directions in the same session — too narrow the first time, too wide once "fixed" — and the
count that finally held was the one taken by reading the candidates rather than by a pattern over them,
which is the same lesson `count_the_population` names on its own.

## Then

Size what you just measured with `count_the_population` if the count is not yet obviously right. Freeze what
you filed into criteria with `declare_criteria_first` before touching any code. Load
`references/request-template.md` at the moment you write the issue.
