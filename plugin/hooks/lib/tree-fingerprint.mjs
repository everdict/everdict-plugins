// ONE answer to "is this the tree it was", shared by every hook that asks (DEFAUL-205). The first-change guard
// compares a call's before and after; SessionStart records the tree the session FOUND; the Stop guard compares
// the tree it leaves with that baseline. Written twice, the two predicates would drift, and then "the session
// changed code" would mean one thing at the first change and another at the end.
//
// The `digest` is the tracked diff's bytes + each untracked file's size and mtime. Content-exact for tracked
// files, metadata-exact for untracked ones — enough to tell "something was written" from "nothing was". HEAD
// is carried beside it as `head` but is NOT in the digest (DEFAUL-293): following the remote —
// `git pull --ff-only`, `reset --hard origin/x` — moves HEAD and writes nothing the session authored, so
// whether a HEAD move is a change is `treeChanged`'s question, asked of the commits it brought in.
// `undefined` means it could not be measured (no git, no HEAD yet, a timeout), and every caller reads that
// as unknown.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Content hashes, not a digest of the whole tree, and only when the two are compared. The link-first guard
// needs the finer answer `treeFingerprint` cannot give: not just "did something change" but WHICH path —
// because its one exception is a single path, `.everdict/workspace`.

// PLUGIN-OWNED METADATA IS NEVER "the session changed the repository" (DEFAUL-269 round 2). Measured live:
// SessionStart writes `.everdict/workspace` to LINK a checkout, and it does so after `recordBaseline` runs —
// so the Stop guard, comparing the tree it leaves against that baseline, read the plugin's own write as the
// session's change and refused a read-only session for "changed code, recorded nothing" in the one case that
// should be the quietest: a checkout linking itself for the first time. `.everdict/**` is excluded from both
// functions below, tracked and untracked alike, so linking — or opting out — is never itself a change.
const PLUGIN_OWNED = /^\.everdict(\/|$)/;
const EXCLUDE_PLUGIN_OWNED = ["--", ".", ":!.everdict"];

const gitIn = (root, args) => {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
};

export const treeFingerprint = (root) => {
  const head = gitIn(root, ["rev-parse", "HEAD"])?.trim() ?? "no-head";
  const diff = gitIn(root, ["diff", "HEAD", "--binary", ...EXCLUDE_PLUGIN_OWNED]);
  const untracked = gitIn(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  if (diff === undefined || untracked === undefined) return undefined;
  const hash = createHash("sha256").update(diff).update("\0");
  for (const file of untracked
    .split("\0")
    .filter(Boolean)
    .filter((f) => !PLUGIN_OWNED.test(f))) {
    try {
      const st = statSync(path.join(root, file));
      hash.update(`${file}:${st.size}:${st.mtimeMs}\n`);
    } catch {
      hash.update(`${file}:gone\n`);
    }
  }
  return { head, digest: hash.digest("hex") };
};

// The reflog subjects that AUTHOR a commit. A fast-forward (`merge x: Fast-forward`, `pull …: Fast-forward`)
// and a rebase's bookends bring commits in without writing one.
const AUTHORING = /^(commit|merge|rebase|cherry-pick|revert|am)\b/;
const NOT_AUTHORING = /^rebase \((start|finish)\)|: Fast-forward$/;
const REFLOG_WINDOW = 200;

// Did the session change the tree between two `treeFingerprint`s? The digests differ → yes. HEAD moved with
// the working tree alike → only if the move brought in something the session AUTHORED: (a) a commit no
// remote-tracking ref has, or (b) — closing `git commit && git push` in one call, where the push has already
// made the commit reachable from a remote — a new commit HEAD's reflog records as authored. Anything git
// cannot answer is "no": unknown allows, as everywhere else in this module.
export const treeChanged = (root, before, after) => {
  if (!before || !after) return false;
  if (before.digest !== after.digest) return true;
  if (before.head === after.head) return false;
  const local = gitIn(root, ["rev-list", after.head, "--not", before.head, "--remotes"]);
  if (local === undefined) return false;
  if (local.trim() !== "") return true;
  const brought = gitIn(root, ["rev-list", after.head, "--not", before.head]);
  const reflog = gitIn(root, ["reflog", "--format=%H %gs", "-n", String(REFLOG_WINDOW)]);
  if (brought === undefined || reflog === undefined) return false;
  const shas = new Set(brought.split("\n").filter(Boolean));
  return reflog
    .split("\n")
    .filter(Boolean)
    .some((line) => {
      const space = line.indexOf(" ");
      const subject = line.slice(space + 1);
      return shas.has(line.slice(0, space)) && AUTHORING.test(subject) && !NOT_AUTHORING.test(subject);
    });
};

// Every path that is dirty right now (tracked-modified ∪ untracked), each mapped to a content hash — `HEAD`
// is deliberately not part of this one: the link-first guard's exception is about a WORKING-TREE write, not
// about moving HEAD.
//
// `.everdict/**` is excluded here too (see above) — round 2's consequence for the link-first gate is that a
// Bash call whose ONLY change is `.everdict/workspace` now produces an EMPTY snapshot diff, same as a call
// that changed nothing at all: the gate no longer needs to name that one path specially, only ask "is the
// diff empty".
export const dirtySnapshot = (root) => {
  const tracked = gitIn(root, ["diff", "HEAD", "--name-only"]);
  const untracked = gitIn(root, ["ls-files", "--others", "--exclude-standard"]);
  if (tracked === undefined || untracked === undefined) return undefined;
  const paths = new Set(
    [...tracked.split("\n"), ...untracked.split("\n")]
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !PLUGIN_OWNED.test(p)),
  );
  const snapshot = {};
  for (const file of paths) {
    try {
      snapshot[file] = createHash("sha256")
        .update(readFileSync(path.join(root, file)))
        .digest("hex");
    } catch {
      snapshot[file] = "gone";
    }
  }
  return snapshot;
};

// Which paths differ between two `dirtySnapshot`s — appeared, disappeared, or changed content. Order is not
// meaningful; callers that need "is the change SMALLER than this" check the returned list's membership.
export const changedPaths = (before, after) => {
  const paths = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changed = [];
  for (const p of paths) if (before?.[p] !== after?.[p]) changed.push(p);
  return changed;
};

// The baseline lives OUTSIDE the repository, keyed by session: a hook must never change the thing it measures.
const baselineFile = (session) =>
  path.join(os.tmpdir(), "everdict-session-baseline", `${String(session).replace(/[^A-Za-z0-9_-]/g, "_")}.json`);

// v2: the digest no longer covers HEAD (DEFAUL-293). An unversioned baseline hashed HEAD in, so comparing it
// with a v2 digest would call every session changed — `readBaseline` ignores it instead.
const BASELINE_VERSION = 2;

export const recordBaseline = (session, root) => {
  if (!session || !root) return;
  const found = treeFingerprint(root);
  if (!found) return;
  try {
    const file = baselineFile(session);
    mkdirSync(path.dirname(file), { recursive: true });
    // `startup` and `resume`/`compact` all fire SessionStart; only the FIRST one is the tree the session found.
    if (existsSync(file)) return;
    writeFileSync(file, JSON.stringify({ v: BASELINE_VERSION, root, ...found, at: new Date().toISOString() }));
  } catch {
    // No baseline means the Stop guard falls back to reading the tree as it is — never more permissive.
  }
};

export const readBaseline = (session, root) => {
  if (!session || !root) return undefined;
  try {
    const baseline = JSON.parse(readFileSync(baselineFile(session), "utf8"));
    return baseline.v === BASELINE_VERSION && baseline.root === root && typeof baseline.digest === "string"
      ? baseline
      : undefined;
  } catch {
    return undefined;
  }
};
