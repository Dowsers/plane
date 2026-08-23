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

export const MEMBER_INVITE_RESTRICTION_LABELS: Record<TMemberInviteRestriction, string> = {
  OWNER_ONLY: "Owner only",
  ADMINS_AND_ABOVE: "Admins and above (default)",
  ADMINS_AND_MEMBERS: "Admins and Members",
};

export const MEMBER_INVITE_RESTRICTION_DESCRIPTIONS: Record<TMemberInviteRestriction, string> = {
  OWNER_ONLY: "Only the workspace Owner can invite new members.",
  ADMINS_AND_ABOVE: "Admins (and the Owner) can invite new members.",
  ADMINS_AND_MEMBERS: "Admins and Members can invite new members.",
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

export const DOMAIN_VERIFICATION_METHOD_LABELS: Record<TDomainVerificationMethod, string> = {
  DNS_TXT: "DNS TXT record",
  HTML_FILE: "HTML file upload",
};

export const DOMAIN_VERIFICATION_METHOD_OPTIONS: TDomainVerificationMethod[] = ["DNS_TXT", "HTML_FILE"];

/** Exigence 7 - "5 a 43200 (30 jours max)", matches
 * `WorkspaceSecurityPolicySerializer.validate_session_timeout_minutes`. */
export const SESSION_TIMEOUT_MINUTES_MIN = 5;
export const SESSION_TIMEOUT_MINUTES_MAX = 43200;
