// WHICH FILES CARRY THIS SESSION'S HISTORY — the main transcript and every subagent it spawned. Extracted out
// of `session-campaigns.mjs` (DEFAUL-265) so a second scanner asking the same question — did THIS session do X
// anywhere it could have, including a local subagent's own transcript — reads the same files rather than
// re-deriving the harness's transcript layout a second time and drifting from it.
//
// `<dir>/<session_id>.jsonl` is the main transcript; `<dir>/<session_id>/subagents/agent-*.jsonl` is a
// subagent's own. The harness does not document which shape a subagent's hook call receives its own
// `transcript_path` as, so both are accepted rather than assumed.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const deriveContext = (transcriptPath, sessionId) => {
  if (!transcriptPath) return undefined;
  if (path.basename(transcriptPath) === `${sessionId}.jsonl`) {
    return { dir: path.dirname(transcriptPath), main: transcriptPath };
  }
  const subagentsDir = path.dirname(transcriptPath);
  const sessionDir = path.dirname(subagentsDir);
  if (path.basename(subagentsDir) === "subagents" && path.basename(sessionDir) === sessionId) {
    const dir = path.dirname(sessionDir);
    return { dir, main: path.join(dir, `${sessionId}.jsonl`) };
  }
  return { dir: path.dirname(transcriptPath), main: transcriptPath };
};

// Every file that could carry this session's history: its own main transcript, then every
// `<session_id>/subagents/*.jsonl` found beside it. An unrecognised shape falls back to treating the given
// path as the main transcript on its own directory, which can only under-scan (fewer subagent files found),
// never mistake one session's records for another's.
export const sessionTranscriptFiles = ({ transcriptPath, sessionId }) => {
  if (!sessionId) return [];
  const context = deriveContext(transcriptPath, sessionId);
  if (!context) return [];
  const files = context.main ? [context.main] : [];
  const subagentsDir = path.join(context.dir, sessionId, "subagents");
  let subs = [];
  try {
    subs = existsSync(subagentsDir) ? readdirSync(subagentsDir).filter((f) => f.endsWith(".jsonl")) : [];
  } catch {
    subs = [];
  }
  return [...files, ...subs.map((f) => path.join(subagentsDir, f))];
};
