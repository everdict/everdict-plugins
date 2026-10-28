---
description: Use before changing code: open the request and campaign this work belongs to, so it traces back to why.
argument-hint: "[what you are about to change]"
---

Put the work about to happen on the record. What the user described: `$ARGUMENTS`.

Every operation below is a call to the REST door: `everdict-api <op> [--id …] [--query k=v] --body '{…}'`
(`everdict-api describe <op>` prints the body an operation takes; bodies are camelCase). For a long body write
the file with a QUOTED heredoc — `cat > campaign.json <<'JSON' … JSON` — because an unquoted heredoc executes
the backticks inside it, and pass it as `--body @campaign.json`.

## 1. Find out whether it already exists

`everdict-api list_issues` — the request may be filed already; work under it rather than opening a second one.
`everdict-api get_task_context --body '{"refs":[{"type":"repository","key":"<owner>/<name>"}]}'` — a decision or
finding may already govern what you are about to change. ⚠️ The ANCHORED call, not `list_knowledge_entries`: it
is the only read that files what the workspace offered, and the Stop guard accepts no other (DEFAUL-134).

## 2. The request — ONE ISSUE PER THING ASKED FOR

If nothing covers it, `everdict-api create_issue --body @issue.json`: the problem and why it is worth work, not
the fix you have in mind. Set `status` to `in_progress` when you start, and `projectId` if the workspace groups
work that way.

The door REFUSES an issue without two things, and names the field it is missing. `requestSource` — where the
request came from: `{"kind":"owner","words":"<the owner's verbatim words>"}` when the owner asked,
`{"kind":"agent"}` when you started it on your own judgement, `{"kind":"external","ref":"…"}` for another system,
`{"kind":"unknown"}` when you cannot say (absent is never read as the owner). And `brief` — the plain-language
account for the person who owns the product: `summary` (one line), `why`, `change` (what changes for them),
`risk: {level, reason}` (a level without a reason is refused; "low" is not a default), `reversible: {value, how?}`,
and `decided` (what you decided and why). `description` stays the engineering record below it. Add `ask` only
when one of the workspace's declared conditions for asking a person holds.

**Count what was asked for, and split before you build.** A request that bundles several things — five
feedback reports, three acceptance bullets, a list with "and also" in it — becomes one issue per thing, as
sub-issues (`create_issue` with `parentId`). This is not tidiness. A bundle can only be answered all-or-nothing,
so the parts that DID ship disappear into the single unmet verdict of the whole, and "how much of this is
done" stops being a question anyone can ask the record. `everdict-api list_issues --query parent=<id>` is then
the count.

Split by what the user would accept separately, not by what you would implement together. Two reports of the
same defect are ONE requirement. One report whose fix only removes the confusion — the screen now explains
why it refuses — is TWO: the explanation, and the thing they actually wanted.

## 3. The design — before the campaign, not after

`open_change_campaign` REFUSES a request whose work chain is not `accepted` or `shipped` (DEFAUL-264): the
accepted chain is the record that the design stage ran, and this is enforced on the SERVER, for every
client, not a habit this plugin merely encourages. So before opening:

`everdict-api write_file` a spec to `docs/specs/<slug>-spec.md` (body `{"path","content"}`), then
`everdict-api set_issue_chain --id <issue> --body '{"move":"accept","design":{"kind":"spec","path":"<path>"}}'`
— or, for a change too small to design, `"design":{"kind":"declined","why":"…"}`.
A legacy issue with no chain at all is refused exactly like a `draft` one; accepting it now dates the
acceptance from today, not backwards.

## 4. The campaign

An **evaluated** change — one with a dataset, scenarios and a held-out gate — opens a campaign with
`everdict-api open_campaign --body @campaign.json` (`issueId`, `frame`); the frame is frozen and the gate decides what may be adopted
(skill `everdict` covers the frame's fields).

An ordinary code change opens the `change` grade:
`everdict-api open_change_campaign --body @campaign.json` — `{"issueId","service":{"repository","path"},"criteria":[…]}`
(`docs/architecture/change-campaigns.md`). One open campaign per issue; a successor names its
predecessor in `continues`.

Leave `delegation` off — the campaign is delegated by default. The plugin runs the delegation bootstrap
(`/everdict:setup`) for you: a `"delegation":{"required":false,"because":"readiness_blocked"}` opt-out is accepted
only after it, and is denied if the bootstrap made the workspace ready. When it stays blocked, quote the
per-check outcome the hook reports in the opt-out's `detail`; "setup cannot complete" is not a reason without it.

## 5. Declare how it will be judged — before you start, and say what each criterion judges

Every criterion carries `judges`:

- `{ kind: "requirement", issueId }` — answers one thing that was asked for. **One per sub-issue.** These
  are what the count is over. When the request is atomic, that is the campaign's own issue.
- `{ kind: "quality" }` — judges the change itself: the repository's gates, no regression, the
  counterexample seen red. Never counted as a requirement, in either direction — it cannot pad the total,
  and an unmet request cannot hide among them.

At least one must be a requirement, or the open is refused: a campaign made only of quality gates passes
without anyone saying what was asked for.

**Scope each criterion to what THIS campaign can finish.** A criterion that spans work you cannot complete
— "all five are diagnosed", when two of them need a repro path you do not have — comes back `not_met` and
takes the whole round down with it, hiding the three that shipped. What you cannot finish is the next
round's criterion, a separate issue, or the `remaining` of a partial close. Not this round's gate.

If the change genuinely verifies nothing, declare THAT as a criterion.

## 6. Say what you did

Report the issue's identifier and what it now records, so the user can see where the work will land. If you
split the request, report the count — how many things it turned out to be asked for — because that number is
the one the user will ask about at the end.

## 7. Closing it — a campaign ends on a verdict, not on an adopted round

The pull request is part of what you are closing over: a round's `changes[].pr` names it, the plugin records `gh pr create` /
`gh pr merge` on the issue itself, and a merge after the round is `attach_round_pull_request --id <campaign> --seq <round>`.

`log_change_round` adopting every criterion does not close the campaign by itself. Every adopting close needs
a CURRENT approving verdict, unconditionally:

```
everdict-api mint_change_report --id <campaign>
everdict-api review_change_report --id <report> --body '{"reportDigest":"<digest>","disposition":{"kind":"approved"},"rationale":"…"}'
everdict-api close_change_campaign --id <campaign> --body '{"state":"adopted","roundSeq":<n>,"reason":"…","knowledge":["<entry id>"]}'
```

(`everdict-api describe close_change_campaign` names the close body's exact fields.)

**Who may file that verdict does not depend on who did the round.** The agent judges its own work
(DEFAUL-418): you may `review_change_report` a round you logged yourself, hand-typed or delegated, and close over
your own approval — unless the campaign was opened with `review: { required: true }`, which refuses that close:
the approval must then come from an actor that judged no round and is not the closer. Otherwise independence is recorded rather than refused — an adopting close stamps whether the approval
was independent, and the census lists a self-judged adoption as a gap. What a close still needs is a CURRENT
approving verdict over the campaign as it stands.

If the verdict comes back `rejected`, the directive decides the next move: `revise` names the round that
answers it in `respondsTo`; `explore` declines to choose the next move (`why` required, `hypotheses` optional) — the next round names it in `respondsTo` and states `chosenHypothesis` (`{hypothesis, why}`); `reframe` names the successor campaign to open, in `authorizedBy`, rather than
another round here.

A campaign opened after replayable history carries `priorEvidence` (the selection rule the replay recommends, or `none` and why), and its delegate's brief says so. A round of such a campaign must state `replayedRule` (`{stance: followed|overrode, why}`); the rule itself is read from the campaign.
