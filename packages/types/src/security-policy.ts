/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables") -
 * frontend types matching `WorkspaceSecurityPolicy`/`WorkspaceVerifiedDomain`
 * (apps/api/plane/db/models/workspace.py) and their serializers
 * (apps/api/plane/app/serializers/workspace_security.py) exactly.
 */

export type TMemberInviteRestriction = "OWNER_ONLY" | "ADMINS_AND_ABOVE" | "ADMINS_AND_MEMBERS";

export type TAllowedAuthMethod = "EMAIL_PASSWORD" | "MAGIC_LINK" | "GOOGLE" | "GITHUB";

export type TDomainVerificationMethod = "DNS_TXT" | "HTML_FILE";

/**
 * `GET /api/workspaces/<slug>/security-policy/` returns a synthesized
 * payload (model defaults, `id`/`workspace` omitted) when no row exists
 * yet for the workspace - see `WorkspaceSecurityPolicyEndpoint.get`'s own
 * docstring - so `id`/`workspace`/audit fields are optional here.
 */
export type TWorkspaceSecurityPolicy = {
  id?: string;
  workspace?: string;
  enforce_sso_only: boolean;
  member_invite_restriction: TMemberInviteRestriction;
  allowed_auth_methods: TAllowedAuthMethod[];
  session_timeout_minutes: number | null;
  force_reauth_for_sensitive_actions: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TWorkspaceSecurityPolicyUpdatePayload = Partial<
  Pick<
    TWorkspaceSecurityPolicy,
    | "enforce_sso_only"
    | "member_invite_restriction"
    | "allowed_auth_methods"
    | "session_timeout_minutes"
    | "force_reauth_for_sensitive_actions"
  >
>;

export type TWorkspaceVerifiedDomain = {
  id: string;
  workspace: string;
  domain: string;
  verification_method: TDomainVerificationMethod;
  /** Server-generated, read-only - the raw token to embed in the DNS TXT
   * value / HTML file content (see `@plane/utils`'s
   * `dnsTxtRecordValue`/`htmlFilePath` helpers for the exact format the
   * backend's `plane.utils.domain_verification` module checks for). */
  verification_token: string;
  is_verified: boolean;
  verified_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TWorkspaceVerifiedDomainCreatePayload = {
  domain: string;
  verification_method: TDomainVerificationMethod;
};

/** Response of `POST /api/workspaces/<slug>/verified-domains/<id>/verify/`
 * - synchronous, see that endpoint's own docstring (spec's own open
 * question #3 resolved as sync, not Celery+polling). */
export type TWorkspaceVerifiedDomainVerifyResponse = {
  is_verified: boolean;
  verified_at: string | null;
  detail: string;
};

/**
 * Body shapes accepted by `POST /api/workspaces/<slug>/reauth/`
 * (`WorkspaceReauthChallengeEndpoint`) - exigence 8's "confirm you are
 * still you" challenge, reused across every sensitive action this policy
 * gates (workspace deletion, full data export, security-policy
 * modification, personal API token revocation).
 */
export type TReauthChallengeRequest =
  | { method: "password"; password: string }
  | { method: "magic_code"; action: "request" }
  | { method: "magic_code"; action: "confirm"; code: string };

export type TReauthChallengeResponse = {
  reauthenticated?: boolean;
  message?: string;
};

/**
 * Shape of the 401 body `plane.utils.reauth.reauth_required_response()`
 * returns - callers detect this via `error_code === "REAUTH_REQUIRED"`
 * (see `apps/web/core/helpers/reauth.helper.ts`) to open the reauth modal
 * instead of surfacing a generic error.
 */
export type TReauthRequiredError = {
  error_code: "REAUTH_REQUIRED";
  error_message?: string;
  detail?: string;
};
