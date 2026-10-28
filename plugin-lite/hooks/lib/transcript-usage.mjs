#!/usr/bin/env node
// ── WHAT THIS SESSION SPENT SINCE ITS LAST ROUND, READ FROM ITS OWN TRANSCRIPT (DEFAUL-251) ──────────────
//
// An interactive session cannot see its dollars, and so every round it logged declared `cost_unknown` — which
// kept replay bar D at 0/n for good. It CAN see its tokens: Claude Code's transcript records `message.usage` on
// every assistant turn, with the model that spent them. This turns that into the `usage` a round takes; the
// server prices it through its one table (never this file — a price table spelled twice has already diverged).
//
//   · "Since its last round": turns AFTER the last assistant message that ran `everdict-api log_change_round`. The turn
//     that made that call belongs to the round it logged.
//   · One assistant message is written as several lines (one per content block), each repeating the SAME usage,
//     so turns are counted once per `message.id`.
//   · Sidechain turns (a subagent's) are not in this file's main thread; they are left out, and the helper says
//     nothing about them rather than guessing.
//   · `inputTokens` is Anthropic's `input_tokens` — the UNCACHED input — with cache reads and writes separate.
//
// Also runnable: `node transcript-usage.mjs <transcript.jsonl>` prints the `usage` JSON.

// The call that logged a round is a Bash `tool_use` running the REST door (DEFAUL-296) — the MCP `tool_use` this
// used to look for no longer exists. It reads the COMMAND, not a receipt: the receipt is a later `tool_result`,
// and this asks which ASSISTANT turn made the call. The two spellings are the op name and `raw POST …/rounds`.
const ROUND_COMMAND = /everdict-api\s+(?:log_change_round\b|raw\s+POST\s+\S*\/change-campaigns\/[^/\s]+\/rounds\b)/;
const isLogRound = (block) =>
  block?.type === "tool_use" && block.name === "Bash" && ROUND_COMMAND.test(String(block.input?.command ?? ""));

// `lines`: the transcript's JSONL lines. Returns `[]` when nothing was spent since the last round, and
// `undefined` when the text holds no readable assistant turn at all — unknown, not zero.
export function usageSinceLastRound(lines) {
  const turns = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // a torn last line while the file is being written
    }
    if (entry?.type !== "assistant" || entry.isSidechain === true) continue;
    const message = entry.message;
    if (!message || typeof message.id !== "string") continue;
    turns.push(message);
  }
  if (turns.length === 0) return undefined;

  let start = 0;
  turns.forEach((message, i) => {
    if (Array.isArray(message.content) && message.content.some(isLogRound)) start = i + 1;
  });
  // The call's own message can span several lines; skip every line of it, not only the one holding the call.
  const closing = start > 0 ? turns[start - 1].id : undefined;

  const seen = new Set();
  const byModel = new Map();
  for (const message of turns.slice(start)) {
    if (message.id === closing || seen.has(message.id)) continue;
    seen.add(message.id);
    const u = message.usage;
    if (!u || typeof message.model !== "string" || message.model.startsWith("<")) continue; // `<synthetic>` turns
    const acc = byModel.get(message.model) ?? {
      model: message.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    acc.inputTokens += u.input_tokens ?? 0;
    acc.outputTokens += u.output_tokens ?? 0;
    acc.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    acc.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
    byModel.set(message.model, acc);
  }
  return [...byModel.values()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import("node:fs");
  const path = process.argv[2];
  if (!path) {
    console.error("usage: transcript-usage.mjs <transcript.jsonl>");
    process.exit(2);
  }
  const usage = usageSinceLastRound(readFileSync(path, "utf8").split("\n"));
  if (usage === undefined) {
    console.error("no assistant turn could be read from that transcript");
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(usage)}\n`);
}
