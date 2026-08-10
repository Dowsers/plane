# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# See docs/feature-specs/08-api-webhooks-cli.md ("6. Explorateur d'API
# interactif") in plane-selfhost for the full feature spec these implement.
# Token-authenticated (X-Api-Key) by inheriting plane.api.views.base -
# consistent with the rest of this app: the explorer executes real calls
# from the browser using a real APIToken (its own or a freshly-minted
# ephemeral one), never a session cookie, so these two backend endpoints
# it actually needs (as opposed to the ~180 pre-existing ones it just
# calls directly) live on the same surface as everything else it touches.

# Python imports
import uuid
from datetime import timedelta

# Django imports
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

# Third party imports
from drf_spectacular.settings import spectacular_settings
from rest_framework import status
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.app.permissions import allow_permission, ROLE
from plane.db.models import APIToken, Workspace, WorkspaceAPIExplorerSettings, WorkspaceMember

# Process-local cache-bust token: regenerated on every apiserver
# start/redeploy (a fresh Python process), so a stale cached schema from a
# previous deploy can never be served after a restart, without needing a
# real deploy-hook/version-pin mechanism (spec's own open question: "quelle
# strategie de cache/invalidation lors des mises a jour de l'instance ?").
# The TTL below is only a backstop against unbounded Redis growth across
# many restarts, not the actual invalidation mechanism.
_SCHEMA_CACHE_BUST = uuid.uuid4().hex
_SCHEMA_CACHE_KEY = f"api_explorer:openapi_schema:{_SCHEMA_CACHE_BUST}"
_SCHEMA_CACHE_TTL_SECONDS = 60 * 60

# Ephemeral tokens are capped hard at 1h (spec exigence 4: "expiration <=
# 1h") - a caller may ask for less, never more.
EPHEMERAL_TOKEN_MAX_TTL_SECONDS = 60 * 60
EPHEMERAL_TOKEN_MIN_TTL_SECONDS = 60


def _feature_available(workspace):
    """Two-layer gate mirroring FLEXIBLE_QUERY_ENABLED +
    Workspace.is_flexible_query_enabled (see settings/common.py's own
    comment on API_EXPLORER_ENABLED for why this pair of switches exists).
    A missing settings row means "never configured" - since
    `WorkspaceAPIExplorerSettings.is_enabled` defaults True, this reads as
    enabled without needing to create a row on every read."""
    if not settings.API_EXPLORER_ENABLED:
        return False
    row = WorkspaceAPIExplorerSettings.objects.filter(workspace=workspace).first()
    return row.is_enabled if row is not None else True


def _not_found():
    # Same "404, not 403/400" convention as
    # plane.api.views.flexible_query._not_found - indistinguishable from
    # "this URL doesn't exist" whenever the feature is off, so a disabled
    # feature never leaks its own existence to a caller who isn't even a
    # workspace member (those are already 403'd by `allow_permission`
    # before this is reached).
    return Response({"error": "Not found."}, status=status.HTTP_404_NOT_FOUND)


class APIExplorerSchemaEndpoint(BaseAPIView):
    """
    GET /api/v1/workspaces/{slug}/api-explorer/schema/

    Reuses drf-spectacular's own generator/settings as-is (same
    PREPROCESSING_HOOKS, same TAGS, etc. as the instance-wide
    `/api/schema/`) rather than reimplementing schema generation - this
    endpoint's only real job is caching + gating. Hard-requires
    `ENABLE_DRF_SPECTACULAR` on top of `API_EXPLORER_ENABLED`: without it,
    `DEFAULT_SCHEMA_CLASS` is never switched to drf-spectacular's
    AutoSchema (see settings/common.py), and `SchemaGenerator` would walk
    endpoints whose `.schema` is DRF's own bare-bones default, producing a
    schema too inaccurate to be worth serving.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        if not settings.ENABLE_DRF_SPECTACULAR:
            return _not_found()

        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return _not_found()

        if not _feature_available(workspace):
            return _not_found()

        schema = cache.get(_SCHEMA_CACHE_KEY)
        if schema is None:
            generator_class = spectacular_settings.DEFAULT_GENERATOR_CLASS
            generator = generator_class()
            # public=True: this is documentation for whatever the instance
            # can do, not a per-caller filtered view of it - matches how
            # the instance-wide /api/schema/ route (SERVE_PUBLIC) behaves.
            schema = generator.get_schema(request=request, public=True)
            cache.set(_SCHEMA_CACHE_KEY, schema, _SCHEMA_CACHE_TTL_SECONDS)

        return Response(schema, status=status.HTTP_200_OK)


class APIExplorerEphemeralTokenEndpoint(BaseAPIView):
    """
    POST /api/v1/workspaces/{slug}/api-explorer/tokens/ephemeral/

    Body: {"scope": "read_write" | "read_only", "ttl_seconds": <int, optional>}

    Judgment call beyond the spec's literal wording: requesting
    scope=read_write is itself treated as a mutating/"execute" capability
    request, so it is denied (403, not silently downgraded to read_only -
    silently changing what the caller asked for would be a worse surprise
    given exigence 5's whole point is that mutating actions must never be
    ambiguous) for a Member workspace whose
    `WorkspaceAPIExplorerSettings.allow_members_execute` is False. Without
    this check, exigence 14's "execution restricted to Admin" would be
    trivially bypassable - a Member could just mint their own read_write
    ephemeral token instead of using their real one. Admins can always
    request either scope.
    """

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        if not settings.API_EXPLORER_ENABLED:
            return _not_found()

        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return _not_found()

        if not _feature_available(workspace):
            return _not_found()

        requested_scope = request.data.get("scope", APIToken.Scope.READ_WRITE)
        if requested_scope not in APIToken.Scope.values:
            return Response(
                {"error": f"scope must be one of: {', '.join(APIToken.Scope.values)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        member_role = (
            WorkspaceMember.objects.filter(member=request.user, workspace=workspace, is_active=True)
            .values_list("role", flat=True)
            .first()
        )
        settings_row = WorkspaceAPIExplorerSettings.objects.filter(workspace=workspace).first()
        allow_members_execute = settings_row.allow_members_execute if settings_row is not None else False
        can_execute = member_role == ROLE.ADMIN.value or (
            member_role == ROLE.MEMBER.value and allow_members_execute
        )

        if requested_scope == APIToken.Scope.READ_WRITE and not can_execute:
            return Response(
                {
                    "error": (
                        "Only Admins (or Members, if this workspace has enabled "
                        "'Allow Members to execute requests') may request a "
                        "read_write ephemeral token. Request scope=read_only instead."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            ttl_seconds = int(request.data.get("ttl_seconds", EPHEMERAL_TOKEN_MAX_TTL_SECONDS))
        except (TypeError, ValueError):
            return Response({"error": "ttl_seconds must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        # Clamp, don't reject - a caller asking for 2h should get capped at
        # 1h (exigence 4: "never more"), not be forced to retry with a
        # different number.
        ttl_seconds = max(EPHEMERAL_TOKEN_MIN_TTL_SECONDS, min(ttl_seconds, EPHEMERAL_TOKEN_MAX_TTL_SECONDS))

        token = APIToken.objects.create(
            label=f"API Explorer ({workspace.slug})",
            description="Ephemeral token issued by the interactive API explorer.",
            user=request.user,
            user_type=1 if request.user.is_bot else 0,
            # Set even though APIToken is not otherwise workspace-scoped
            # elsewhere in this codebase (see the scoping note in
            # plane.api.views.rate_limit.RateLimitStatusEndpoint) - this
            # token's entire reason to exist IS this one workspace's
            # explorer session, so recording that context costs nothing
            # and may as well be accurate.
            workspace=workspace,
            expired_at=timezone.now() + timedelta(seconds=ttl_seconds),
            scope=requested_scope,
            is_ephemeral=True,
        )

        return Response(
            {
                "id": str(token.id),
                "token": token.token,
                "scope": token.scope,
                "is_ephemeral": token.is_ephemeral,
                "expired_at": token.expired_at,
            },
            status=status.HTTP_201_CREATED,
        )
