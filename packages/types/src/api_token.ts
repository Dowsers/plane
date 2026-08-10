/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export interface IApiToken {
  created_at: string;
  created_by: string;
  description: string;
  expired_at: string | null;
  id: string;
  is_active: boolean;
  label: string;
  last_used: string | null;
  updated_at: string;
  updated_by: string;
  user: string;
  user_type: number;
  token?: string;
  workspace: string;
  // Rate-limiting fields (category 8, feature 2) - always present on every
  // `APITokenReadSerializer` response (list/retrieve), never on `create`'s
  // write-oriented `APITokenSerializer`. See that serializer
  // (apps/api/plane/app/serializers/api.py) for how each is resolved.
  allowed_rate_limit: string;
  rate_limit_tier_key: string;
  rate_limit_effective_per_minute: number;
  rate_limit_effective_per_hour: number;
  rate_limit_current_usage_per_minute: number;
  rate_limit_overridden_by: string | null;
  rate_limit_overridden_at: string | null;
  rate_limit_override_reason: string;
}

/** Body of `PATCH /api/workspaces/{slug}/api-tokens/{pk}/rate-limit-override/`
 * (`WorkspaceAPITokenRateLimitOverrideEndpoint`, Workspace Admin only). */
export type TApiTokenRateLimitOverridePayload = {
  allowed_rate_limit: string; // "<int>/min" or "<int>/hour"
  reason: string;
};

/** Response of the same endpoint - a partial echo, not a full `IApiToken`. */
export type TApiTokenRateLimitOverrideResponse = {
  id: string;
  allowed_rate_limit: string;
  rate_limit_overridden_by: string | null;
  rate_limit_overridden_at: string | null;
  rate_limit_override_reason: string;
};
