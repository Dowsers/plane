# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# See docs/feature-specs/08-api-webhooks-cli.md ("1. Couche de requetes
# flexible facon GraphQL") in plane-selfhost for the full feature spec
# these implement.

# Python imports
import time

# Django imports
from django.conf import settings

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.app.permissions import WorkspaceViewerPermission
from plane.api.rate_limit import FlexibleQueryCostThrottle
from plane.db.models import FlexibleQueryLog, Workspace, WorkspaceQuerySettings
from plane.utils.exception_logger import log_exception
from plane.utils.flexible_query.exceptions import FlexibleQueryBranchTimeout, FlexibleQueryError
from plane.utils.flexible_query.introspection import build_schema
from plane.utils.flexible_query.resolver import precompute_cost, run_query


def _feature_available(workspace):
    """Both halves of the gate (exigence 12 + the spec's own per-workspace
    user story) must be true - see the reasoning in
    Workspace.is_flexible_query_enabled's own field comment
    (db/models/workspace.py) for why this is two independent switches
    rather than one."""
    return bool(settings.FLEXIBLE_QUERY_ENABLED) and bool(workspace.is_flexible_query_enabled)


def _not_found():
    # Deliberately indistinguishable from "this URL doesn't exist" (404,
    # not 403/400) whenever the feature is off - see the verification
    # requirement in this feature's own README: with the flag unset, the
    # endpoint must "404 or otherwise clearly refuse, never silently
    # allow". Permission checks (WorkspaceViewerPermission, run by DRF
    # before this ever executes) still 403 a non-member first, so this
    # branch is only reached for callers who ARE workspace members but hit
    # a disabled feature.
    return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)


def _effective_settings(workspace):
    row = WorkspaceQuerySettings.objects.filter(workspace=workspace).first()
    if row is None:
        return (
            WorkspaceQuerySettings.DEFAULT_MAX_DEPTH,
            WorkspaceQuerySettings.DEFAULT_MAX_COST,
            WorkspaceQuerySettings.DEFAULT_TIMEOUT_MS,
        )
    return row.max_depth, row.max_cost, row.timeout_ms


def _elapsed_ms(started_at):
    return int((time.monotonic() - started_at) * 1000)


def _write_log(workspace, user, body, *, cost, duration_ms, log_status):
    try:
        FlexibleQueryLog.objects.create(
            workspace=workspace,
            actor=user if getattr(user, "is_authenticated", False) else None,
            raw_query=body if isinstance(body, dict) else {},
            computed_cost=cost,
            duration_ms=duration_ms,
            status=log_status,
        )
    except Exception as e:  # noqa: BLE001 - logging must never break the actual response
        log_exception(e, warning=True)


class FlexibleQueryEndpoint(BaseAPIView):
    """
    POST /api/v1/workspaces/{slug}/query/

    Read-only nested-relation resolver - see
    `plane/utils/flexible_query/resolver.py` for the engine itself. This
    view is intentionally thin: instance/workspace gating, settings
    resolution, the cost-weighted throttle, and translating the resolver's
    exceptions into HTTP responses + an audit log row. All entity/relation/
    permission/cost logic lives in the `flexible_query` package, not here.
    """

    permission_classes = [WorkspaceViewerPermission]

    def get_throttles(self):
        # Replaces (not stacks on top of) the flat/tiered per-request
        # throttle every other plane.api view gets from
        # BaseAPIView.get_throttles() - exigence 10 wants THIS endpoint's
        # limit weighted by computed cost, not request count. The actual
        # check happens explicitly inside post() below once the cost is
        # known, not through DRF's automatic pre-body-parse throttle
        # pipeline (which runs before request.data exists).
        return []

    def post(self, request, slug):
        if not settings.FLEXIBLE_QUERY_ENABLED:
            return _not_found()

        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return _not_found()

        if not _feature_available(workspace):
            return _not_found()

        max_depth, max_cost, timeout_ms = _effective_settings(workspace)

        body = request.data if isinstance(request.data, dict) else {}
        started_at = time.monotonic()

        try:
            cost = precompute_cost(body, max_depth=max_depth, max_cost=max_cost)
        except FlexibleQueryError as e:
            _write_log(
                workspace, request.user, body, cost=0, duration_ms=_elapsed_ms(started_at),
                log_status=FlexibleQueryLog.Status.REJECTED,
            )
            return Response({"error": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)

        throttle = FlexibleQueryCostThrottle()
        if not throttle.allow_request(request, self, cost=cost):
            _write_log(
                workspace, request.user, body, cost=cost, duration_ms=_elapsed_ms(started_at),
                log_status=FlexibleQueryLog.Status.REJECTED,
            )
            response = Response(
                {
                    "error": "Flexible query cost budget exceeded for this window",
                    "code": "rate_limited",
                    "cost": cost,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            retry_after = throttle.wait()
            if retry_after:
                response["Retry-After"] = retry_after
            return response

        try:
            result, cost = run_query(
                body,
                user=request.user,
                workspace=workspace,
                max_depth=max_depth,
                max_cost=max_cost,
                timeout_ms=timeout_ms,
            )
        except FlexibleQueryError as e:
            _write_log(
                workspace, request.user, body, cost=cost, duration_ms=_elapsed_ms(started_at),
                log_status=FlexibleQueryLog.Status.REJECTED,
            )
            return Response({"error": e.message, "code": e.code}, status=status.HTTP_400_BAD_REQUEST)
        except FlexibleQueryBranchTimeout:
            _write_log(
                workspace, request.user, body, cost=cost, duration_ms=_elapsed_ms(started_at),
                log_status=FlexibleQueryLog.Status.TIMEOUT,
            )
            return Response(
                {"error": f"Query exceeded the {timeout_ms}ms timeout", "code": "timeout"},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except Exception as e:  # noqa: BLE001 - never 500 a caller-triggerable failure without logging it
            log_exception(e)
            _write_log(
                workspace, request.user, body, cost=cost, duration_ms=_elapsed_ms(started_at),
                log_status=FlexibleQueryLog.Status.REJECTED,
            )
            return Response(
                {"error": "Something went wrong while resolving this query"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        final_status = FlexibleQueryLog.Status.PARTIAL if result["errors"] else FlexibleQueryLog.Status.SUCCESS
        _write_log(
            workspace, request.user, body, cost=cost, duration_ms=_elapsed_ms(started_at), log_status=final_status
        )
        return Response(result, status=status.HTTP_200_OK)


class FlexibleQuerySchemaEndpoint(BaseAPIView):
    """GET /api/v1/workspaces/{slug}/query/schema/ - introspection over the
    exact same whitelist registry the resolver above enforces (exigence
    14)."""

    permission_classes = [WorkspaceViewerPermission]

    def get(self, request, slug):
        if not settings.FLEXIBLE_QUERY_ENABLED:
            return _not_found()

        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return _not_found()

        if not _feature_available(workspace):
            return _not_found()

        return Response(build_schema(), status=status.HTTP_200_OK)
