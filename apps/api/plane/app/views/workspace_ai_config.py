# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Admin-only CRUD + connection-test endpoints for the shared per-workspace
LLM config - category 9 (AI features,
docs/feature-specs/09-ai-features.md in plane-selfhost) infrastructure
prerequisite. See `plane.db.models.ai_config.WorkspaceAIConfig` for the
model rationale and `plane.utils.workspace_ai` for the shared call-through
logic future category 9 features (thread summary, status-update drafting,
auto-triage, digest, chat assistant) will use.

`GET`/`PATCH /api/workspaces/<slug>/ai-config/` - Admin only (`level=
"WORKSPACE"`, matching every other workspace-scoped connector in this
codebase, e.g. `GithubConnectionEndpoint`). `api_key` is never present in a
GET response - `WorkspaceAIConfigSerializer` only ever exposes
`is_configured` (bool). A PATCH may include a new `api_key` in the request
body - handled directly here rather than through the serializer (which has
no `api_key` field at all), matching `GithubConnectionEndpoint.post`'s
equivalent pattern for `access_token`.

`POST /api/workspaces/<slug>/ai-config/test/` - Admin only. Makes a
trivial real LLM call ("reply with the word OK") using the saved config
(optionally overridden by fields in the request body, so the UI's "Test
connection" button can validate an about-to-be-saved config before the
user hits Save) and reports success/failure.
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import WorkspaceAIConfigSerializer
from plane.db.models import Workspace, WorkspaceAIConfig
from plane.db.models.ai_config import WorkspaceAIProvider
from plane.utils.workspace_ai import call_llm

from .base import BaseAPIView


class WorkspaceAIConfigEndpoint(BaseAPIView):
    """`GET`/`PATCH` on `/workspaces/<slug>/ai-config/`."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        config = WorkspaceAIConfig.objects.filter(workspace__slug=slug).first()
        if config is None:
            return Response({"is_configured": False, "is_enabled": False}, status=status.HTTP_200_OK)
        return Response(WorkspaceAIConfigSerializer(config).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        config, _ = WorkspaceAIConfig.objects.get_or_create(
            workspace=workspace, defaults={"connected_by": request.user}
        )

        if "provider" in request.data:
            config.provider = request.data["provider"]
        if "model_name" in request.data:
            config.model_name = request.data["model_name"]
        if "api_base_url" in request.data:
            config.api_base_url = request.data["api_base_url"] or None
        if "is_enabled" in request.data:
            config.is_enabled = bool(request.data["is_enabled"])
        # Write-only: only ever set from the request body here, never
        # echoed back by the serializer. An explicit empty string/None
        # clears the stored key; omitting the key entirely leaves whatever
        # is already stored untouched (so a client can flip `is_enabled`
        # without having to resend the secret).
        if "api_key" in request.data:
            config.api_key = request.data["api_key"] or None

        config.connected_by = request.user
        config.save()

        return Response(WorkspaceAIConfigSerializer(config).data, status=status.HTTP_200_OK)


class WorkspaceAIConfigTestEndpoint(BaseAPIView):
    """`POST /workspaces/<slug>/ai-config/test/` - the backend for every
    future category 9 feature settings page's "Test connection" button."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        config = WorkspaceAIConfig.objects.filter(workspace__slug=slug).first()

        provider = request.data.get("provider") or (config.provider if config else None)
        model_name = request.data.get("model_name") or (config.model_name if config else None)
        api_base_url = request.data.get("api_base_url") or (config.api_base_url if config else None)
        api_key = request.data.get("api_key") or (config.api_key if config else None)

        if not provider or not model_name:
            return Response(
                {"success": False, "error": "AI is not configured for this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not api_key and provider != WorkspaceAIProvider.CUSTOM_OPENAI_COMPATIBLE:
            return Response(
                {"success": False, "error": f"No API key configured for provider {provider}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        text, error = call_llm(
            prompt="Reply with only the word OK.",
            api_key=api_key,
            model=model_name,
            provider=provider,
            api_base_url=api_base_url or None,
        )
        if error:
            return Response({"success": False, "error": error}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"success": True, "response": text}, status=status.HTTP_200_OK)
