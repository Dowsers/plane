# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from uuid import uuid4
from urllib.parse import urlparse

# Django imports
from django.db import models
from django.core.exceptions import ValidationError

# Module imports
from plane.db.models import BaseModel, ProjectBaseModel


def generate_token():
    return "plane_wh_" + uuid4().hex


def validate_schema(value):
    parsed_url = urlparse(value)
    if parsed_url.scheme not in ["http", "https"]:
        raise ValidationError("Invalid schema. Only HTTP and HTTPS are allowed.")


def validate_domain(value):
    parsed_url = urlparse(value)
    domain = parsed_url.netloc
    if domain in ["localhost", "127.0.0.1"]:
        raise ValidationError("Local URLs are not allowed.")


class Webhook(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="workspace_webhooks")
    url = models.URLField(validators=[validate_schema, validate_domain], max_length=1024)
    is_active = models.BooleanField(default=True)
    secret_key = models.CharField(max_length=255, default=generate_token)
    project = models.BooleanField(default=False)
    issue = models.BooleanField(default=False)
    module = models.BooleanField(default=False)
    cycle = models.BooleanField(default=False)
    issue_comment = models.BooleanField(default=False)
    # "workflow_rule.triggered" event - see
    # docs/feature-specs/06-automation-workflow-sla.md ("Moteur de regles
    # d'automatisation") in plane-selfhost. Unlike the other booleans above
    # this event's payload isn't a serialized model instance (see
    # webhook_task.py's `event_data_override`), it's a small bespoke dict.
    workflow_rule = models.BooleanField(default=False)
    # Covers all four governed-workflow events from
    # docs/feature-specs/06-automation-workflow-sla.md ("Workflows gouvernes
    # multi-etats avec approbations", section 4) in plane-selfhost -
    # `workflow.transition.completed`, `workflow.transition.blocked`,
    # `workflow.approval.requested`, `workflow.approval.decided`. ONE
    # boolean for all four (not four separate columns): this mirrors how
    # `issue_comment` above already covers multiple comment-related
    # sub-events (created/updated/deleted) under a single column rather
    # than one column per verb - the granularity that matters to a webhook
    # subscriber is "governed-workflow activity happened", with the actual
    # sub-event distinguished by the payload's own `event`/`action` fields
    # (same `{event, action, data}` shape every other webhook event already
    # uses), not by which column let it through the filter. Four separate
    # booleans would only pay off if real subscribers wanted e.g. approval
    # decisions but not transition completions - nothing in the spec's own
    # "Nouveaux evenements webhook" list suggests that granularity is
    # actually needed in v1.
    workflow_transition = models.BooleanField(default=False)
    is_internal = models.BooleanField(default=False)
    version = models.CharField(default="v1", max_length=50)

    def __str__(self):
        return f"{self.workspace.slug} {self.url}"

    class Meta:
        unique_together = ["workspace", "url", "deleted_at"]
        verbose_name = "Webhook"
        verbose_name_plural = "Webhooks"
        db_table = "webhooks"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "url"],
                condition=models.Q(deleted_at__isnull=True),
                name="webhook_url_unique_url_when_deleted_at_null",
            )
        ]


class WebhookLog(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="webhook_logs")
    # Associated webhook
    webhook = models.UUIDField()

    # Basic request details
    event_type = models.CharField(max_length=255, blank=True, null=True)
    request_method = models.CharField(max_length=10, blank=True, null=True)
    request_headers = models.TextField(blank=True, null=True)
    request_body = models.TextField(blank=True, null=True)

    # Response details
    response_status = models.TextField(blank=True, null=True)
    response_headers = models.TextField(blank=True, null=True)
    response_body = models.TextField(blank=True, null=True)

    # Retry Count
    retry_count = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "Webhook Log"
        verbose_name_plural = "Webhook Logs"
        db_table = "webhook_logs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.event_type} {str(self.webhook)}"


class ProjectWebhook(ProjectBaseModel):
    webhook = models.ForeignKey("db.Webhook", on_delete=models.CASCADE, related_name="project_webhooks")

    class Meta:
        unique_together = ["project", "webhook", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "webhook"],
                condition=models.Q(deleted_at__isnull=True),
                name="project_webhook_unique_project_webhook_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Webhook"
        verbose_name_plural = "Project Webhooks"
        db_table = "project_webhooks"
        ordering = ("-created_at",)
