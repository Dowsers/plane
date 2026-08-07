# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Depth/cost limits - exigence 5-6 of docs/feature-specs/08-api-webhooks-cli.md
(section 1) in plane-selfhost. Both are computed from the request's shape
alone (root `limit` + every nested `include.<relation>.limit`) - no query is
ever executed before both checks pass, per the spec's explicit "avant
execution" requirement.

Cost model: the spec says "produit des limit a chaque niveau imbriqué"
(product of the limits at each nesting level), which is unambiguous for a
single chain of relations but doesn't by itself say how sibling relations
at the same level combine. This implementation generalizes it the only way
that stays a genuine upper bound on total rows fetched: for a single
branch (root -> relation -> relation -> ...) the cost IS the product of the
limits along that chain (exactly what the spec says); for a tree with
several relations at the same level, the total cost is the SUM of each
branch's own chain-product, since a batched query for sibling relation A
and a batched query for sibling relation B are two independent queries,
not one multiplied by the other. Each relation node's own contribution is
`limit * (1 + sum(child contributions))`, i.e. the relation's own rows plus
whatever its children cost, scaled by how many parent rows it can have.
"""

from .exceptions import FlexibleQueryError
from .registry import get_relation_def, is_root_entity

DEFAULT_ROOT_LIMIT = 25
MAX_ROOT_LIMIT = 100
MAX_RELATION_LIMIT = 100


def validate_depth(entity_name, include, max_depth, current_depth=1, path="$"):
    """Raises FlexibleQueryError if the include tree nests deeper than
    max_depth. Root query itself is depth 1."""
    if not include:
        return
    if current_depth >= max_depth:
        raise FlexibleQueryError(
            f"Query nesting is too deep (max {max_depth} levels); "
            f"'{path}' would need depth {current_depth + 1}",
            code="max_depth_exceeded",
        )
    for relation_name, node in include.items():
        relation_def = get_relation_def(entity_name, relation_name)
        if relation_def is None:
            raise FlexibleQueryError(
                f"Unknown relation '{relation_name}' on entity '{entity_name}'",
                code="unknown_relation",
            )
        nested_include = (node or {}).get("include") if isinstance(node, dict) else None
        if nested_include and not is_root_entity(relation_def.target):
            raise FlexibleQueryError(
                f"Relation '{path}.{relation_name}' does not support further nested 'include'",
                code="relation_not_nestable",
            )
        validate_depth(
            relation_def.target if is_root_entity(relation_def.target) else None,
            nested_include,
            max_depth,
            current_depth=current_depth + 1,
            path=f"{path}.{relation_name}",
        )


def compute_cost(root_limit, entity_name, include):
    """Compute the request's total estimated cost, per the module docstring
    above. `entity_name` is only used to resolve each relation's default
    limit from the registry when the client omits it."""

    def _relation_cost(entity_name, relation_name, node):
        relation_def = get_relation_def(entity_name, relation_name)
        if relation_def is None:
            raise FlexibleQueryError(
                f"Unknown relation '{relation_name}' on entity '{entity_name}'",
                code="unknown_relation",
            )
        node = node or {}
        limit = node.get("limit", relation_def.default_limit) if relation_def.cardinality == "many" else 1
        limit = validate_limit(limit, relation_def.max_limit, relation_name)
        child_include = node.get("include") or {}
        child_total = 0
        if child_include:
            if not is_root_entity(relation_def.target):
                raise FlexibleQueryError(
                    f"Relation '{relation_name}' does not support further nested 'include'",
                    code="relation_not_nestable",
                )
            for nested_name, nested_node in child_include.items():
                child_total += _relation_cost(relation_def.target, nested_name, nested_node)
        return limit * (1 + child_total)

    total = root_limit
    for relation_name, node in (include or {}).items():
        total += _relation_cost(entity_name, relation_name, node)
    return total


def validate_limit(limit, max_limit, label):
    try:
        limit = int(limit)
    except (TypeError, ValueError) as e:
        raise FlexibleQueryError(f"'{label}' limit must be an integer", code="invalid_limit") from e
    if limit <= 0:
        raise FlexibleQueryError(f"'{label}' limit must be a positive integer", code="invalid_limit")
    if limit > max_limit:
        raise FlexibleQueryError(f"'{label}' limit {limit} exceeds the maximum of {max_limit}", code="limit_too_large")
    return limit


def validate_root_limit(limit):
    if limit is None:
        return DEFAULT_ROOT_LIMIT
    return validate_limit(limit, MAX_ROOT_LIMIT, "root")


def validate_and_compute_cost(entity_name, root_limit, include, *, max_depth, max_cost):
    """Runs both checks and raises FlexibleQueryError (400, pre-execution)
    if either is violated. Returns the computed cost on success."""
    validate_depth(entity_name, include, max_depth)
    cost = compute_cost(root_limit, entity_name, include)
    if cost > max_cost:
        raise FlexibleQueryError(
            f"Query estimated cost ({cost}) exceeds the maximum allowed ({max_cost})",
            code="max_cost_exceeded",
        )
    return cost
