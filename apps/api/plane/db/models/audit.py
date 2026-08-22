# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (Admin, Security, SSO/SCIM & Permissions,
docs/feature-specs/11-admin-security-sso.md in plane-selfhost), features 3
("Journal d'audit de sécurité workspace") + 5 ("Rôle Owner dédié + Team/
Project Owner délégué") - MERGED model per this initiative's own
pre-implementation research (the two spec sections each independently
proposed an incompatible `WorkspaceAuditLog` model).

Canonical shape = feature 3's own proposal (broader: `ip_address`/
`user_agent`/actor+target snapshot fields, more indexes), EXTENDED with:
- feature 5's 5 ownership/lifecycle event types added to feature 3's own
  `AuditEventType` enum.
- A GENERALIZED target representation (`target_type`/`target_id` as plain
  strings, feature 5's own proposal) since feature 5's targets include
  Project and Workspace instances, not just User - kept ALONGSIDE (not
  instead of) feature 3's `target_user`/`target_email_snapshot` FK+snapshot
  pair, which stays populated only when the target genuinely is a user, so
  the pre-existing member-focused event types keep a real FK for
  convenient querying while project/workspace-targeted events use the
  generic string pair instead.
"""

# Django imports
from django.conf import settings
from django.db import models

# Module imports
from .base import BaseModel


class AuditEventType(models.TextChoices):
    # Feature 3's own base catalogue (exigence 1).
    LOGIN_SUCCESS = "LOGIN_SUCCESS"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGOUT = "LOGOUT"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"
    MEMBER_INVITED = "MEMBER_INVITED"
    MEMBER_INVITE_REVOKED = "MEMBER_INVITE_REVOKED"
    MEMBER_INVITE_ACCEPTED = "MEMBER_INVITE_ACCEPTED"
    MEMBER_REMOVED = "MEMBER_REMOVED"
    MEMBER_ROLE_CHANGED = "MEMBER_ROLE_CHANGED"
    MEMBER_DEACTIVATED = "MEMBER_DEACTIVATED"
    API_TOKEN_CREATED = "API_TOKEN_CREATED"
    API_TOKEN_REVOKED = "API_TOKEN_REVOKED"
    WEBHOOK_CREATED = "WEBHOOK_CREATED"
    WEBHOOK_UPDATED = "WEBHOOK_UPDATED"
    WEBHOOK_DELETED = "WEBHOOK_DELETED"
    OAUTH_CONFIG_UPDATED = "OAUTH_CONFIG_UPDATED"
    # Feature 5's 5 ownership/lifecycle event types, added per decision #1 -
    # note feature 5's own proposal named this last one
    # "OAUTH_CONFIG_CHANGED", a near-duplicate of feature 3's
    # "OAUTH_CONFIG_UPDATED" above - the merge keeps ONE (feature 3's
    # spelling, already listed above) rather than two synonyms.
    PROJECT_DELETED = "PROJECT_DELETED"
    PROJECT_OWNER_ASSIGNED = "PROJECT_OWNER_ASSIGNED"
    PROJECT_OWNER_REVOKED = "PROJECT_OWNER_REVOKED"
    OWNERSHIP_TRANSFERRED = "OWNERSHIP_TRANSFERRED"
    WORKSPACE_DELETED = "WORKSPACE_DELETED"


class WorkspaceAuditLog(BaseModel):
    """Immutable security/audit trail entry (exigence 5 - no update/delete
    API for individual entries, see decision #3's purge-only-in-bulk
    convention). `BaseModel` already provides `id`/`created_at`/
    `updated_at`/`created_by`/`updated_by`/`deleted_at` - `created_at` here
    IS the event timestamp (exigence 2), and this model deliberately never
    uses `updated_at`/soft-delete (rows are hard-purged in bulk by the
    retention task, see `plane.bgtasks.cleanup_task.purge_expired_audit_logs`,
    never individually)."""

    workspace = models.ForeignKey(
        "db.Workspace",
        related_name="audit_logs",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )  # null = instance-scoped event (OAUTH_CONFIG_UPDATED) - exigence 10.

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="audit_logs_performed",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    # Exigence 9 - survives actor deletion, captured at write time.
    actor_email_snapshot = models.CharField(max_length=255, blank=True)

    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="audit_logs_targeted",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
    )
    # Exigence 9 - survives target_user deletion, captured at write time.
    target_email_snapshot = models.CharField(max_length=255, blank=True)

    # Generalized target representation (feature 5's own proposal) - used
    # for non-user targets (Project, Workspace) where `target_user` above
    # is left null. Plain strings (not a FK/ContentType) since the targets
    # span models across apps and a target row (e.g. a deleted Project) may
    # itself no longer exist by the time this entry is read.
    target_type = models.CharField(max_length=32, blank=True)
    target_id = models.CharField(max_length=255, blank=True)

    event_type = models.CharField(max_length=64, choices=AuditEventType.choices, db_index=True)

    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        verbose_name = "Workspace Audit Log"
        verbose_name_plural = "Workspace Audit Logs"
        db_table = "workspace_audit_logs"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["workspace", "-created_at"]),
            models.Index(fields=["workspace", "event_type"]),
            models.Index(fields=["actor", "-created_at"]),
            models.Index(fields=["target_user", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type} <{self.workspace_id}>"
