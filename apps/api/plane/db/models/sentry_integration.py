# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Sentry integration models - see docs/feature-specs/07-integrations-git.md
("5. Integration Sentry native") in plane-selfhost.

Does NOT reuse the spec's cited `Integration`/`WorkspaceIntegration`
(plane/db/models/integration/{base,github,slack}.py) - confirmed dead
above the model layer (no views/urls anywhere in this fork) and built on
base classes (`AuditModel`, plain `BaseModel`) that predate this fork's
current `WorkspaceBaseModel`/`ProjectBaseModel` conventions
(plane/db/mixins.py). Follows the same fresh-model pattern already used
for Figma in this same category (plane/db/models/figma.py, feature 4)
instead - plain `WorkspaceBaseModel`/`ProjectBaseModel` inheritance plus
the real `EncryptedTextField` (plane.db.fields) for secrets.

Connection style (spec's own open question 1): Sentry's "Integration
Platform" (OAuth, marketplace-style installation) needs a publicly
reachable callback URL, which this sandbox does not have. This implements
the spec's own stated alternative instead - a manually-created **Sentry
Internal Integration** token, pasted by an admin, which is what a
self-hosted-behind-a-firewall deployment can actually use today (and, per
Sentry's own docs, still gets a real webhook with the exact same
`Sentry-Hook-Signature` HMAC-SHA256 verification as a Marketplace
integration - see plane/utils/sentry_signature.py, independently verified
against Sentry's published docs).

Deduplication (exigence 4): the spec's cited mechanism -
`Issue.external_id`/`external_source` with a claimed
`unique_together(project, external_id, external_source)` - does not exist
on `Issue.Meta` in this fork (verified: no such constraint). Real,
enforced dedup here instead comes from `IssueSentryDetail`'s own
`unique_together(workspace, sentry_issue_id)` constraint below.
`Issue.external_id`/`external_source` are still populated for consistency
with this fork's real convention (the public API's idempotent-create
pattern, apps/api/plane/api/views/*.py), just not relied upon for the
uniqueness guarantee.
"""

from django.db import models

from plane.db.fields import EncryptedTextField
from plane.db.models.project import ProjectBaseModel
from plane.db.models.workspace import WorkspaceBaseModel


class WorkspaceSentryConnection(WorkspaceBaseModel):
    """One active Sentry connection per workspace - exigence 1 (connect via
    an integration token + org slug) and hors-perimetre #5 ("pas de
    support multi-organisation Sentry par workspace en V1")."""

    org_slug = models.CharField(max_length=255)
    base_url = models.URLField(
        default="https://sentry.io",
        help_text="Sentry base URL - override for self-hosted/on-premise Sentry (spec open question 2).",
    )
    api_token = EncryptedTextField()
    # Last 4 characters of the plaintext token, kept unencrypted
    # specifically so the UI can render "sntrys_****ab12" (exigence 10)
    # without ever decrypting the real token for display.
    token_last_4 = models.CharField(max_length=4, blank=True)
    webhook_secret = EncryptedTextField(
        blank=True,
        help_text="Sentry Internal Integration 'Client Secret' - verifies Sentry-Hook-Signature (exigence 11).",
    )
    is_active = models.BooleanField(default=True)
    connected_by = models.ForeignKey(
        "db.User", on_delete=models.SET_NULL, null=True, related_name="sentry_connections_made"
    )
    connected_at = models.DateTimeField(null=True, blank=True)
    last_validated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Workspace Sentry Connection"
        verbose_name_plural = "Workspace Sentry Connections"
        db_table = "workspace_sentry_connections"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace"],
                condition=models.Q(is_active=True, deleted_at__isnull=True),
                name="unique_active_sentry_connection_per_workspace",
            )
        ]

    def __str__(self):
        return f"{self.org_slug} <{self.workspace_id}>"


class SentryProjectSync(ProjectBaseModel):
    """Project <-> Sentry-project mapping - exigence 2, 5."""

    connection = models.ForeignKey(WorkspaceSentryConnection, on_delete=models.CASCADE, related_name="project_syncs")
    sentry_project_slug = models.CharField(max_length=255)
    default_state = models.ForeignKey("db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    resolved_state = models.ForeignKey(
        "db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    reopen_state = models.ForeignKey("db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    label = models.ForeignKey("db.Label", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    auto_resolve = models.BooleanField(default=True)
    auto_reopen = models.BooleanField(default=True)
    sync_comments_on_new_events = models.BooleanField(default=True)
    comment_throttle_minutes = models.PositiveIntegerField(default=60)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Sentry Project Sync"
        verbose_name_plural = "Sentry Project Syncs"
        db_table = "sentry_project_syncs"
        ordering = ("-created_at",)
        constraints = [
            # Exigence 2 - "un projet Plane = un mapping Sentry actif".
            # Soft-deleted/disabled rows don't count (FigmaWorkspaceConnection
            # precedent for the same "one active X per Y" shape).
            models.UniqueConstraint(
                fields=["project"],
                condition=models.Q(is_active=True, deleted_at__isnull=True),
                name="unique_active_sentry_sync_per_project",
            ),
            # Exigence 2 - "un même projet Sentry ne peut être mappé qu'à un
            # seul projet Plane à la fois" - scoped per connection (i.e.
            # per Sentry org), since sentry_project_slug is only unique
            # within one Sentry org, not globally.
            models.UniqueConstraint(
                fields=["connection", "sentry_project_slug"],
                condition=models.Q(is_active=True, deleted_at__isnull=True),
                name="unique_active_sentry_project_mapping",
            ),
        ]

    def __str__(self):
        return f"{self.sentry_project_slug} -> {self.project_id}"


class SentrySyncStatus(models.TextChoices):
    UNRESOLVED = "unresolved", "Unresolved"
    RESOLVED = "resolved", "Resolved"
    IGNORED = "ignored", "Ignored"


class IssueSentryDetail(ProjectBaseModel):
    """Denormalized Sentry issue details (exigence 3) + the real
    deduplication mechanism (exigence 4 - see module docstring)."""

    issue = models.OneToOneField("db.Issue", on_delete=models.CASCADE, related_name="sentry_detail")
    project_sync = models.ForeignKey(
        SentryProjectSync, on_delete=models.SET_NULL, null=True, blank=True, related_name="issue_details"
    )
    sentry_issue_id = models.CharField(max_length=255, db_index=True)
    sentry_short_id = models.CharField(max_length=255, blank=True)
    permalink = models.URLField(blank=True, max_length=1000)
    level = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=20, choices=SentrySyncStatus.choices, default=SentrySyncStatus.UNRESOLVED)
    event_count = models.PositiveIntegerField(default=0)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    # Exigence 4 - throttles the "+N occurrences" auto-comment
    # independently of `comment_throttle_minutes` living on the (possibly
    # later torn-down) SentryProjectSync row.
    last_occurrence_comment_at = models.DateTimeField(null=True, blank=True)
    # Exigence 7 - set by the outbound sync task immediately before it
    # calls the Sentry API, and checked by the inbound webhook handler (and
    # vice versa) to prevent an infinite Plane<->Sentry echo loop. See
    # plane/bgtasks/sentry_sync_task.py for the actual guard logic - this
    # field alone is not the guard, `issue_activity`'s `integration_sync_origin`
    # kwarg is the real choke point (see plane/bgtasks/issue_activities_task.py).
    last_outbound_sync_status = models.CharField(max_length=10, null=True, blank=True)
    last_sync_error = models.TextField(null=True, blank=True)
    # Exigence 13 - set False when the owning connection/project sync is
    # torn down; the link becomes read-only but history is kept.
    is_sync_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Issue Sentry Detail"
        verbose_name_plural = "Issue Sentry Details"
        db_table = "issue_sentry_details"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(fields=["workspace", "sentry_issue_id"], name="unique_sentry_issue_per_workspace")
        ]

    def __str__(self):
        return f"{self.sentry_short_id or self.sentry_issue_id} <{self.issue_id}>"
