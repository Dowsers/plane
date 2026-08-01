# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Notifications and reminders for structured project status updates - see
docs/feature-specs/03-projects-roadmaps-initiatives.md ("Mises a jour de
statut structurees") in plane-selfhost. Deliberately bespoke direct-send
email tasks (EmailMultiAlternatives, no HTML template) - not the issue
notification digest pipeline (email_notification_task.py), which is
hardcoded to Issue-shaped context and cannot be reused here. "Watchers"
means all active ProjectMembers - no ProjectSubscriber/ProjectWatcher
model exists in this codebase.
"""

from datetime import timedelta

from celery import shared_task
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils import timezone

from plane.license.utils.instance_value import get_email_configuration


def _send_plain_email(subject, body, to_emails):
    if not to_emails:
        return
    (
        EMAIL_HOST,
        EMAIL_HOST_USER,
        EMAIL_HOST_PASSWORD,
        EMAIL_PORT,
        EMAIL_USE_TLS,
        EMAIL_USE_SSL,
        EMAIL_FROM,
    ) = get_email_configuration()

    connection = get_connection(
        host=EMAIL_HOST,
        port=int(EMAIL_PORT),
        username=EMAIL_HOST_USER,
        password=EMAIL_HOST_PASSWORD,
        use_tls=EMAIL_USE_TLS == "1",
        use_ssl=EMAIL_USE_SSL == "1",
    )
    msg = EmailMultiAlternatives(subject=subject, body=body, from_email=EMAIL_FROM, to=to_emails, connection=connection)
    msg.send()


def cadence_timedelta(cadence):
    if cadence == "WEEKLY":
        return timedelta(days=7)
    if cadence == "BIWEEKLY":
        return timedelta(days=14)
    if cadence == "MONTHLY":
        return timedelta(days=30)
    return None


@shared_task
def notify_project_update_published(project_update_id):
    from plane.db.models import ProjectUpdate, ProjectMember, Notification

    project_update = ProjectUpdate.objects.filter(pk=project_update_id).first()
    if project_update is None:
        return

    project = project_update.project
    members = ProjectMember.objects.filter(project=project, is_active=True).exclude(
        member_id=project_update.created_by_id
    )

    status_label = project_update.get_status_display()
    title = f'New status update on "{project.name}": {status_label}'
    message_stripped = project_update.description_html or status_label

    to_emails = []
    for member in members:
        Notification.objects.create(
            workspace_id=project.workspace_id,
            project_id=project.id,
            entity_identifier=project_update.id,
            entity_name="PROJECT_UPDATE",
            title=title,
            message=[{"data": message_stripped}],
            message_stripped=message_stripped,
            sender="in_app:project_update:published",
            triggered_by_id=project_update.created_by_id,
            receiver_id=member.member_id,
        )
        if member.member.email:
            to_emails.append(member.member.email)

    if to_emails:
        _send_plain_email(title, message_stripped, to_emails)


@shared_task
def send_project_update_reminders():
    from plane.db.models import Project, ProjectUpdateReminder, Notification

    now = timezone.now()
    due_projects = Project.objects.filter(
        archived_at__isnull=True,
        update_reminder_enabled=True,
        next_update_due_at__isnull=False,
        next_update_due_at__lte=now,
        update_owner__isnull=False,
    )

    for project in due_projects:
        reminder, _ = ProjectUpdateReminder.objects.get_or_create(
            project=project,
            scheduled_for=project.next_update_due_at,
            defaults={"workspace_id": project.workspace_id},
        )

        if reminder.reminder_count >= 3:
            continue
        if reminder.sent_at is not None and (now - reminder.sent_at) < timedelta(days=2):
            continue

        title = f'Status update overdue for "{project.name}"'
        message = f"A status update for {project.name} is overdue. Please publish one when you can."
        Notification.objects.create(
            workspace_id=project.workspace_id,
            project_id=project.id,
            entity_identifier=project.id,
            entity_name="PROJECT_UPDATE_REMINDER",
            title=title,
            message=[{"data": message}],
            message_stripped=message,
            sender="in_app:project_update:reminder",
            receiver_id=project.update_owner_id,
        )
        if project.update_owner.email:
            _send_plain_email(title, message, [project.update_owner.email])

        reminder.sent_at = now
        reminder.reminder_count += 1
        reminder.save(update_fields=["sent_at", "reminder_count"])
