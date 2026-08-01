# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
"Since last update" summary block - see
docs/feature-specs/03-projects-roadmaps-initiatives.md ("Mises a jour de
statut structurees") in plane-selfhost. Computed on demand (not cached),
using Issue.completed_at (a dedicated auto-set/cleared field - see
Issue.save()) for completions, and IssueActivity for cancellations (no
equivalent cancelled_at field exists on Issue).
"""

from django.utils import timezone


def generate_project_update_summary(project, since):
    from plane.db.models import Issue, IssueActivity, State, Cycle, ProjectUpdate

    if since is None:
        last_update = ProjectUpdate.objects.filter(project=project).order_by("-created_at").first()
        since = last_update.created_at if last_update else project.created_at

    issues_created = Issue.issue_objects.filter(project=project, created_at__gte=since).count()

    issues_completed = Issue.issue_objects.filter(
        project=project, completed_at__isnull=False, completed_at__gte=since
    ).count()

    cancelled_state_ids = set(
        State.objects.filter(project=project, group="cancelled").values_list("id", flat=True)
    )
    cancelled_activity = IssueActivity.objects.filter(
        project=project, field="state", created_at__gte=since, new_identifier__isnull=False
    ).values_list("issue_id", "new_identifier")
    issues_cancelled = len(
        {issue_id for issue_id, new_identifier in cancelled_activity if new_identifier in cancelled_state_ids}
    )

    net_backlog_change = issues_created - (issues_completed + issues_cancelled)

    cycles_started = Cycle.objects.filter(project=project, start_date__gte=since).count()
    now = timezone.now()
    cycles_closed = Cycle.objects.filter(
        project=project, end_date__isnull=False, end_date__gte=since, end_date__lt=now
    ).count()

    return {
        "since": since.isoformat() if hasattr(since, "isoformat") else since,
        "issues_created": issues_created,
        "issues_completed": issues_completed,
        "issues_cancelled": issues_cancelled,
        "net_backlog_change": net_backlog_change,
        "cycles_started": cycles_started,
        "cycles_closed": cycles_closed,
    }
