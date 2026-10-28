// THE STORE FIRST, THE PLUGIN'S SEED AS FALLBACK (DEFAUL-271, part 3) ─────────────────────────────────
//
// A workspace's adopted methodology never reached its sessions, and the plugin carried none of the seed as
// a fallback. This is the one place both halves are decided: ask the workspace's own skill library for
// what it adopted from the seed (`GET /skills`, filtered to a `origin.forkedFrom` naming one of the
// bundled seed ids — `lib/plugin-seed.mjs` reads which ids those are from what the plugin actually
// shipped, never a hand list); when that cannot be answered — no credential, nothing adopted, or the call
// itself failed — the plugin's own bundled seed is what a session is told to use instead.
//
// UNKNOWN IS UNIGNORABLE (rule `protocol` L2): "no credential" (`absent`) and "asked, and the workspace
// answered nothing" (`read`, zero skills) and "asked, and could not find out" (`unknown`, with why) are
// three different facts, and only the last one is a failure worth naming as one. All three fall back to
// the plugin's bundled seed — the fallback is the same; the REASON is not the same sentence.
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { skillSeedDigest } from "./content-digest.mjs";

const SKILLS_TIMEOUT_MS = 4_000;

const apiBaseOf = (apiUrl) =>
  String(apiUrl ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/mcp$/, "");

const fetchJson = async (url, { key, workspace, timeoutMs = SKILLS_TIMEOUT_MS }) => {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, "x-everdict-workspace": workspace },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { kind: "unknown", why: `HTTP ${res.status}` };
    return { kind: "read", value: await res.json() };
  } catch (err) {
    return { kind: "unknown", why: err instanceof Error ? err.name : "unreachable" };
  }
};

// The plugin's bundled seed, as the fallback answer — `{name, version, digest}` per skill, the same shape
// an adopted skill reports, so a reader of the ledger cannot tell "store" and "plugin" apart by shape, only
// by the `source` field naming which one it is.
const pluginFallback = (bundled, lookup, why) => ({
  source: "plugin",
  lookup,
  ...(why !== undefined ? { why } : {}),
  skills: bundled.map((b) => ({ name: b.name, version: b.version, digest: b.digest })),
});

const writeSkillToDisk = (workspace, skill) => {
  const dir = path.join(os.homedir(), ".everdict", "skills", workspace, skill.name);
  try {
    mkdirSync(dir, { recursive: true });
    const header = [
      "---",
      `name: ${skill.name}`,
      `description: ${skill.description ?? ""}`,
      "---",
      `<!-- everdict store skill: workspace=${workspace} id=${skill.id} version=${skill.version} digest=${skill.digest} -->`,
      "",
    ].join("\n");
    writeFileSync(path.join(dir, "SKILL.md"), `${header}\n${skill.instructions}\n`);
    for (const file of skill.files ?? []) {
      const target = path.join(dir, file.path);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }
    return path.join(dir, "SKILL.md");
  } catch {
    // Best-effort, same as every other filesystem write a hook makes: the session still learns WHAT was
    // adopted from the block and the ledger even if this machine could not write the copy.
    return path.join(dir, "SKILL.md");
  }
};

// `credentials` is `readCredentials()`'s own three-valued result — passed in rather than re-read, for the
// same reason `linkFromProducts` takes it as a parameter: a caller that already read the registry for
// another reason must not read it twice (rule `protocol` L3).
export async function resolveMethodology({ workspace, credentials, bundled }) {
  if (credentials?.kind === "unreadable") return pluginFallback(bundled, "unknown", credentials.why);
  if (credentials?.kind !== "read") return pluginFallback(bundled, "absent");

  const credential = credentials.workspaces?.[workspace];
  const apiUrl = typeof credential?.apiUrl === "string" ? credential.apiUrl : undefined;
  const key = typeof credential?.key === "string" ? credential.key : undefined;
  if (!apiUrl || !key) return pluginFallback(bundled, "absent");

  const base = apiBaseOf(apiUrl);
  const list = await fetchJson(`${base}/skills`, { key, workspace });
  if (list.kind !== "read") return pluginFallback(bundled, "unknown", list.why);

  const bundledIds = new Set(bundled.map((b) => b.id));
  const bundledNames = new Set(bundled.map((b) => b.name));
  const candidates = (Array.isArray(list.value) ? list.value : []).filter((s) =>
    bundledIds.has(s?.origin?.forkedFrom?.id),
  );
  if (candidates.length === 0) return pluginFallback(bundled, "read");

  const skills = [];
  for (const candidate of candidates) {
    // The list row already carries `instructions`/`files` (the store's own SELECT is not summarized), but
    // only the single-skill read re-hydrates from the workspace filesystem when it differs from the DB row
    // — so the detail call is what a session actually gets, and the list item is only the degrade path.
    const detail = await fetchJson(`${base}/skills/${encodeURIComponent(candidate.id)}`, { key, workspace });
    const full = detail.kind === "read" ? detail.value : candidate;
    const digest = skillSeedDigest({ instructions: full.instructions, files: full.files ?? [] });
    const writtenPath = writeSkillToDisk(workspace, { ...full, digest });
    skills.push({
      name: full.name,
      version: full.version,
      digest,
      path: writtenPath,
      overridesBundled: bundledNames.has(full.name),
    });
  }
  return { source: "store", lookup: "read", skills };
}

// The block a session reads, and the block ALONE decides nothing about the ledger row — both are built
// from the same `resolveMethodology` result so they cannot disagree about which skills were in effect.
export function methodologyContextLines(result) {
  const lines = ["## This workspace's methodology", ""];
  if (result.source === "store") {
    for (const skill of result.skills) {
      const overrides = skill.overridesBundled ? ` — overrides the plugin's bundled \`${skill.name}\`` : "";
      lines.push(`- **${skill.name}** v${skill.version} \`${skill.digest}\` — ${skill.path}${overrides}`);
    }
  } else {
    const why =
      result.lookup === "unknown"
        ? ` (the workspace's skill library could not be reached: ${result.why})`
        : result.lookup === "absent"
          ? " (no credential for this workspace)"
          : " (nothing adopted)";
    lines.push(
      `No adopted methodology${why} — the plugin's bundled seed applies: ${result.skills.map((s) => `\`${s.name}\``).join(", ")}.`,
    );
  }
  lines.push("", "Read `file_the_request` and `declare_criteria_first` before filing or opening anything.");
  return lines;
}

// `{source, skills:[{name,digest}], lookup}` — exactly what the ledger row carries, stripped of the
// path/version/why noise the human-readable block needs and the meter does not.
export function methodologyLedgerField(result) {
  return {
    source: result.source,
    skills: result.skills.map((s) => ({ name: s.name, digest: s.digest })),
    lookup: result.lookup,
  };
}
