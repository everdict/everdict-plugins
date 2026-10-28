# Request template

Copy the frame into the issue description. Fill every section; leave nothing as a placeholder you never
replaced — an unfilled line is itself a finding, not an oversight to fix later.

## Brief (the `brief` field, written for the owner in plain language)

- **Summary:** one line — what this is
- **Why:** why it is being done
- **What changes:** what changes for the owner or the user, not for the code
- **Risk:** low | medium | high — AND the reason; a level with no ground is refused
- **Reversible:** yes or no, and how it is undone
- **What I decided, and why:** the call you made, so the owner reads a decision rather than a question

## Quote

> the owner's own words, verbatim, exactly as they asked (also sent as `requestSource: {kind: "owner", words}`)

## Measured before filing

- **Population:** what you counted (files, call sites, users, requests, rows — name the set)
- **Count:** the number, and where it came from (a query, a search command, a directory you read by hand)
- **First reading:** the count you started with, if it was wrong — left here rather than deleted
- **Corrected reading:** the number that actually held, and what changed between the two

## Split

One line per sub-issue this request became, each carrying its own identifier once filed:

- [ ] <thing asked for #1> — issue <id>
- [ ] <thing asked for #2> — issue <id>

## Done when

Checkable statements only — each one a stranger could run and answer yes or no. Never a direction
("improve X", "make Y better").

- [ ] <statement #1>
- [ ] <statement #2>

## Design

- [ ] a spec document written, at path: `___`
- [ ] OR declined, because: `___`

## Before filing

- [ ] The quote is the owner's words, not a paraphrase.
- [ ] The count was measured, not guessed — and a wrong first reading is left visible if there was one.
- [ ] Every bundled ask has its own sub-issue.
- [ ] Every Done-when line is checkable by someone who has never seen this request.
- [ ] The design step is done — a spec's path, or a declined reason — before any change campaign opens.