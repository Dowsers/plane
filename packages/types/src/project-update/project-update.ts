/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TProjectUpdateStatus = "ON_TRACK" | "AT_RISK" | "OFF_TRACK";

export type TProjectUpdateGeneratedSummary = {
  since: string;
  issues_created: number;
  issues_completed: number;
  issues_cancelled: number;
  net_backlog_change: number;
  cycles_started: number;
  cycles_closed: number;
};

/**
 * Category 9, feature 6 - "AI-assisted status update drafting"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost, PROJECT-only in
 * this fork). Shared status for a single generation attempt - see
 * `AIGenerationStatus` (apps/api/plane/db/models/project_update.py).
 */
export type TAIGenerationStatus = "PENDING" | "SUCCESS" | "FAILED" | "TIMEOUT";

/** `ProjectUpdate.ai_generation_metadata` / `AIGenerationLog.token_usage`
 * shape - see `generate_project_update_draft`
 * (apps/api/plane/utils/project_update_ai_draft.py). `prompt_tokens`/
 * `completion_tokens` are always `null` today - documented gap, the shared
 * LLM helper doesn't currently surface provider token-usage counts. */
export type TProjectUpdateAIGenerationMetadata = {
  llm_provider?: string | null;
  llm_model?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  latency_ms?: number;
};

/** `ProjectUpdate.ai_source_snapshot` shape - the serialized issue-delta
 * actually used for a generation, frozen for reproducibility/audit - see
 * `compute_project_update_delta` (apps/api/plane/utils/project_update_ai_draft.py). */
export type TProjectUpdateAISourceSnapshot = {
  since: string;
  computed_at: string;
  data_scope: string;
  completed_issues: Record<string, unknown>[];
  overdue_issues: Record<string, unknown>[];
  blocked_issues: Record<string, unknown>[];
  remaining_distribution: Record<string, number>;
};

export interface IProjectUpdate {
  id: string;
  workspace_id: string;
  project_id: string;
  status: TProjectUpdateStatus;
  description_html: string;
  generated_summary_json: TProjectUpdateGeneratedSummary | Record<string, never>;
  is_summary_edited: boolean;
  // AI-assisted drafting provenance (exigence 8) - see `ProjectUpdate`'s own
  // field comments (apps/api/plane/db/models/project_update.py).
  is_ai_assisted: boolean;
  ai_draft_content: string | null;
  ai_generation_status: TAIGenerationStatus | null;
  ai_generation_metadata: TProjectUpdateAIGenerationMetadata | Record<string, never> | null;
  ai_source_snapshot: TProjectUpdateAISourceSnapshot | Record<string, never> | null;
  ai_regeneration_count: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  created_by_detail?: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string;
    avatar_url: string;
  };
}

export type TProjectUpdateWritePayload = {
  status: TProjectUpdateStatus;
  description_html: string;
  generated_summary_json?: TProjectUpdateGeneratedSummary | Record<string, never>;
  is_summary_edited?: boolean;
  // Only ever sent when publishing a draft generated via
  // `POST .../updates/draft/` - a manual, non-AI "Add update" submission
  // omits these entirely rather than forcing `is_ai_assisted: false`.
  is_ai_assisted?: boolean;
  ai_draft_content?: string | null;
  ai_generation_status?: TAIGenerationStatus | null;
  ai_generation_metadata?: TProjectUpdateAIGenerationMetadata | Record<string, never> | null;
  ai_source_snapshot?: TProjectUpdateAISourceSnapshot | Record<string, never> | null;
  ai_regeneration_count?: number;
};

export type TProjectUpdateCadence = "DISABLED" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

/** Response of `POST /api/workspaces/:slug/projects/:projectId/updates/draft/`
 * - never persists a `ProjectUpdate` row itself, see
 * `ProjectUpdateAIDraftEndpoint` (apps/api/plane/app/views/project_update/ai_draft.py).
 * `suggested_status` is a modifiable suggestion, never locked in. */
export type TProjectUpdateAIDraftResponse = {
  draft_content: string;
  suggested_status: TProjectUpdateStatus;
  ai_generation_status: TAIGenerationStatus;
  ai_generation_metadata: TProjectUpdateAIGenerationMetadata | Record<string, never>;
  ai_source_snapshot: TProjectUpdateAISourceSnapshot | Record<string, never>;
  regeneration_count: number;
  max_regenerations: number;
};

/** One row of `GET .../ai-update-logs/` (Admin-only, PROJECT level - same
 * gating as manual update creation, not a workspace-level permission) - see
 * `AIGenerationLogSerializer` (apps/api/plane/app/serializers/ai_generation_log.py). */
export type TAIGenerationLog = {
  id: string;
  workspace_id: string;
  project_id: string;
  update_id: string | null;
  status: TAIGenerationStatus;
  provider: string | null;
  model_name: string | null;
  token_usage: Record<string, unknown> | null;
  error_message: string | null;
  triggered_by: string | null;
  triggered_by_detail?: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string;
    avatar_url: string;
  };
  created_at: string;
};

export type TAIGenerationLogParams = {
  cursor?: string;
  per_page?: number;
};
