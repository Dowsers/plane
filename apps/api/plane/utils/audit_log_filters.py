# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), features 3+5 merged, exigence 8 - shared filter
application for `WorkspaceAuditLog`, used by BOTH the list endpoint
(`plane.app.views.workspace.audit_log.WorkspaceAuditLogViewSet`) and the
CSV export task (`plane.bgtasks.audit_log_export_task`) so "l'export CSV
DOIT s'appliquer aux filtres actifs" (exigence 11) can never silently
drift from what the list endpoint itself would return for the same query
params.
"""

from typing import Mapping


def apply_audit_log_filters(queryset, params: Mapping):
    """`params` is anything `dict`-like with `.get`/multi-value access -
    both `request.GET` (a DRF `QueryDict`) and a plain `dict` (as stored
    on `ExporterHistory.filters` for the export task, since Celery tasks
    don't have a live `QueryDict` to re-parse) work here."""
    event_types = _get_list(params, "event_type")
    if event_types:
        queryset = queryset.filter(event_type__in=event_types)

    actor = _get_single(params, "actor")
    if actor:
        queryset = queryset.filter(actor_id=actor)

    target_user = _get_single(params, "target_user")
    if target_user:
        queryset = queryset.filter(target_user_id=target_user)

    date_from = _get_single(params, "date_from")
    if date_from:
        queryset = queryset.filter(created_at__gte=date_from)

    date_to = _get_single(params, "date_to")
    if date_to:
        queryset = queryset.filter(created_at__lte=date_to)

    return queryset


def _get_list(params, key):
    getlist = getattr(params, "getlist", None)
    if callable(getlist):
        values = [v for v in getlist(key) if v]
        # A comma-separated single query param value (?event_type=A,B) is
        # also accepted, matching this fork's other multi-value filters.
        flattened = []
        for value in values:
            flattened.extend([v for v in value.split(",") if v])
        return flattened

    value = params.get(key)
    if not value:
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    return [v for v in str(value).split(",") if v]


def _get_single(params, key):
    return params.get(key) or None
