# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Project Template blueprint <-> real Project translation - see
docs/feature-specs/03-projects-roadmaps-initiatives.md ("Templates de
projet") in plane-selfhost.

Two directions:
- build_template_from_project(): snapshot an existing Project's states/
  labels/members(/issues) into a new ProjectTemplate blueprint ("Save as
  template").
- instantiate_project_from_template(): resolve a ProjectTemplate blueprint
  into a brand new real Project ("Create project from template"). Always
  synchronous, inside one transaction.atomic() block - no Celery split, no
  seeding_status field. The spec itself hedges on the async threshold ("ex.
  50... ou de facon systematique"), and this codebase has no precedent for
  a partial-failure-safe async multi-step entity builder, so keeping it
  synchronous is the deliberately simpler, safer choice for this
  iteration - documented as a scope decision in the patch README.
"""

from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone


def build_template_from_project(project, name, description="", include_current_work_items=False, actor=None):
    from plane.db.models import (
        ProjectTemplate,
        ProjectTemplateState,
        ProjectTemplateLabel,
        ProjectTemplateMember,
        ProjectTemplateIssue,
        State,
        Label,
        ProjectMember,
        Issue,
    )

    with transaction.atomic():
        template = ProjectTemplate.objects.create(
            workspace=project.workspace,
            name=name,
            description=description,
            logo_props=project.logo_props,
            network=project.network,
            created_by=actor,
            updated_by=actor,
        )

        state_map = {}
        for state in State.objects.filter(project=project, deleted_at__isnull=True):
            t_state = ProjectTemplateState.objects.create(
                template=template,
                name=state.name,
                color=state.color,
                group=state.group,
                sequence=state.sequence,
                default=state.default,
                created_by=actor,
            )
            state_map[state.id] = t_state

        label_map = {}
        labels = list(Label.objects.filter(project=project, deleted_at__isnull=True))
        for label in sorted(labels, key=lambda item: 0 if item.parent_id is None else 1):
            t_label = ProjectTemplateLabel.objects.create(
                template=template,
                parent=label_map.get(label.parent_id),
                name=label.name,
                color=label.color,
                sort_order=label.sort_order,
                created_by=actor,
            )
            label_map[label.id] = t_label

        for member in ProjectMember.objects.filter(project=project, is_active=True, deleted_at__isnull=True):
            ProjectTemplateMember.objects.create(
                template=template, member_id=member.member_id, role=member.role, created_by=actor
            )

        if include_current_work_items:
            issue_map = {}
            issues = list(
                Issue.issue_objects.filter(project=project)
                .select_related("state")
                .prefetch_related("labels", "assignees")
                .order_by("sort_order")
            )
            # Two-pass: parents first, then children (arbitrary depth via
            # repeated passes rather than assuming a single level).
            remaining = issues
            while remaining:
                progressed = []
                still_remaining = []
                for issue in remaining:
                    if issue.parent_id is not None and issue.parent_id not in issue_map:
                        still_remaining.append(issue)
                        continue
                    progressed.append(issue)
                if not progressed:
                    # Defensive: a cycle or missing parent outside this set - stop rather than loop forever.
                    break
                for issue in progressed:
                    t_issue = ProjectTemplateIssue.objects.create(
                        template=template,
                        name=issue.name,
                        description_html=issue.description_html,
                        priority=issue.priority,
                        state=state_map.get(issue.state_id),
                        parent=issue_map.get(issue.parent_id),
                        sort_order=issue.sort_order,
                        created_by=actor,
                    )
                    t_issue.labels.set([label_map[label.id] for label in issue.labels.all() if label.id in label_map])
                    issue_map[issue.id] = t_issue
                remaining = still_remaining

        return template


def _resolve_state_map(template, project, actor):
    from plane.db.models import State, DEFAULT_STATES

    template_states = list(template.states.all().order_by("sequence"))
    state_map = {}
    if template_states:
        for t_state in template_states:
            state_map[t_state.id] = State.objects.create(
                name=t_state.name,
                color=t_state.color,
                project=project,
                workspace=project.workspace,
                sequence=t_state.sequence,
                group=t_state.group,
                default=t_state.default,
                created_by=actor,
            )
    else:
        # No states defined on the template - fall back to Plane's normal
        # default seed, same shape as ProjectViewSet.create().
        State.objects.bulk_create(
            [
                State(
                    name=state["name"],
                    color=state["color"],
                    project=project,
                    sequence=state["sequence"],
                    workspace=project.workspace,
                    group=state["group"],
                    default=state.get("default", False),
                    created_by=actor,
                )
                for state in DEFAULT_STATES
            ]
        )
    return state_map


def _resolve_label_map(template, project, actor):
    from plane.db.models import Label

    template_labels = list(template.labels.all())
    label_map = {}
    for t_label in sorted(template_labels, key=lambda item: 0 if item.parent_id is None else 1):
        label_map[t_label.id] = Label.objects.create(
            name=t_label.name,
            color=t_label.color,
            project=project,
            workspace=project.workspace,
            parent=label_map.get(t_label.parent_id),
            sort_order=t_label.sort_order,
            created_by=actor,
        )
    return label_map


def _resolve_member_map(template, project, workspace, creator, actor):
    from plane.db.models import ProjectMember, WorkspaceMember

    member_map = {}
    for t_member in template.members.all():
        if t_member.member_id == creator.id:
            # Creator is always added as project Admin separately.
            continue
        # Silently skip a template member no longer an active workspace
        # member of the target workspace - a stale blueprint reference
        # should not fail the whole instantiation.
        if not WorkspaceMember.objects.filter(
            workspace=workspace, member_id=t_member.member_id, is_active=True
        ).exists():
            continue
        member_map[t_member.id] = ProjectMember.objects.create(
            project=project, member_id=t_member.member_id, role=t_member.role, created_by=actor
        )
    return member_map


def _create_issues_from_template(template, project, workspace, actor, state_map, label_map, member_map):
    from plane.db.models import Issue, IssueLabel, IssueAssignee

    template_issues = list(
        template.issues.select_related("state").prefetch_related("labels", "assignees").order_by("sort_order")
    )
    issue_map = {}
    remaining = template_issues
    while remaining:
        progressed = []
        still_remaining = []
        for t_issue in remaining:
            if t_issue.parent_id is not None and t_issue.parent_id not in issue_map:
                still_remaining.append(t_issue)
                continue
            progressed.append(t_issue)
        if not progressed:
            break
        for t_issue in progressed:
            target_date = None
            if t_issue.target_date_offset_days is not None:
                target_date = (timezone.now() + timedelta(days=t_issue.target_date_offset_days)).date()

            # Issue.objects.create() (not bulk_create) so Issue.save()'s
            # pg_advisory_xact_lock-guarded sequence_id assignment runs
            # correctly for every starter item.
            issue = Issue.objects.create(
                name=t_issue.name,
                description_html=t_issue.description_html,
                priority=t_issue.priority,
                state=state_map.get(t_issue.state_id),
                parent=issue_map.get(t_issue.parent_id),
                target_date=target_date,
                sort_order=t_issue.sort_order,
                project=project,
                workspace=workspace,
                created_by=actor,
            )
            issue_map[t_issue.id] = issue

            label_ids = [label_map[label.id].id for label in t_issue.labels.all() if label.id in label_map]
            if label_ids:
                IssueLabel.objects.bulk_create(
                    [
                        IssueLabel(
                            issue=issue,
                            label_id=label_id,
                            project=project,
                            workspace=workspace,
                            created_by=actor,
                        )
                        for label_id in label_ids
                    ],
                    batch_size=10,
                )

            assignee_ids = [
                member_map[member.id].member_id for member in t_issue.assignees.all() if member.id in member_map
            ]
            if assignee_ids:
                IssueAssignee.objects.bulk_create(
                    [
                        IssueAssignee(
                            issue=issue,
                            assignee_id=assignee_id,
                            project=project,
                            workspace=workspace,
                            created_by=actor,
                        )
                        for assignee_id in assignee_ids
                    ],
                    batch_size=10,
                )
        remaining = still_remaining
    return issue_map


def instantiate_project_from_template(
    template,
    workspace,
    creator,
    name,
    identifier,
    network=None,
    description=None,
    logo_props=None,
    linked_initiative_id=None,
):
    from plane.app.serializers import ProjectSerializer
    from plane.db.models import ProjectMember, ProjectTemplate
    from plane.app.permissions import ROLE

    with transaction.atomic():
        project_payload = {
            "name": name,
            "identifier": identifier,
            "network": network if network is not None else template.network,
            "description": description if description is not None else template.description,
            "logo_props": logo_props if logo_props is not None else template.logo_props,
        }
        serializer = ProjectSerializer(data=project_payload, context={"workspace_id": workspace.id})
        serializer.is_valid(raise_exception=True)
        project = serializer.save()
        project.created_from_template = template
        project.save(update_fields=["created_from_template"])

        ProjectMember.objects.create(project=project, member=creator, role=ROLE.ADMIN.value, created_by=creator)

        state_map = _resolve_state_map(template, project, creator)
        label_map = _resolve_label_map(template, project, creator)
        member_map = _resolve_member_map(template, project, workspace, creator, creator)
        _create_issues_from_template(template, project, workspace, creator, state_map, label_map, member_map)

        if linked_initiative_id:
            from plane.db.models import Initiative, InitiativeProject
            from plane.utils.initiative_health import recalculate_initiative_health

            if Initiative.objects.filter(workspace=workspace, pk=linked_initiative_id).exists():
                InitiativeProject.objects.create(
                    initiative_id=linked_initiative_id,
                    project=project,
                    workspace=workspace,
                    created_by=creator,
                )
                recalculate_initiative_health(linked_initiative_id)

        ProjectTemplate.objects.filter(pk=template.pk).update(usage_count=F("usage_count") + 1)

        return project
