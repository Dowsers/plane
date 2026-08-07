# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
The resolver itself - see docs/feature-specs/08-api-webhooks-cli.md
("Couche de requetes flexible facon GraphQL") in plane-selfhost for the
full spec this implements.

Two-phase design:
  1. `_compile_node` walks the whole request tree (root + every nested
     `include`) up front and raises `FlexibleQueryError` (-> HTTP 400,
     nothing executed yet) for anything structurally wrong: unknown
     entity/relation/field names, bad `filters` JSON (validated via the
     real `ComplexFilterBackend` against a `.none()` queryset, which never
     touches the database - see filter_backend.py, `_apply_json_filter`
     only ever calls the lazy `.filter()`), limits out of range. Combined
     with `cost.validate_and_compute_cost` (depth/cost, also pre-
     execution), nothing about the request shape gets a chance to run a
     query until every check has passed.
  2. `_resolve_level` walks the SAME tree a second time, this time
     materializing queries level by level (breadth-first: fetch the
     parents, then batch-fetch every relation across ALL parents in one
     query each, rather than one query per parent row). Any runtime
     failure of one relation (permission-scoped down to nothing is NOT a
     failure - see scoping.py - only an actual exception or a timeout is)
     becomes one `errors[]` entry for that branch; the rest of the tree
     still resolves (exigence 9).

SECURITY: every single queryset this module ever materializes - the root
query AND every relation's batched child query, without exception - is
passed through `scoping.scope_queryset` (or `scope_comments`/
`scope_assignees` for the two relation-only targets) before being touched
further. See scoping.py's own module docstring for why that is applied
again for every relation even though the parent was already authorized.
"""

import base64
import time
from collections import defaultdict
from contextlib import contextmanager

from django.db import connection, transaction
from django.db.utils import OperationalError
from rest_framework.exceptions import ValidationError as DRFValidationError

from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueAssignee,
    IssueComment,
    IssueLabel,
    IssueRelation,
    ModuleIssue,
    Page,
    State,
)
from plane.utils.exception_logger import log_exception
from plane.utils.filters import ComplexFilterBackend

from . import cost as cost_module
from .exceptions import FlexibleQueryBranchTimeout, FlexibleQueryError
from .registry import RELATION_ONLY_FIELDS, get_entity_def, is_root_entity
from .scoping import scope_assignees, scope_comments, scope_queryset

# --- small shared helpers ---------------------------------------------


class _FilterView:
    """Minimal stand-in for a DRF view - ComplexFilterBackend only ever
    reads these three attributes off whatever `view` it's given."""

    def __init__(self, filterset_class):
        self.filterset_class = filterset_class
        self.complex_filter_max_depth = 5
        self.complex_filter_max_conditions = 50


class ResolverContext:
    def __init__(self, user, workspace, deadline):
        self.user = user
        self.workspace = workspace
        self.deadline = deadline
        self.errors = []


def _remaining_ms(ctx):
    return max(0.0, (ctx.deadline - time.monotonic()) * 1000.0)


def _deadline_exceeded(ctx):
    return time.monotonic() >= ctx.deadline


@contextmanager
def bounded_statement(remaining_ms_value):
    """Bounds every query run inside this block by a Postgres-level
    `SET LOCAL statement_timeout`, scoped to a savepoint (nested
    `transaction.atomic()`) so a timeout on one branch's query never
    poisons the surrounding transaction for later, independent branches -
    see the module docstring in resolver.py's report writeup for the full
    reasoning (Postgres aborts the whole transaction after a raised error
    until a ROLLBACK; a savepoint rollback is scoped to just this block).
    """
    remaining = max(int(remaining_ms_value), 1)
    with transaction.atomic():
        with connection.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout = %s", [remaining])
        try:
            yield
        except OperationalError as e:
            if _looks_like_statement_timeout(e):
                raise FlexibleQueryBranchTimeout() from e
            raise


def _looks_like_statement_timeout(exc):
    text = str(exc).lower()
    return "statement timeout" in text or "canceling statement" in text or "query_canceled" in text


def _apply_filters(queryset, filterset_class, filters_dict):
    if not filters_dict:
        return queryset
    view = _FilterView(filterset_class)
    return ComplexFilterBackend().filter_queryset(None, queryset, view, filter_data=filters_dict)


def _validate_filters_shape(filters_dict, filterset_class, model, path):
    view = _FilterView(filterset_class)
    try:
        ComplexFilterBackend().filter_queryset(None, model._default_manager.none(), view, filter_data=filters_dict)
    except DRFValidationError as e:
        raise FlexibleQueryError(f"Invalid 'filters' at '{path}': {e.detail}", code="invalid_filters") from e


def _validate_fields(fields, allowed_fields, default_fields, path):
    if fields is None:
        return list(default_fields)
    if not isinstance(fields, list) or not all(isinstance(f, str) for f in fields):
        raise FlexibleQueryError(f"'{path}.fields' must be a list of strings", code="invalid_fields")
    if not fields:
        raise FlexibleQueryError(f"'{path}.fields' must not be empty", code="invalid_fields")
    unknown = [f for f in fields if f not in allowed_fields]
    if unknown:
        raise FlexibleQueryError(
            f"Unknown field(s) {unknown} for '{path}' - allowed: {sorted(allowed_fields)}",
            code="unknown_field",
        )
    return fields


def _validate_order_by(order_by, orderable_fields, default_order_by, path):
    if order_by is None:
        return default_order_by
    if orderable_fields == () or not isinstance(order_by, str):
        raise FlexibleQueryError(f"'{path}' does not support 'order_by'", code="order_by_not_supported")
    field_name = order_by[1:] if order_by.startswith("-") else order_by
    if field_name not in orderable_fields:
        raise FlexibleQueryError(f"Cannot order '{path}' by '{field_name}'", code="invalid_order_by")
    return order_by


def _project(instance, fields):
    return {f: getattr(instance, f, None) for f in fields}


def _base_queryset(model):
    if model is Issue:
        return Issue.issue_objects.all()
    return model.objects.all()


def _decode_cursor(cursor):
    if not cursor:
        return 0
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        offset = int(raw)
        if offset < 0:
            raise ValueError("negative offset")
        return offset
    except Exception as e:
        raise FlexibleQueryError("Invalid 'cursor'", code="invalid_cursor") from e


def _encode_cursor(offset):
    return base64.urlsafe_b64encode(str(offset).encode()).decode()


# --- phase 1: compile / validate (no query execution) -------------------


def _compile_node(entity_name, fields, filters_dict, order_by, include, *, path, relation_def=None):
    if entity_name is not None:
        entity_def = get_entity_def(entity_name)
        allowed_fields = entity_def.fields
        default_fields = entity_def.default_fields
        filterset_class = entity_def.filterset_class
        orderable_fields = entity_def.orderable_fields
        default_order_by = entity_def.default_order_by
        relations = entity_def.relations
        model = entity_def.model
    else:
        allowed_fields = RELATION_ONLY_FIELDS[relation_def.target]
        default_fields = allowed_fields
        filterset_class = None
        orderable_fields = ()
        default_order_by = None
        relations = {}
        model = None

    resolved_fields = _validate_fields(fields, allowed_fields, default_fields, path)

    if filters_dict is not None:
        if filterset_class is None:
            raise FlexibleQueryError(f"'{path}' does not support 'filters'", code="filters_not_supported")
        _validate_filters_shape(filters_dict, filterset_class, model, path)

    resolved_order_by = _validate_order_by(order_by, orderable_fields, default_order_by, path)

    compiled_include = {}
    if include:
        if not relations:
            raise FlexibleQueryError(f"'{path}' does not support 'include'", code="include_not_supported")
        if not isinstance(include, dict):
            raise FlexibleQueryError(f"'{path}.include' must be an object", code="invalid_include")
        for relation_name, node in include.items():
            rel_def = relations.get(relation_name)
            if rel_def is None:
                raise FlexibleQueryError(
                    f"Unknown relation '{relation_name}' on '{path}'", code="unknown_relation"
                )
            node = node or {}
            if not isinstance(node, dict):
                raise FlexibleQueryError(f"'{path}.include.{relation_name}' must be an object", code="invalid_include")

            rel_filters = node.get("filters")
            rel_order_by_in = node.get("order_by")
            if not rel_def.filterable:
                # Derived/computed relations (blocking_issues, comments,
                # assignees, ...) have a fixed pairing query with no
                # client-controllable filtering *or* ordering - reject
                # both explicitly rather than silently ignoring one of them.
                if rel_filters is not None:
                    raise FlexibleQueryError(
                        f"Relation '{relation_name}' does not support 'filters'", code="filters_not_supported"
                    )
                if rel_order_by_in is not None:
                    raise FlexibleQueryError(
                        f"Relation '{relation_name}' does not support 'order_by'", code="order_by_not_supported"
                    )

            if rel_def.cardinality == "many":
                rel_limit = cost_module.validate_limit(
                    node.get("limit", rel_def.default_limit), rel_def.max_limit, f"{path}.include.{relation_name}"
                )
            elif "limit" in node:
                raise FlexibleQueryError(
                    f"Relation '{relation_name}' has cardinality 'one' and does not support 'limit'",
                    code="limit_not_supported",
                )
            else:
                rel_limit = 1

            child_target = rel_def.target if is_root_entity(rel_def.target) else None
            child_compiled = _compile_node(
                child_target,
                node.get("fields"),
                rel_filters,
                rel_order_by_in,
                node.get("include"),
                path=f"{path}.include.{relation_name}",
                relation_def=rel_def,
            )
            compiled_include[relation_name] = {
                "relation_def": rel_def,
                "fields": child_compiled["fields"],
                "filters": rel_filters,
                "order_by": child_compiled["order_by"],
                "limit": rel_limit,
                "include": child_compiled["include"],
            }

    return {
        "fields": resolved_fields,
        "filters": filters_dict,
        "order_by": resolved_order_by,
        "include": compiled_include,
    }


# --- phase 2: execute, batched per level, partial-resolution-safe --------


def _group_and_project(pairs, instances_by_id, limit):
    """`pairs`: list of (parent_id, target_id). `instances_by_id`: dict of
    already-scoped/filtered/ordered target instances keyed by id (only
    ones the user is allowed to see - target ids missing from this dict
    are silently dropped, per exigence 8: an inaccessible relation target
    disappears, it never raises or is otherwise distinguishable). Returns
    dict[parent_id -> list[instance]] (raw instances, NOT yet projected -
    projection happens one level up, after any further recursion)."""
    order_index = {iid: idx for idx, iid in enumerate(instances_by_id.keys())}
    pairs_sorted = sorted(pairs, key=lambda p: order_index.get(p[1], 10**9))
    grouped = defaultdict(list)
    for parent_id, target_id in pairs_sorted:
        inst = instances_by_id.get(target_id)
        if inst is None:
            continue
        if len(grouped[parent_id]) >= limit:
            continue
        grouped[parent_id].append(inst)
    return grouped


def _resolve_pairs_via_target(entity_name, filterset_class, pairs, filters_dict, order_by, limit, *, ctx, path):
    target_ids = {t for _, t in pairs if t}
    if not target_ids:
        return {}, None
    model = get_entity_def(entity_name).model
    try:
        with bounded_statement(_remaining_ms(ctx)):
            qs = _base_queryset(model).filter(id__in=target_ids)
            qs = scope_queryset(entity_name, qs, user=ctx.user, workspace=ctx.workspace)
            qs = _apply_filters(qs, filterset_class, filters_dict)
            if order_by:
                qs = qs.order_by(order_by)
            instances_by_id = {inst.id: inst for inst in qs}
    except FlexibleQueryBranchTimeout:
        return None, {"path": path, "code": "timeout", "message": f"Relation '{path}' timed out"}
    except Exception as e:  # noqa: BLE001 - any runtime failure here is a partial-resolution branch error, not a 500
        log_exception(e)
        return None, {"path": path, "code": "resolution_error", "message": f"Failed to resolve '{path}'"}
    return _group_and_project(pairs, instances_by_id, limit), None


def _resolve_via_target(entity_name, pairs, filters_dict, order_by, limit, *, ctx, path):
    """Thin wrapper around `_resolve_pairs_via_target` that looks up
    `entity_name`'s filterset from the registry - shared by every relation
    resolver below whose target is a root entity."""
    filterset_class = get_entity_def(entity_name).filterset_class
    return _resolve_pairs_via_target(
        entity_name, filterset_class, pairs, filters_dict, order_by, limit, ctx=ctx, path=path
    )


def _resolve_sub_issues(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    pairs = list(Issue.issue_objects.filter(parent_id__in=parent_ids).values_list("parent_id", "id"))
    return _resolve_via_target("issue", pairs, filters_dict, order_by, limit, ctx=ctx, path=path)


def _issue_relation_pairs(relation_type, group_field, target_field, parent_ids):
    lookups = {f"{group_field}__in": parent_ids, "relation_type": relation_type}
    return list(IssueRelation.objects.filter(**lookups).values_list(group_field, target_field))


def _resolve_blocking_issues(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    # Issue X "is blocking" issue P <=> IssueRelation(issue=P, related_issue=X,
    # relation_type="blocked_by") - see the module docstring in scoping.py and
    # IssueRelationViewSet.list (app/views/issue/relation.py) for the same derivation.
    pairs = _issue_relation_pairs("blocked_by", "related_issue_id", "issue_id", parent_ids)
    return _resolve_via_target("issue", pairs, None, None, limit, ctx=ctx, path=path)


def _resolve_blocked_by_issues(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    pairs = _issue_relation_pairs("blocked_by", "issue_id", "related_issue_id", parent_ids)
    return _resolve_via_target("issue", pairs, None, None, limit, ctx=ctx, path=path)


def _resolve_duplicate_issues(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    # Symmetric relation type - stored on either side, so both directions
    # must be checked (mirrors IssueRelationViewSet.list's own
    # duplicate_issues + duplicate_issues_related pair).
    pairs = _issue_relation_pairs(
        "duplicate", "issue_id", "related_issue_id", parent_ids
    ) + _issue_relation_pairs("duplicate", "related_issue_id", "issue_id", parent_ids)
    return _resolve_via_target("issue", pairs, None, None, limit, ctx=ctx, path=path)


def _resolve_cycle(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    pairs = list(
        CycleIssue.objects.filter(issue_id__in=parent_ids, deleted_at__isnull=True).values_list("issue_id", "cycle_id")
    )
    return _resolve_via_target("cycle", pairs, filters_dict, order_by, limit, ctx=ctx, path=path)


def _resolve_module(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    pairs = list(
        ModuleIssue.objects.filter(issue_id__in=parent_ids, deleted_at__isnull=True)
        .values_list("issue_id", "module_id")
    )
    return _resolve_via_target("module", pairs, filters_dict, order_by, limit, ctx=ctx, path=path)


def _resolve_labels(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    pairs = list(
        IssueLabel.objects.filter(issue_id__in=parent_ids, deleted_at__isnull=True).values_list("issue_id", "label_id")
    )
    return _resolve_via_target("label", pairs, filters_dict, order_by, limit, ctx=ctx, path=path)


def _resolve_cycles_for_project(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    pairs = list(Cycle.objects.filter(project_id__in=parent_ids).values_list("project_id", "id"))
    return _resolve_via_target("cycle", pairs, filters_dict, order_by, limit, ctx=ctx, path=path)


def _resolve_states_for_project(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    pairs = list(State.objects.filter(project_id__in=parent_ids).values_list("project_id", "id"))
    return _resolve_via_target("state", pairs, filters_dict, order_by, limit, ctx=ctx, path=path)


def _resolve_sub_pages(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    pairs = list(Page.objects.filter(parent_id__in=parent_ids).values_list("parent_id", "id"))
    return _resolve_via_target("page", pairs, filters_dict, order_by, limit, ctx=ctx, path=path)


def _resolve_comments(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    try:
        with bounded_statement(_remaining_ms(ctx)):
            qs = IssueComment.objects.filter(issue_id__in=parent_ids, deleted_at__isnull=True)
            qs = scope_comments(qs, user=ctx.user, workspace=ctx.workspace).order_by(order_by or "-created_at")
            rows = list(qs)
    except FlexibleQueryBranchTimeout:
        return None, {"path": path, "code": "timeout", "message": f"Relation '{path}' timed out"}
    except Exception as e:  # noqa: BLE001
        log_exception(e)
        return None, {"path": path, "code": "resolution_error", "message": f"Failed to resolve '{path}'"}
    grouped = defaultdict(list)
    for row in rows:
        if len(grouped[row.issue_id]) >= limit:
            continue
        grouped[row.issue_id].append(row)
    return grouped, None


def _resolve_assignees(parent_ids, relation_def, fields, filters_dict, order_by, limit, *, ctx, path):
    try:
        with bounded_statement(_remaining_ms(ctx)):
            qs = IssueAssignee.objects.filter(issue_id__in=parent_ids, deleted_at__isnull=True)
            qs = qs.select_related("assignee")
            qs = scope_assignees(qs, user=ctx.user, workspace=ctx.workspace)
            rows = list(qs)
    except FlexibleQueryBranchTimeout:
        return None, {"path": path, "code": "timeout", "message": f"Relation '{path}' timed out"}
    except Exception as e:  # noqa: BLE001
        log_exception(e)
        return None, {"path": path, "code": "resolution_error", "message": f"Failed to resolve '{path}'"}
    grouped = defaultdict(list)
    for row in rows:
        if row.assignee_id is None:
            continue
        if len(grouped[row.issue_id]) >= limit:
            continue
        grouped[row.issue_id].append(row.assignee)
    return grouped, None


_RELATION_RESOLVERS = {
    "sub_issues": _resolve_sub_issues,
    "blocking_issues": _resolve_blocking_issues,
    "blocked_by_issues": _resolve_blocked_by_issues,
    "duplicate_issues": _resolve_duplicate_issues,
    "comments": _resolve_comments,
    "cycle": _resolve_cycle,
    "module": _resolve_module,
    "labels": _resolve_labels,
    "assignees": _resolve_assignees,
    "cycles": _resolve_cycles_for_project,
    "states": _resolve_states_for_project,
    "sub_pages": _resolve_sub_pages,
}


def _resolve_level(entity_name, instances, resolved_fields, compiled_include, *, ctx, path):
    """Returns dict[instance.id -> projected dict], with every relation in
    `compiled_include` resolved and attached (recursively)."""
    projected_by_id = {inst.id: _project(inst, resolved_fields) for inst in instances}
    if not compiled_include or not instances:
        return projected_by_id

    parent_ids = list(projected_by_id.keys())
    for relation_name, relation_node in compiled_include.items():
        relation_def = relation_node["relation_def"]
        child_path = f"{path}.include.{relation_name}"

        if _deadline_exceeded(ctx):
            timeout_message = f"'{child_path}' skipped - request deadline exceeded"
            ctx.errors.append({"path": child_path, "code": "timeout", "message": timeout_message})
            for pid in projected_by_id:
                projected_by_id[pid][relation_name] = [] if relation_def.cardinality == "many" else None
            continue

        resolver_fn = _RELATION_RESOLVERS[relation_name]
        try:
            grouped_instances, error = resolver_fn(
                parent_ids,
                relation_def,
                relation_node["fields"],
                relation_node["filters"],
                relation_node["order_by"],
                relation_node["limit"],
                ctx=ctx,
                path=child_path,
            )
        except FlexibleQueryBranchTimeout:
            grouped_instances, error = None, {
                "path": child_path, "code": "timeout", "message": f"Relation '{child_path}' timed out"
            }
        except Exception as e:  # noqa: BLE001 - exigence 9: one branch's bug must not fail the whole query
            log_exception(e)
            grouped_instances, error = None, {
                "path": child_path, "code": "resolution_error", "message": f"Failed to resolve '{child_path}'"
            }
        if error:
            ctx.errors.append(error)
            for pid in projected_by_id:
                projected_by_id[pid][relation_name] = [] if relation_def.cardinality == "many" else None
            continue

        # Dedup children across parents (the same child can legitimately
        # appear under more than one parent, e.g. two issues sharing a
        # label) before any further recursion, so it's only resolved once.
        all_children = {}
        for insts in grouped_instances.values():
            for inst in insts:
                all_children[inst.id] = inst

        target_entity_for_recursion = relation_def.target if is_root_entity(relation_def.target) else None
        nested_include = relation_node.get("include")
        if all_children and target_entity_for_recursion:
            child_projected_by_id = _resolve_level(
                target_entity_for_recursion,
                list(all_children.values()),
                relation_node["fields"],
                nested_include,
                ctx=ctx,
                path=child_path,
            )
        else:
            child_projected_by_id = {cid: _project(inst, relation_node["fields"]) for cid, inst in all_children.items()}

        # Iterate every parent, not just the ones grouped_instances happens
        # to have a key for - a parent whose sole child(ren) were all
        # excluded by scoping (exigence 8: "an inaccessible relation target
        # disappears") never gets a key in grouped_instances at all (it's a
        # defaultdict, only populated by an append), which previously left
        # this relation_name key missing from the row entirely instead of
        # an empty list/None - a client indexing row[relation_name] would
        # KeyError instead of seeing the documented empty result.
        for pid in parent_ids:
            insts = grouped_instances.get(pid, [])
            values = [child_projected_by_id[inst.id] for inst in insts if inst.id in child_projected_by_id]
            if pid in projected_by_id:
                projected_by_id[pid][relation_name] = values if relation_def.cardinality == "many" else (
                    values[0] if values else None
                )

    return projected_by_id


def _parse_request_shape(body):
    if not isinstance(body, dict):
        raise FlexibleQueryError("Request body must be a JSON object", code="invalid_body")
    entity_name = body.get("entity")
    if not isinstance(entity_name, str) or not entity_name:
        raise FlexibleQueryError("'entity' is required and must be a string", code="invalid_entity")
    if not is_root_entity(entity_name):
        raise FlexibleQueryError(
            f"Unknown entity '{entity_name}' - see GET .../query/schema/ for the whitelist", code="unknown_entity"
        )
    fields = body.get("fields")
    filters_dict = body.get("filters")
    include = body.get("include")
    limit = body.get("limit")
    cursor = body.get("cursor")
    order_by = body.get("order_by")
    if filters_dict is not None and not isinstance(filters_dict, dict):
        raise FlexibleQueryError("'filters' must be an object", code="invalid_filters")
    if include is not None and not isinstance(include, dict):
        raise FlexibleQueryError("'include' must be an object", code="invalid_include")
    if cursor is not None and not isinstance(cursor, str):
        raise FlexibleQueryError("'cursor' must be a string", code="invalid_cursor")
    return entity_name, fields, filters_dict, include, limit, cursor, order_by


def precompute_cost(body, *, max_depth, max_cost):
    """Standalone precheck: parses+validates the request shape and computes
    its cost WITHOUT resolving anything (no `user`/`workspace` needed - see
    module docstring, this never touches the database). Used by the view to
    run the cost-weighted throttle (rate_limit.FlexibleQueryCostThrottle)
    *before* calling `run_query`, since a request that is going to be
    throttled shouldn't have its (already fully known) cost thrown away and
    recomputed - and, symmetrically, so the throttle check happens after
    the same pre-execution depth/cost rejection every other 400 goes
    through, never on a request that would have been rejected anyway.
    Raises FlexibleQueryError, same as run_query.
    """
    entity_name, _fields, _filters_dict, include, limit, _cursor, _order_by = _parse_request_shape(body)
    root_limit = cost_module.validate_root_limit(limit)
    cost = cost_module.validate_and_compute_cost(
        entity_name, root_limit, include, max_depth=max_depth, max_cost=max_cost
    )
    return cost


def run_query(body, *, user, workspace, max_depth, max_cost, timeout_ms):
    """Top-level entry point. Raises `FlexibleQueryError` for any
    structural problem (-> HTTP 400) or `FlexibleQueryBranchTimeout` if the
    ROOT query itself times out (-> HTTP 504, nothing partial to serve).
    Returns (response_dict, computed_cost) on success (which may still
    contain a non-empty `errors[]` for partially-failed nested branches -
    that is HTTP 200, not an exception).
    """
    entity_name, fields, filters_dict, include, limit, cursor, order_by = _parse_request_shape(body)
    entity_def = get_entity_def(entity_name)

    root_limit = cost_module.validate_root_limit(limit)
    cost = cost_module.validate_and_compute_cost(
        entity_name, root_limit, include, max_depth=max_depth, max_cost=max_cost
    )

    compiled = _compile_node(entity_name, fields, filters_dict, order_by, include, path="$")
    offset = _decode_cursor(cursor)

    ctx = ResolverContext(user=user, workspace=workspace, deadline=time.monotonic() + timeout_ms / 1000.0)

    qs = _base_queryset(entity_def.model)
    qs = scope_queryset(entity_name, qs, user=user, workspace=workspace)
    qs = _apply_filters(qs, entity_def.filterset_class, compiled["filters"])
    if compiled["order_by"]:
        qs = qs.order_by(compiled["order_by"])

    with bounded_statement(_remaining_ms(ctx)):
        page = list(qs[offset : offset + root_limit + 1])

    has_more = len(page) > root_limit
    page = page[:root_limit]

    projected_by_id = _resolve_level(entity_name, page, compiled["fields"], compiled["include"], ctx=ctx, path="$")
    data = [projected_by_id[inst.id] for inst in page]

    return {
        "data": data,
        "errors": ctx.errors,
        "next_cursor": _encode_cursor(offset + root_limit) if has_more else None,
        "cost": cost,
    }, cost
