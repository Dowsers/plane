# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Entity/relation whitelist for the flexible query layer - see
docs/feature-specs/08-api-webhooks-cli.md ("Couche de requetes flexible
facon GraphQL", exigence 3-4) in plane-selfhost.

Defined entirely in code (not a DB table) so the introspection endpoint
(`GET /api/v1/workspaces/{slug}/query/schema/`) can never drift from what
the resolver actually implements - both read from the exact same
`ENTITY_REGISTRY` object. This is a deliberate, narrow whitelist: adding a
new entity or relation means editing this file, not a database row.

Filtering on each entity reuses the real nested AND/OR/NOT filter engine
built for Category 4 (`plane.utils.filters.ComplexFilterBackend` +
`BaseFilterSet`/`IssueFilterSet`, see `plane/utils/filters/filterset.py`)
rather than a second filter compiler - the spec's own claim that a "PQL
syntax already used for webhook filters" exists to reuse is fabricated
(`Webhook` is flat boolean columns, no filter language at all); the real
reusable engine is this one, built for saved-view filters.
"""

from dataclasses import dataclass, field

from plane.db.models import Cycle, Issue, Label, Module, Page, Project, State, WorkspaceMember

from .filtersets import (
    CycleFilterSet,
    FlexibleQueryIssueFilterSet,
    LabelFilterSet,
    ModuleFilterSet,
    PageFilterSet,
    ProjectFilterSet,
    StateFilterSet,
    WorkspaceMemberFilterSet,
)


@dataclass(frozen=True)
class RelationDef:
    """One resolvable relation on an entity, per the spec's exigence-4
    fixed list. `target` is either a key into ENTITY_REGISTRY (the
    relation's rows are also independently root-queryable, e.g.
    `issue.cycle` -> the `cycle` entity) or one of the two relation-only
    pseudo-entities declared below (`_comment`, `_user`) for targets that
    are not themselves in the spec's root-entity whitelist.
    """

    target: str
    cardinality: str  # "one" | "many"
    default_limit: int = 10
    max_limit: int = 100
    # Whether `filters` is accepted on this relation's `include` node -
    # False for the two relation-only targets (_comment, _user), which have
    # no FilterSet of their own (see filtersets.py's module docstring for
    # why that's a deliberately scoped v1 limitation, not an oversight).
    filterable: bool = True


@dataclass(frozen=True)
class EntityDef:
    """One root-queryable entity from the spec's exigence-3 whitelist."""

    model: type
    fields: tuple  # every field name selectable via the request's `fields` list
    default_fields: tuple  # used when the client omits `fields` entirely
    orderable_fields: tuple
    default_order_by: str
    filterset_class: type
    relations: dict = field(default_factory=dict)


# --- Relation-only pseudo-entities -----------------------------------
# Targets of `issue.comments` / `issue.assignees` (exigence 4) that are not
# themselves root-queryable per exigence 3's whitelist. Kept out of
# ENTITY_REGISTRY (so they can never be used as `entity` at the request
# root or introspected as a top-level type) but still need their own field
# whitelist for output projection.
COMMENT_FIELDS = ("id", "comment_stripped", "issue_id", "created_by_id", "actor_id", "created_at", "updated_at")
USER_FIELDS = ("id", "email", "display_name", "first_name", "last_name", "avatar")

RELATION_ONLY_FIELDS = {
    "_comment": COMMENT_FIELDS,
    "_user": USER_FIELDS,
}


ENTITY_REGISTRY = {
    "issue": EntityDef(
        model=Issue,
        fields=(
            "id",
            "name",
            "description_stripped",
            "priority",
            "sequence_id",
            "project_id",
            "state_id",
            "parent_id",
            "start_date",
            "target_date",
            "completed_at",
            "is_draft",
            "archived_at",
            "created_at",
            "updated_at",
            "created_by_id",
        ),
        default_fields=("id", "name", "sequence_id", "project_id", "state_id", "priority"),
        orderable_fields=("created_at", "updated_at", "sequence_id", "priority", "start_date", "target_date", "name"),
        default_order_by="-created_at",
        filterset_class=FlexibleQueryIssueFilterSet,
        relations={
            "sub_issues": RelationDef(target="issue", cardinality="many"),
            # Derived from IssueRelation, NOT a stored relation_type value -
            # see resolver.py's `_resolve_blocking_issues` etc. for the
            # exact forward/reverse derivation (mirrors
            # IssueRelationViewSet.list in app/views/issue/relation.py).
            "blocking_issues": RelationDef(target="issue", cardinality="many", filterable=False),
            "blocked_by_issues": RelationDef(target="issue", cardinality="many", filterable=False),
            "duplicate_issues": RelationDef(target="issue", cardinality="many", filterable=False),
            "comments": RelationDef(target="_comment", cardinality="many", filterable=False),
            "cycle": RelationDef(target="cycle", cardinality="one", default_limit=1, max_limit=1),
            # Many, not one, despite the spec's singular `issue.module` name -
            # ModuleIssue has no constraint limiting an issue to one module
            # (see db/models/module.py) - kept the spec's key name verbatim.
            "module": RelationDef(target="module", cardinality="many"),
            "labels": RelationDef(target="label", cardinality="many", default_limit=20),
            "assignees": RelationDef(target="_user", cardinality="many", default_limit=20, filterable=False),
        },
    ),
    "project": EntityDef(
        model=Project,
        fields=(
            "id",
            "name",
            "identifier",
            "description",
            "network",
            "archived_at",
            "created_at",
            "updated_at",
        ),
        default_fields=("id", "name", "identifier", "network"),
        orderable_fields=("created_at", "updated_at", "name", "identifier"),
        default_order_by="-created_at",
        filterset_class=ProjectFilterSet,
        relations={
            "cycles": RelationDef(target="cycle", cardinality="many"),
            "states": RelationDef(target="state", cardinality="many", default_limit=50),
        },
    ),
    "cycle": EntityDef(
        model=Cycle,
        fields=(
            "id", "name", "description", "project_id", "start_date", "end_date",
            "archived_at", "created_at", "updated_at",
        ),
        default_fields=("id", "name", "project_id", "start_date", "end_date"),
        orderable_fields=("created_at", "updated_at", "name", "start_date", "end_date"),
        default_order_by="-created_at",
        filterset_class=CycleFilterSet,
    ),
    "module": EntityDef(
        model=Module,
        fields=(
            "id", "name", "description", "project_id", "start_date", "target_date",
            "status", "archived_at", "created_at", "updated_at",
        ),
        default_fields=("id", "name", "project_id", "status"),
        orderable_fields=("created_at", "updated_at", "name", "start_date", "target_date"),
        default_order_by="-created_at",
        filterset_class=ModuleFilterSet,
    ),
    "page": EntityDef(
        model=Page,
        fields=(
            "id", "name", "access", "is_global", "parent_id", "owned_by_id",
            "sort_order", "archived_at", "created_at", "updated_at",
        ),
        default_fields=("id", "name", "access", "parent_id"),
        orderable_fields=("created_at", "updated_at", "name", "sort_order"),
        default_order_by="-created_at",
        filterset_class=PageFilterSet,
        relations={
            "sub_pages": RelationDef(target="page", cardinality="many"),
        },
    ),
    "state": EntityDef(
        model=State,
        fields=("id", "name", "color", "group", "sequence", "project_id", "is_triage", "default"),
        default_fields=("id", "name", "group", "color"),
        orderable_fields=("sequence", "name"),
        default_order_by="sequence",
        filterset_class=StateFilterSet,
    ),
    "label": EntityDef(
        model=Label,
        fields=("id", "name", "color", "project_id", "sort_order", "parent_id", "created_at"),
        default_fields=("id", "name", "color", "project_id"),
        orderable_fields=("sort_order", "name", "created_at"),
        default_order_by="sort_order",
        filterset_class=LabelFilterSet,
    ),
    # "Member" - WorkspaceMember, not ProjectMember: see registry docstring
    # in the flexible-query README/report for the reasoning (a workspace-
    # scoped query layer needs an entity that is naturally scoped by the
    # URL's own workspace slug without a project_id first being known;
    # ProjectMember rows are reachable today only indirectly, e.g. via a
    # project filter on top of this entity if ever needed).
    "member": EntityDef(
        model=WorkspaceMember,
        fields=("id", "member_id", "role", "is_active", "created_at"),
        default_fields=("id", "member_id", "role", "is_active"),
        orderable_fields=("created_at", "role"),
        default_order_by="-created_at",
        filterset_class=WorkspaceMemberFilterSet,
    ),
}


def get_entity_def(entity_name):
    entity_def = ENTITY_REGISTRY.get(entity_name)
    if entity_def is None:
        return None
    return entity_def


def get_relation_def(entity_name, relation_name):
    entity_def = ENTITY_REGISTRY.get(entity_name)
    if entity_def is None:
        return None
    return entity_def.relations.get(relation_name)


def is_root_entity(name):
    """True if `name` is one of the exigence-3 whitelisted root entities
    (as opposed to a relation-only pseudo-entity like `_comment`/`_user`,
    or simply not a valid entity name at all)."""
    return name in ENTITY_REGISTRY


def get_relation_output_fields(relation_def):
    """Return the allowed output field names for a relation's target,
    whether the target is a full root entity or one of the relation-only
    pseudo-entities."""
    if relation_def.target in RELATION_ONLY_FIELDS:
        return RELATION_ONLY_FIELDS[relation_def.target]
    return ENTITY_REGISTRY[relation_def.target].fields
