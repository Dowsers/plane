# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 2 "SCIM 2.0 natif", exigence 5.

Hand-rolled `startIndex`/`count` pagination - this fork's existing
`plane.app.views.base.BasePaginator` is an opaque-cursor design (confirmed
incompatible by this feature's own pre-implementation research), so it is
not used here at all. This is the SAME `{"schemas": [...], "totalResults",
"itemsPerPage", "startIndex", "Resources": [...]}` envelope shape RFC 7644
SS3.4.2 mandates for `ListResponse`.

The empty-workspace case (exigence "considerations API/UX" - Okta/Azure AD
connection-test wizards send a bare `GET /Users` against a workspace with
zero members and must see a clean `200` with a valid, empty `Resources`
list) falls out of this function by construction: `total_results = 0` ->
`resources = []` -> a fully spec-shaped envelope, never a 404/500/malformed
body.
"""

from typing import Callable, List

SCIM_LIST_RESPONSE_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse"

DEFAULT_COUNT = 100
MAX_COUNT = 500


def _parse_int(raw, default: int) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def scim_paginate(queryset, query_params, resource_builder: Callable) -> dict:
    """`queryset` must support `.count()` and slicing (any Django
    QuerySet). `resource_builder(obj) -> dict` renders one SCIM resource.
    `query_params` is anything `dict`-like with `.get()` (a DRF/Django
    `QueryDict` in practice).
    """
    start_index = _parse_int(query_params.get("startIndex"), 1)
    if start_index < 1:
        start_index = 1

    count = _parse_int(query_params.get("count"), DEFAULT_COUNT)
    count = max(0, min(count, MAX_COUNT))

    total_results = queryset.count()

    resources: List[dict]
    if count == 0 or total_results == 0:
        resources = []
    else:
        offset = start_index - 1
        page = queryset[offset : offset + count]
        resources = [resource_builder(obj) for obj in page]

    return {
        "schemas": [SCIM_LIST_RESPONSE_SCHEMA],
        "totalResults": total_results,
        "itemsPerPage": len(resources),
        "startIndex": start_index,
        "Resources": resources,
    }
