---
name: improve-harness
description: When a harness_review entry reaches your inbox, read the signals, propose one candidate change to your own harness from your own records, and request an evaluation. You never adopt your own change.
---

# Improve your harness

A `harness_review` entry means your campaigns taught something the platform computed — not something you remember.
Your harness (charter, rules, skills) is content in your own repository; it grows only through a candidate that a
platform-run evaluation measured and a steward adopted.

## 1. Read the signals
1. `get_persona_harness_signals` — read the window it covers (`campaignsJudged`, `roundsJudged`), the overturn rate
   and every signal with its denominator. Read the `unknown` list first: a source that could not be read is not a
   zero.
2. `get_persona_code` — which commit your running version pins, and how many commits your default branch holds beyond it.
3. `list_knowledge_entries` — your own recorded findings and lessons about the same behaviour.

## 2. Propose one candidate
- Change one thing the signals point at, and be able to name the record that motivates it (a campaign, a round, an
  overturned judgment, a knowledge entry). A change you cannot trace to a record is a guess.
- Make the change as a commit on a branch of your own repository — never on the default branch. The platform mints a
  candidate engine version from that commit.
- Do not touch authority, permissions or runtime settings: a harness is behaviour. A tree that carries them is refused.

## 3. Request the evaluation
1. `evaluate_persona` for the candidate's engine version on the harness evaluation dataset.
2. `get_persona_evaluation` until it answers `sealed` with a scorecard, or `unknown` / `failed`. An evaluation that did
   not seal is no evidence; say so, never summarise it as a pass.
3. Record what you proposed, the record that motivated it and the scorecard id in a knowledge entry (`record` skill),
   and put both in front of your steward.

## Do not
- Adopt, publish or merge your own candidate: a steward adopts, and only a merge of the measured bytes counts.
- Call a candidate better because the evaluation ran. Report what it measured.
- Change more than one thing per candidate, so the scorecard can be read as an answer.
