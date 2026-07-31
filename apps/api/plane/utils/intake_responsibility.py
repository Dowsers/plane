# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.utils import timezone

# Module imports
from plane.app.permissions.base import ROLE
from plane.db.models import IntakeResponsibilitySetting, IntakeRotationMember, Notification, ProjectMember


def assign_intake_responsibility(intake_issue, project, actor_id=None):
    """
    Computes and persists the current responsible member for a freshly
    created intake issue, per the project's IntakeResponsibilitySetting -
    exigences 1-4 et 9 de docs/feature-specs/02-cycles-intake.md
    ("Responsabilité d'intake & auto-routage") in plane-selfhost. No-op if
    the feature isn't enabled for the project.
    """
    setting = IntakeResponsibilitySetting.objects.filter(project_id=project.id, is_enabled=True).first()
    if setting is None:
        return

    if setting.assignment_mode == "fixed_owner":
        assignee_id, source = setting.fixed_owner_id, "fixed_owner"
    else:
        assignee_id, source = next_round_robin_member(setting)

    if assignee_id is None:
        _notify_admins_uncovered(intake_issue, project)
        return

    intake_issue.assigned_to_id = assignee_id
    intake_issue.assigned_at = timezone.now()
    intake_issue.assignment_source = source
    intake_issue.save(update_fields=["assigned_to", "assigned_at", "assignment_source"])

    notify_assignee(intake_issue, project, assignee_id, actor_id)


def next_round_robin_member(setting):
    """
    Atomically reads and advances the persistent rotation cursor -
    exigence 8 (jamais remis à zéro) et exigence 14 (deux items créés en
    même temps ne reçoivent jamais le même tour) de la spec.
    """
    with transaction.atomic():
        locked_setting = IntakeResponsibilitySetting.objects.select_for_update().get(id=setting.id)
        active_member_ids = list(
            IntakeRotationMember.objects.filter(responsibility_setting=locked_setting, is_active=True)
            .order_by("sort_order")
            .values_list("member_id", flat=True)
        )
        if not active_member_ids:
            return None, "round_robin"

        index = locked_setting.rotation_cursor % len(active_member_ids)
        locked_setting.rotation_cursor = locked_setting.rotation_cursor + 1
        locked_setting.save(update_fields=["rotation_cursor"])
        return active_member_ids[index], "round_robin"


def _notify_admins_uncovered(intake_issue, project):
    admin_ids = list(
        ProjectMember.objects.filter(
            workspace_id=project.workspace_id,
            project_id=project.id,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).values_list("member_id", flat=True)
    )
    if not admin_ids:
        return

    Notification.objects.bulk_create(
        [
            Notification(
                workspace_id=project.workspace_id,
                project_id=project.id,
                entity_identifier=intake_issue.id,
                entity_name="INTAKE_ISSUE",
                title="Intake item not covered",
                message=[{"data": "No active rotation member is available to triage this intake item."}],
                message_stripped="No active rotation member is available to triage this intake item.",
                sender="in_app:intake_activities:uncovered",
                receiver_id=admin_id,
            )
            for admin_id in admin_ids
        ]
    )


def notify_assignee(intake_issue, project, assignee_id, actor_id):
    Notification.objects.create(
        workspace_id=project.workspace_id,
        project_id=project.id,
        entity_identifier=intake_issue.id,
        entity_name="INTAKE_ISSUE",
        title="You have been assigned an intake item",
        message=[{"data": "You have been assigned a new intake item to triage."}],
        message_stripped="You have been assigned a new intake item to triage.",
        sender="in_app:intake_activities:assigned",
        triggered_by_id=actor_id,
        receiver_id=assignee_id,
    )
