/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserLite } from "./users";

/**
 * Category 9 (AI features, docs/feature-specs/09-ai-features.md in
 * plane-selfhost), feature 5 - "Digest periodique automatise" (Linear
 * "Pulse" equivalent). Mirrors the serializers in
 * apps/api/plane/app/serializers/digest.py and the models in
 * apps/api/plane/db/models/digest.py verbatim.
 *
 * `send_audio` is intentionally NOT part of `TDigestPreference` here even
 * though the backend schema has the field - per the backend's own module
 * docstring, it is a schema-level placeholder only (no TTS provider exists
 * anywhere in this fork, exigence 11's "point d'extension"), and no UI path
 * should ever surface or set it. `audio_file` is similarly omitted from
 * `TDigestRun`/`TDigestRunDetail`.
 */

export type TDigestFrequency = "DAILY" | "WEEKLY";

export type TDigestScope = "ALL_PROJECTS" | "FAVORITES_ONLY" | "CUSTOM";

export type TDigestRunStatus = "PENDING" | "GENERATED" | "SENT" | "SKIPPED_EMPTY" | "FAILED";

export type TDigestGenerationMethod = "TEMPLATE" | "LLM";

export type TDigestItemType =
  | "ISSUE_CREATED"
  | "ISSUE_COMPLETED"
  | "ISSUE_STATE_CHANGED"
  | "COMMENT_MENTION"
  | "CYCLE_STARTED"
  | "CYCLE_COMPLETED"
  | "CYCLE_SCOPE_CHANGED";

/** `GET/PATCH /workspaces/:slug/users/me/digest-preferences/` - any active
 * workspace member (Admin/Member/Guest), get-or-create on first access. */
export type TDigestPreference = {
  id: string;
  user: string;
  workspace: string;
  is_enabled: boolean;
  frequency: TDigestFrequency;
  day_of_week: number | null;
  time_of_day: string;
  scope: TDigestScope;
  custom_projects: string[];
  send_in_app: boolean;
  send_email: boolean;
  created_at: string;
  updated_at: string;
};

/** `custom_projects` is read-only on the backend serializer - the view
 * applies M2M writes directly from `request.data.custom_projects` after
 * validating every id belongs to this workspace (400 otherwise). Sent as a
 * plain array of project ids alongside the rest of the partial payload,
 * never through a separate call. */
export type TDigestPreferencePayload = Partial<
  Pick<
    TDigestPreference,
    "is_enabled" | "frequency" | "day_of_week" | "time_of_day" | "scope" | "send_in_app" | "send_email"
  >
> & {
  custom_projects?: string[];
};

export type TDigestItem = {
  id: string;
  digest_run: string;
  project: string;
  cycle: string | null;
  issue: string | null;
  item_type: TDigestItemType;
  actor: string | null;
  actor_detail: IUserLite | null;
  payload: Record<string, unknown>;
  position: number;
  created_at: string;
};

/** List shape - `GET /workspaces/:slug/users/me/digests/` (paginated,
 * anti-chronological). Deliberately excludes `summary_text`/`items` - see
 * `TDigestRunDetail` for the detail shape. */
export type TDigestRun = {
  id: string;
  workspace: string;
  period_start: string;
  period_end: string;
  frequency: TDigestFrequency;
  status: TDigestRunStatus;
  generation_method: TDigestGenerationMethod;
  item_count: number;
  sent_at: string | null;
  created_at: string;
};

export type TDigestItemsByProject = {
  project_id: string;
  project_name: string;
  items_by_type: Partial<Record<TDigestItemType, TDigestItem[]>>;
};

/** Detail shape - `GET /workspaces/:slug/users/me/digests/:id/`. Prefer
 * `items_by_project` (pre-grouped by project then item type) for rendering
 * over grouping the flat `items` list client-side. */
export type TDigestRunDetail = TDigestRun & {
  summary_text: string;
  items: TDigestItem[];
  items_by_project: TDigestItemsByProject[];
};

/** `POST /workspaces/:slug/users/me/digests/preview/` - rate-limited
 * (3/hour/user, see `DigestPreviewThrottle`), 429 on excess. Returns either
 * a full detail (digest had qualifying content) or this lighter
 * skipped-empty acknowledgement - never throws for the "nothing to report"
 * case, only on a genuine error/429. */
export type TDigestPreviewSkippedResponse = {
  status: "SKIPPED_EMPTY";
  message: string;
};

export type TDigestPreviewResponse = TDigestRunDetail | TDigestPreviewSkippedResponse;

/** Admin-only (`GET` any Admin/Member, `PATCH` Admin only) -
 * `GET/PATCH /workspaces/:slug/digest-settings/`. `is_digest_llm_enrichment_enabled`
 * is only ever actually used if the workspace ALSO has an enabled
 * `TWorkspaceAIConfig` (packages/types/src/workspace-ai-config.ts) - the
 * backend silently falls back to the templated digest otherwise, it never
 * fails a digest because of this. */
export type TWorkspaceDigestSettings = {
  id: string;
  digest_feature_enabled: boolean;
  is_digest_llm_enrichment_enabled: boolean;
};

export type TWorkspaceDigestSettingsPayload = Partial<
  Pick<TWorkspaceDigestSettings, "digest_feature_enabled" | "is_digest_llm_enrichment_enabled">
>;
