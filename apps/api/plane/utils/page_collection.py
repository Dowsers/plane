# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 10 (Docs/Wiki & Collaboration, docs/feature-specs/10-docs-wiki.md
in plane-selfhost), feature 4 - "Wiki workspace en GA". Shared depth/
cycle-detection helpers for `PageCollection` nesting (exigence 3: max
depth of 3 levels, 400 error if violated), used by both
`PageCollectionSerializer.validate_parent`
(`plane.app.serializers.page_collection`) and the reparent/delete-cascade
logic in `plane.app.views.page.workspace`.

All lookups are bounded: the global invariant this module enforces means
no Collection tree is ever more than 3 levels deep, so none of these
helpers ever need more than two hops down/up the tree - no need for a
recursive CTE the way `unarchive_archive_page_and_descendants`
(`plane.app.views.page.base`) needs one for the unbounded `Page.parent`
sub-page hierarchy.
"""

MAX_COLLECTION_DEPTH = 3


def collection_depth(collection):
    """Depth of `collection` itself - a root Collection (no parent) is
    depth 1, its direct children are depth 2, grandchildren depth 3."""
    depth = 0
    node = collection
    while node is not None:
        depth += 1
        node = node.parent
    return depth


def collection_relative_subtree_height(collection):
    """How many extra levels exist below `collection` today: 0 if it has
    no children, 1 if it has children but no grandchildren, 2 if it has
    grandchildren. Bounded to two hops by the MAX_COLLECTION_DEPTH
    invariant - a Collection can never have great-grandchildren."""
    from plane.db.models import PageCollection

    child_ids = list(PageCollection.objects.filter(parent_id=collection.id).values_list("id", flat=True))
    if not child_ids:
        return 0
    has_grandchildren = PageCollection.objects.filter(parent_id__in=child_ids).exists()
    return 2 if has_grandchildren else 1


def collection_descendant_ids(collection):
    """All descendant Collection ids (children + grandchildren only, per
    the same bounded-depth invariant as `collection_relative_subtree_height`)."""
    from plane.db.models import PageCollection

    child_ids = list(PageCollection.objects.filter(parent_id=collection.id).values_list("id", flat=True))
    if not child_ids:
        return set()
    grandchild_ids = list(PageCollection.objects.filter(parent_id__in=child_ids).values_list("id", flat=True))
    return set(child_ids) | set(grandchild_ids)


def validate_collection_depth(*, new_parent, existing_instance=None):
    """Raise `ValueError` if placing `existing_instance` (None means "a
    brand-new Collection") under `new_parent` (None means "root") would
    push any node in its subtree past MAX_COLLECTION_DEPTH.

    Callers (serializer/view) are expected to translate `ValueError` into
    their own 400 response shape.
    """
    new_depth = (collection_depth(new_parent) if new_parent is not None else 0) + 1
    relative_height = collection_relative_subtree_height(existing_instance) if existing_instance is not None else 0
    if new_depth + relative_height > MAX_COLLECTION_DEPTH:
        raise ValueError(f"Collections can be nested at most {MAX_COLLECTION_DEPTH} levels deep.")
