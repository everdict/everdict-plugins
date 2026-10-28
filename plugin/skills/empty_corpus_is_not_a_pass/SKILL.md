---
name: empty_corpus_is_not_a_pass
description: >-
  Use when writing or reviewing any gate, scanner, lint rule or guard, or when something passed
  and you cannot say what it looked at. Refuse an empty corpus, distrust a first zero, print what
  the number counts.
---
<!-- generated from everdict methodology seed: id=empty-corpus-is-not-a-pass version=1.0.0 digest=sha256:7813239e8b6fea6367831e3787620c27158f3542f18be88574c865b09694ee00 — do not edit; run node scripts/generate-plugin-seed-skills.mjs -->

# An empty corpus is not a pass

A check that found nothing has two possible meanings: there was nothing wrong, or it was never
looking. They print the same. Before a check may report, it must establish that there was something
to look at.

## The rule

**Refuse to report over an empty corpus.** No files matched, no rows loaded, no routes extracted, no
cases collected — say so and fail, rather than printing a clean result. A scanner with nothing to
look at reads exactly like coverage, and the failure is silent for as long as nobody asks.

Apply it to more than scanners. A screen that has never been rendered with real data is an empty
corpus. A code path that production has never executed is an empty corpus. A suite where the
scenarios skip when the infrastructure is absent is an empty corpus, and a skip and a pass exit the
same way.

## A new check's zero deserves the opposite suspicion from a zero in a report

When an established check reports zero, that is usually the debt being paid down. When a NEW check
reports zero on its first run, the first hypothesis is that the check is wrong — three drafts of one
reader gave three confident, different, wrong numbers. Before believing a new zero:

1. **Run it against a known violation.** Inject one, confirm the check accuses it, remove it.
2. **Check the corpus size**, not just the result. How many files/rows did it actually read?
3. **Derive the number a second way** and make the two agree.

## Do not measure a proxy

"Did anything get recorded?" is not "was the right thing recorded". A guard asking the easy question
is satisfied while the work it exists to force goes undone. Two tells:

- The check's own comment states a STRONGER rule than the code enforces. That gap is the defect.
- Absence and correctness produce the same answer, so a non-empty field passes regardless of what is
  in it — one measured guard was satisfied by a link where evidence was required.

Write the refusal message as carefully as the predicate: half of the fix is the sentence that tells
the next person what would satisfy the check.

## Declare what the number is a number OF

Every check prints a SCOPE beside its result, derived from its matcher and corpus — never copied from
its header, and never a literal written on the day it was authored, which is true once and silently
false afterwards. A count over part of a law reads exactly like coverage of the whole law.

State the negative space too: "this measures X; it does NOT measure Y" is the sentence that stops a
reader concluding more than you measured.

## Know which way the check is wrong

A guard errs in one of two directions, and they are not equally bad.

- **Missing** — silent, and the thing it should have caught ships.
- **False accusation** — stops the worker, and if the stated reason is wrong they have no way to fix
  it. This is the worse one, and it is indistinguishable from a real finding.

"An empty corpus is not a pass" usually guards the missing direction. It can invert: a condition
reading "nothing to count" as "everything is settled" convicts an honest case of a violation it did
not commit. When you write a guard, say which direction its emptiness falls in.

## A failing check hides its own blind spots

While a check is red, nobody asks what it is not looking at. The first time it goes green is the
first time its coverage gets read — and that is when a file that had certified nothing became
visible. Treat a first green as the beginning of the audit, not the end.

## Where this came from

A screen was complete, consumed by two pages, and protected by a type-level drift guard — and every
record in the store had the field absent, so it had never once been drawn with real data. It proved
nothing, and it looked finished.

A check enforcing two rules had all three of its descriptions — its declared scope, its violation
message, and its green PASS line — state only one of them, inside the very file written to refuse
certificates that do not describe their subject.

## Then

`verify_at_the_surface` is the other half: what to do once you accept that green is not evidence.
