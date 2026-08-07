# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Per-entity visibility scoping - the security-critical core of the flexible
query layer (exigence 7-8 of docs/feature-specs/08-api-webhooks-cli.md,
section 1, in plane-selfhost).

THE ONE INVARIANT EVERYTHING ELSE DEPENDS ON: every function here starts
with an unconditional `.filter(workspace_id=workspace.id)` (or an
equivalent membership/ownership check that itself only ever considers rows
already known to belong to that workspace) *before* anything else -
including before the caller's own membership/role/ownership conditions are
ANDed in, and long before any client-supplied `filters` JSON is applied by
ComplexFilterBackend on top. A crafted filter can therefore only ever
*narrow* an already workspace-scoped, already permission-scoped queryset -
it can never widen it or reach into another workspace, because the
workspace/permission Q is a separate, code-controlled `.filter()` call the
client's filter tree is layered on top of, never a value the client
supplies or can override (see filtersets.py's module docstring: none of
these FilterSets even declare a `workspace`/`workspace_id` field, so trying
to filter on one 400s with `invalid_filter_field` rather than doing
anything at all).

`resolver.py` calls `scope_queryset()` for the ROOT entity of a request AND
(unconditionally, every single time, no exceptions) for every relation's
target queryset before returning it - even when the parent row was already
individually authorized. This is deliberate defense-in-depth against the
"relation points somewhere it structurally shouldn't" class of bug (e.g. a
`sub_issues` relation somehow returning a row in a different project than
its parent) - the child is re-validated from scratch, never assumed safe
just because its parent was.
"""

from django.db.models import Q

from plane.db.models import Cycle, Issue, Label, Module, Page, Project, State, WorkspaceMember
from plane.db.models.project import ROLE

GUEST = ROLE.GUEST.value


def _issue_visibility_q(user):
    """Mirrors the exact guest-visibility rule already used by
    IssueListEndpoint/WorkspaceLabelsEndpoint-style code
    (app/views/issue/base.py) - active ProjectMember of the issue's
    project; if that membership is GUEST and the project has
    `guest_view_all_features=False`, only issues the guest themselves
    created are visible.
    """
    return (
        Q(
            project__project_projectmember__member=user,
            project__project_projectmember__is_active=True,
            project__project_projectmember__role__gt=GUEST,
        )
        | Q(
            project__project_projectmember__member=user,
            project__project_projectmember__is_active=True,
            project__project_projectmember__role=GUEST,
            project__guest_view_all_features=True,
        )
        | Q(
            project__project_projectmember__member=user,
            project__project_projectmember__is_active=True,
            project__project_projectmember__role=GUEST,
            project__guest_view_all_features=False,
            created_by=user,
        )
    )


def _project_member_q(path_prefix, user):
    """Q for "the row's project (reached by `path_prefix`, e.g.
    'project__' or 'projects__') has an active ProjectMember row for
    `user`" - the plain (non-guest-aware) membership check used by every
    project-scoped entity except Issue itself (Cycle/Module/State/Label
    structural rows are visible to any active member including guests -
    `guest_view_all_features` only ever gated Issue visibility anywhere
    else in this codebase, confirmed by grep before writing this)."""
    return Q(
        **{
            f"{path_prefix}project_projectmember__member": user,
            f"{path_prefix}project_projectmember__is_active": True,
        }
    )


def scope_issue(queryset, *, user, workspace):
    return queryset.filter(workspace_id=workspace.id).filter(_issue_visibility_q(user))


def scope_project(queryset, *, user, workspace):
    """Mirrors ProjectListCreateAPIEndpoint.get_queryset (api/views/project.py):
    membership OR the project being public (`network == Project.PUBLIC` == 2) -
    Plane's own precedent for "public projects are discoverable workspace-
    wide even without joining". This is intentionally MORE permissive than
    every other project-scoped entity below (which require actual
    membership, no public fallback) - that asymmetry is real and already
    exists in this codebase (browsing project *metadata* vs. actually
    reading a project's issues/cycles/etc. are different trust levels
    there), not a bug introduced here.
    """
    return queryset.filter(workspace_id=workspace.id).filter(
        Q(project_projectmember__member=user, project_projectmember__is_active=True) | Q(network=2)
    )


def scope_cycle(queryset, *, user, workspace):
    return queryset.filter(workspace_id=workspace.id).filter(_project_member_q("project__", user))


def scope_module(queryset, *, user, workspace):
    return queryset.filter(workspace_id=workspace.id).filter(_project_member_q("project__", user))


def scope_state(queryset, *, user, workspace):
    return queryset.filter(workspace_id=workspace.id).filter(_project_member_q("project__", user))


def scope_label(queryset, *, user, workspace):
    """Labels can be workspace-scoped (`project_id IS NULL`, see
    LabelBulkRescopeEndpoint in app/views/workspace/label.py) or
    project-scoped. A workspace-level label is visible to any active
    workspace member - already guaranteed by this endpoint's own entry gate
    (WorkspaceEntityPermission, checked before the resolver ever runs), no
    further per-row check needed for that branch.
    """
    return queryset.filter(workspace_id=workspace.id).filter(
        Q(project__isnull=True) | _project_member_q("project__", user)
    )


def scope_page(queryset, *, user, workspace):
    """Page has no direct `project` FK (M2M `projects` via ProjectPage) and
    its own private/public `access` flag. Combines three precedents from
    ProjectPagePermission/PageViewSet.get_queryset (app/permissions/page.py,
    app/views/page/base.py):
      - the owner can always see their own page, private or not (the base
        `ProjectPagePermission._has_private_page_action_access` returns
        False for everyone else - Community edition has no shared-private-
        page mechanism, confirmed by grep);
      - a PUBLIC page linked to at least one project the user is an active
        member of is visible (PageViewSet.get_queryset's own rule);
      - a PUBLIC page with `is_global=True` is treated as visible workspace-
        wide regardless of project linkage - `is_global` exists on the
        model with exactly this documented intent but PageViewSet's own
        listing query never actually branches on it (confirmed by grep,
        looks like a pre-existing incomplete wiring, not something to
        copy here) - honoring the field's stated semantic here is a
        deliberate, documented choice, not a leak: it only ever makes a
        page visible to workspace *members*, all of whom already passed
        this endpoint's own workspace-membership gate.
    """
    return (
        queryset.filter(workspace_id=workspace.id)
        .filter(
            Q(owned_by=user)
            | Q(access=Page.PUBLIC_ACCESS, is_global=True)
            | Q(
                access=Page.PUBLIC_ACCESS,
                projects__project_projectmember__member=user,
                projects__project_projectmember__is_active=True,
            )
        )
        .distinct()
    )


def scope_member(queryset, *, user, workspace):
    """Mirrors WorkspaceMemberAPIEndpoint (api/views/member.py): listing the
    workspace member roster itself is ADMIN/MEMBER only, guests excluded -
    narrower than this endpoint's own entry gate (any active workspace
    member, including guests, can call POST .../query/ at all), so this is
    enforced again here specifically for the `member` entity rather than
    relying on the outer gate alone.
    """
    ADMIN, MEMBER = ROLE.ADMIN.value, ROLE.MEMBER.value
    return queryset.filter(workspace_id=workspace.id).filter(
        Q(
            workspace__workspace_member__member=user,
            workspace__workspace_member__is_active=True,
            workspace__workspace_member__role__in=[ADMIN, MEMBER],
        )
    )


_SCOPE_FUNCTIONS = {
    "issue": scope_issue,
    "project": scope_project,
    "cycle": scope_cycle,
    "module": scope_module,
    "state": scope_state,
    "label": scope_label,
    "page": scope_page,
    "member": scope_member,
}


def scope_queryset(entity_name, queryset, *, user, workspace):
    """Single dispatch point used by both the root query and every relation
    resolution. Raises KeyError for an entity name outside the registry -
    callers are expected to have already validated `entity_name` against
    `registry.ENTITY_REGISTRY` before reaching here, so a KeyError here
    would indicate a bug in this module, not bad client input.
    """
    return _SCOPE_FUNCTIONS[entity_name](queryset, user=user, workspace=workspace)


def scope_comments(queryset, *, user, workspace):
    """`_comment` relation-only target (issue.comments) - IssueComment is a
    ProjectBaseModel (has its own `project`/`workspace` FKs), scoped by
    plain project membership. Not guest-aware on its own terms since its
    `issue_id__in=[...]` restriction in resolver.py is always applied
    against a set of issue ids that already passed `scope_issue()` -
    membership here is pure defense-in-depth, not the primary gate.
    """
    return queryset.filter(workspace_id=workspace.id).filter(_project_member_q("project__", user))


def scope_assignees(queryset, *, user, workspace):
    """`_user` relation-only target (issue.assignees) - queryset here is
    IssueAssignee rows (ProjectBaseModel), same reasoning as
    scope_comments above."""
    return queryset.filter(workspace_id=workspace.id).filter(_project_member_q("project__", user))


# Referenced directly (not via ENTITY_REGISTRY, since these two are not
# root-queryable entities) by resolver.py's relation handlers for
# `issue.comments` / `issue.assignees`.
__all__ = [
    "scope_queryset",
    "scope_comments",
    "scope_assignees",
    "Cycle",
    "Issue",
    "Label",
    "Module",
    "Page",
    "Project",
    "State",
    "WorkspaceMember",
]
