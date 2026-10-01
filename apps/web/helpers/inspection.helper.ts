/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Inspection compliance (ISO/IEC 17020 §4.1/§4.2) - detects the rejection the
 * enforcement gate returns (`plane.utils.inspection_compliance`) when the
 * caller owes signatures and their grace period has elapsed.
 *
 * A **403**, not the 401 its sibling `isReauthRequiredError` looks for, and
 * that difference is deliberate on the backend side: `api.service.ts`'s
 * interceptor hard-redirects to the login page on any 401 except
 * REAUTH_REQUIRED, which would throw the user out of the app instead of showing
 * them the signing screen. A 403 passes straight through, so nothing in
 * `api.service.ts` needs to know this error code exists.
 *
 * Every service in this app throws `error?.response?.data` on failure, so the
 * object a `catch` sees IS that body - but this also tolerates a raw axios
 * error, matching `reauth.helper.ts`'s own tolerance.
 */
import type { TInspectionDocumentKind } from "@plane/types";

export const INSPECTION_SIGNATURE_REQUIRED_ERROR_CODE = "INSPECTION_SIGNATURE_REQUIRED";

type TInspectionErrorBody = {
  error_code?: unknown;
  project_id?: unknown;
  outstanding?: unknown;
  response?: { data?: { error_code?: unknown; project_id?: unknown; outstanding?: unknown } };
};

const unwrap = (error: unknown): TInspectionErrorBody | null => {
  if (!error || typeof error !== "object") return null;
  const err = error as TInspectionErrorBody;
  if (err.error_code === INSPECTION_SIGNATURE_REQUIRED_ERROR_CODE) return err;
  if (err.response?.data?.error_code === INSPECTION_SIGNATURE_REQUIRED_ERROR_CODE) return err.response.data;
  return null;
};

export function isInspectionSignatureRequiredError(error: unknown): boolean {
  return unwrap(error) !== null;
}

/** The kinds named in the rejection, so a caller can say what is missing
 * without a second round trip. */
export function getInspectionOutstandingKinds(error: unknown): TInspectionDocumentKind[] {
  const body = unwrap(error);
  if (!body || !Array.isArray(body.outstanding)) return [];
  return body.outstanding.filter((kind): kind is TInspectionDocumentKind => typeof kind === "string");
}

export function getInspectionBlockedProjectId(error: unknown): string | null {
  const body = unwrap(error);
  return typeof body?.project_id === "string" ? body.project_id : null;
}
