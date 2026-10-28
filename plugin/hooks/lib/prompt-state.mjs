// What the prompt hook has shown this session — read by the read-first gate and the Stop question.
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const promptStatePath = (session, home = os.homedir()) =>
  path.join(home, ".everdict", "sessions", session, "prompt-context.json");

// → {injected: [identifier], ids: [record id], ownReceipts: [receipt id of the hook's own door calls]} — empty when nothing was shown or the file is unreadable.
export const readPromptState = (session, home) => {
  try {
    const parsed = JSON.parse(readFileSync(promptStatePath(session, home), "utf8"));
    return {
      injected: Array.isArray(parsed.injected) ? parsed.injected : [],
      ids: Array.isArray(parsed.ids) ? parsed.ids : [],
      ownReceipts: Array.isArray(parsed.ownReceipts) ? parsed.ownReceipts : [],
    };
  } catch {
    return { injected: [], ids: [], ownReceipts: [] };
  }
};
