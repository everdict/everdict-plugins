// What a created issue lacks, said in the session's own context (DEFAUL-291) — the logic `conventions-guard.mjs`
// ran on the MCP transport, moved here so the REST door prints it after `create_issue` (DEFAUL-295).
//
// The server answers every create with `conventions: {missing, suggested, candidates}`. The session that ignores a
// result's tail files the issue bare, so this restates the missing fields and the top candidates as the next call
// to make. NOT a refusal: the issue exists, and this only says how to complete it.
//   · `suggested` names fields the workspace is not required to fill but HAS a vocabulary for (a product at 1%
//     fill is not "required", yet its services exist) — listed after the missing ones, softer, same candidates;
//   · an absent `conventions` (an older server) or an empty `missing` AND `suggested` is SILENT — nothing to complete;
//   · product candidates from THIS checkout's repository come first, because the service the session is
//     changing is the one whose product the issue belongs to.
const TOP = 3;

// What each suggested field's vocabulary is, in the workspace's own terms.
const VOCABULARY = {
  labels: "labels",
  product: "products with services",
  project: "active projects",
  assignee: "assignees",
};

/** `response` is the parsed `create_issue` answer; `repository` is `owner/name` of the checkout, when known. */
export const conventionsFeedback = ({ response, repository }) => {
  const result =
    response?.conventions || typeof response !== "object" || response === null
      ? response
      : (response.record ?? response.issue ?? response);
  const conventions = result?.conventions;
  const missing = Array.isArray(conventions?.missing) ? conventions.missing.filter((f) => typeof f === "string") : [];
  const suggested = (Array.isArray(conventions?.suggested) ? conventions.suggested : []).filter(
    (f) => typeof f === "string" && !missing.includes(f),
  );
  if (missing.length === 0 && suggested.length === 0) return undefined;
  const candidates = conventions.candidates && typeof conventions.candidates === "object" ? conventions.candidates : {};

  const matchesRepository = (candidate) => {
    if (!repository) return false;
    const repo = repository.toLowerCase();
    const name = repo.split("/").pop();
    const declared = typeof candidate?.repository === "string" ? candidate.repository.toLowerCase() : undefined;
    if (declared !== undefined) return declared === repo || declared.endsWith(`/${name}`) || declared === name;
    return typeof candidate?.service === "string" && [repo, name].includes(candidate.service.toLowerCase());
  };

  const listOf = (field) => {
    const raw = candidates[field];
    if (raw === undefined || raw === null) return [];
    const list = Array.isArray(raw) ? raw : [raw];
    return field === "product"
      ? [...list.filter(matchesRepository), ...list.filter((c) => !matchesRepository(c))]
      : list;
  };

  const show = (candidate) => (typeof candidate === "string" ? candidate : JSON.stringify(candidate));
  const lines = missing.map((field) => {
    const top = listOf(field).slice(0, TOP);
    return top.length > 0
      ? `- **${field}**: ${top.map(show).join(" · ")}`
      : `- **${field}**: no candidate in the vocabulary`;
  });
  const suggestedLines = suggested.map((field) => {
    const top = listOf(field).slice(0, TOP);
    const vocabulary = VOCABULARY[field] ?? field;
    return `- **${field}**: this workspace has ${vocabulary} — link it${top.length > 0 ? `: ${top.map(show).join(" · ")}` : ""}`;
  });

  const id = typeof result?.id === "string" ? result.id : "<id>";
  return [
    missing.length > 0
      ? "# Everdict — the issue you just created is missing fields its workspace requires"
      : "# Everdict — the issue you just created could carry more of what its workspace has",
    "",
    ...lines,
    ...(suggestedLines.length > 0
      ? [...(lines.length > 0 ? [""] : []), "Suggested (not required, but the vocabulary exists):", ...suggestedLines]
      : []),
    "",
    `Apply with update_issue {id: "${id}", …} using the candidates above (a project, parent, assignee or priority change is a decision — add reason). Where a field has no candidate, leave it — nothing is invented.`,
  ].join("\n");
};
