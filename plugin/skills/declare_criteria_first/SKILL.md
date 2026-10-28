---
name: declare_criteria_first
description: >-
  Use at the start of any change, or when a request bundles several things and 'done' is unclear.
  Freeze acceptance criteria before touching anything: one per thing asked, each naming its
  instrument and baseline.
---
<!-- generated from everdict methodology seed: id=declare-criteria-first version=1.0.0 digest=sha256:e07a7e2f9a183bd9208ae4713632ed4a30cffc0a03438192df14f4f958b04155 — do not edit; run node scripts/generate-plugin-seed-skills.mjs -->

# Declare the criteria before the work

Write down what would make this change acceptable BEFORE you change anything, and freeze the list. A
criterion written afterwards describes the outcome instead of judging it — it can only agree with
what you did.

## The procedure

1. **Read the request until you can say what it asked for, in a count.** If it asked for five things,
   that is five criteria, one each. A criterion spanning several requests can only be answered
   all-or-nothing, so the parts that did ship disappear into its single `not_met`.
2. **Split anything bundled into sub-requests first**, then give each one its own criterion. "Five
   were asked, two shipped" should be a count somebody reads off the record, not a sentence in a
   report.
3. **Say what each criterion JUDGES.** A *requirement* criterion answers one thing the request asked
   for. A *quality* criterion judges the change itself — gates, regressions, counterexamples seen
   red — and is never counted as a requirement.
4. **Establish the baseline of every check a criterion names.** Run it on the tree you are about to
   change. Green → "exits 0" is fair. Already red → the criterion names the baseline ("no new
   problems beyond the 2 at `<revision>`"), and the red check gets its own request, because a check
   nobody can declare against has stopped working.
5. **Open the campaign with the list.** From here it is immutable: you answer it, you do not edit it.
6. **Answer every criterion when you log the round** — `met`, `not_met` or `not_run`, each marked
   `observed` (a command ran; name it and cite its numbers) or `asserted` (you read the code and
   concluded). Anything other than `met` carries the reason, because "why not" is the half a reader
   acts on.

## Three rules that decide whether the list is worth anything

**Never declare what you cannot count.** A criterion promising a number you have no instrument for
cannot be answered honestly, and the only ways out are to lie or to quietly drop it. Both are worse
than a weaker criterion. If you want to count it, build the instrument first — and then counting IS
the work.

**Make at least one criterion refuse something.** "The feature works" is satisfied by the happy path.
"The door refuses a request with no proof, and the refusal reaches the reader" is a criterion the
work can actually fail. The second kind finds defects; the first kind records opinions.

**A check's NUMBERS are part of the claim, not just its exit code.** "Tests pass" over a suite where
a third are skipped is a much weaker statement than it reads as. Record passed AND skipped, files
scanned, rows examined — the exit code alone hides the corpus.

## Where this came from

A campaign declared five checks green; four came back with numbers and the fifth exited non-zero on
work the change never touched, because nobody ran it first. The round was correctly rejected for a
reason that was true about the repository and false about the work. Running the check first costs one
command; not running it costs a rejected round plus a standing temptation to launder the failure.

A separate campaign declared it would count something the data could not be counted by. The platform
refused the retraction, which was the right outcome: the mistake was declaring an uncountable
criterion, and the repair is a better instrument, not a quieter promise.

A third declared that a refusal had to be seen on the screen. That one criterion rejected a round and
surfaced two defects nobody had gone looking for.

## Then

Do the work with `counterexample_first`; when it is done, close the loop with `write_the_lesson`.
Load `references/criterion-checklist.md` at the moment you write the list.
