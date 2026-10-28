---
name: verify_at_the_surface
description: >-
  Use before calling any user-facing change done, or when you need evidence it shipped rather than
  merely passed. Measure the rendered surface with real data; make two published numbers disagree
  as predicted.
---
<!-- generated from everdict methodology seed: id=verify-at-the-surface version=1.0.0 digest=sha256:f427a821c38838de5d7ccc9553f1f973de28e8ea472186f4b465706246d34903 — do not edit; run node scripts/generate-plugin-seed-skills.mjs -->

# Verify where the reader is, not where the code is

A test tells you a predicate is correct. It cannot tell you the result is legible, and it cannot tell
you the correct predicate is the one actually running. Both need a reading taken outside the suite.

## Only a render proves it is readable

After building a surface, OPEN it with real data and measure:

- Compare the rendered width against the container's; content behind a scrollbar is content nobody
  reads. One measured picture needed more width than the column had, and what sat off-screen was the
  single node answering the question the page existed to answer.
- Count the nodes and follow the links. A layout that draws a sequence as siblings is wrong
  semantically before it is wrong visually — it says "parallel attempts" about one line of work.
- Read the console. Missing-content errors surface here and nowhere else.
- Check the empty, single-item and overflowing cases, which are the ones fixtures skip.

**Measure the DOM, not the HTML source.** Frameworks serialize data into the page that is never
drawn, so searching the source finds strings that no reader can see. This mistake is easy to make
twice in one session.

A suite is strong on *is the predicate right* and structurally blind to *is the result legible*. For
any product claiming to be readable, the render IS the measurement, and shipping a screen without
opening it verifies the half that was never in doubt.

## Only a live disagreement proves your code is the code that is running

A unit suite cannot distinguish a right predicate that shipped from a right predicate that did not —
those are identical in every number except the ones the running system produced.

So get the disagreement deliberately:

1. Pick two figures the system publishes INDEPENDENTLY that should agree, or differ by a known
   amount.
2. Do a known quantity of work — count it before you look.
3. Predict the movement of each figure, then read both.

One figure moving as predicted is consistent with a cache, a stale deployment or a coincidence. Two
figures disagreeing by exactly the expected amount is not. A measured instance: one number rose by
seven and the other by six, differing by precisely the one item that had been skipped — which nobody
computed, and which proved the skip-exclusion was not merely written but deployed.

## The capability is not built until it reaches the reader

A runtime with no surface is a plan. Ship the behaviour and the thing a person uses to reach it in
the same change, or the work is invisible and its absence is indistinguishable from never having been
started.

⚠️ Absence on a screen has two meanings — it was left out, or it is not a thing to draw. Rule the
second one out before "fixing" it, or you will repair a defect that was not there and introduce a
real one doing it.

## Measuring that a loop improved

- **Three readings, not two.** Before the change, after the change but BEFORE the act it enables, and
  after that act. Two readings cannot separate a real improvement from a ruler that moved, and the
  middle reading is the one that carries the argument.
- **Split every ratio into numerator and denominator.** A rate hides which one moved. Numerator flat
  while the denominator shrank is a measurement change; both rising is real; the ratio alone cannot
  tell them apart. Report the pair and let the reader divide.
- **Never let the instrument be fed by the thing it measures.** Once a gate feeds the meter, every
  later reading is a reading about itself.
- **A flattering measurement is worse than a missing one**, because it ends the search.

## Where this came from

A picture passed seventeen assertions and was wrong twice in ways no assertion could reach. Both were
found by rendering it on a real screen and measuring, and both changed the design rather than the
styling. The whole exercise was four tool calls.

## Then

Record what the reading taught with `write_the_lesson`.
