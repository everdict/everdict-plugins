// The Everdict contract — the ONE place its lines are written. SessionStart and the prompt hook's closing line
// render from here. It reaches a session only through the plugin; nothing renders it into a repository.

export const contractLines = ({ workspace, repository, issueHint } = {}) => [
  "## Contract",
  `- Everdict (workspace **${workspace ?? "<workspace>"}**${repository ? `, repository ${repository}` : ""}) is the system of record. Read the open issue before you act${issueHint ? ` (branch names ${issueHint})` : ""}: \`everdict-api get_task_context --body '{"refs":[{"type":"repository","key":"${repository ?? "<owner>/<name>"}"}]}'\`.`,
  "- Changes go issue → campaign (`/everdict:campaign`) → round, delegated by default (`/everdict:delegate`); the first code change is refused until a campaign is named.",
  "- Claude's auto-memory may name Everdict issues; it is a pointer, never the state — read the issue before acting on it.",
  "- Record before you stop (`/everdict:record`). Door `everdict-api` only, no raw HTTP.",
];

// The prompt hook's closing line: the next read, named by the same door the contract names.
export const nextReadLine = (identifier) =>
  `Read next: \`everdict-api get_issue --id ${identifier}\` — before acting on any of the above.`;
