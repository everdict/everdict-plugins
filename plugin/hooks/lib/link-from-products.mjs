// A CHECKOUT LINKS ITSELF TO THE WORKSPACE WHOSE PRODUCT LISTS IT (DEFAUL-269). Moved out of
// `session-start.mjs` in round 2: a live session showed the MCP client's OWN resolution (`mcp-headers.mjs`,
// the `headersHelper`) can be asked before SessionStart's context ever reaches the model, and it needs an
// answer NOW — "whichever hook happens to run first" is not a design, and the unauthenticated fallback that
// resulted (every unlinked checkout's first tool call landing in the key's own default workspace) is exactly
// the bug DEFAUL-269 exists to close. So BOTH SessionStart and `mcp-headers.mjs` call this.
//
// IDEMPOTENT BOTH WAYS: whichever caller runs first writes `.everdict/workspace` and the repository cache;
// the other resolves `linked` on its own next call (or, within the same process, is handed the `{linked}`
// this function itself returns) and does nothing further.
//
// When `resolveWorkspace` reads `unlinked`, every REGISTERED workspace's credential is asked `GET /products`,
// and a service whose `repository` matches this checkout's remote, case-insensitively, is a match. Exactly
// one match links the checkout — writes the declaration, records the repository cache — and names the
// product. Several matches are named, never linked: guessing among them would write one team's identity into
// another's trust zone, the same reason a workspace is never invented. A workspace whose lookup FAILED is
// named as `unknown`, never folded into "no match" — a failed read and an honest absence are different facts.
//
// `credentials` is a parameter, not read here, so a caller that already read the registry for another reason
// (`mcp-headers.mjs`, to decide whether a credential exists at all) does not read it twice.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { recordRepository } from "./repository-cache.mjs";
import { declarationPathIn } from "./workspace.mjs";

export const linkFromProducts = async ({ root, repository, credentials }) => {
  if (!root || !repository) return undefined;
  if (credentials?.kind !== "read") return undefined;
  const entries = Object.entries(credentials.workspaces);
  if (entries.length === 0) return undefined;

  const matches = [];
  const unknown = [];
  await Promise.all(
    entries.map(async ([workspaceId, credential]) => {
      const apiUrl = typeof credential?.apiUrl === "string" ? credential.apiUrl : undefined;
      const key = typeof credential?.key === "string" ? credential.key : undefined;
      if (!apiUrl || !key) {
        unknown.push(workspaceId);
        return;
      }
      const base = apiUrl.replace(/\/+$/, "").replace(/\/mcp$/, "");
      try {
        const res = await fetch(`${base}/products`, {
          headers: { Authorization: `Bearer ${key}`, "x-everdict-workspace": workspaceId },
          signal: AbortSignal.timeout(4_000),
        });
        if (!res.ok) {
          unknown.push(workspaceId);
          return;
        }
        const products = await res.json();
        for (const product of Array.isArray(products) ? products : []) {
          const hit = (Array.isArray(product?.services) ? product.services : []).some(
            (service) =>
              typeof service?.repository === "string" && service.repository.toLowerCase() === repository.toLowerCase(),
          );
          if (hit) {
            matches.push({
              workspaceId,
              product: typeof product?.name === "string" ? product.name : String(product?.id ?? "?"),
            });
            return;
          }
        }
      } catch {
        unknown.push(workspaceId);
      }
    }),
  );

  if (matches.length === 1) {
    const { workspaceId, product } = matches[0];
    try {
      mkdirSync(path.dirname(declarationPathIn(root)), { recursive: true });
      writeFileSync(declarationPathIn(root), `${workspaceId}\n`);
      recordRepository(repository, { workspace: workspaceId, product, linkedAt: new Date().toISOString() });
      return {
        linked: { kind: "linked", workspace: workspaceId, from: `product ${product} in ${workspaceId}`, root },
      };
    } catch {
      // A write that failed leaves the checkout unlinked, same as any other lookup that found no home for it.
      return { matches, unknown };
    }
  }
  return { matches, unknown };
};
