// THE REPOSITORY → WORKSPACE CACHE (DEFAUL-269) — `~/.everdict/repositories.json`, keyed by the
// lower-cased `owner/name` SessionStart resolved a checkout's remote to. `lib/workspace.mjs` reads it as
// resolution step 4, so a SECOND checkout of a repository already linked once resolves OFFLINE — no product
// lookup, no credential, no network — from whichever checkout linked it first.
//
// A cache that cannot be read is read as empty, never as a refusal: the worst case is a checkout that asks
// the product API again, not one that is wrongly told it belongs nowhere.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const cachePath = () => path.join(os.homedir(), ".everdict", "repositories.json");

const readCache = (file) => {
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const lookupRepository = (repository, file = cachePath()) => {
  if (!repository) return undefined;
  return readCache(file)[repository.toLowerCase()];
};

// `entry` is `{workspace, product, linkedAt}`. A failed write leaves the checkout linked (the `.everdict/
// workspace` file SessionStart wrote is the durable record) but a SECOND checkout would ask the product API
// again rather than reading this cache — the narrower cost, never a wrong answer.
export const recordRepository = (repository, entry, file = cachePath()) => {
  if (!repository) return;
  const cache = readCache(file);
  cache[repository.toLowerCase()] = entry;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(cache, null, 2));
  } catch {
    // See above.
  }
};
