/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TInstanceSAMLConfiguration } from "@plane/types";

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 1 ("SSO SAML 2.0 natif") - "Surfaces UI"
 * wording: god-mode lists SAML configurations with status
 * (Actif/Domaine non vérifié/Désactivé). Derived, not persisted -
 * `InstanceSAMLConfiguration` itself only has `is_enabled`; verification
 * status lives on its `domains`.
 */
export type TSAMLConfigStatus = "active" | "domain_unverified" | "disabled";

export const SAML_CONFIG_STATUS_LABELS: Record<TSAMLConfigStatus, string> = {
  active: "Active",
  domain_unverified: "Domain not verified",
  disabled: "Disabled",
};

export function getSamlConfigStatus(
  config: Pick<TInstanceSAMLConfiguration, "is_enabled" | "domains">
): TSAMLConfigStatus {
  if (config.is_enabled) return "active";
  if (config.domains.length > 0 && !config.domains.some((domain) => domain.is_verified)) return "domain_unverified";
  return "disabled";
}
