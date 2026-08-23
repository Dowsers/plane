/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 1 ("SSO SAML 2.0 natif"), exigence 13 - the
 * "Test connection" round trip.
 *
 * `POST /api/instances/admin/saml-configurations/<id>/test-connection/`
 * returns a `redirect_url` the browser must actually navigate to (a real
 * SAML AuthnRequest to the IdP). The IdP then posts the resulting
 * SAMLResponse back to `/auth/saml/<id>/acs/`, which - per
 * `plane.authentication.views.saml.SAMLACSEndpoint._handle_test_connection`
 * - ALWAYS redirects to the bare god-mode admin root
 * (`base_host(request, is_admin=True)`, i.e. `/god-mode/?saml_test_result=
 * ...`), never to the specific SAML config page the test was launched
 * from (the backend has no way to know which admin-app route that was).
 *
 * Two problems this module solves together:
 * 1. The admin app's own `(home)/layout.tsx` redirects an already
 *    logged-in admin away from `/` to `/general` on mount - it must special
 *    -case `saml_test_result` and forward to the SAML config page instead
 *    of losing the query string.
 * 2. The config id itself isn't in that redirect's query string, so it's
 *    stashed in `sessionStorage` right before navigating to `redirect_url`,
 *    and read back once landing on `/`.
 */

const PENDING_KEY = "plane:saml-test-connection:pending-config-id";
const RESULT_KEY = "plane:saml-test-connection:result-query";

/** Call right before `window.location.assign(redirect_url)`. */
export function rememberPendingSamlTestConnection(configId: string): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, configId);
  } catch {
    // sessionStorage unavailable (private browsing, etc.) - the result
    // simply won't be relayed back; the round trip itself still works.
  }
}

/** Called once, from `(home)/layout.tsx`, when a `saml_test_result` query
 * param is observed on the admin root. Returns the config id to forward
 * to (or `null` if none was stashed - e.g. a stale/replayed URL), and
 * stashes the raw query string so the destination page can read the
 * actual result once it mounts. Clears the pending-id marker either way. */
export function consumePendingSamlTestConnection(search: string): string | null {
  let configId: string | null = null;
  try {
    configId = window.sessionStorage.getItem(PENDING_KEY);
    window.sessionStorage.removeItem(PENDING_KEY);
    window.sessionStorage.setItem(RESULT_KEY, search);
  } catch {
    return null;
  }
  return configId;
}

/** Called once, from the SAML config detail page, on mount. Returns the
 * raw `search` query string of the test-connection result (parse with
 * `URLSearchParams`) or `null` if there is none pending, and clears it. */
export function readAndClearSamlTestConnectionResult(): string | null {
  try {
    const value = window.sessionStorage.getItem(RESULT_KEY);
    window.sessionStorage.removeItem(RESULT_KEY);
    return value;
  } catch {
    return null;
  }
}
