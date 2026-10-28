# Neutralization checklist

For each fix in the change — not for the change as a whole.

## Before

- [ ] The suite is GREEN on the current build. A stale artifact makes every later reading meaningless.
- [ ] You know which assertion you expect to fall, and why.

## Per clause

- [ ] Each clause of a compound condition is neutralized SEPARATELY.
- [ ] For each, the number of failing assertions is recorded. Zero means that clause is untested — a
      finding, right now, not later.
- [ ] Sibling clauses in the same predicate are measured even when you only changed one.

## Validity of the neutralization

- [ ] The neutralized code actually BEHAVES differently — substitute a wrong behaviour, do not just
      disable narrowing or delete the guard, either of which can make the check meaningless instead
      of wrong.
- [ ] If the target is located by matching text, that text occurs exactly ONCE.
- [ ] If removing the guard yields the same answer, the assertion watches a SIDE EFFECT (was the
      collaborator called?) rather than the return value.
- [ ] After restoring, the file is byte-identical to where it started.

## Message

- [ ] The red message names the invariant, not just the arithmetic.
- [ ] A reader who has never seen this code could say what rule was broken.

## Afterwards

- [ ] The escape hatch the defect travelled through is deleted in the same change.
- [ ] If this fix reopened a previously closed state, the older guard is re-measured too.