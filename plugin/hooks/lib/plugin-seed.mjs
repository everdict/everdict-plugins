// THE PLUGIN'S OWN BUNDLED METHODOLOGY, READ FROM WHAT IT SHIPPED — NEVER A HAND LIST (DEFAUL-271).
//
// `scripts/generate-plugin-seed-skills.mjs` writes `plugin/skills/<name>/SKILL.md` for every methodology
// seed skill, each carrying a generated-marker line naming its seed `id`, `version` and `digest`. A hook
// cannot import `@everdict/application-control`'s `methodologySeedSkills()` — that is a TypeScript package
// built by this monorepo, and a plugin install carries no `packages/` — so this is the one place a hook
// reads "which ids are the plugin's own seed" back out of the bytes the generator already committed. Two
// readers of `methodologySeedSkills()` (the generator and this file) would be the predicate written twice
// rule `protocol` L3 refuses; reading the SAME generated marker the check-plugin-seed-skills gate already
// verifies matches the seed is the one spelling.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_SKILLS_DIR = path.resolve(import.meta.dirname, "..", "..", "skills");

const MARKER = /<!--\s*generated from everdict methodology seed:\s*id=(\S+)\s+version=(\S+)\s+digest=(\S+)\s+—/;

// `{ id, name, version, digest, path }[]` — one entry per `plugin/skills/<name>/SKILL.md` carrying the
// generated marker. Silent about anything that is not marked generated (hand-written skills, a stray dir).
export function bundledSeedSkills(skillsDir = DEFAULT_SKILLS_DIR) {
  if (!existsSync(skillsDir)) return [];
  const out = [];
  for (const name of readdirSync(skillsDir).sort()) {
    const file = path.join(skillsDir, name, "SKILL.md");
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const m = MARKER.exec(text);
    if (!m) continue;
    out.push({ id: m[1], name, version: m[2], digest: m[3], path: file });
  }
  return out;
}
