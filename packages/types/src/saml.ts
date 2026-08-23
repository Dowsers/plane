/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 1 ("SSO SAML 2.0 natif") - frontend types
 * matching `InstanceSAMLConfiguration`/`SAMLVerifiedDomain`
 * (apps/api/plane/license/models/saml.py) and their serializers
 * (apps/api/plane/license/api/serializers/saml.py) exactly, plus the
 * public `/auth/saml/discover/` response shape
 * (apps/api/plane/authentication/views/saml.py's `SAMLDiscoverEndpoint`).
 */

export type TSAMLSignatureAlgorithm = "rsa-sha256" | "rsa-sha384" | "rsa-sha512";

/** Exigence 2 - `email` mandatory, `first_name`/`last_name` optional.
 * Values are the SAML `<Attribute Name="...">` (or `FriendlyName`) the
 * IdP actually emits - matches
 * `plane.license.models.saml.get_default_attribute_mapping`'s shape,
 * always admin-editable per configuration. */
export type TSAMLAttributeMapping = {
  email: string;
  first_name?: string;
  last_name?: string;
};

export type TSAMLVerifiedDomain = {
  id: string;
  saml_configuration: string;
  domain: string;
  /** Server-generated, read-only - the raw token to embed in the DNS TXT
   * record value (see `@plane/utils`'s `dnsTxtRecordValue` helper - SAML
   * domain verification is DNS_TXT only, unlike feature 6's
   * `WorkspaceVerifiedDomain` which also offers HTML_FILE). */
  verification_token: string;
  is_verified: boolean;
  verified_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TSAMLVerifiedDomainCreatePayload = {
  domain: string;
};

/** Response of
 * `POST /api/instances/admin/saml-configurations/<pk>/domains/<domain_id>/verify/`
 * - synchronous (DNS TXT only), matching
 * `InstanceSAMLDomainVerifyEndpoint`'s own docstring. */
export type TSAMLVerifiedDomainVerifyResponse = {
  is_verified: boolean;
  verified_at: string | null;
  detail: string;
};

export type TInstanceSAMLConfiguration = {
  id: string;
  name: string;
  idp_entity_id: string;
  idp_sso_url: string;
  idp_slo_url: string | null;
  idp_certificate: string;
  metadata_url: string | null;
  /** Server-generated (exigence 5), read-only - never admin-entered. */
  sp_entity_id: string;
  attribute_mapping: TSAMLAttributeMapping;
  signature_algorithm: TSAMLSignatureAlgorithm;
  is_enabled: boolean;
  enforce_sso: boolean;
  /** Real deviation from the spec's own field list (see the backend
   * model's own docstring) - configurable per-config
   * `NotBefore`/`NotOnOrAfter` clock-skew tolerance, default 180s. */
  clock_skew_tolerance_seconds: number;
  /** Exigence 3 - a single GET on a configuration shows its domains'
   * verification status without a separate list endpoint. */
  domains: TSAMLVerifiedDomain[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** `POST /api/instances/admin/saml-configurations/` - a brand new
 * configuration can never be created already-enabled (the backend 400s
 * if `is_enabled` is passed truthy - add and verify a domain first, then
 * PATCH `is_enabled: true`), so `is_enabled`/`enforce_sso` are
 * deliberately omitted here. */
export type TInstanceSAMLConfigurationCreatePayload = {
  name: string;
  idp_entity_id: string;
  idp_sso_url: string;
  idp_slo_url?: string | null;
  idp_certificate: string;
  metadata_url?: string | null;
  attribute_mapping: TSAMLAttributeMapping;
  signature_algorithm: TSAMLSignatureAlgorithm;
  clock_skew_tolerance_seconds: number;
};

export type TInstanceSAMLConfigurationUpdatePayload = Partial<
  TInstanceSAMLConfigurationCreatePayload & {
    is_enabled: boolean;
    enforce_sso: boolean;
  }
>;

/** `POST /api/instances/admin/saml-configurations/<pk>/test-connection/`
 * (exigence 13) - initiates a real SAML round-trip (the browser must be
 * navigated to `redirect_url`, not fetched); the detailed
 * success/error report is delivered later, out-of-band, via a redirect
 * back to the god-mode admin root with `saml_test_result`/... query
 * params - see `SAMLACSEndpoint._handle_test_connection` and this app's
 * own `helpers/saml-test-connection.ts`. */
export type TSAMLTestConnectionResponse = {
  redirect_url: string;
  request_id: string;
};

/** Query params `plane.authentication.views.saml.SAMLACSEndpoint`'s
 * test-connection branch redirects the god-mode admin root with. */
export type TSAMLTestConnectionResult =
  | { saml_test_result: "success"; saml_test_email?: string; saml_test_name_id?: string }
  | { saml_test_result: "error"; saml_test_code?: string; saml_test_detail?: string };

/** `POST /auth/saml/discover/` (public/unauthenticated) - the login
 * screen calls this right after email entry to decide whether to show
 * password/OTP/OAuth or a "Continue with {IdP}" button. */
export type TSAMLDiscoverResponse =
  | { sso_applies: false }
  | {
      sso_applies: true;
      config_id: string;
      name: string;
      enforce_sso: boolean;
      login_url: string;
    };
