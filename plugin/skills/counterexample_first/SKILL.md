---
name: counterexample_first
description: >-
  Use for any bug fix, new guard or validation, or a green suite you doubt. See the counterexample
  RED for the stated reason before fixing; neutralize each fix clause and count which assertions
  fall.
---
<!-- generated from everdict methodology seed: id=counterexample-first version=1.0.0 digest=sha256:adb4af1b8c1e97ec51f2b9f73910f1119ea48a8d60a49ec029825b496373eb17 — do not edit; run node scripts/generate-plugin-seed-skills.mjs -->

# See it red first, and neutralize every fix

A test that has never failed is a claim about the code, not a check on it. Before a fix, watch the
counterexample fail. After the fix, put the defect back and watch it fail again — clause by clause.

## The procedure

1. **Write the counterexample against the UNFIXED code and run it.** It must be RED.
2. **Read the failure message.** It has to name the invariant that was violated. "Expected 2, got 1"
   passes on the wrong code as easily as the right code; "the roster kept a member the tenant does
   not own" tells the next reader what broke. If the message does not name the law, the test is
   pointed at a symptom.
3. **Rule out the other reason for red.** Red means one of two things: the rule is missing, or you
   asked at the wrong layer. Not excluding the second is how people "fix" defects that were never
   there — the rule existed one level up, the probe could not see it, and the repair introduces the
   real defect.
4. **Make the change.** Green.
5. **Neutralize it and re-run.** Put the wrong behaviour back and confirm the suite goes red for the
   stated reason. This is a different guarantee from step 1: red-first proves the test catches the
   OLD defect; neutralization proves it still catches a RE-INTRODUCED one. Tests go vacuous later,
   and vacuous is invisible in green.
6. **Delete the escape hatch in the same change.** A fix that leaves the old path reachable has moved
   the defect, not removed it.

## Neutralize per CLAUSE, never the whole guard

`if (a && b && c) refuse()` is three claims. Removing the whole condition goes red on the strongest
clause alone and tells you nothing about the other two. Remove them one at a time and count the
assertions that fall:

    whole guard removed      1 assertion fell
    first clause removed     0 assertions fell   ← VACUOUS: nothing tests it
    second clause removed    1
    third clause removed     3

A measured instance had a comment two lines above, from an earlier sweep, already saying one clause
in that predicate had been a vacuous certificate — and the sweep missed its sibling in the same
expression. When you fix one clause, measure its siblings.

## Four ways a neutralization lies to you

- **No green baseline.** Neutralizing on top of a stale build or an already-red suite measures
  anything at all rather than your change. Confirm green first.
- **A no-op mutation.** If the neutralized code behaves identically, the run reads exactly like a
  mutation that was caught. Assert the target actually moved before trusting the red.
- **Absence that produces the same answer.** When removing a guard yields the same output — a
  resolver rejects the input anyway and both paths fall to one default — the answer cannot see the
  guard. Watch the SIDE EFFECT instead: was the collaborator called? A spy double catches what an
  assertion on the return value cannot.
- **A non-unique anchor.** If the neutralization is applied by string substitution and the target
  text appears twice, it edits one site and reads exactly like one that edited them all.

## Confirming probes cannot tell you which clause did the work

A probe that breaks something and watches a counter rise is *confirming*: it proves the code does
something. It cannot say which rule did it, and it would have passed against a rule you already
rejected as wrong.

A *discriminating* probe has two arms differing in ONE variable, with opposite expected outcomes:

    clone identical in every keyed field          → ACCUSED
    clone identical except one keyed field        → NOT accused
    restore                                       → exit 0, bytes identical

Both arms must come out as predicted. A probe that cannot come out the other way is exactly the probe
that can be inert without anyone noticing.

## Where this came from

A review lane that every change in a chain depended on was certified by a neutralization pointed at
the wrong call site: two entries named the same substitution, both hit the first site, and the second
site — the one the lane actually runs — had never been neutralized by anything. It went red on the
first real assertion once re-aimed.

Another test was named for the property it was supposed to prove ("widens the tree") while asserting
there was exactly one child. It had never been red, and the behaviour it named had never worked.

A counterweight written to prove a guard was load-bearing stayed green with the guard removed — every
arm fell to the same fallback — and only a mutation exposed it. Three vacuous counterweights were
caught in a single session, all three by mutation and none by reading.

## Then

Before designing the fix, size it with `count_the_population`. Before believing a check that passed,
read `empty_corpus_is_not_a_pass`. Load `references/neutralization-checklist.md` at step 5.
