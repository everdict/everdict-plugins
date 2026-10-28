// Local, language-agnostic ranking of open issues against a prompt (DEFAUL-530). Hangul runs → character
// bigrams; Latin/digit runs of 3+ → whole lowercase tokens. A stop-list drops function bigrams and words.
// Score = |P ∩ T| / √|T|. The top matches are then expanded to their open parent's family.
// ⚠️ Hangul is written as \u escapes — the repository's own prose and source stay ASCII.

// Hangul is spelled as hex code points: a formatter rewrites \u escapes into literals, and this repository's
// source stays English (the language policy).
export const ko = (hex) => String.fromCodePoint(...hex.split(" ").map((h) => Number.parseInt(h, 16)));
const HANGUL_RUN = new RegExp(`[${ko("ac00")}-${ko("d7a3")}]+`, "g");

const KOREAN_FUNCTION_BIGRAMS = [
  "d558 b294",
  "c788 b294",
  "d55c b2e4",
  "c785 b2c8",
  "b2c8 b2e4",
  "c5d0 c11c",
  "c73c b85c",
  "d558 ac8c",
  "d574 c11c",
  "d558 c138",
  "c8fc c138",
  "c138 c694",
  "d558 ace0",
  "d574 c918",
  "d574 c8fc",
];

const STOP = new Set([
  ...KOREAN_FUNCTION_BIGRAMS.map(ko),
  // English
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "you",
  "are",
  "not",
  "please",
  "can",
  "how",
]);

export const tokens = (text) => {
  const out = new Set();
  for (const run of String(text).match(HANGUL_RUN) ?? [])
    for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2));
  for (const run of String(text)
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [])
    if (run.length >= 3) out.add(run);
  for (const stop of STOP) out.delete(stop);
  return out;
};

export const MIN_SHARED = 2;
export const MIN_SCORE = 0.5;

// → [{issue, score}] best first; only issues that clear the threshold.
export const rank = (promptText, issues) => {
  const p = tokens(promptText);
  if (p.size === 0) return [];
  return issues
    .flatMap((issue) => {
      const t = tokens(issue.title);
      if (t.size === 0) return [];
      let shared = 0;
      for (const token of t) if (p.has(token)) shared++;
      const score = shared / Math.sqrt(t.size);
      return shared >= MIN_SHARED && score >= MIN_SCORE ? [{ issue, score }] : [];
    })
    .sort((a, b) => b.score - a.score || a.issue.identifier.localeCompare(b.issue.identifier));
};

// Group the top `top` matches under their open parent (when present). Each family: {root, children, matched:Set(id)}.
export const families = (ranked, open, { top = 3, maxChildren = 6 } = {}) => {
  const byId = new Map(open.map((i) => [i.id, i]));
  const out = new Map();
  for (const { issue } of ranked.slice(0, top)) {
    const root = issue.parentId !== undefined && byId.has(issue.parentId) ? byId.get(issue.parentId) : issue;
    if (!out.has(root.id)) out.set(root.id, { root, matched: new Set() });
    out.get(root.id).matched.add(issue.id);
  }
  return [...out.values()].map(({ root, matched }) => {
    const kids = open.filter((i) => i.parentId === root.id);
    kids.sort((a, b) => Number(matched.has(b.id)) - Number(matched.has(a.id)) || a.number - b.number);
    return { root, matched, children: kids.slice(0, maxChildren) };
  });
};
