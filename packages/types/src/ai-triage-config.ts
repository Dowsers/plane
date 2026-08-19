/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 9, feature 1 - "AI-assisted auto-triage"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost) settings.
 * Mirrors the flat config fields added directly to `Project`/`Workspace`
 * (see `apps/api/plane/app/views/ai_triage_config.py`'s own docstring for
 * why this fork rejected the spec's own satellite
 * `ProjectAITriageConfig`/`WorkspaceAITriageConfig` models) - same
 * convention as `is_initiatives_enabled`/`is_flexible_query_enabled`/
 * `is_ai_summary_enabled`.
 */

/** Response shape of `GET/PATCH .../projects/:projectId/ai-triage-config/`.
 * `is_ai_triage_enabled: null` is the tri-state "inherit the workspace
 * master switch" value - an explicit `true`/`false` overrides it. Never
 * collapse this to a plain boolean in the UI: that would make "inherit"
 * unrepresentable. `workspace_master_switch_enabled` is a read-only
 * convenience echo of `Workspace.is_ai_triage_enabled`, included so the
 * settings card can grey itself out without a second request. */
export type TProjectAITriageConfig = {
  is_ai_triage_enabled: boolean | null;
  ai_triage_auto_apply_module: boolean;
  ai_triage_auto_apply_assignee: boolean;
  ai_triage_auto_apply_labels: boolean;
  ai_triage_confidence_threshold_module: number;
  ai_triage_confidence_threshold_assignee: number;
  ai_triage_confidence_threshold_labels: number;
  ai_triage_max_labels_suggested: number;
  ai_triage_min_historical_issues: number;
  workspace_master_switch_enabled: boolean;
};

/** Request body for `PATCH .../projects/:projectId/ai-triage-config/` -
 * every field optional, partial update (only fields present in the body
 * are touched server-side). `is_ai_triage_enabled: null` explicitly
 * restores "inherit from workspace". */
export type TProjectAITriageConfigPayload = Partial<Omit<TProjectAITriageConfig, "workspace_master_switch_enabled">>;

/** Response shape of `GET/PATCH .../workspaces/:slug/ai-triage-config/` -
 * just the master switch. Note this is the SAME underlying
 * `Workspace.is_ai_triage_enabled` field already exposed on `IWorkspace`
 * (workspace.ts) via the generic workspace serializer - Settings > AI's
 * "Features" toggle row reads/writes it through `useWorkspace()`, not this
 * dedicated endpoint/type, mirroring `is_ai_summary_enabled`'s own
 * precedent. This type exists for completeness and any future caller that
 * needs the workspace-scoped endpoint specifically. */
export type TWorkspaceAITriageConfig = {
  is_ai_triage_enabled: boolean;
};
