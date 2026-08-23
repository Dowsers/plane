/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables"),
 * exigence 8 - detects the `REAUTH_REQUIRED` rejection
 * `plane.utils.reauth.guard_sensitive_action` returns (401, body
 * `{"error_code": "REAUTH_REQUIRED", ...}`) for a sensitive action blocked
 * pending re-authentication. Every service in this app throws
 * `error?.response?.data` on failure (see e.g. `WorkspaceService.
 * deleteWorkspace`/`ProjectExportService.csvExport`/`WorkspaceSecurityService.
 * updateSecurityPolicy`), so the error object a `catch` sees IS that body
 * directly - but this also tolerates being handed the raw axios error
 * (`error.response.data`) in case a call site catches before that mapping.
 */
export const REAUTH_REQUIRED_ERROR_CODE = "REAUTH_REQUIRED";

export function isReauthRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { error_code?: unknown; response?: { data?: { error_code?: unknown } } };
  return err.error_code === REAUTH_REQUIRED_ERROR_CODE || err.response?.data?.error_code === REAUTH_REQUIRED_ERROR_CODE;
}
