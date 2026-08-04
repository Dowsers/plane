# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Dashboard, DeployBoard
from plane.db.models.deploy_board import get_anchor
from ..base import BaseAPIView

# Deliberate deviation from the spec's own suggestion of a dedicated
# `DashboardPublish` model - see docs/feature-specs/05-insights-analytics.md,
# section 3, exigences 9-12. `DeployBoard` already models "an entity has a
# public, unauthenticated, read-only link with a unique anchor token" for
# every other publishable entity in this codebase (projects, views, pages,
# ...) - reusing it here needs zero migration for the publish mechanism
# itself, only `entity_name="dashboard"` (a free `CharField`, not
# constrained by `DeployBoard.TYPE_CHOICES`, which is declared but never
# attached via `choices=` on the field - so this is a supported, if
# undocumented, extension point).
#
# "Regenerer le jeton" (exigence 12) = reassign `anchor` and save, rather
# than delete+recreate the row - simpler, and preserves the row's other
# columns (`created_at`, etc.) across a regeneration.
# "Depublier" (exigence 12) = call `.delete()` on the row (the standard
# `SoftDeleteModel` soft-delete every model in this codebase uses - it sets
# `deleted_at` so the row drops out of `DeployBoard.objects`, the default
# manager, immediately), rather than `is_disabled=True` - this makes the
# old anchor 404 immediately via the exact same lookup every other public
# endpoint already uses, with no extra "is this disabled" branch needed
# anywhere. Re-publishing afterwards (`POST` again) creates a fresh row
# with a brand new anchor - the unique constraint only applies among
# non-deleted rows, so this never conflicts with the soft-deleted one.


class DashboardPublishEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE", creator=True, model=Dashboard)
    def post(self, request, slug, pk):
        dashboard = Dashboard.objects.filter(workspace__slug=slug, pk=pk).first()
        if dashboard is None:
            return Response({"error": "Dashboard not found"}, status=status.HTTP_404_NOT_FOUND)

        deploy_board, created = DeployBoard.objects.get_or_create(
            entity_name="dashboard",
            entity_identifier=dashboard.id,
            defaults={"workspace_id": dashboard.workspace_id},
        )
        return Response(
            {
                "anchor": deploy_board.anchor,
                "is_published": not deploy_board.is_disabled,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE", creator=True, model=Dashboard)
    def patch(self, request, slug, pk):
        deploy_board = DeployBoard.objects.filter(
            entity_name="dashboard", entity_identifier=pk, workspace__slug=slug
        ).first()
        if deploy_board is None:
            return Response({"error": "Dashboard is not published"}, status=status.HTTP_404_NOT_FOUND)

        deploy_board.anchor = get_anchor()
        deploy_board.save(update_fields=["anchor"])
        return Response(
            {
                "anchor": deploy_board.anchor,
                "is_published": not deploy_board.is_disabled,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE", creator=True, model=Dashboard)
    def delete(self, request, slug, pk):
        deploy_board = DeployBoard.objects.filter(
            entity_name="dashboard", entity_identifier=pk, workspace__slug=slug
        ).first()
        if deploy_board is not None:
            deploy_board.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
