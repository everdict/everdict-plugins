// ── A CHANGE THAT REMOVES WHAT A DOCUMENT CITES HAS MADE THAT DOCUMENT FALSE (DEFAUL-177, "a document's owner") ──
//
// The seed names five gates the plugin should carry to a workspace that adopts it. Three are the product's
// own domain refusals and follow any workspace for free; a fix's regression test is a gate of its own. The
// fifth — a change that makes a document false updates the document — lived only in THIS repository's
// docs check (since deleted, DEFAUL-802), so an adopting workspace never met it.
//
// ⚠️ WHAT THIS DOES NOT ASK, AND THE TWO MEASUREMENTS THAT DECIDED IT (replayed before it was wired in):
//   · The seed's literal form — "touching a file a document anchors owes that document an update, or a
//     `Docs-unchanged: <doc> — <why>` line" — over this repository's last 200 commits: 118 touched an
//     anchored file, 2 updated the document with it, **116 would have been refused**. A guard that refuses
//     98% of ordinary work is a tax whose declaration everyone learns to paste.
//   · "An owned document cites a path HEAD lacks" — 17 documents, 37 references at HEAD, nearly all of them
//     legitimate: gitignored files a doc tells you to create, build output, and the history of a directory
//     that moved. A generic plugin cannot carry this repository's list of which directories count.
// Whether a change made a document false is its author's judgement — except for the half a machine can see:
// the change REMOVED a path, and a document still cites it. That is caused by this round, it is never
// legitimate, and it needs no per-repository vocabulary: the removal itself says the path was real.
//
// Pure over reads the caller supplies (the tree after, the removed paths, the documents), so the hook's git
// plumbing and this predicate are tested apart.

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

function frontmatter(markdown) {
  const fm = FRONTMATTER.exec(markdown);
  const fields = new Map();
  if (!fm) return fields;
  for (const line of fm[1].split("\n")) {
    const m = /^([a-z_-]+):\s*(.*)$/.exec(line);
    if (m) fields.set(m[1], m[2].trim());
  }
  return fields;
}

// `anchors: [a, b]` — the frontmatter list a document uses to name the files it describes.
export function anchorsOf(markdown) {
  const line = frontmatter(markdown).get("anchors");
  if (line === undefined) return [];
  return line
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

// Every backticked token shaped like a relative path (a slash, no spaces or placeholders). Whether it names
// something real is not decided here — only whether the round removed it.
export function citedPaths(markdown) {
  const body = markdown.replace(FRONTMATTER, "");
  const out = new Set();
  for (const m of body.matchAll(/`([^`\n]+)`/g)) {
    const token = m[1]
      .trim()
      .replace(/[).,;]+$/, "")
      .replace(/:[\d,\-+]+$/, "")
      .replace(/#.*$/, "")
      .replace(/\/+$/, "");
    if (!token.includes("/") || /[*?{}<>|\s$]/.test(token) || /^[a-z]+:\/\//.test(token)) continue;
    out.add(token);
  }
  return [...out];
}

// `after` — every path the tree holds now; `removed` — every path a commit of the round deleted or renamed
// away; `docs` — [{ path, markdown }] as they stand now. A superseded document keeps what it decided against,
// on purpose (the same exemption `check-docs` gives it), so it is not read.
export function referencesTheRoundRemoved({ after, removed, docs }) {
  const dirs = new Set();
  for (const p of after) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join("/"));
  }
  const exists = (p) => after.has(p) || dirs.has(p);
  const removedByRound = (p) => {
    if (exists(p)) return false;
    if (removed.has(p)) return true;
    for (const r of removed) if (r.startsWith(`${p}/`)) return true;
    return false;
  };
  const findings = [];
  for (const { path, markdown } of docs) {
    if (frontmatter(markdown).get("status") === "superseded") continue;
    const dead = [
      ...anchorsOf(markdown)
        .filter(removedByRound)
        .map((ref) => ({ kind: "anchor", ref })),
      ...citedPaths(markdown)
        .filter(removedByRound)
        .map((ref) => ({ kind: "cited", ref })),
    ];
    if (dead.length > 0) findings.push({ doc: path, dead });
  }
  return findings;
}
