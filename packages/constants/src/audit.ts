/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), features 3+5 merged - display labels for
 * `TAuditEventType` (@plane/types), used by the Workspace Settings >
 * Security > Audit log table/filters and its CSV export.
 */
import type { TAuditEventType } from "@plane/types";

export const AUDIT_EVENT_TYPE_LABELS: Record<TAuditEventType, string> = {
  LOGIN_SUCCESS: "Login succeeded",
  LOGIN_FAILED: "Login failed",
  LOGOUT: "Logout",
  PASSWORD_CHANGED: "Password changed",
  MEMBER_INVITED: "Member invited",
  MEMBER_INVITE_REVOKED: "Member invite revoked",
  MEMBER_INVITE_ACCEPTED: "Member invite accepted",
  MEMBER_REMOVED: "Member removed",
  MEMBER_ROLE_CHANGED: "Member role changed",
  MEMBER_DEACTIVATED: "Member deactivated",
  API_TOKEN_CREATED: "API token created",
  API_TOKEN_REVOKED: "API token revoked",
  WEBHOOK_CREATED: "Webhook created",
  WEBHOOK_UPDATED: "Webhook updated",
  WEBHOOK_DELETED: "Webhook deleted",
  OAUTH_CONFIG_UPDATED: "OAuth config updated",
  PROJECT_DELETED: "Project deleted",
  PROJECT_OWNER_ASSIGNED: "Project Owner assigned",
  PROJECT_OWNER_REVOKED: "Project Owner revoked",
  OWNERSHIP_TRANSFERRED: "Workspace ownership transferred",
  WORKSPACE_DELETED: "Workspace deleted",
};

export const AUDIT_EVENT_TYPE_OPTIONS: { value: TAuditEventType; label: string }[] = (
  Object.keys(AUDIT_EVENT_TYPE_LABELS) as TAuditEventType[]
).map((value) => ({ value, label: AUDIT_EVENT_TYPE_LABELS[value] }));
