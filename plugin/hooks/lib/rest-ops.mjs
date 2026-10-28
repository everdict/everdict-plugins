// THE ONE PLACE AN OPERATION MEETS A ROUTE (DEFAUL-295).
//
// The seed skills, the plugin's text and the in-product agent share one vocabulary: an OPERATION NAME
// (`log_change_round`, `create_sandbox`, …). The in-product agent reaches an operation as an MCP tool; the plugin
// reaches it over REST through `bin/everdict-api`. This table is what turns a name into `{method, path}` for the
// door, and it is imported — never re-listed — by the door (`bin/everdict-api`), by the parity suite
// (`scripts/check-plugin-door.mjs`, via `scripts/lib/rest-ops-parity.mjs`) and, from the receipts campaign on, by whatever recognises an operation
// in a transcript. A predicate written twice has already diverged (protocol L3).
//
// `scripts/lib/rest-ops-parity.mjs` holds both directions: every operation the plugin names is in this table,
// and every entry is a route `apps/api` registers. Paths use `{param}` segments; the door fills them from
// `--<param> <value>` (URL-encoded, so a `repository` with a `/` in it is one segment).
//
// Bodies and query strings are the REST ones (camelCase), not the MCP argument shapes — `everdict-api describe
// <op>` reads them from `GET /docs/json`.

const op = (name, method, path) => Object.freeze({ op: name, method, path });

export const REST_OPS = Object.freeze([
  op("adopt_environment", "PUT", "/workspace/adopted-environments"),
  op("cancel_persona_evaluation", "POST", "/personas/{id}/evaluations/{evaluationId}/cancel"),
  // PLT-39: brain rollouts (everdict brains … in the CLI).
  op("plan_brain_rollout", "GET", "/personas/brains/plan"),
  op("start_brain_rollout", "POST", "/personas/brain-rollouts"),
  op("list_brain_rollouts", "GET", "/personas/brain-rollouts"),
  op("get_brain_rollout", "GET", "/personas/brain-rollouts/{id}"),
  op("stop_brain_rollout", "POST", "/personas/brain-rollouts/{id}/stop"),
  op("decide_approval", "POST", "/approvals/{id}/decide"),
  op("get_org_chart", "GET", "/authority/chart"),
  op("grant_authority", "POST", "/authority/grants"),
  op("list_approvals", "GET", "/approvals"),
  op("list_members", "GET", "/members"),
  op("move_member", "POST", "/authority/moves"),
  op("attach_round_pull_request", "POST", "/change-campaigns/{id}/rounds/{seq}/pull-request"),
  op("campaign_decision", "GET", "/campaigns/{id}/decision"),
  op("close_change_campaign", "POST", "/change-campaigns/{id}/close"),
  op("close_sandbox", "POST", "/sandboxes/{id}/close"),
  op("cancel_run", "POST", "/runs/{id}/cancel"),
  op("cancel_scorecard", "POST", "/scorecards/{id}/cancel"),
  op("create_comment", "POST", "/comments"),
  op("create_dataset", "POST", "/datasets"),
  op("create_issue", "POST", "/issues"),
  op("create_judge", "POST", "/judges"),
  op("create_knowledge_entry", "POST", "/knowledge/entries"),
  op("create_model", "POST", "/models"),
  op("create_runtime", "POST", "/runtimes"),
  op("create_sandbox", "POST", "/sandboxes"),
  op("create_task", "POST", "/tasks"),
  op("delegation_readiness", "GET", "/workspace/delegation-readiness"),
  op("delete_capability", "DELETE", "/capabilities/{id}/versions/{version}"),
  op("delete_dataset", "DELETE", "/datasets/{id}/versions/{version}"),
  op("diff_datasets", "GET", "/datasets/{id}/diff"),
  op("diff_scorecards", "GET", "/scorecards/diff"),
  op("get_workspace_attention", "GET", "/workspace/attention"),
  op("get_capability", "GET", "/capabilities/{id}"),
  op("get_harness_plugin", "GET", "/harness-plugins/{id}/versions/{version}"),
  op("get_change_campaign", "GET", "/change-campaigns/{id}"),
  op("get_campaign_document", "GET", "/change-campaigns/{id}/documents/{digest}"),
  op("get_dataset", "GET", "/datasets/{id}/versions/{version}"),
  op("get_deployment", "GET", "/deployment"),
  op("get_harness_instance", "GET", "/harnesses/{id}/{version}/instance"),
  op("get_harness_template", "GET", "/harness-templates/{id}/{version}"),
  op("get_image_push_credentials", "POST", "/workspace/image-registries/push-credentials"),
  op("get_issue", "GET", "/issues/{id}"),
  op("get_issue_lineage", "GET", "/issues/{id}/lineage"),
  op("get_judge", "GET", "/judges/{id}/versions/{version}"),
  op("get_knowledge_entry", "GET", "/knowledge/entries/{id}"),
  op("get_model", "GET", "/models/{id}/versions/{version}"),
  op("get_run", "GET", "/runs/{id}"),
  op("get_runtime", "GET", "/runtimes/{id}/versions/{version}"),
  op("get_sandbox", "GET", "/sandboxes/{id}"),
  op("get_scorecard", "GET", "/scorecards/{id}"),
  op("get_task_context", "POST", "/knowledge/context"),
  op("ingest_scorecard", "POST", "/scorecards/ingest"),
  op("inspect_image", "GET", "/workspace/image-registries/manifest"),
  op("inspect_managed_image", "GET", "/workspace/images/manifest"),
  op("interrupt_sandbox_task", "POST", "/sandboxes/{id}/interrupt"),
  op("issue_conventions", "GET", "/workspace/issue-conventions"),
  op("list_adopted_environments", "GET", "/workspace/adopted-environments"),
  op("list_capabilities", "GET", "/capabilities"),
  op("list_harness_plugins", "GET", "/harness-plugins"),
  op("list_change_campaigns", "GET", "/change-campaigns"),
  op("list_criterion_catalog", "GET", "/criterion-catalog"),
  op("list_datasets", "GET", "/datasets"),
  op("list_harness_templates", "GET", "/harness-templates"),
  op("list_harnesses", "GET", "/harnesses"),
  op("list_image_tags", "GET", "/workspace/image-registries/tags"),
  op("list_issues", "GET", "/issues"),
  op("list_judges", "GET", "/judges"),
  op("list_knowledge_entries", "GET", "/knowledge/entries"),
  op("list_persona_goals", "GET", "/persona-goals"),
  op("set_persona_goal", "POST", "/persona-goals"),
  op("update_persona_goal", "PATCH", "/persona-goals/{id}"),
  op("list_managed_image_tags", "GET", "/workspace/images/{repository}/tags"),
  op("list_models", "GET", "/models"),
  op("list_public_capabilities", "GET", "/capabilities/public"),
  op("list_runs", "GET", "/runs"),
  op("list_runtimes", "GET", "/runtimes"),
  op("list_scorecards", "GET", "/scorecards"),
  op("list_tasks", "GET", "/tasks"),
  op("list_workspace_image_registries", "GET", "/workspace/image-registries"),
  op("list_workspace_images", "GET", "/workspace/images"),
  op("list_workspaces", "GET", "/workspaces"),
  op("mark_workspace_attention_seen", "POST", "/workspace/attention/seen"),
  op("log_campaign_round", "POST", "/campaigns/{id}/rounds"),
  op("log_change_round", "POST", "/change-campaigns/{id}/rounds"),
  op("mint_change_report", "POST", "/change-campaigns/{id}/report"),
  op("get_goal_decisions", "GET", "/goals/{kind}/{id}/decisions"),
  op("next_work", "GET", "/goals/{kind}/{id}/next-work"),
  op("open_campaign", "POST", "/campaigns"),
  op("open_change_campaign", "POST", "/change-campaigns"),
  op("open_plan", "POST", "/plans"),
  op("probe_runtime", "POST", "/runtimes/probe"),
  op("probe_workspace_image_registry", "POST", "/workspace/image-registries/probe"),
  op("publish_checkpoint", "POST", "/checkpoints"),
  op("pull_scorecard", "POST", "/scorecards/ingest/pull"),
  op("push_image_grant", "POST", "/workspace/images/push-grant"),
  op("read_sandbox_task_trace", "GET", "/sandboxes/{id}/tasks/{taskId}/trace"),
  op("record_pull_request", "POST", "/issues/{id}/pull-requests"),
  op("record_retrieval_use", "POST", "/knowledge/context/use"),
  op("register_harness", "POST", "/harnesses"),
  op("register_harness_template", "POST", "/harness-templates"),
  op("remove_member", "DELETE", "/members/{subject}"),
  op("remove_workspace_image", "DELETE", "/workspace/images/{repository}"),
  op("restore_member", "POST", "/members/{subject}/restore"),
  op("request_verification", "POST", "/checkpoints/{id}/verify"),
  op("review_change_report", "POST", "/change-reports/{id}/verdict"),
  op("supersede_change_report", "POST", "/change-reports/{id}/supersede"),
  op("register_criterion_catalog_entry", "POST", "/criterion-catalog"),
  op("run_scorecard", "POST", "/scorecards"),
  op("sandbox_exec", "POST", "/sandboxes/{id}/exec"),
  op("sandbox_git_fetch", "POST", "/sandboxes/{id}/git/fetch"),
  op("sandbox_git_push", "POST", "/sandboxes/{id}/git/push"),
  op("save_capability", "PUT", "/capabilities/{id}"),
  op("search_files", "GET", "/fs/search"),
  op("set_capability_visibility", "PATCH", "/capabilities/{id}/visibility"),
  op("set_issue_chain", "POST", "/issues/{id}/chain"),
  op("set_initiative_status", "POST", "/initiatives/{id}/status"),
  op("set_issue_status", "POST", "/issues/{id}/status"),
  op("set_project_status", "POST", "/projects/{id}/status"),
  op("set_secret", "PUT", "/secrets/{name}"),
  op("set_workspace_image_registry", "PUT", "/workspace/image-registries"),
  op("settle_campaign", "POST", "/campaigns/{id}/settle"),
  op("submit_run", "POST", "/runs"),
  op("submit_sandbox_task", "POST", "/sandboxes/{id}/tasks"),
  op("update_issue", "PATCH", "/issues/{id}"),
  op("update_knowledge_entry", "PATCH", "/knowledge/entries/{id}"),
  op("update_task", "PATCH", "/tasks/{id}"),
  op("validate_capability", "POST", "/capabilities/validate"),
  op("validate_dataset", "POST", "/datasets/validate"),
  op("validate_judge", "POST", "/judges/validate"),
  op("validate_model", "POST", "/models/validate"),
  op("validate_runtime", "POST", "/runtimes/validate"),
  op("verify_adopted_environment", "POST", "/workspace/adopted-environments/verify"),
  op("verify_image", "GET", "/workspace/image-registries/verify"),
  op("verify_knowledge_entry", "POST", "/knowledge/entries/{id}/verify"),
  op("write_file", "PUT", "/fs/file"),
]);

const PARAM = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/** The `{…}` names of a path template, in order. */
export const pathParamsOf = (template) => [...template.matchAll(PARAM)].map((m) => m[1]);

export const findOp = (name) => REST_OPS.find((entry) => entry.op === name);

/** Fill a template from `params`, URL-encoding each value. Throws on a missing one — a half-filled path is a different route. */
export const fillPath = (template, params) =>
  template.replace(PARAM, (_, name) => {
    const value = params[name];
    if (value === undefined || value === "") throw new Error(`missing path parameter --${name}`);
    return encodeURIComponent(String(value));
  });

const templateRegex = (template) => {
  const escaped = template.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(PARAM, "[^/]+")}$`);
};

/** The op a concrete `METHOD path` request is, by template match — `undefined` when the table has none. */
export const opForRequest = (method, path) => {
  const bare = path.split("?")[0].replace(/\/+$/, "") || "/";
  const wanted = method.toUpperCase();
  return REST_OPS.find((entry) => entry.method === wanted && templateRegex(entry.path).test(bare))?.op;
};
