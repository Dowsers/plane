# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 4 - "Moteur de synchronisation local-first/
offline pour le web", backend half.

Query-building helpers behind the two new endpoints in
`plane.app.views.sync` (see that module's own docstring for the full API
contract):

- `GET /api/workspaces/<slug>/sync/` - incremental delta ("what changed
  since my last poll") for `issue`/`issue_comment`/`page` (real volume,
  real incremental filtering + tombstones), and a full current snapshot
  for the reference-data entities `cycle`/`module`/`label`/`state` (low
  volume, read-only in this feature's scope - see exigence 1's own
  wording: only an Issue's *assignment* to one of these is a mutation
  this feature offline-queues, never the reference entity itself).
- `GET /api/workspaces/<slug>/sync/accessible-ids/` - the access-
  revocation reconciliation endpoint (exigence 11's own real, otherwise-
  unsolved gap: a membership change that revokes access to an entity does
  NOT bump that entity's `updated_at`, so it can never surface as a delta
  through the endpoint above). Returns just the current accessible id set
  per entity type - cheap for the client to diff its own IndexedDB cache
  against and purge anything no longer present.

Every accessible-* function below answers the exact same underlying
question ("what can this user currently see in this workspace") that this
codebase already answers ad hoc, per view, all over `plane.app.views` -
this module exists so the two sync endpoints above (and nothing else)
share one definition of it rather than re-deriving their own, subtly
different version. It deliberately does NOT try to become the one true
shared visibility layer for the whole app - that would be a much larger,
riskier refactor than this feature calls for.
"""

from typing import Iterable, Optional

from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import OuterRef, Q, QuerySet, Subquery, UUIDField, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    Label,
    Module,
    ModuleIssue,
    Page,
    ProjectMember,
    State,
    User,
)

# The full set of entity keys accepted by `entities=` on both endpoints.
SUPPORTED_ENTITIES = frozenset({"issue", "issue_comment", "cycle", "module", "label", "state", "page"})

# Entities with real per-row incremental delta + tombstone support (real
# volume, per task's own scoping). Everything else in `SUPPORTED_ENTITIES`
# is reference data - handled by the "return everything currently
# visible" branch instead, see `plane.app.views.sync` module docstring.
DELTA_CAPABLE_ENTITIES = frozenset({"issue", "issue_comment", "page"})

# Same cap as `plane.utils.global_paginator.PAGINATOR_MAX_LIMIT` - one
# delta response page never returns more than this many rows for a single
# delta-capable entity. See `plane.app.views.sync` module docstring for
# the "keep calling with the same `since` while `has_more` is true" paging
# contract this enables without a heavier opaque per-entity cursor.
DELTA_PAGE_SIZE = 1000


def parse_entities(raw: Optional[str]) -> frozenset:
    """`entities=issue,cycle,page` -> `{"issue", "cycle", "page"}`,
    silently dropping anything not in `SUPPORTED_ENTITIES` (an unknown key
    is far more likely to be a forward/backward frontend-version skew
    than something worth a hard 400 for). Empty/missing `entities` means
    "all of them"."""
    if not raw:
        return SUPPORTED_ENTITIES
    requested = {chunk.strip() for chunk in raw.split(",") if chunk.strip()}
    return frozenset(requested & SUPPORTED_ENTITIES)


def get_accessible_project_ids(slug: str, user: User) -> QuerySet:
    """Active-membership project ids for `user` in the workspace `slug`,
    excluding deleted/archived projects - the same base membership check
    `plane.utils.date_utils.get_analytics_filters` already expresses
    (independently) for the analytics endpoints. Returns a `QuerySet` of
    UUIDs (lazy - safe to use directly in a `project_id__in=` filter,
    never forces a second round-trip)."""
    return ProjectMember.objects.filter(
        workspace__slug=slug,
        member=user,
        is_active=True,
        project__deleted_at__isnull=True,
        project__archived_at__isnull=True,
    ).values_list("project_id", flat=True)


def _guest_restricted_project_ids(slug: str, user: User) -> QuerySet:
    """Project ids where `user` is a GUEST (role 5) AND that project has
    NOT opted into `guest_view_all_features` - the exact condition every
    existing per-project issue-listing view (`IssueViewSet.list`,
    `IssuePaginatedViewSet.list`) already checks inline before adding a
    `created_by=request.user` restriction. Promoted here to a per-
    workspace, multi-project form since this feature's delta/
    reconciliation endpoints span every accessible project in one call,
    not just one."""
    return ProjectMember.objects.filter(
        workspace__slug=slug,
        member=user,
        is_active=True,
        role=5,
        project__guest_view_all_features=False,
        project__deleted_at__isnull=True,
        project__archived_at__isnull=True,
    ).values_list("project_id", flat=True)


def get_accessible_issue_queryset(slug: str, user: User) -> QuerySet:
    """Every non-draft, non-triage, non-archived Issue `user` can
    currently see across the whole workspace - i.e. the same
    per-project "GUEST without `guest_view_all_features` only sees their
    own issues" rule every existing project-scoped issue endpoint already
    applies, combined across every project `user` is a member of. Base
    manager is `Issue.issue_objects` (excludes triage-state/archived/
    draft/archived-project rows already - see `IssueManager`), matching
    what `IssuePaginatedViewSet`/`IssueViewSet.list` already use."""
    accessible_project_ids = get_accessible_project_ids(slug, user)
    guest_restricted_project_ids = list(_guest_restricted_project_ids(slug, user))

    queryset = Issue.issue_objects.filter(workspace__slug=slug, project_id__in=accessible_project_ids)
    if guest_restricted_project_ids:
        queryset = queryset.filter(
            ~Q(project_id__in=guest_restricted_project_ids) | Q(created_by=user)
        )
    return queryset


def get_accessible_issue_tombstone_queryset(slug: str, user: User) -> QuerySet:
    """Soft-deleted-or-archived issues within projects `user` can still
    see - the workspace-scoped analog of the existing project-scoped
    `DeletedIssuesListViewSet` (`plane.app.views.issue.base`), which this
    reuses the exact same `Q(archived_at__isnull=False) |
    Q(deleted_at__isnull=False)` shape from. Uses `Issue.all_objects`
    (bypasses the soft-delete-aware default manager) since a tombstone
    row is, by definition, one the default manager would otherwise hide.
    Deliberately does NOT apply the guest-own-issue restriction
    (`get_accessible_issue_queryset` does) - telling a GUEST "issue X was
    deleted" leaks only an opaque id already known to their own client
    cache (they cached it while it still existed and was visible to
    them), never the deleted content itself."""
    return Issue.all_objects.filter(workspace__slug=slug, project_id__in=get_accessible_project_ids(slug, user)).filter(
        Q(archived_at__isnull=False) | Q(deleted_at__isnull=False)
    )


def get_accessible_issue_comment_queryset(slug: str, user: User) -> QuerySet:
    """Every IssueComment within a project `user` is an active member of.
    Deliberately does NOT layer on the issue-level guest-own restriction
    `get_accessible_issue_queryset` applies - matches
    `IssueCommentViewSet.get_queryset()`'s own real, current behavior
    (confirmed during this category's research to have no `access`/
    guest filtering at all on the in-app thread today); this delta
    endpoint intentionally mirrors what a client can already fetch via
    the normal comment-thread endpoint, not a new, stricter rule."""
    return IssueComment.objects.filter(workspace__slug=slug, project_id__in=get_accessible_project_ids(slug, user))


def get_accessible_page_queryset(slug: str, user: User) -> QuerySet:
    """Every Page (workspace-global Wiki page or project page) `user` can
    currently see - mirrors `PageViewSet.get_queryset`/
    `WorkspacePageViewSet.get_queryset`'s own `Q(owned_by=user) |
    Q(access=Page.PUBLIC_ACCESS)` visibility rule, minus their
    is-favorite/label/unresolved-comment-count annotations (irrelevant to
    a metadata-only sync delta - see `plane.app.views.sync` module
    docstring for exactly which fields this entity's delta actually
    returns)."""
    accessible_project_ids = get_accessible_project_ids(slug, user)
    visible = Q(owned_by=user) | Q(access=Page.PUBLIC_ACCESS)
    return (
        Page.objects.filter(workspace__slug=slug)
        .filter(visible)
        .filter(Q(is_global=True) | Q(projects__id__in=accessible_project_ids))
        .distinct()
    )


def get_accessible_page_tombstone_queryset(slug: str, user: User) -> QuerySet:
    """Soft-deleted Pages `user` could have seen before deletion - same
    reasoning as `get_accessible_issue_tombstone_queryset` for why the
    visibility check is still worth applying (a deleted PRIVATE page
    owned by someone else should never even confirm its own former
    existence to an unrelated user), using `Page.all_objects` to reach
    past the soft-delete-aware default manager."""
    accessible_project_ids = get_accessible_project_ids(slug, user)
    visible = Q(owned_by=user) | Q(access=Page.PUBLIC_ACCESS)
    return (
        Page.all_objects.filter(workspace__slug=slug, deleted_at__isnull=False)
        .filter(visible)
        .filter(Q(is_global=True) | Q(projects__id__in=accessible_project_ids))
        .distinct()
    )


def get_accessible_cycle_queryset(slug: str, user: User) -> QuerySet:
    return Cycle.objects.filter(workspace__slug=slug, project_id__in=get_accessible_project_ids(slug, user))


def get_accessible_module_queryset(slug: str, user: User) -> QuerySet:
    return Module.objects.filter(workspace__slug=slug, project_id__in=get_accessible_project_ids(slug, user))


def get_accessible_label_queryset(slug: str, user: User) -> QuerySet:
    """Project-scoped labels in an accessible project, plus workspace-
    wide labels (`project_id is NULL` - see `Label`'s own model
    docstring/constraints) which any active workspace member can see
    regardless of project membership, since they aren't tied to one
    project in the first place. Reaching this function at all already
    implies workspace membership (both sync endpoints are gated by
    `allow_permission(..., level="WORKSPACE")`), so no separate
    workspace-membership re-check is needed here."""
    accessible_project_ids = get_accessible_project_ids(slug, user)
    return Label.objects.filter(workspace__slug=slug).filter(
        Q(project_id__in=accessible_project_ids) | Q(project__isnull=True)
    )


def get_accessible_state_queryset(slug: str, user: User) -> QuerySet:
    return State.objects.filter(workspace__slug=slug, project_id__in=get_accessible_project_ids(slug, user))


def _annotate_issue_relations(queryset: QuerySet) -> QuerySet:
    """`cycle_id`/`module_ids`/`label_ids`/`assignee_ids` - the exact same
    subquery shapes `IssuePaginatedViewSet.get_queryset`/`IssueViewSet.
    list` (`plane.app.views.issue.base`) already annotate, duplicated
    here rather than imported/shared: those two are tightly embedded in
    their own view methods (not factored into a standalone function to
    import), and this fork's existing convention is for each similar view
    to re-derive these annotations locally rather than share one (compare
    `IssueViewSet.apply_annotations` vs `IssuePaginatedViewSet.
    get_queryset`, already two independent copies of a similar chain)."""
    return (
        queryset.annotate(
            cycle_id=Subquery(
                CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
            )
        )
        .annotate(
            label_ids=Coalesce(
                Subquery(
                    IssueLabel.objects.filter(issue_id=OuterRef("pk"))
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("label_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
            assignee_ids=Coalesce(
                Subquery(
                    IssueAssignee.objects.filter(issue_id=OuterRef("pk"), assignee__member_project__is_active=True)
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("assignee_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
            module_ids=Coalesce(
                Subquery(
                    ModuleIssue.objects.filter(issue_id=OuterRef("pk"), module__archived_at__isnull=True)
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("module_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
        )
    )


ISSUE_FIELDS = [
    "id",
    "project_id",
    "name",
    "state_id",
    "priority",
    "sort_order",
    "sequence_id",
    "parent_id",
    "start_date",
    "target_date",
    "completed_at",
    "estimate_point",
    "is_draft",
    "cycle_id",
    "module_ids",
    "label_ids",
    "assignee_ids",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "external_source",
    "external_id",
]

ISSUE_COMMENT_FIELDS = [
    "id",
    "project_id",
    "issue_id",
    "comment_html",
    "comment_stripped",
    "access",
    "edited_at",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "external_source",
    "external_id",
]

PAGE_FIELDS = [
    "id",
    "workspace_id",
    "name",
    "access",
    "is_global",
    "is_locked",
    "parent_id",
    "collection_id",
    "sort_order",
    "archived_at",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "external_source",
    "external_id",
]

CYCLE_FIELDS = [
    "id",
    "project_id",
    "name",
    "description",
    "start_date",
    "end_date",
    "actual_start_date",
    "actual_end_date",
    "sort_order",
    "archived_at",
    "created_at",
    "updated_at",
    "updated_by",
    "external_source",
    "external_id",
]

MODULE_FIELDS = [
    "id",
    "project_id",
    "name",
    "description",
    "start_date",
    "target_date",
    "status",
    "sort_order",
    "archived_at",
    "created_at",
    "updated_at",
    "updated_by",
    "external_source",
    "external_id",
]

LABEL_FIELDS = [
    "id",
    "project_id",
    "name",
    "color",
    "parent_id",
    "sort_order",
    "created_at",
    "updated_at",
    "updated_by",
    "external_source",
    "external_id",
]

STATE_FIELDS = [
    "id",
    "project_id",
    "name",
    "color",
    "group",
    "default",
    "sequence",
    "created_at",
    "updated_at",
    "updated_by",
    "external_source",
    "external_id",
]


def _delta_bucket(queryset: QuerySet, fields: Iterable[str], since: Optional[str]) -> dict:
    """Shared paging shape for the 3 delta-capable entities - see
    `plane.app.views.sync` module docstring for the full paging contract
    this implements (`has_more` + "call again with the same `since`").
    `queryset` must already be ordered by `updated_at` ascending by the
    caller (kept explicit at the call site rather than baked in here, so
    it's visible next to the actual filtering)."""
    if since:
        queryset = queryset.filter(updated_at__gt=since)
    total_matching = queryset.count()
    rows = list(queryset.values(*fields)[:DELTA_PAGE_SIZE])
    return {"results": rows, "has_more": total_matching > len(rows)}


def build_delta_response(slug: str, user: User, since: Optional[str], entities: frozenset) -> dict:
    """Core of `GET /api/workspaces/<slug>/sync/`. The returned `cursor`
    is captured BEFORE any of the queries below run (see this module's
    own docstring header comment inline below for why that ordering,
    not the more obvious "capture it after querying", is the one that's
    actually safe against concurrent writes)."""
    # Captured up front, deliberately: a row written between this instant
    # and the moment each query below actually executes will carry an
    # `updated_at` LATER than this timestamp, so returning this (earlier)
    # value as `cursor` guarantees the client's NEXT poll (`since=cursor`)
    # will still pick that row up. Capturing the cursor AFTER querying
    # instead would risk the opposite bug: a write landing during the
    # query window could be missed by THIS response yet still fall
    # before a later-captured cursor, silently skipping it forever.
    cursor = timezone.now().isoformat()

    response = {"cursor": cursor}

    if "issue" in entities:
        queryset = get_accessible_issue_queryset(slug, user).order_by("updated_at")
        queryset = _annotate_issue_relations(queryset)
        bucket = _delta_bucket(queryset, ISSUE_FIELDS, since)
        if since:
            bucket["deleted_ids"] = list(
                get_accessible_issue_tombstone_queryset(slug, user).filter(updated_at__gt=since).values_list(
                    "id", flat=True
                )
            )
        response["issue"] = bucket

    if "issue_comment" in entities:
        queryset = get_accessible_issue_comment_queryset(slug, user).order_by("updated_at")
        response["issue_comment"] = _delta_bucket(queryset, ISSUE_COMMENT_FIELDS, since)

    if "page" in entities:
        queryset = get_accessible_page_queryset(slug, user).order_by("updated_at")
        bucket = _delta_bucket(queryset, PAGE_FIELDS, since)
        if since:
            bucket["deleted_ids"] = list(
                get_accessible_page_tombstone_queryset(slug, user).filter(updated_at__gt=since).values_list(
                    "id", flat=True
                )
            )
        response["page"] = bucket

    # Reference data (exigence's own "read-only in this feature's scope")
    # - always the full currently-visible set, no `since` filtering, no
    # tombstones: a client diffing this full list against its own cache
    # handles updates AND deletions/inaccessibility in one pass, for
    # free, same technique `accessible-ids/` uses for the volume entities.
    if "cycle" in entities:
        response["cycle"] = {"results": list(get_accessible_cycle_queryset(slug, user).values(*CYCLE_FIELDS))}
    if "module" in entities:
        response["module"] = {"results": list(get_accessible_module_queryset(slug, user).values(*MODULE_FIELDS))}
    if "label" in entities:
        response["label"] = {"results": list(get_accessible_label_queryset(slug, user).values(*LABEL_FIELDS))}
    if "state" in entities:
        response["state"] = {"results": list(get_accessible_state_queryset(slug, user).values(*STATE_FIELDS))}

    return response


ACCESSIBLE_ID_QUERYSET_BUILDERS = {
    "issue": get_accessible_issue_queryset,
    "issue_comment": get_accessible_issue_comment_queryset,
    "cycle": get_accessible_cycle_queryset,
    "module": get_accessible_module_queryset,
    "label": get_accessible_label_queryset,
    "state": get_accessible_state_queryset,
    "page": get_accessible_page_queryset,
}


def build_accessible_ids_response(slug: str, user: User, entities: frozenset) -> dict:
    """Core of `GET /api/workspaces/<slug>/sync/accessible-ids/` - see
    `plane.app.views.sync` module docstring for the full contract and the
    recommended polling cadence. Every value is a plain list of ids using
    the exact same accessible-* querysets `build_delta_response` uses, so
    the two endpoints can never silently disagree about what "accessible"
    means for a given entity type."""
    response = {"generated_at": timezone.now().isoformat()}
    for entity in entities:
        builder = ACCESSIBLE_ID_QUERYSET_BUILDERS.get(entity)
        if builder is None:
            continue
        response[entity] = list(builder(slug, user).values_list("id", flat=True).distinct())
    return response
