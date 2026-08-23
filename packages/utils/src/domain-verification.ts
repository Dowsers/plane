/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables") -
 * pure, frontend-only mirrors of `apps/api/plane/utils/domain_verification.py`'s
 * `dns_txt_record_value`/`html_file_path` helpers, so the "Add domain"
 * flow can show an Owner exactly what to publish without a round trip.
 * MUST stay in sync with that module - the backend is the actual source
 * of truth these strings are checked against.
 */

const TOKEN_PREFIX = "plane-verify";

/** The exact TXT record VALUE to publish on the bare domain (no
 * subdomain) - matches `plane.utils.domain_verification.dns_txt_record_value`. */
export function dnsTxtRecordValue(token: string): string {
  return `${TOKEN_PREFIX}=${token}`;
}

/** Well-known path (no scheme/domain) a plain-text file containing the
 * token must be served at - matches
 * `plane.utils.domain_verification.html_file_path`. */
export function htmlFileVerificationPath(token: string): string {
  return `/.well-known/${TOKEN_PREFIX}-${token}.txt`;
}
