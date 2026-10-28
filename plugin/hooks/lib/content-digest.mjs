// A BYTE-FOR-BYTE MIRROR OF THE SERVER'S DIGEST, NOT AN IMPORT OF IT (DEFAUL-271).
//
// `packages/domain/src/platform/provenance/content-digest.ts` (`contentDigest`) and
// `packages/domain/src/eval/harness/harness-seeds.ts` (`skillSeedDigest`) are the canonical algorithm — sha256
// over key-sorted, undefined-stripped JSON, with a skill's `files` sorted by path first. A plugin hook
// cannot depend on `@everdict/domain`: that package is built by this monorepo, and a bare plugin install
// carries no `packages/`. So the digest a session writes to `~/.everdict/skills/**` must be produced by an
// algorithm copied here rather than imported — and it must stay IDENTICAL to the server's, because the
// whole point of "digest-pinned" is that a workspace and the session it hands a skill to agree on what the
// bytes were. `scripts/check-plugin-hooks.mjs` cross-checks this copy against the real `skillSeedDigest`
// (built, resolved by path) so the two cannot drift silently.
import { createHash } from "node:crypto";

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentDigest(value) {
  return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`;
}

export function skillSeedDigest({ instructions, files }) {
  return contentDigest({
    instructions,
    files: [...(files ?? [])]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => ({ path: f.path, content: f.content })),
  });
}
