# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from celery import shared_task

# Django imports
from django.db.models import Q
from django.utils import timezone
from datetime import timedelta

# Module imports
from plane.db.models import IntakeIssue, IntakeResponsibilitySetting
from plane.db.models.intake import IntakeIssueStatus
from plane.utils.exception_logger import log_exception
from plane.utils.intake_responsibility import next_round_robin_member, notify_assignee


@shared_task
def check_intake_escalations():
    """
    Runs every 5 minutes - reassigns Pending intake items that have sat
    with their current assignee past escalation_timeout_minutes to the next
    round-robin member. See docs/feature-specs/02-cycles-intake.md
    ("Responsabilité d'intake & auto-routage", exigence 7) in
    plane-selfhost. Escalation only applies to round_robin mode - a
    fixed_owner has no "next" member to escalate to.
    """
    settings_ids = list(
        IntakeResponsibilitySetting.objects.filter(
            is_enabled=True, assignment_mode="round_robin", project__archived_at__isnull=True
        ).values_list("id", flat=True)
    )
    for setting_id in settings_ids:
        _escalate_overdue_items_for_setting(setting_id)


def _escalate_overdue_items_for_setting(setting_id):
    try:
        setting = IntakeResponsibilitySetting.objects.select_related("project").filter(id=setting_id).first()
        if setting is None:
            return

        cutoff = timezone.now() - timedelta(minutes=setting.escalation_timeout_minutes)
        overdue_items = IntakeIssue.objects.filter(
            project_id=setting.project_id,
            status=IntakeIssueStatus.PENDING.value,
            assigned_to__isnull=False,
        ).filter(Q(last_escalated_at__isnull=True, assigned_at__lt=cutoff) | Q(last_escalated_at__lt=cutoff))

        for intake_issue in overdue_items:
            _escalate_item(intake_issue, setting)
    except Exception as e:
        log_exception(e)


def _escalate_item(intake_issue, setting):
    assignee_id, _ = next_round_robin_member(setting)
    if assignee_id is None:
        return

    intake_issue.assigned_to_id = assignee_id
    intake_issue.assigned_at = timezone.now()
    intake_issue.last_escalated_at = timezone.now()
    intake_issue.escalation_count = intake_issue.escalation_count + 1
    intake_issue.assignment_source = "round_robin"
    intake_issue.save(
        update_fields=["assigned_to", "assigned_at", "last_escalated_at", "escalation_count", "assignment_source"]
    )
    notify_assignee(intake_issue, setting.project, assignee_id, actor_id=None)
