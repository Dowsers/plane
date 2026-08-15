# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Generic inbound/outbound integration event log - see
docs/feature-specs/07-integrations-git.md ("5. Integration Sentry native"
and "6. Pont support client type Zendesk/Front") in plane-selfhost.

Modeled on `IntakeMessageLog` (plane/db/models/intake_channel.py, Category
2), NOT on the spec's own cited precedent `WebhookLog`
(plane/db/models/webhook.py) - `WebhookLog` has no `direction` field (it
is hard-wired outbound-only, FK'd to the outbound `Webhook` model) and no
idempotency/external-event-id field, neither of which a generic
inbound+outbound integration log can do without. `IntakeMessageLog` has
both already, in real working shape - this follows its column shape
(direction/payload as JSONField/external id) rather than WebhookLog's.

Not scoped to the spec's own suggested `workspace_integration` FK, because
that model (`WorkspaceIntegration`, plane/db/models/integration/base.py)
is dead code with no views/urls anywhere above it in this fork (confirmed
by prior category-7 research) and predates this fork's current
`WorkspaceBaseModel` conventions. Instead this logs against `workspace` +
a loose `connector_id` (UUID, not a hard FK) - exactly like
`WebhookLog.webhook` already does for the *outbound* webhook system (a
plain UUID column, not a ForeignKey) - because a generic log meant to be
"reutilisable pour de futures integrations" (the spec's own words) can't
hold a single FK type; today `connector_id` points at either a
`WorkspaceSentryConnection.id` or a `WorkspaceSupportConnector.id`
depending on `provider`, never both, and a future integration would add a
third possible target without needing a schema change here.
"""

from django.db import models

from plane.db.models.workspace import WorkspaceBaseModel


class IntegrationProvider(models.TextChoices):
    SENTRY = "sentry", "Sentry"
    ZENDESK = "zendesk", "Zendesk"
    FRONT = "front", "Front"
    GENERIC_WEBHOOK = "generic_webhook", "Generic Webhook"


class IntegrationEventDirection(models.TextChoices):
    INBOUND = "IN", "Inbound"
    OUTBOUND = "OUT", "Outbound"


class IntegrationEventLog(WorkspaceBaseModel):
    provider = models.CharField(max_length=32, choices=IntegrationProvider.choices, db_index=True)
    # Points at either a WorkspaceSentryConnection.id or a
    # WorkspaceSupportConnector.id depending on `provider` - see module
    # docstring for why this isn't a real ForeignKey.
    connector_id = models.UUIDField(null=True, blank=True, db_index=True)
    direction = models.CharField(max_length=3, choices=IntegrationEventDirection.choices)
    event_type = models.CharField(max_length=100, blank=True)
    # Inbound: the provider's own event/delivery id (Sentry's
    # `Sentry-Hook-Signature`-protected payload doesn't carry one
    # top-level id shared by every resource type, so callers pass the
    # most specific id available - e.g. issue id + action for `issue`
    # resource events, event id for `event_alert` ones; Zendesk/Front
    # ticket-event ids). Outbound: usually left null (nothing to
    # deduplicate against on the way out).
    external_event_id = models.CharField(max_length=255, null=True, blank=True)
    # Truncated/redacted payload - callers are responsible for stripping
    # secrets (API tokens, signatures) before saving here, same
    # expectation the spec places on this field.
    payload = models.JSONField(default=dict, blank=True)
    response_status = models.CharField(max_length=10, null=True, blank=True)
    error_message = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name = "Integration Event Log"
        verbose_name_plural = "Integration Event Logs"
        db_table = "integration_event_logs"
        ordering = ("-created_at",)
        constraints = [
            # Idempotence (Sentry exigence 11, Support exigence 6/8): the
            # same inbound external event id, for the same connector, is
            # never processed twice. NULL external_event_id rows are never
            # deduplicated against each other - Postgres treats NULL as
            # distinct from NULL in a unique constraint, which is exactly
            # "don't dedupe when there's nothing stable to dedupe on"
            # (outbound logs, or an inbound payload with no stable id).
            models.UniqueConstraint(
                fields=["connector_id", "external_event_id"],
                condition=models.Q(direction=IntegrationEventDirection.INBOUND, external_event_id__isnull=False),
                name="unique_inbound_external_event_id_per_connector",
            )
        ]
        indexes = [models.Index(fields=["workspace", "provider", "created_at"], name="integ_log_ws_provider_idx")]

    def __str__(self):
        return f"{self.provider}:{self.direction}:{self.event_type} <{self.workspace_id}>"
