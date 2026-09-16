/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables") -
 * display labels for `TMemberInviteRestriction`/`TAllowedAuthMethod`/
 * `TDomainVerificationMethod` (@plane/types), used by the Workspace
 * Settings > Security > security-policy panel and verified-domains panel.
 */
import type { TAllowedAuthMethod, TDomainVerificationMethod, TMemberInviteRestriction } from "@plane/types";

export const MEMBER_INVITE_RESTRICTION_I18N_LABELS: Record<TMemberInviteRestriction, string> = {
  OWNER_ONLY: "security_policy_panel.invite_restriction.options.owner_only.label",
  ADMINS_AND_ABOVE: "security_policy_panel.invite_restriction.options.admins_and_above.label",
  ADMINS_AND_MEMBERS: "security_policy_panel.invite_restriction.options.admins_and_members.label",
};

export const MEMBER_INVITE_RESTRICTION_I18N_DESCRIPTIONS: Record<TMemberInviteRestriction, string> = {
  OWNER_ONLY: "security_policy_panel.invite_restriction.options.owner_only.description",
  ADMINS_AND_ABOVE: "security_policy_panel.invite_restriction.options.admins_and_above.description",
  ADMINS_AND_MEMBERS: "security_policy_panel.invite_restriction.options.admins_and_members.description",
};

export const MEMBER_INVITE_RESTRICTION_OPTIONS: TMemberInviteRestriction[] = [
  "OWNER_ONLY",
  "ADMINS_AND_ABOVE",
  "ADMINS_AND_MEMBERS",
];

export const ALLOWED_AUTH_METHOD_LABELS: Record<TAllowedAuthMethod, string> = {
  EMAIL_PASSWORD: "Email / Password",
  MAGIC_LINK: "Magic Link / OTP",
  GOOGLE: "Google OAuth",
  GITHUB: "GitHub OAuth",
};

export const DOMAIN_VERIFICATION_METHOD_I18N_LABELS: Record<TDomainVerificationMethod, string> = {
  DNS_TXT: "verified_domains_panel.method.dns_txt",
  HTML_FILE: "verified_domains_panel.method.html_file",
};

export const DOMAIN_VERIFICATION_METHOD_OPTIONS: TDomainVerificationMethod[] = ["DNS_TXT", "HTML_FILE"];

/** Exigence 7 - "5 a 43200 (30 jours max)", matches
 * `WorkspaceSecurityPolicySerializer.validate_session_timeout_minutes`. */
export const SESSION_TIMEOUT_MINUTES_MIN = 5;
export const SESSION_TIMEOUT_MINUTES_MAX = 43200;
