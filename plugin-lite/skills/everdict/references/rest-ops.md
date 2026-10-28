# Everdict operations — the REST door's catalog

<!-- derived from plugin/hooks/lib/rest-ops.mjs; its generator was deleted in DEFAUL-802, so update this file by hand whenever that table changes -->

An operation name is the vocabulary; `everdict-api <op>` is how it is invoked:

```
everdict-api <op> [--<pathParam> <value>]… [--query k=v]… [--body '{…}' | --body @file.json | --body -]
everdict-api describe <op>     # the operation's summary, parameters and request body schema
everdict-api ops [filter]      # this table, live
everdict-api raw <METHOD> <path> [--body …]   # a route the table lacks
```

The response JSON is on stdout. Bodies and query strings are the REST ones (camelCase). Exit `0` on 2xx, `1` on an
HTTP error (the `{code,message,data?}` envelope is on stdout), `2` refused before the request was sent, `3` a
transport failure — the outcome is UNKNOWN, read before you repeat a write (writes are never retried by the
door). Every call that reaches the server leaves an `EVERDICT_RECEIPT` line on stderr. Authorization and
validation failures come back as the error envelope, e.g. `FORBIDDEN`, `CONFLICT`, `NOT_FOUND`; roles are
`viewer < member < admin` and every route is workspace-scoped.

For a long body write the file with a QUOTED heredoc (`<<'JSON'`): an unquoted heredoc executes backticks.

## Operations (124)

| Operation | Method | Route | Path params |
|---|---|---|---|
| `adopt_environment` | PUT | `/workspace/adopted-environments` |  |
| `decide_approval` | POST | `/approvals/{id}/decide` | `--id` |
| `get_org_chart` | GET | `/authority/chart` |  |
| `grant_authority` | POST | `/authority/grants` |  |
| `list_approvals` | GET | `/approvals` |  |
| `list_members` | GET | `/members` |  |
| `move_member` | POST | `/authority/moves` |  |
| `attach_round_pull_request` | POST | `/change-campaigns/{id}/rounds/{seq}/pull-request` | `--id` `--seq` |
| `campaign_decision` | GET | `/campaigns/{id}/decision` | `--id` |
| `close_change_campaign` | POST | `/change-campaigns/{id}/close` | `--id` |
| `close_sandbox` | POST | `/sandboxes/{id}/close` | `--id` |
| `cancel_run` | POST | `/runs/{id}/cancel` | `--id` |
| `cancel_scorecard` | POST | `/scorecards/{id}/cancel` | `--id` |
| `create_comment` | POST | `/comments` |  |
| `create_dataset` | POST | `/datasets` |  |
| `create_issue` | POST | `/issues` |  |
| `create_judge` | POST | `/judges` |  |
| `create_knowledge_entry` | POST | `/knowledge/entries` |  |
| `create_model` | POST | `/models` |  |
| `create_runtime` | POST | `/runtimes` |  |
| `create_sandbox` | POST | `/sandboxes` |  |
| `create_task` | POST | `/tasks` |  |
| `delegation_readiness` | GET | `/workspace/delegation-readiness` |  |
| `delete_capability` | DELETE | `/capabilities/{id}/versions/{version}` | `--id` `--version` |
| `delete_dataset` | DELETE | `/datasets/{id}/versions/{version}` | `--id` `--version` |
| `diff_datasets` | GET | `/datasets/{id}/diff` | `--id` |
| `diff_scorecards` | GET | `/scorecards/diff` |  |
| `get_workspace_attention` | GET | `/workspace/attention` |  |
| `get_capability` | GET | `/capabilities/{id}` | `--id` |
| `get_change_campaign` | GET | `/change-campaigns/{id}` | `--id` |
| `get_campaign_document` | GET | `/change-campaigns/{id}/documents/{digest}` | `--id` `--digest` |
| `get_dataset` | GET | `/datasets/{id}/versions/{version}` | `--id` `--version` |
| `get_deployment` | GET | `/deployment` |  |
| `get_harness_instance` | GET | `/harnesses/{id}/{version}/instance` | `--id` `--version` |
| `get_harness_template` | GET | `/harness-templates/{id}/{version}` | `--id` `--version` |
| `get_image_push_credentials` | POST | `/workspace/image-registries/push-credentials` |  |
| `get_issue` | GET | `/issues/{id}` | `--id` |
| `get_issue_lineage` | GET | `/issues/{id}/lineage` | `--id` |
| `get_judge` | GET | `/judges/{id}/versions/{version}` | `--id` `--version` |
| `get_knowledge_entry` | GET | `/knowledge/entries/{id}` | `--id` |
| `get_model` | GET | `/models/{id}/versions/{version}` | `--id` `--version` |
| `get_run` | GET | `/runs/{id}` | `--id` |
| `get_runtime` | GET | `/runtimes/{id}/versions/{version}` | `--id` `--version` |
| `get_sandbox` | GET | `/sandboxes/{id}` | `--id` |
| `get_scorecard` | GET | `/scorecards/{id}` | `--id` |
| `get_task_context` | POST | `/knowledge/context` |  |
| `ingest_scorecard` | POST | `/scorecards/ingest` |  |
| `inspect_image` | GET | `/workspace/image-registries/manifest` |  |
| `inspect_managed_image` | GET | `/workspace/images/manifest` |  |
| `interrupt_sandbox_task` | POST | `/sandboxes/{id}/interrupt` | `--id` |
| `issue_conventions` | GET | `/workspace/issue-conventions` |  |
| `list_adopted_environments` | GET | `/workspace/adopted-environments` |  |
| `list_capabilities` | GET | `/capabilities` |  |
| `list_change_campaigns` | GET | `/change-campaigns` |  |
| `list_criterion_catalog` | GET | `/criterion-catalog` |  |
| `list_datasets` | GET | `/datasets` |  |
| `list_harness_templates` | GET | `/harness-templates` |  |
| `list_harnesses` | GET | `/harnesses` |  |
| `list_image_tags` | GET | `/workspace/image-registries/tags` |  |
| `list_issues` | GET | `/issues` |  |
| `list_judges` | GET | `/judges` |  |
| `list_knowledge_entries` | GET | `/knowledge/entries` |  |
| `list_managed_image_tags` | GET | `/workspace/images/{repository}/tags` | `--repository` |
| `list_models` | GET | `/models` |  |
| `list_public_capabilities` | GET | `/capabilities/public` |  |
| `list_runs` | GET | `/runs` |  |
| `list_runtimes` | GET | `/runtimes` |  |
| `list_scorecards` | GET | `/scorecards` |  |
| `list_tasks` | GET | `/tasks` |  |
| `list_workspace_image_registries` | GET | `/workspace/image-registries` |  |
| `list_workspace_images` | GET | `/workspace/images` |  |
| `list_workspaces` | GET | `/workspaces` |  |
| `mark_workspace_attention_seen` | POST | `/workspace/attention/seen` |  |
| `log_campaign_round` | POST | `/campaigns/{id}/rounds` | `--id` |
| `log_change_round` | POST | `/change-campaigns/{id}/rounds` | `--id` |
| `mint_change_report` | POST | `/change-campaigns/{id}/report` | `--id` |
| `get_goal_decisions` | GET | `/goals/{kind}/{id}/decisions` | `--kind` `--id` |
| `next_work` | GET | `/goals/{kind}/{id}/next-work` | `--kind` `--id` |
| `open_campaign` | POST | `/campaigns` |  |
| `open_change_campaign` | POST | `/change-campaigns` |  |
| `open_plan` | POST | `/plans` |  |
| `probe_runtime` | POST | `/runtimes/probe` |  |
| `probe_workspace_image_registry` | POST | `/workspace/image-registries/probe` |  |
| `publish_checkpoint` | POST | `/checkpoints` |  |
| `pull_scorecard` | POST | `/scorecards/ingest/pull` |  |
| `push_image_grant` | POST | `/workspace/images/push-grant` |  |
| `read_sandbox_task_trace` | GET | `/sandboxes/{id}/tasks/{taskId}/trace` | `--id` `--taskId` |
| `record_pull_request` | POST | `/issues/{id}/pull-requests` | `--id` |
| `record_retrieval_use` | POST | `/knowledge/context/use` |  |
| `register_harness` | POST | `/harnesses` |  |
| `register_harness_template` | POST | `/harness-templates` |  |
| `remove_member` | DELETE | `/members/{subject}` | `--subject` |
| `remove_workspace_image` | DELETE | `/workspace/images/{repository}` | `--repository` |
| `restore_member` | POST | `/members/{subject}/restore` | `--subject` |
| `request_verification` | POST | `/checkpoints/{id}/verify` | `--id` |
| `review_change_report` | POST | `/change-reports/{id}/verdict` | `--id` |
| `supersede_change_report` | POST | `/change-reports/{id}/supersede` | `--id` |
| `register_criterion_catalog_entry` | POST | `/criterion-catalog` |  |
| `run_scorecard` | POST | `/scorecards` |  |
| `sandbox_exec` | POST | `/sandboxes/{id}/exec` | `--id` |
| `sandbox_git_fetch` | POST | `/sandboxes/{id}/git/fetch` | `--id` |
| `sandbox_git_push` | POST | `/sandboxes/{id}/git/push` | `--id` |
| `save_capability` | PUT | `/capabilities/{id}` | `--id` |
| `search_files` | GET | `/fs/search` |  |
| `set_capability_visibility` | PATCH | `/capabilities/{id}/visibility` | `--id` |
| `set_issue_chain` | POST | `/issues/{id}/chain` | `--id` |
| `set_initiative_status` | POST | `/initiatives/{id}/status` | `--id` |
| `set_issue_status` | POST | `/issues/{id}/status` | `--id` |
| `set_project_status` | POST | `/projects/{id}/status` | `--id` |
| `set_secret` | PUT | `/secrets/{name}` | `--name` |
| `set_workspace_image_registry` | PUT | `/workspace/image-registries` |  |
| `settle_campaign` | POST | `/campaigns/{id}/settle` | `--id` |
| `submit_run` | POST | `/runs` |  |
| `submit_sandbox_task` | POST | `/sandboxes/{id}/tasks` | `--id` |
| `update_issue` | PATCH | `/issues/{id}` | `--id` |
| `update_task` | PATCH | `/tasks/{id}` | `--id` |
| `validate_capability` | POST | `/capabilities/validate` |  |
| `validate_dataset` | POST | `/datasets/validate` |  |
| `validate_judge` | POST | `/judges/validate` |  |
| `validate_model` | POST | `/models/validate` |  |
| `validate_runtime` | POST | `/runtimes/validate` |  |
| `verify_adopted_environment` | POST | `/workspace/adopted-environments/verify` |  |
| `verify_image` | GET | `/workspace/image-registries/verify` |  |
| `write_file` | PUT | `/fs/file` |  |
