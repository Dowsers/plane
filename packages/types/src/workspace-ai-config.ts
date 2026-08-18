/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Shared per-workspace LLM connection/config - category 9 (AI features,
 * docs/feature-specs/09-ai-features.md in plane-selfhost) infrastructure
 * prerequisite. See `apps/api/plane/db/models/ai_config.py` and
 * `apps/api/plane/app/views/workspace_ai_config.py` for the backend
 * contract this type mirrors.
 */
export type TWorkspaceAIProvider = "openai" | "anthropic" | "gemini" | "custom_openai_compatible";

/**
 * Response shape of `GET /api/workspaces/:slug/ai-config/`. `api_key` is
 * never present - only `is_configured` (whether a key is currently stored)
 * is exposed, matching this fork's convention for every other connector's
 * secret. When no config row exists yet, the backend responds with just
 * `{ is_configured: false, is_enabled: false }`, so every other field here
 * is optional.
 */
export type TWorkspaceAIConfig = {
  id?: string;
  workspace?: string;
  is_enabled: boolean;
  provider?: TWorkspaceAIProvider;
  api_base_url?: string | null;
  model_name?: string;
  is_configured: boolean;
  connected_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

/**
 * Request body for `PATCH /api/workspaces/:slug/ai-config/`. `api_key` is
 * write-only and optional - omit it to leave the stored key untouched
 * (e.g. when only flipping `is_enabled`), or send an empty string/null to
 * clear it.
 */
export type TWorkspaceAIConfigPayload = {
  provider?: TWorkspaceAIProvider;
  model_name?: string;
  api_base_url?: string | null;
  is_enabled?: boolean;
  api_key?: string | null;
};

/** Request body for `POST /api/workspaces/:slug/ai-config/test/` - any
 * field omitted falls back to the already-saved config, so the "Test
 * connection" button can validate an about-to-be-saved config before Save
 * is clicked. */
export type TWorkspaceAIConfigTestPayload = Partial<TWorkspaceAIConfigPayload>;

export type TWorkspaceAIConfigTestResponse = {
  success: boolean;
  response?: string;
  error?: string;
};
