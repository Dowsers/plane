/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 9, feature 2 - "Detection de doublons/similarite"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost) settings.
 * Mirrors the flat config fields added directly to `Workspace`/`Project`
 * (apps/api/plane/db/models/workspace.py, apps/api/plane/app/views/
 * duplicate_detection_config.py) - same flat-field convention as
 * `is_ai_triage_enabled`/`TProjectAITriageConfig`
 * (packages/types/src/ai-triage-config.ts), except this feature's backend
 * gives the WORKSPACE level its own dedicated endpoint too (threshold/scope
 * need range/choice validation beyond a plain boolean, unlike the simpler
 * triage master switch, which stays on the generic workspace serializer) -
 * so, unlike `is_ai_triage_enabled`, these three fields are read/written
 * through this dedicated service, never through `useWorkspace()`/
 * `updateWorkspace()`.
 */

/** Matches `DuplicateDetectionScope` (apps/api/plane/db/models/workspace.py)
 * verbatim. */
export type TDuplicateDetectionScope = "project" | "workspace";

/** Response shape of `GET/PATCH /workspaces/:slug/duplicate-detection-config/` -
 * Admin only for both verbs. */
export type TWorkspaceDuplicateDetectionConfig = {
  is_duplicate_detection_enabled: boolean;
  duplicate_detection_similarity_threshold: number;
  duplicate_detection_scope: TDuplicateDetectionScope;
};

export type TWorkspaceDuplicateDetectionConfigPayload = Partial<TWorkspaceDuplicateDetectionConfig>;

/** Response shape of
 * `GET/PATCH /workspaces/:slug/projects/:projectId/duplicate-detection-config/`.
 * `is_duplicate_detection_enabled: null` is the tri-state "inherit the
 * workspace master switch" value - same convention as
 * `TProjectAITriageConfig.is_ai_triage_enabled`, never collapse this to a
 * plain boolean. `workspace_master_switch_enabled` is a read-only
 * convenience echo of `Workspace.is_duplicate_detection_enabled`. */
export type TProjectDuplicateDetectionConfig = {
  is_duplicate_detection_enabled: boolean | null;
  workspace_master_switch_enabled: boolean;
};

export type TProjectDuplicateDetectionConfigPayload = {
  is_duplicate_detection_enabled: boolean | null;
};

/** `POST /workspaces/:slug/duplicate-detection-config/backfill/` - Admin
 * only, rate-limited. The backend only ever enqueues the existing
 * `backfill_issue_embeddings_batch` Celery task and returns a plain
 * confirmation `detail` string - there is no job id/progress-tracking
 * response to poll, so the frontend intentionally shows nothing more than
 * a "Backfill started" toast (no fake progress bar). */
export type TDuplicateDetectionBackfillPayload = {
  batch_size?: number;
  countdown?: number;
};

export type TDuplicateDetectionBackfillResponse = {
  detail: string;
};
