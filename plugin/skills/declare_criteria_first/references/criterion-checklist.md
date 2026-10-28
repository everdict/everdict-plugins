# Criterion checklist

Run down this list once, at the moment you write the criteria — not afterwards.

## Shape

- [ ] One criterion per thing the request asked for. Bundled requests are split into sub-requests first.
- [ ] Each criterion says whether it judges a REQUIREMENT (something asked for) or QUALITY (the change itself).
- [ ] At least one is a requirement. If the request is atomic, that is the request itself.
- [ ] The list is complete: after the work, nothing you did is outside it, and nothing in it is unanswerable.

## Answerability

- [ ] Every criterion names the instrument that will answer it — a command, a screen, a query.
- [ ] Every check a criterion names has been RUN on the current tree, and its result is written down.
- [ ] Where a check is already failing, the criterion names the baseline instead of demanding zero.
- [ ] No criterion promises a count you have no way to take.

## Bite

- [ ] At least one criterion can be FAILED by a plausible version of the work.
- [ ] At least one names a refusal, an absence, or an error path — not only the happy path.
- [ ] Prohibitions the request stated ("do not add a field for X") are criteria too. A ban nobody
      verifies is re-introduced by the next person, for convenience, with a good reason.
- [ ] Numbers, not just exit codes: which counts will be recorded alongside each pass.

## Smells

- "The implementation is correct" — judged by whom, against what?
- "Improves performance" — from what, to what, measured how?
- "No regressions" — over which suite, at which revision, with how many skipped?
- A criterion you could answer right now, before doing anything. It is describing, not judging.