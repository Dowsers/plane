# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
FilterSets for the entities in the flexible-query whitelist that don't
already have one. `Issue` reuses the real `IssueFilterSet`
(plane/utils/filters/filterset.py, built for Category 4's nested-filter-
groups feature) as its base unmodified - see the module docstring on
`registry.py` for why reusing that engine (rather than inventing a second
filter compiler) matters here.

Every FilterSet below explicitly declares `id`/`id__in` itself (repeated
per class rather than factored into a shared mixin) - a plain (non-
FilterSet) mixin's declared `Filter` attributes are NOT picked up by
django-filters' `FilterSetMetaclass` (it only walks `base.declared_filters`
for bases that are themselves already-built FilterSets, and only reads
`attrs` from the new class's own body for everything else), so a shared
mixin here would silently produce a FilterSet where `id` is undeclared -
confirmed the hard way via a failing test suite before writing it this way.

Deliberately NOT exposing `workspace`/`workspace_id`/`project` (the model,
as opposed to `project_id`) as filterable on any of these: the resolver
always applies its own hard-coded `.filter(workspace_id=...)` scope *before*
any client-supplied filter is ANDed in (see scoping.py), and every entity's
allowed-fields list here is a strict allowlist - a field that was never
declared can never be filtered on, so a crafted `{"workspace_id": "<other
workspace>"}` filter is rejected outright by ComplexFilterBackend
(`invalid_filter_field`) rather than silently narrowing (or, worse, ever
being able to widen) the safe base queryset.
"""

from django_filters import filters

from plane.db.models import Cycle, Label, Module, Page, Project, State, WorkspaceMember
from plane.utils.filters import IssueFilterSet
from plane.utils.filters.filterset import BaseFilterSet, CharInFilter, UUIDInFilter


class FlexibleQueryIssueFilterSet(IssueFilterSet):
    """Adds `id`/`id__in` on top of the real, unmodified `IssueFilterSet`
    (Category 4's engine) via subclassing rather than editing that shared
    class directly - see this module's own docstring above."""

    id = filters.UUIDFilter(field_name="id")
    id__in = UUIDInFilter(field_name="id", lookup_expr="in")

    class Meta(IssueFilterSet.Meta):
        pass


class ProjectFilterSet(BaseFilterSet):
    id = filters.UUIDFilter(field_name="id")
    id__in = UUIDInFilter(field_name="id", lookup_expr="in")
    name = filters.CharFilter(field_name="name", lookup_expr="icontains")
    identifier = filters.CharFilter(field_name="identifier", lookup_expr="icontains")
    identifier__exact = filters.CharFilter(field_name="identifier", lookup_expr="exact")
    network = filters.NumberFilter(field_name="network", lookup_expr="exact")
    archived_at__isnull = filters.BooleanFilter(field_name="archived_at", lookup_expr="isnull")

    class Meta:
        model = Project
        fields = []


class CycleFilterSet(BaseFilterSet):
    id = filters.UUIDFilter(field_name="id")
    id__in = UUIDInFilter(field_name="id", lookup_expr="in")
    project_id = filters.UUIDFilter(field_name="project_id")
    project_id__in = UUIDInFilter(field_name="project_id", lookup_expr="in")
    name = filters.CharFilter(field_name="name", lookup_expr="icontains")
    archived_at__isnull = filters.BooleanFilter(field_name="archived_at", lookup_expr="isnull")

    class Meta:
        model = Cycle
        fields = {
            "start_date": ["exact", "gte", "lte"],
            "end_date": ["exact", "gte", "lte"],
        }


class ModuleFilterSet(BaseFilterSet):
    id = filters.UUIDFilter(field_name="id")
    id__in = UUIDInFilter(field_name="id", lookup_expr="in")
    project_id = filters.UUIDFilter(field_name="project_id")
    project_id__in = UUIDInFilter(field_name="project_id", lookup_expr="in")
    name = filters.CharFilter(field_name="name", lookup_expr="icontains")
    status = filters.CharFilter(field_name="status", lookup_expr="exact")
    archived_at__isnull = filters.BooleanFilter(field_name="archived_at", lookup_expr="isnull")

    class Meta:
        model = Module
        fields = []


class StateFilterSet(BaseFilterSet):
    id = filters.UUIDFilter(field_name="id")
    id__in = UUIDInFilter(field_name="id", lookup_expr="in")
    project_id = filters.UUIDFilter(field_name="project_id")
    project_id__in = UUIDInFilter(field_name="project_id", lookup_expr="in")
    name = filters.CharFilter(field_name="name", lookup_expr="icontains")
    group = filters.CharFilter(field_name="group", lookup_expr="exact")
    group__in = CharInFilter(field_name="group", lookup_expr="in")

    class Meta:
        model = State
        fields = []


class LabelFilterSet(BaseFilterSet):
    id = filters.UUIDFilter(field_name="id")
    id__in = UUIDInFilter(field_name="id", lookup_expr="in")
    project_id = filters.UUIDFilter(field_name="project_id")
    project_id__in = UUIDInFilter(field_name="project_id", lookup_expr="in")
    project_id__isnull = filters.BooleanFilter(field_name="project_id", lookup_expr="isnull")
    name = filters.CharFilter(field_name="name", lookup_expr="icontains")

    class Meta:
        model = Label
        fields = []


class PageFilterSet(BaseFilterSet):
    id = filters.UUIDFilter(field_name="id")
    id__in = UUIDInFilter(field_name="id", lookup_expr="in")
    name = filters.CharFilter(field_name="name", lookup_expr="icontains")
    access = filters.NumberFilter(field_name="access", lookup_expr="exact")
    is_global = filters.BooleanFilter(field_name="is_global", lookup_expr="exact")
    parent_id__isnull = filters.BooleanFilter(field_name="parent_id", lookup_expr="isnull")
    parent_id = filters.UUIDFilter(field_name="parent_id")
    owned_by_id = filters.UUIDFilter(field_name="owned_by_id")
    archived_at__isnull = filters.BooleanFilter(field_name="archived_at", lookup_expr="isnull")

    class Meta:
        model = Page
        fields = []


class WorkspaceMemberFilterSet(BaseFilterSet):
    id = filters.UUIDFilter(field_name="id")
    id__in = UUIDInFilter(field_name="id", lookup_expr="in")
    role = filters.NumberFilter(field_name="role", lookup_expr="exact")
    role__in = filters.BaseInFilter(field_name="role", lookup_expr="in")
    is_active = filters.BooleanFilter(field_name="is_active", lookup_expr="exact")
    member_id = filters.UUIDFilter(field_name="member_id")

    class Meta:
        model = WorkspaceMember
        fields = []
