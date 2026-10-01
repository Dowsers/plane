# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Reminder emails for outstanding inspection obligations (ISO/IEC 17020
§4.1/§4.2).

Runs daily (see the beat entry in `plane.celery`). Three things happen here, in
this order, and the ordering matters:

1. Obligations that have since been satisfied get their stale `blocked_since`
   cleared. The endpoints already do this at the two moments satisfaction
   actually occurs (signing, and a manager accepting a declaration); this is the
   nightly safety net, so a row can never stay "blocked" forever because of a
   crash between the two.
2. Members still inside their grace period get a reminder - THROTTLED, see
   below.
3. Members whose grace period has elapsed get exactly ONE "your access is now
   blocked" email, on the null -> set transition of `blocked_since`.

## Why the cadence is driven by the obligation row, not the calendar

A naive "email everyone outstanding, daily" would send a finance auditor four
emails a day across four engagements, which trains people to filter them -
exactly the opposite of what a compliance reminder is for. So:

- First reminder goes out immediately (`reminder_count == 0`).
- Subsequent ones only after `REMINDER_INTERVAL`, capped at `MAX_REMINDERS`
  during the grace period.
- One blocked email at the transition, then at most one weekly nudge.
- ONE email per member per run, aggregating every kind AND every project they
  are behind on, rather than one per obligation row.

## Blocking is only real when enforcement is on

`blocked_since` is stamped here only if the instance kill switch
(`ENABLE_INSPECTION_ENFORCEMENT`) is on. With it off nobody is actually denied
access, so claiming "your access is now blocked" in an email would be a lie -
reminders still go out, but the blocked path stays dormant. This mirrors the
gate's own behaviour and is why the task cannot simply assume the grace clock
tells the whole story.
"""

import logging
from datetime import timedelta

from celery import shared_task
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils import timezone

from plane.db.models import InspectionDocumentKind, InspectionObligation
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception
from plane.utils.inspection_compliance import (
    is_instance_enforcement_enabled,
    outstanding_kinds,
)

logger = logging.getLogger("plane.worker")

# Minimum gap between two reminders while still inside the grace period.
REMINDER_INTERVAL = timedelta(hours=48)
# Reminders sent during the grace period before the member is blocked.
MAX_REMINDERS = 4
# Gap between nudges once a member is actually blocked.
BLOCKED_NUDGE_INTERVAL = timedelta(days=7)

_KIND_LABELS = {
    InspectionDocumentKind.IMPARTIALITY.value: "Déclaration d'impartialité (§4.1)",
    InspectionDocumentKind.CONFIDENTIALITY.value: "Engagement de confidentialité / NDA (§4.2)",
    InspectionDocumentKind.ETHICS_CHARTER.value: "Charte d'éthique de la mission",
}


def _send(template, subject, recipient_email, context):
    """Shared send path, mirroring `plane.bgtasks.project_invitation_task`."""
    html_content = render_to_string(template, context)
    text_content = generate_plain_text_from_html(html_content)

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

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email=EMAIL_FROM,
        to=[recipient_email],
        connection=connection,
    )
    msg.attach_alternative(html_content, "text/html")
    msg.send()


def _outstanding_by_project(now):
    """Map `project -> {member_id: [kinds still owed]}` for every live
    inspection project.

    Resolves the applicable version once per (project, kind) rather than once
    per obligation row - `outstanding_kinds` is called per member, but the
    projects it queries are already loaded, so this stays a bounded number of
    queries per project rather than per row.
    """
    obligations = (
        InspectionObligation.objects.filter(
            project__is_inspection_enabled=True,
            project__inspection_enforcement_paused=False,
            project__archived_at__isnull=True,
        )
        .select_related("project", "member")
        .order_by("project_id")
    )

    grouped = {}
    for obligation in obligations:
        grouped.setdefault(obligation.project_id, {"project": obligation.project, "rows": []})
        grouped[obligation.project_id]["rows"].append(obligation)
    return grouped


@shared_task
def send_inspection_signature_reminders():
    try:
        now = timezone.now()
        enforcement_on = is_instance_enforcement_enabled()
        grouped = _outstanding_by_project(now)

        # Accumulated per member so one person gets ONE email covering every
        # project and kind they are behind on.
        reminder_digest = {}
        blocked_digest = {}
        to_clear_block = []
        reminded_rows = []
        newly_blocked_rows = []
        nudged_rows = []

        for bucket in grouped.values():
            project = bucket["project"]
            grace = timedelta(days=project.inspection_grace_period_days or 0)

            # One satisfaction check per member of this project.
            owed_by_member = {}
            for obligation in bucket["rows"]:
                if obligation.member_id not in owed_by_member:
                    owed_by_member[obligation.member_id] = set(
                        outstanding_kinds(project, obligation.member_id)
                    )

            for obligation in bucket["rows"]:
                still_owed = owed_by_member[obligation.member_id]

                if obligation.kind not in still_owed:
                    # Satisfied - clear a stale block if one is left over.
                    if obligation.blocked_since is not None:
                        obligation.blocked_since = None
                        to_clear_block.append(obligation)
                    continue

                member = obligation.member
                if member is None or not member.email:
                    continue

                entry = {
                    "project_name": project.name,
                    "document": _KIND_LABELS.get(obligation.kind, obligation.kind),
                }
                overdue = now - obligation.obligation_started_at > grace

                if overdue and enforcement_on:
                    if obligation.blocked_since is None:
                        # The transition: exactly one "you are blocked" email.
                        obligation.blocked_since = now
                        obligation.last_reminder_sent_at = now
                        newly_blocked_rows.append(obligation)
                        blocked_digest.setdefault(member, []).append(entry)
                    elif (
                        obligation.last_reminder_sent_at is None
                        or now - obligation.last_reminder_sent_at >= BLOCKED_NUDGE_INTERVAL
                    ):
                        obligation.last_reminder_sent_at = now
                        nudged_rows.append(obligation)
                        blocked_digest.setdefault(member, []).append(entry)
                    continue

                # Inside the grace period (or enforcement off): throttled nudges.
                if obligation.reminder_count >= MAX_REMINDERS:
                    continue
                if (
                    obligation.last_reminder_sent_at is not None
                    and now - obligation.last_reminder_sent_at < REMINDER_INTERVAL
                ):
                    continue

                deadline = obligation.obligation_started_at + grace
                obligation.reminder_count += 1
                obligation.last_reminder_sent_at = now
                reminded_rows.append(obligation)
                reminder_digest.setdefault(member, []).append(
                    {**entry, "deadline": deadline, "is_overdue": overdue}
                )

        for member, documents in reminder_digest.items():
            try:
                _send(
                    "emails/notifications/inspection_signature_reminder.html",
                    "Action requise : documents d'inspection à signer",
                    member.email,
                    {
                        "first_name": member.first_name or member.display_name or member.email,
                        "documents": documents,
                        "enforcement_on": enforcement_on,
                    },
                )
            except Exception as exc:  # noqa: BLE001 - one bad address must not stop the run
                log_exception(exc)

        for member, documents in blocked_digest.items():
            try:
                _send(
                    "emails/notifications/inspection_access_blocked.html",
                    "Accès suspendu : documents d'inspection non signés",
                    member.email,
                    {
                        "first_name": member.first_name or member.display_name or member.email,
                        "documents": documents,
                    },
                )
            except Exception as exc:  # noqa: BLE001
                log_exception(exc)

        # Single bulk write per field group. Plain `bulk_update` bypasses
        # `BaseModel.save()`, so no `updated_by` churn on a background job.
        if reminded_rows:
            InspectionObligation.objects.bulk_update(
                reminded_rows, ["reminder_count", "last_reminder_sent_at"]
            )
        if newly_blocked_rows:
            InspectionObligation.objects.bulk_update(
                newly_blocked_rows, ["blocked_since", "last_reminder_sent_at"]
            )
        if nudged_rows:
            InspectionObligation.objects.bulk_update(nudged_rows, ["last_reminder_sent_at"])
        if to_clear_block:
            InspectionObligation.objects.bulk_update(to_clear_block, ["blocked_since"])

        logger.info(
            "Inspection reminders: %s reminded, %s newly blocked, %s nudged, %s blocks cleared.",
            len(reminded_rows),
            len(newly_blocked_rows),
            len(nudged_rows),
            len(to_clear_block),
        )
        return
    except Exception as exc:  # noqa: BLE001
        log_exception(exc)
        return
