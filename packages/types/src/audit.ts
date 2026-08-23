/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), features 3 ("Journal d'audit de securite workspace") +
 * 5 ("Role Owner dedie + Team/Project Owner delegue") merged - frontend
 * types for `WorkspaceAuditLog` (apps/api/plane/db/models/audit.py).
 *
 * Keep this list in sync with `AuditEventType` (apps/api/plane/db/models/
 * audit.py) - it is the single source of truth for the exact spelling and
 * ordering of every event type.
 */
import type { IUserLite } from "./users";

export type TAuditEventType =
  // Feature 3's own base catalogue (exigence 1)
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "MEMBER_INVITED"
  | "MEMBER_INVITE_REVOKED"
  | "MEMBER_INVITE_ACCEPTED"
  | "MEMBER_REMOVED"
  | "MEMBER_ROLE_CHANGED"
  | "MEMBER_DEACTIVATED"
  | "API_TOKEN_CREATED"
  | "API_TOKEN_REVOKED"
  | "WEBHOOK_CREATED"
  | "WEBHOOK_UPDATED"
  | "WEBHOOK_DELETED"
  | "OAUTH_CONFIG_UPDATED"
  // Feature 5's 5 ownership/lifecycle event types
  | "PROJECT_DELETED"
  | "PROJECT_OWNER_ASSIGNED"
  | "PROJECT_OWNER_REVOKED"
  | "OWNERSHIP_TRANSFERRED"
  | "WORKSPACE_DELETED";

/**
 * Matches `AUDIT_LOG_LIST_FIELDS`/`WorkspaceAuditLogListSerializer`
 * (apps/api/plane/app/serializers/audit.py) - deliberately excludes
 * `old_value`/`new_value`/`metadata`/`user_agent`, only available on the
 * detail payload below.
 */
export type TWorkspaceAuditLogListItem = {
  id: string;
  workspace: string | null;
  event_type: TAuditEventType;
  actor: IUserLite | null;
  actor_email_snapshot: string;
  target_user: IUserLite | null;
  target_email_snapshot: string;
  target_type: string;
  target_id: string;
  ip_address: string | null;
  created_at: string;
};

/**
 * Matches `WorkspaceAuditLogSerializer` (`fields = "__all__"` on the
 * model, apps/api/plane/app/serializers/audit.py) - the full payload,
 * including `old_value`/`new_value`/`metadata`/`user_agent`.
 */
export type TWorkspaceAuditLogDetail = TWorkspaceAuditLogListItem & {
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  user_agent: string;
};

/**
 * Query params understood by both the list endpoint and the CSV export
 * endpoint - see `apply_audit_log_filters`
 * (apps/api/plane/utils/audit_log_filters.py), the single shared filter
 * function both call sites use so they can never silently diverge.
 */
export type TWorkspaceAuditLogFilters = {
  event_type?: TAuditEventType[];
  actor?: string;
  target_user?: string;
  date_from?: string;
  date_to?: string;
};

export type TWorkspaceAuditLogListParams = TWorkspaceAuditLogFilters & {
  cursor?: string;
  per_page?: number;
};
