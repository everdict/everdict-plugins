// ONE resolver, reaching worktrees (DEFAUL-261) and now the whole link lifecycle (DEFAUL-269, DEFAUL-270).
// Every hook that needs "which workspace does this checkout belong to" imports THIS — session-start,
// first-change-guard, record-guard, capture-guard, image-push-guard — so the declaration is read in exactly
// one place rather than reimplemented per hook and drifting.
//
// MEASURED: a worktree of an opted-in repository (`git worktree add`) resolved nothing, because
// `.everdict/workspace` lives in the MAIN worktree's tree and a worktree does not share working-directory
// files with it — only the git metadata. Every guard was therefore silent in every worktree of every
// repository that declared a workspace through the file (not the env var). ~150 checkouts, one resolved.
//
// MEASURED (DEFAUL-269): 48 sessions in a week opened against a checkout with no `.everdict/workspace`, and
// 24 of the 28 that edited made no Everdict call — even though the repository's remote is a service listed
// by a product in a workspace the operator already holds a credential for. Nobody had run one command to say
// so. So resolution grew a fourth source, the repository cache, and a checkout that still resolves nothing is
// `unlinked` rather than silently unknown — `first-change-guard.mjs` refuses its edits until it is linked or
// opted out (DEFAUL-270).
//
// THE RESULT IS A UNION, NOT ALWAYS `{workspace, from, root}`:
//   {kind:"linked", workspace, from, root}   — resolved, as before; `from` names WHERE it came from.
//   {kind:"opted-out", root}                 — the declaration is exactly `none`: every hook stays silent.
//   {kind:"unlinked", root, repository}      — a git checkout resolving to nothing; `repository` is
//                                              `owner/name` from the first remote, or undefined when there
//                                              is none. `first-change-guard.mjs` refuses edits here.
//   undefined                                — no git at all (`rev-parse --show-toplevel` failed): UNKNOWN,
//                                              and every caller still reads that as "allow" — a broken
//                                              repository or a checkout outside git is not held to anything.
//
// Resolution order, first hit wins:
//   1. EVERDICT_WORKSPACE, trimmed and non-empty.
//   2. <show-toplevel>/.everdict/workspace — this checkout's own file.
//   3. The MAIN worktree's .everdict/workspace — found via `--git-common-dir`, whose parent (when its
//      basename is `.git`) is the main worktree. Skipped when the main worktree IS this checkout, so a
//      non-worktree clone never reads its own file twice under a different name.
//   4. The repository cache (`lib/repository-cache.mjs`, `~/.everdict/repositories.json`), keyed by the
//      lower-cased `owner/name` a PRIOR checkout of this same remote linked — offline, no network, so a
//      second clone of an already-linked repository resolves without asking the product API again.
//   5. `unlinked` — SessionStart is the only hook allowed to try turning this into a link, by asking every
//      registered workspace's products whether one lists this repository (DEFAUL-269, `session-start.mjs`).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { lookupRepository } from "./repository-cache.mjs";

const gitIn = (cwd, args) => {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    }).trim();
  } catch {
    return undefined;
  }
};

// THE ONE PLACE THE DECLARATION'S PATH IS BUILT. `session-start.mjs` (writing a link) and
// `first-change-guard.mjs` (the one target the link-first guard exempts) both need it too; they import this
// rather than joining ".everdict"/"workspace" themselves, so the existing invariant — no hook OTHER than this
// module builds that path — extends to writing it, not only reading it.
export const declarationPathIn = (root) => path.join(root, ".everdict", "workspace");

const workspaceFileIn = (dir) => {
  const file = declarationPathIn(dir);
  if (!existsSync(file)) return undefined;
  const value = readFileSync(file, "utf8").trim();
  return value.length > 0 ? value : undefined;
};

// `owner/name` from the checkout's first remote — the same regex session-start.mjs and the other hooks use to
// display a repository, now the ONE place it is derived for resolution purposes too.
export const repositoryOf = (cwd) => {
  const firstRemote = gitIn(cwd, ["remote"])?.split("\n")[0]?.trim();
  const url = firstRemote ? gitIn(cwd, ["remote", "get-url", firstRemote]) : undefined;
  return url ? (/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url)?.[1] ?? undefined) : undefined;
};

export const resolveWorkspace = (cwd) => {
  const root = gitIn(cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) return undefined;

  const envWorkspace = process.env.EVERDICT_WORKSPACE?.trim();
  if (envWorkspace) {
    if (envWorkspace === "none") return { kind: "opted-out", root };
    return { kind: "linked", workspace: envWorkspace, from: "EVERDICT_WORKSPACE", root };
  }

  const ownWorkspace = workspaceFileIn(root);
  if (ownWorkspace) {
    if (ownWorkspace === "none") return { kind: "opted-out", root };
    return { kind: "linked", workspace: ownWorkspace, from: ".everdict/workspace", root };
  }

  // ── THE MAIN WORKTREE (DEFAUL-261) ──────────────────────────────────────────────────────────────
  // `--git-common-dir` is the one git call that answers "which .git do all worktrees of this checkout
  // share" — a worktree's own `.git` is a FILE pointing at it, never the directory itself. When the common
  // dir's basename is `.git`, its parent is the main worktree's root; any other shape (a bare repo, some
  // other layout) is not resolved further here.
  const commonDir = gitIn(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (commonDir && path.basename(commonDir) === ".git") {
    const mainWorktree = path.dirname(commonDir);
    if (mainWorktree !== root) {
      const mainWorkspace = workspaceFileIn(mainWorktree);
      if (mainWorkspace) {
        if (mainWorkspace === "none") return { kind: "opted-out", root };
        return { kind: "linked", workspace: mainWorkspace, from: "main worktree .everdict/workspace", root };
      }
    }
  }

  const repository = repositoryOf(cwd);
  const cached = repository ? lookupRepository(repository) : undefined;
  if (cached?.workspace) return { kind: "linked", workspace: cached.workspace, from: "repository registry", root };

  return { kind: "unlinked", root, repository };
};
