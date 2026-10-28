---
name: count_the_population
description: >-
  Use before any sweep, migration or 'fix it everywhere' change, or when a familiar defect turns
  up again. Count real instances by query or reading, never by pattern; the count chooses the
  repair.
---
<!-- generated from everdict methodology seed: id=count-the-population version=1.0.0 digest=sha256:78dbc0dac88225302702e472cdf2592a22bdc56e20d4d400d33c3ff415a95928 — do not edit; run node scripts/generate-plugin-seed-skills.mjs -->

# Count the population, then choose the fix

The same defect has different correct repairs depending on how many instances there are and what
shape they take. Count first. The count chooses the fix; a familiar pattern applied without counting
chooses it for you, wrongly.

## The law

**A population cannot be counted by pattern, because every pattern encodes an assumption about
spelling — and the spellings ARE the population.**

One measured population of call sites, five methods:

    text search, filtered for noise                      4    the filter deleted a true positive
    the same, plus two a reviewer spotted                6    blind to a second call form
    program and verb tested independently, per line     12    blind to calls split across lines,
                                                              to a local helper wrapping the command,
                                                              and to a second command with the same defect
    a syntax-aware matcher                               4    its own "is this the thing" test was wrong
    READING every candidate                             19    ← the answer

A fourth answer is not a tiebreak. Two corollaries, both paid for:

- Never filter a sweep's output by a pattern that can occur INSIDE what you are looking for.
- Never assume one spelling of a command, field or route is the only spelling.

**Ask the data, or read it.** Where the population lives in a store, run the query — a join answers in
one shot what a text search can only approximate. Where it lives in source, read the candidates.
Where you must use a matcher, derive the count a second, independent way and make the two agree
before believing either.

## The count changes the fix

The same "two spellings split one resource" defect, twice:

|                               | a NEW field       | an EXISTING field     |
| ----------------------------- | ----------------- | --------------------- |
| legacy rows                   | 0                 | 90                    |
| normalizing writes            | safe              | 64 rows orphaned      |

Normalizing the write side is right for the first and catastrophic for the second: it converts "a
read that cannot find it" into "a read that lost it", and the second is worse, because the first at
least answers when you ask with the other spelling. Counting turned a migration rewriting 64 rows
into a read-side resolution rewriting none — and the migration would have passed its tests, because a
migration test checks that the migration ran, never what became invisible.

## Count the siblings

The most common shape is **a mechanism one lane uses and its sibling does not**. When you fix a lane,
count the others:

- How many call sites does this store method have? How many of them now pass the new argument?
- This route was fixed. What are the other routes reaching the same seam?
- This writer normalizes. Does the reader?
- This guard fires at creation. What are the other paths into the same state? Enumerate them —
  one measured instance found two more doors, and one of them did not pass through creation at all.

Count them with a query or by reading, and write the number down. "I fixed the other places too" is
not a number.

## Before you widen a sweep, run the widened sweep and read the delta

A widening that changes nothing ships as a fix and deletes the boundary that was telling the truth. A
widening that changes a lot may be harvesting junk. Read what moved in both directions, and decide
which direction is the improvement.

## Report absences with their scope

"There is no such call" is always a stronger claim than what you measured. Say which SET it is absent
from — "no caller in this service", not "no caller". Dropping the scope is how "impossible" and
"nobody has done it yet" get swapped, and the two lead to opposite decisions.

## Where this came from

A count of one population was taken five times before it was right, and the instances the wrong
methods missed were not random: they were the files under the most active development, so the corpus
with holes read exactly like coverage.

Four separate counts in one session each had a wrong first instrument. Every time, the tell was a
second derivation disagreeing with the first.

## Then

Fix it with `counterexample_first`. If the count came from a scanner, `empty_corpus_is_not_a_pass`
tells you when to disbelieve its zero.
