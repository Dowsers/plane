# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Third party imports
import pytz
from celery import shared_task
from crum import impersonate

# Django imports
from django.db import transaction
from django.utils import timezone

# Module imports
from plane.app.serializers.issue import IssueCreateSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    IssueActivity,
    RecurringIssueTemplate,
    RecurringIssueTemplateAssignee,
    RecurringIssueTemplateLabel,
    State,
    StateGroup,
)
from plane.utils.exception_logger import log_exception
from plane.utils.recurring_issue_schedule import compute_next_run_at, resolve_template_name


@shared_task
def generate_recurring_issues():
    """
    Runs hourly (registered in plane/celery.py) - materializes the next
    due occurrence for every active RecurringIssueTemplate whose
    `next_run_at` has passed. See
    docs/feature-specs/06-automation-workflow-sla.md ("Work items
    récurrents", section 3) in plane-selfhost.
    """
    template_ids = list(
        RecurringIssueTemplate.objects.filter(is_active=True, next_run_at__lte=timezone.now()).values_list(
            "id", flat=True
        )
    )
    for template_id in template_ids:
        _generate_scheduled_occurrence(template_id)


def _generate_scheduled_occurrence(template_id):
    try:
        with transaction.atomic():
            # select_for_update serializes concurrent/delayed runs of this
            # task for the same template row - this (plus the re-check of
            # is_active/next_run_at below, now that the row is locked) is
            # what makes the scan idempotent. Mirrors the pattern already
            # proven in this fork by cycle_auto_schedule_task.py, which is
            # a materially better fit here than the daily archive/close
            # task's (issue_automation_task.py) weaker approach of relying
            # on a field write to implicitly drop a row out of the next
            # scan's filter, with no lock at all.
            template = (
                RecurringIssueTemplate.objects.select_for_update()
                .filter(id=template_id, is_active=True, next_run_at__lte=timezone.now())
                .first()
            )
            if template is None:
                # A concurrent/prior run of this task already advanced
                # next_run_at (or deactivated the template) since the
                # un-locked scan query ran - nothing left to do here.
                return

            # Defensive re-checks in case end_date/max_occurrences were
            # lowered (via a PATCH) after next_run_at was last computed,
            # such that this template is no longer actually due to
            # generate anything - deactivate without creating an issue
            # rather than generating one past the configured bounds.
            if template.end_date is not None and template.next_run_at.date() > template.end_date:
                template.is_active = False
                template.save(update_fields=["is_active"])
                return
            if (
                template.max_occurrences is not None
                and template.occurrences_generated >= template.max_occurrences
            ):
                template.is_active = False
                template.save(update_fields=["is_active"])
                return

            materialize_occurrence(template)

            template.occurrences_generated += 1
            # Advance from the *scheduled* time, not from now(), so a
            # late-running task (e.g. Celery beat/worker was down for a
            # few hours) doesn't drift the schedule forward.
            template.next_run_at = compute_next_run_at(template, after=template.next_run_at)

            if template.end_date is not None and template.next_run_at.date() > template.end_date:
                template.is_active = False
            if (
                template.max_occurrences is not None
                and template.occurrences_generated >= template.max_occurrences
            ):
                template.is_active = False

            template.save(update_fields=["occurrences_generated", "next_run_at", "is_active"])
    except Exception as e:
        log_exception(e)


def _resolve_generation_state(template):
    """
    Exigence 14 fallback chain: the template's own `state` if it still
    exists on the project -> the project's own `default_state` if that
    still exists -> the first state in the project's Backlog group. Any
    step can be missing (soft-deleted state, project with no default
    state configured) - each fallback re-validates against the DB rather
    than trusting a possibly-stale FK id.
    """
    project = template.project
    if template.state_id:
        state = State.objects.filter(pk=template.state_id, project_id=project.id).first()
        if state is not None:
            return state
    if project.default_state_id:
        default_state = State.objects.filter(pk=project.default_state_id, project_id=project.id).first()
        if default_state is not None:
            return default_state
    return State.objects.filter(project_id=project.id, group=StateGroup.BACKLOG.value).order_by("sequence").first()


def materialize_occurrence(template):
    """
    Creates exactly one real `Issue` from `template` and replicates the
    side-effect `.delay()` calls IssueViewSet.create() normally fires (see
    apps/api/plane/app/views/issue/base.py). Single source of truth for
    "what does generating an occurrence actually do" - called both by the
    hourly scan (`_generate_scheduled_occurrence`, which additionally
    advances/deactivates the schedule around this call) and directly by
    the `generate-now` manual-trigger endpoint (which does NOT touch
    next_run_at/occurrences_generated/is_active at all - per exigence 12,
    "il ne modifie pas le calcul de la prochaine échéance planifiée").

    Returns the created Issue.
    """
    project = template.project
    tz = pytz.timezone(template.timezone)
    occurrence_date = timezone.now().astimezone(tz).date()
    resolved_name = resolve_template_name(template.name, occurrence_date)
    state = _resolve_generation_state(template)

    label_ids = list(RecurringIssueTemplateLabel.objects.filter(template=template).values_list("label_id", flat=True))
    assignee_ids = list(
        RecurringIssueTemplateAssignee.objects.filter(template=template).values_list("assignee_id", flat=True)
    )

    payload = {
        "name": resolved_name,
        "description_html": template.description_html,
        "priority": template.priority,
        "label_ids": [str(i) for i in label_ids],
        "assignee_ids": [str(i) for i in assignee_ids],
    }
    if state is not None:
        payload["state_id"] = str(state.id)
    if template.estimate_point_id:
        payload["estimate_point"] = str(template.estimate_point_id)

    # IssueCreateSerializer.create() relies on django-crum's
    # get_current_user() (via BaseModel.save()) to attribute created_by/
    # updated_by, rather than accepting an explicit created_by_id kwarg
    # end-to-end (Issue.objects.create() -> Manager.create() always calls
    # .save() without disable_auto_set_user=True, so there is no way to
    # pass created_by_id through that path). Outside a request there is no
    # CRUM-tracked user at all, so without `impersonate` here the
    # generated issue (and its IssueAssignee/IssueLabel/IssueSequence
    # rows, and this template's own audit trail) would end up with
    # created_by=None instead of the template's own creator - `impersonate`
    # is django-crum's own documented mechanism for exactly this
    # non-request-context case and composes cleanly with reusing
    # IssueCreateSerializer as-is.
    with impersonate(template.created_by):
        serializer = IssueCreateSerializer(
            data=payload,
            context={
                "project_id": project.id,
                "workspace_id": project.workspace_id,
                "default_assignee_id": project.default_assignee_id,
            },
        )
        serializer.is_valid(raise_exception=True)
        # recurring_template / recurring_template_name_snapshot aren't
        # part of the user-facing payload - passed as extra save() kwargs,
        # merged into validated_data by DRF, and consumed by
        # IssueCreateSerializer.create()'s `Issue.objects.create(**validated_data, ...)`
        # exactly like any other model field.
        issue = serializer.save(
            recurring_template=template,
            # The raw, un-resolved template name (not `resolved_name`) -
            # this snapshot exists so a later "Généré depuis : X" display
            # can identify *which template*; the per-occurrence resolved
            # name changes every time and would be useless for that.
            recurring_template_name_snapshot=template.name,
        )

        requested_data = json.dumps(
            {
                "name": issue.name,
                "priority": issue.priority,
                "description_html": issue.description_html,
                "state_id": str(issue.state_id) if issue.state_id else None,
                "estimate_point": str(issue.estimate_point_id) if issue.estimate_point_id else None,
                "assignee_ids": [str(i) for i in assignee_ids] if assignee_ids else None,
                "label_ids": [str(i) for i in label_ids] if label_ids else None,
            }
        )
        # Deferred via on_commit: both call sites (the hourly scan and the
        # manual generate-now endpoint) wrap this whole function in an
        # outer transaction.atomic() (for select_for_update, resp. for
        # simple atomicity) - unlike IssueViewSet.create()'s plain HTTP
        # path, which fires issue_activity.delay() with no enclosing
        # atomic block at all. Without on_commit here, the Celery worker
        # could dequeue and start `create_issue_activity` (which does
        # `Issue.objects.get(pk=issue_id)` on its own connection) before
        # this transaction actually commits, raising Issue.DoesNotExist.
        transaction.on_commit(
            lambda: issue_activity.delay(
                type="issue.activity.created",
                requested_data=requested_data,
                actor_id=str(template.created_by_id) if template.created_by_id else None,
                issue_id=str(issue.id),
                project_id=str(project.id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                # origin intentionally omitted (defaults to None) - there is
                # no HTTP request to derive a base_host() from in this
                # Celery-only creation path. issue_activity already
                # tolerates a missing origin (see its `if origin:` guard
                # before it does anything host-related).
                #
                # is_automation is deliberately left at its default False -
                # a template-generated issue's ISSUE_CREATED event is a
                # normal, non-automation issue-creation event for Category
                # 6 Feature 1's workflow rule engine (see the dispatch hook
                # at the end of plane/bgtasks/issue_activities_task.py's
                # issue_activity task): a project's own
                # ISSUE_CREATED-triggered workflow rules (e.g. "auto-assign
                # the QA lead") should be able to act on a
                # recurring-generated issue exactly like any other new
                # issue. This is a deliberate, desirable interaction
                # between the two features, not an oversight.
            )
        )

        # Dedicated activity entry for the generation itself - per this
        # feature's own data-model section, reuses IssueActivity directly
        # rather than a new model.
        IssueActivity.objects.create(
            issue=issue,
            project_id=project.id,
            workspace_id=project.workspace_id,
            verb="created",
            field="recurrence",
            comment=f"Issue générée automatiquement depuis le template récurrent '{template.name}'",
            actor_id=template.created_by_id,
            epoch=int(timezone.now().timestamp()),
        )

    return issue
