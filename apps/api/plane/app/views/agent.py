# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Workspace agent actor CRUD - category 9, feature 7
(docs/feature-specs/09-ai-features.md "7. Type d'acteur agent de premiere
classe" in plane-selfhost). Admin-only management surface (spec's own
"Parametres d'espace de travail -> Membres -> onglet Agents"); the
underlying bot `User` this creates is deliberately member-visible
everywhere else (assignee selectors, @mention search, member lists - see
`plane.utils.agent_actor.member_visibility_q`), unlike the six category-7
integration bots and WORKSPACE_SEED, which stay hidden.
"""

import uuid

from django.contrib.auth.hashers import make_password
from django.db import transaction
from django.db.models import F, Func, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import AgentAPITokenReadSerializer, AgentAPITokenSerializer, AgentProfileSerializer
from plane.db.models import AgentProfile, APIToken, ProjectMember, User, Workspace, WorkspaceMember
from plane.db.models.user import BotTypeEnum

from .base import BaseAPIView, BaseViewSet

# Exigence 2 (docs/feature-specs/09-ai-features.md "7. Type d'acteur agent
# de premiere classe" in plane-selfhost): an agent always belongs to a
# workspace, but never as an Admin (exigence 8) - Member is the sensible
# default; nothing in the create payload can override this (no `role`
# field is ever read from `request.data` here).
AGENT_WORKSPACE_ROLE = ROLE.MEMBER.value


def _agent_queryset(slug):
    project_count_subquery = (
        ProjectMember.objects.filter(member_id=OuterRef("user_id"), is_active=True)
        .order_by()
        .annotate(count=Func(F("id"), function="Count"))
        .values("count")
    )
    return (
        AgentProfile.objects.filter(workspace__slug=slug)
        .select_related("user", "user__avatar_asset", "created_by", "created_by__avatar_asset")
        .annotate(project_count=Coalesce(Subquery(project_count_subquery, output_field=IntegerField()), 0))
    )


class AgentProfileViewSet(BaseViewSet):
    serializer_class = AgentProfileSerializer
    model = AgentProfile

    def get_queryset(self):
        return self.filter_queryset(_agent_queryset(self.kwargs.get("slug")))

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def list(self, request, slug):
        return Response(self.serializer_class(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        agent = self.get_queryset().filter(pk=pk).first()
        if agent is None:
            return Response({"error": "Agent not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.serializer_class(agent).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def create(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        display_name = (request.data.get("display_name") or "").strip()
        if not display_name:
            return Response({"error": "display_name is required"}, status=status.HTTP_400_BAD_REQUEST)

        agent_type = request.data.get("agent_type", AgentProfile.AgentType.GENERIC)
        if agent_type not in AgentProfile.AgentType.values:
            return Response({"error": f"Invalid agent_type: {agent_type}"}, status=status.HTTP_400_BAD_REQUEST)

        description = request.data.get("description", "")

        with transaction.atomic():
            # Deterministic-looking but unique-per-call identity - unlike
            # `plane.utils.integration_bot.get_or_create_integration_bot`
            # (one bot per (workspace, bot_type), idempotent-keyed), every
            # `POST /agents/` call here creates a brand new distinct
            # identity, matching exigence 1 ("creer une identite agent").
            unique = uuid.uuid4().hex
            agent_user = User.objects.create(
                username=f"agent_{unique}",
                email=f"agent_{unique}@plane.so",
                display_name=display_name,
                first_name=display_name,
                last_name="",
                is_bot=True,
                bot_type=BotTypeEnum.WORKSPACE_AGENT,
                # No real password - exigence 7 (a bot can never log in);
                # same convention as get_or_create_integration_bot.
                password=make_password(uuid.uuid4().hex),
                is_password_autoset=True,
            )
            # Exigence 2: a WorkspaceMember is created alongside the bot
            # user, never as Admin (AGENT_WORKSPACE_ROLE = Member).
            WorkspaceMember.objects.create(workspace=workspace, member=agent_user, role=AGENT_WORKSPACE_ROLE)
            agent_profile = AgentProfile.objects.create(
                user=agent_user,
                workspace=workspace,
                agent_type=agent_type,
                description=description,
                # Exigence 1: humain "proprietaire/responsable", required
                # at creation - the requester (an Admin, enforced by
                # @allow_permission above) is exactly that human.
                created_by=request.user,
            )

        agent_profile = _agent_queryset(slug).filter(pk=agent_profile.pk).first()
        return Response(self.serializer_class(agent_profile).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        agent = AgentProfile.objects.filter(workspace__slug=slug, pk=pk).select_related("user").first()
        if agent is None:
            return Response({"error": "Agent not found"}, status=status.HTTP_404_NOT_FOUND)

        if "display_name" in request.data:
            display_name = (request.data.get("display_name") or "").strip()
            if not display_name:
                return Response({"error": "display_name cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            agent.user.display_name = display_name
            agent.user.first_name = display_name
            agent.user.save(update_fields=["display_name", "first_name"])

        if "description" in request.data:
            agent.description = request.data.get("description") or ""

        if "agent_type" in request.data:
            agent_type = request.data.get("agent_type")
            if agent_type not in AgentProfile.AgentType.values:
                return Response({"error": f"Invalid agent_type: {agent_type}"}, status=status.HTTP_400_BAD_REQUEST)
            agent.agent_type = agent_type

        if "status" in request.data:
            new_status = request.data.get("status")
            if new_status not in AgentProfile.Status.values:
                return Response({"error": f"Invalid status: {new_status}"}, status=status.HTTP_400_BAD_REQUEST)
            agent.status = new_status
            if new_status == AgentProfile.Status.DISABLED:
                # Exigence 9: disabling revokes every active token
                # immediately - IssueComment/IssueActivity history is
                # untouched (those FK the bot User row, never the token).
                APIToken.objects.filter(agent=agent, is_active=True).update(is_active=False)

        agent.save()

        agent = _agent_queryset(slug).filter(pk=agent.pk).first()
        return Response(self.serializer_class(agent).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def destroy(self, request, slug, pk):
        # Exigence 9/10: soft-delete only - disable rather than hard-delete
        # so IssueComment/IssueActivity history stays intact. The bot User
        # row is never removed, only flipped to DISABLED and its tokens
        # revoked; the UI is expected to render it as "Agent disabled"
        # (exigence 10) rather than making it disappear.
        agent = AgentProfile.objects.filter(workspace__slug=slug, pk=pk).first()
        if agent is None:
            return Response({"error": "Agent not found"}, status=status.HTTP_404_NOT_FOUND)
        agent.status = AgentProfile.Status.DISABLED
        agent.save(update_fields=["status"])
        APIToken.objects.filter(agent=agent, is_active=True).update(is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class AgentTokenListCreateEndpoint(BaseAPIView):
    """GET/POST /workspaces/{slug}/agents/{agent_id}/tokens/ - Admin only.
    Reuses `APIToken`/`generate_token()` exactly like the existing personal
    API token endpoint (`plane.app.views.api.ApiTokenEndpoint`) rather than
    inventing a new token mechanism - only `user_type=1` and the new
    `agent` FK distinguish an agent token from a personal one.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, agent_id):
        agent = AgentProfile.objects.filter(workspace__slug=slug, pk=agent_id).first()
        if agent is None:
            return Response({"error": "Agent not found"}, status=status.HTTP_404_NOT_FOUND)
        tokens = APIToken.objects.filter(agent=agent).order_by("-created_at")
        return Response(AgentAPITokenReadSerializer(tokens, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, agent_id):
        agent = AgentProfile.objects.filter(workspace__slug=slug, pk=agent_id).select_related("user").first()
        if agent is None:
            return Response({"error": "Agent not found"}, status=status.HTTP_404_NOT_FOUND)
        if agent.status == AgentProfile.Status.DISABLED:
            return Response(
                {"error": "Cannot issue a token for a disabled agent"}, status=status.HTTP_400_BAD_REQUEST
            )

        label = request.data.get("label") or f"{agent.user.display_name} token"
        description = request.data.get("description", "")

        api_token = APIToken.objects.create(
            label=label,
            description=description,
            user=agent.user,
            user_type=1,
            agent=agent,
            workspace=agent.workspace,
        )
        # Unlike AgentAPITokenReadSerializer (list), this includes the raw
        # token - shown once, here, at issuance time, same UX as the
        # existing personal-token endpoint.
        serializer = AgentAPITokenSerializer(api_token)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AgentTokenRevokeEndpoint(BaseAPIView):
    """POST /workspaces/{slug}/agents/{agent_id}/tokens/{token_id}/revoke/
    - Admin only, immediate revocation (`is_active=False`)."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, agent_id, token_id):
        token = APIToken.objects.filter(agent_id=agent_id, agent__workspace__slug=slug, pk=token_id).first()
        if token is None:
            return Response({"error": "Token not found"}, status=status.HTTP_404_NOT_FOUND)
        token.is_active = False
        token.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)
