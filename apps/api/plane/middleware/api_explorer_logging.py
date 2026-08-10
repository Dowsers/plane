# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
API Explorer request tagging - see docs/feature-specs/08-api-webhooks-cli.md
("6. Explorateur d'API interactif", exigence 12) in plane-selfhost.

The explorer calls real, pre-existing REST endpoints directly from the
browser (no execution proxy - see that feature's own "hors perimetre"), so
there is no single view/serializer choke point to log from. Generic
middleware is the only place that can see every one of the 180+ endpoints
without editing each one.

DESIGN NOTE - why a *second*, separate middleware instead of extending the
pre-existing `plane.middleware.logger.APITokenLogMiddleware`: that
middleware already logs *every* X-Api-Key request unconditionally (async,
via Celery, to Mongo-or-`APIActivityLog`) - it is relied upon today and
deliberately left untouched here to avoid risking its existing behavior.
This middleware is intentionally the opposite shape: synchronous (explorer
traffic is low-volume and user-initiated - same reasoning as the webhook
test-send endpoint being synchronous) and conditional (a no-op unless the
explorer's own header is present), writing a second, lighter row tagged
`source="api_explorer"` into the same `APIActivityLog` table (extended
with `workspace`/`duration_ms`/`source` - see db/models/api.py) rather than
a new `APIExplorerRequestLog` model, since the existing table already
covers method/path/status/token identity/timestamp/actor
(`created_by`, from `BaseModel`) - only those three columns were missing.
Two rows per explorer-driven call (one generic, one explorer-tagged) is an
acceptable, easily-filtered trade-off for not touching the existing
Celery/Mongo pipeline.
"""

# Python imports
import time

# Module imports
from plane.db.models import APIActivityLog, Workspace
from plane.utils.exception_logger import log_exception
from plane.utils.ip_address import get_client_ip

EXPLORER_SOURCE_HEADER = "X-Plane-Source"
EXPLORER_SOURCE_VALUE = "api-explorer"
EXPLORER_LOG_SOURCE = "api_explorer"


class APIExplorerActivityLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started_at = time.monotonic()
        response = self.get_response(request)

        if request.headers.get(EXPLORER_SOURCE_HEADER) != EXPLORER_SOURCE_VALUE:
            return response

        try:
            self._log(request, response, started_at)
        except Exception as e:  # noqa: BLE001 - logging must never break the real response
            log_exception(e, warning=True)

        return response

    def _log(self, request, response, started_at):
        duration_ms = int((time.monotonic() - started_at) * 1000)

        actor = request.user if getattr(request, "user", None) else None
        actor_is_authenticated = bool(actor and getattr(actor, "is_authenticated", False))

        workspace_id = None
        resolver_match = getattr(request, "resolver_match", None)
        slug = resolver_match.kwargs.get("slug") if resolver_match else None
        if slug:
            workspace_id = Workspace.objects.filter(slug=slug).values_list("id", flat=True).first()

        log = APIActivityLog(
            token_identifier=request.headers.get("X-Api-Key", ""),
            path=request.path,
            method=request.method,
            query_params=request.META.get("QUERY_STRING", ""),
            response_code=response.status_code,
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT"),
            workspace_id=workspace_id,
            duration_ms=duration_ms,
            source=EXPLORER_LOG_SOURCE,
        )
        # Explicit created_by_id (rather than relying on BaseModel.save()'s
        # crum thread-local fallback) since this runs from middleware, a
        # less typical call site than the view code that fallback is
        # normally exercised from - see this initiative's own note on
        # BaseModel.save()'s created_by_id kwarg for why passing it
        # directly to .save() (not the constructor) is required for it to
        # stick.
        log.save(created_by_id=actor.id if actor_is_authenticated else None)
