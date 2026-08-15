# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Figma integration models - see docs/feature-specs/07-integrations-git.md
("4. Plugin Figma") in plane-selfhost, docker/api/figma-integration/README.md
for what's real vs documented-gap in this iteration.

Confirmed genuinely greenfield before this session (no model, view,
migration, frontend component, or editor extension existed anywhere for
Figma in this fork).

The spec's own model snippet suggests plain `WorkspaceBaseModel`/
`ProjectBaseModel` inheritance, matching this fork's actual base classes
(apps/api/plane/db/mixins.py + db/models/workspace.py + db/models/project.py)
almost exactly - the one adjustment made here is using this fork's real
`EncryptedTextField` (plane.db.fields) instead of the spec's bare
`EncryptedTextField()` (which doesn't exist as a stdlib/Django type - the
spec assumed a field that had to be built as part of this same initiative,
see plane.db.fields.EncryptedTextField's own docstring). `WorkspaceBaseModel`
in this fork also carries an (unused, nullable) `project` FK automatically -
harmless here, not part of the spec's own model shape, left as-is rather
than fighting the base class.
"""

from django.db import models

from plane.db.fields import EncryptedTextField
from plane.db.models.project import ProjectBaseModel
from plane.db.models.workspace import WorkspaceBaseModel


class FigmaWorkspaceConnection(WorkspaceBaseModel):
    """
    One active Figma OAuth connection per workspace (exigence 1 - a
    second connection attempt should "propose replacing" the existing
    one; enforced here at the DB level by keeping only one row
    `is_active=True` at a time, the replacing view flips the old row to
    `is_active=False` before creating the new one rather than deleting it,
    so the audit trail of past connections survives).
    """

    figma_team_id = models.CharField(max_length=255, blank=True)
    figma_team_name = models.CharField(max_length=255, blank=True)
    # Figma account (not team) that authorized the OAuth grant.
    figma_user_id = models.CharField(max_length=255)
    figma_user_handle = models.CharField(max_length=255, blank=True)
    access_token = EncryptedTextField()
    refresh_token = EncryptedTextField(blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    connected_by = models.ForeignKey(
        "db.User", on_delete=models.SET_NULL, null=True, related_name="figma_connections_made"
    )

    class Meta:
        verbose_name = "Figma Workspace Connection"
        verbose_name_plural = "Figma Workspace Connections"
        db_table = "figma_workspace_connections"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace"],
                condition=models.Q(is_active=True, deleted_at__isnull=True),
                name="unique_active_figma_connection_per_workspace",
            )
        ]

    def __str__(self):
        return f"{self.figma_team_name or self.figma_user_handle} <{self.workspace_id}>"


class FigmaFileLink(ProjectBaseModel):
    """
    Links a Figma frame/file to a work item (exigences 3-9). A given
    (workspace, figma_file_key, figma_node_id) can only be the ACTIVE sync
    target (`sync_status_enabled=True`) for one issue at a time (exigence
    4) - enforced by the partial unique constraint below; extra links to
    the same frame remain possible but are forced to
    `sync_status_enabled=False` at creation (see the view, which converts
    the resulting IntegrityError into the spec's documented 409 shape:
    "Cette frame est deja synchronisee avec <identifier>").

    NULL-node caveat (documented, not fixed): Postgres treats NULL as
    distinct from NULL for uniqueness purposes, so two `sync_status_enabled`
    file-level links (figma_node_id=NULL, i.e. "whole file" rather than one
    frame) for the same figma_file_key would NOT collide via this
    constraint the way two frame-level links would. The spec's own model
    section doesn't address this edge case either; left as a known gap
    rather than adding an extra sentinel-value workaround the spec didn't
    ask for.
    """

    DIRECTION_CHOICES = (("plane_to_figma", "Plane -> Figma"), ("figma_to_plane", "Figma -> Plane"))

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="figma_links")
    figma_file_key = models.CharField(max_length=255)
    figma_node_id = models.CharField(max_length=255, null=True, blank=True)
    figma_file_name = models.CharField(max_length=500, blank=True)
    figma_node_name = models.CharField(max_length=500, blank=True)
    url = models.URLField()
    thumbnail_url = models.URLField(blank=True, null=True)
    sync_status_enabled = models.BooleanField(default=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    last_sync_error = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name = "Figma File Link"
        verbose_name_plural = "Figma File Links"
        db_table = "figma_file_links"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "figma_file_key", "figma_node_id"],
                condition=models.Q(sync_status_enabled=True, deleted_at__isnull=True),
                name="unique_active_figma_sync_target",
            )
        ]
        indexes = [models.Index(fields=["issue"])]

    def __str__(self):
        return f"{self.figma_file_key}:{self.figma_node_id} -> {self.issue_id}"


class FigmaSyncLog(ProjectBaseModel):
    """
    Outbound/inbound sync audit trail (exigence 13's retry/backoff worker
    writes one row per attempt here) - direction naming matches
    FigmaFileLink's own docstring cross-reference above.
    """

    DIRECTION_CHOICES = (("plane_to_figma", "Plane -> Figma"), ("figma_to_plane", "Figma -> Plane"))

    file_link = models.ForeignKey(FigmaFileLink, on_delete=models.CASCADE, related_name="sync_logs")
    direction = models.CharField(max_length=20, choices=DIRECTION_CHOICES)
    payload = models.JSONField(default=dict, blank=True)
    success = models.BooleanField(default=True)
    error_message = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name = "Figma Sync Log"
        verbose_name_plural = "Figma Sync Logs"
        db_table = "figma_sync_logs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.direction}:{'ok' if self.success else 'error'} <{self.file_link_id}>"
