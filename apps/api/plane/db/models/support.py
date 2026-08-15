# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Support-ticket bridge models (Zendesk/Front/generic webhook) - see
docs/feature-specs/07-integrations-git.md ("6. Pont support client type
Zendesk/Front") in plane-selfhost.

Filename matches the spec's own suggestion (`plane/db/models/support.py`).
Base classes are this fork's actual current ones
(`WorkspaceBaseModel`/`ProjectBaseModel`, plane/db/mixins.py +
plane/db/models/{workspace,project}.py) - unlike the Sentry spec (which
cited the dead `Integration`/`WorkspaceIntegration` pair), this spec's own
cited precedent `GithubIssueSync` genuinely does extend these same real
base classes, so no correction was needed here.

`IntakeIssue.support_ticket` (the spec's third data-model bullet, under
its stale `InboxIssue` name - this fork calls the model `IntakeIssue`,
Plane renamed Inbox->Intake) is added directly on the existing
`IntakeIssue` model in plane/db/models/intake.py, not here.
"""

import secrets

from django.contrib.postgres.fields import ArrayField
from django.db import models

from plane.db.fields import EncryptedTextField
from plane.db.models.project import ProjectBaseModel
from plane.db.models.workspace import WorkspaceBaseModel


def get_inbound_token():
    # Unguessable URL slug (exigence: "inbound_token... slug d'URL non
    # devinable pour l'endpoint entrant") - 32 bytes of entropy,
    # URL-safe-encoded, same order of magnitude as this fork's other
    # unguessable-token precedents (e.g. IntakeForm.token,
    # get_intake_form_token, plane/db/models/intake.py).
    return secrets.token_urlsafe(32)


class SupportConnectorProvider(models.TextChoices):
    ZENDESK = "zendesk", "Zendesk"
    FRONT = "front", "Front"
    GENERIC_WEBHOOK = "generic_webhook", "Generic Webhook"


class SupportNoteVisibility(models.TextChoices):
    INTERNAL = "internal", "Internal"
    PUBLIC = "public", "Public"


class WorkspaceSupportConnector(WorkspaceBaseModel):
    """One workspace-wide connector configuration (exigence 1, 5) - a
    given workspace may have more than one connector row (e.g. one
    Zendesk + one Front, or two Zendesk connectors for different brands),
    each independently enabled/disabled; the spec's own "hors perimetre"
    section explicitly excludes advanced multi-connector *routing* rules,
    not multiple connector rows outright."""

    provider = models.CharField(max_length=32, choices=SupportConnectorProvider.choices)
    name = models.CharField(max_length=255)
    # Zendesk: subdomain (e.g. "acme" for acme.zendesk.com). Front: not
    # used (Front's API is not per-tenant-subdomained) - left blank.
    # generic_webhook: free-form label for the external tool's base URL.
    domain = models.CharField(max_length=255, blank=True)
    # Zendesk/Front: an OAuth Bearer access token (see
    # plane/utils/support_client.py docstring for why Bearer, not Zendesk's
    # legacy Basic email/token scheme - the model here has no separate
    # "agent email" field, and Zendesk's own docs mark Basic auth as
    # deprecated in favor of OAuth). generic_webhook: unused (no outbound
    # API calls are possible without a documented API shape).
    api_token = EncryptedTextField(blank=True)
    token_last_4 = models.CharField(max_length=4, blank=True)
    webhook_secret = EncryptedTextField(blank=True)
    inbound_token = models.CharField(max_length=64, unique=True, default=get_inbound_token, editable=False)
    default_project = models.ForeignKey(
        "db.Project", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    default_state = models.ForeignKey("db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    reopen_ticket_on_resolve = models.BooleanField(default=True)
    reopen_note_visibility = models.CharField(
        max_length=10, choices=SupportNoteVisibility.choices, default=SupportNoteVisibility.INTERNAL
    )
    is_enabled = models.BooleanField(default=True)
    connected_by = models.ForeignKey(
        "db.User", on_delete=models.SET_NULL, null=True, related_name="support_connectors_made"
    )
    # generic_webhook only (exigence 2) - a minimal JSON key-mapping so an
    # admin can point this connector at a support tool with a
    # differently-named payload without a code change. See
    # plane/utils/support_client.py::extract_generic_ticket_fields for the
    # exact contract this dict is read against (each value is the dotted
    # path, e.g. "ticket.id", to read out of the inbound payload for that
    # logical field).
    generic_field_mapping = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Workspace Support Connector"
        verbose_name_plural = "Workspace Support Connectors"
        db_table = "workspace_support_connectors"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.provider}:{self.name} <{self.workspace_id}>"


class SupportTicketSyncState(models.TextChoices):
    SYNCED = "SYNCED", "Synced"
    PENDING = "PENDING", "Pending"
    ERROR = "ERROR", "Error"


class IssueSupportTicket(ProjectBaseModel):
    """Ticket <-> issue link (exigence 5: unique on
    (connector, external_ticket_id, issue), analogous to IssueLink)."""

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="support_tickets")
    connector = models.ForeignKey(WorkspaceSupportConnector, on_delete=models.CASCADE, related_name="tickets")
    external_ticket_id = models.CharField(max_length=255)
    external_ticket_url = models.URLField(blank=True, max_length=1000)
    requester_email = models.EmailField(null=True, blank=True)
    requester_name = models.CharField(max_length=255, null=True, blank=True)
    subject = models.CharField(max_length=500, blank=True)
    priority = models.CharField(max_length=50, blank=True)
    tags = ArrayField(models.CharField(max_length=100), default=list, blank=True)
    last_synced_status = models.CharField(max_length=100, blank=True)
    # Exigence 17 - "limites en taille (ex. 300 caracteres pour l'extrait)
    # - seul un extrait du dernier message est stocke, jamais le fil
    # complet". Enforced both at the DB column (max_length=300) and
    # explicitly re-truncated in application code before save (see
    # plane/utils/support_client.py) so a provider-side change in message
    # length can never raise a DB-level error instead of silently
    # truncating.
    last_message_snippet = models.CharField(max_length=300, blank=True)
    sync_state = models.CharField(
        max_length=10, choices=SupportTicketSyncState.choices, default=SupportTicketSyncState.PENDING
    )
    last_sync_error = models.TextField(null=True, blank=True)
    last_synced_at = models.DateTimeField(null=True, blank=True)
    # Exigence 18 - manual "Refresh" rate limit (1/30s/link) is enforced at
    # the view layer by comparing against this timestamp.
    last_manual_refresh_at = models.DateTimeField(null=True, blank=True)
    # Exigence 14 - retry bookkeeping for the reopen-sync backoff task.
    reopen_retry_count = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "Issue Support Ticket"
        verbose_name_plural = "Issue Support Tickets"
        db_table = "issue_support_tickets"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["connector", "external_ticket_id", "issue"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_support_ticket_per_connector_issue",
            )
        ]

    def __str__(self):
        return f"{self.connector_id}:{self.external_ticket_id} <-> {self.issue_id}"
