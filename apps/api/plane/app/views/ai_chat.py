# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 9 (AI features, docs/feature-specs/09-ai-features.md in
plane-selfhost), feature 3 - "Assistant de chat IA in-app" endpoints. See
`plane.db.models.ai_chat` for the model shapes/rationale and
`plane.utils.ai_chat_assistant` for the generation/context/proposal logic.

Plain `BaseAPIView` subclasses with explicit `path()` registration
(`plane.app.urls.ai_chat`), matching this codebase's own convention for
every other category 9 feature (`plane.app.views.digest`,
`plane.app.views.ai_triage_config`) rather than a DRF router/ViewSet with
`@action`.
"""

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import (
    AIChangeProposalSerializer,
    AIConversationCreateSerializer,
    AIConversationMessageCreateSerializer,
    AIConversationSerializer,
    AIMessageSerializer,
)
from plane.db.models import (
    AIChangeProposal,
    AIChangeProposalStatus,
    AIConversation,
    AIConversationSource,
    AIMessage,
    AIMessageMode,
    AIMessageRole,
    AIMessageStatus,
    Workspace,
)
from plane.throttles.ai_chat_message import AIChatMessageThrottle
from plane.utils.access_control import can_user_access_object
from plane.utils.ai_chat_assistant import (
    apply_change_proposal,
    generate_assistant_reply,
    is_ai_assistant_available_for_context,
)

from .base import BaseAPIView


class AIConversationListCreateEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 2 of the "GET .../ai-conversations/" considerations -
        # filtered to the requesting user's own conversations. A
        # conversation started via a comment @mention is separately
        # visible to anyone who can read that comment thread already (via
        # their own normal issue/comment read permission) - no extra
        # special-case query is needed here for that.
        queryset = AIConversation.objects.filter(workspace=workspace, created_by=request.user).order_by(
            "-created_at"
        )
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda data: AIConversationSerializer(data, many=True).data,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = AIConversationCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        context_type = serializer.validated_data["context_type"]
        context_object_id = serializer.validated_data.get("context_object_id")

        # Exigence 10/11 - enforced server-side regardless of whether the
        # frontend already hid the entry point.
        available, error = is_ai_assistant_available_for_context(workspace, context_type, context_object_id)
        if not available:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        if context_type != "workspace" and not can_user_access_object(
            request.user, workspace, context_type, context_object_id
        ):
            return Response(
                {"error": "You don't have access to the requested context object."},
                status=status.HTTP_403_FORBIDDEN,
            )

        conversation = AIConversation.objects.create(
            workspace=workspace,
            context_type=context_type,
            context_object_id=context_object_id,
            title=serializer.validated_data.get("title") or "",
            source=AIConversationSource.COMMAND_PALETTE,
            created_by=request.user,
        )
        return Response(AIConversationSerializer(conversation).data, status=status.HTTP_201_CREATED)


class AIConversationDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, pk):
        conversation = AIConversation.objects.filter(
            workspace__slug=slug, pk=pk, created_by=request.user
        ).first()
        if conversation is None:
            return Response({"error": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(AIConversationSerializer(conversation).data, status=status.HTTP_200_OK)


class AIConversationMessageListCreateEndpoint(BaseAPIView):
    throttle_classes = [AIChatMessageThrottle]

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, pk):
        """Poll endpoint (no SSE - see module docstring) - the frontend
        calls this every 1-2s while the latest assistant message's
        `status` is `pending`/`streaming`."""
        conversation = AIConversation.objects.filter(
            workspace__slug=slug, pk=pk, created_by=request.user
        ).first()
        if conversation is None:
            return Response({"error": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        messages = conversation.messages.order_by("created_at")
        return Response(AIMessageSerializer(messages, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, pk):
        conversation = AIConversation.objects.filter(
            workspace__slug=slug, pk=pk, created_by=request.user
        ).first()
        if conversation is None:
            return Response({"error": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        workspace = conversation.workspace
        available, error = is_ai_assistant_available_for_context(
            workspace, conversation.context_type, conversation.context_object_id
        )
        if not available:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AIConversationMessageCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        mode = serializer.validated_data["mode"]

        # Exigence 6 - Guest can never propose. Checked against the
        # conversation's own context object specifically, not just a
        # general workspace role.
        if mode == AIMessageMode.PROPOSE:
            has_write_access = can_user_access_object(
                request.user,
                workspace,
                conversation.context_type,
                conversation.context_object_id,
                min_role=ROLE.MEMBER.value,
            )
            if not has_write_access:
                return Response(
                    {"error": "You need at least Member access to this context to use Propose mode."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        user_message = AIMessage.objects.create(
            conversation=conversation,
            role=AIMessageRole.USER,
            content=serializer.validated_data["content"],
            mode=mode,
            status=AIMessageStatus.COMPLETED,
        )
        assistant_message = AIMessage.objects.create(
            conversation=conversation,
            role=AIMessageRole.ASSISTANT,
            content="",
            mode=mode,
            status=AIMessageStatus.PENDING,
        )

        # Synchronous, one-shot round-trip - see
        # plane.utils.ai_chat_assistant module docstring for why sync was
        # chosen over a Celery task here.
        generate_assistant_reply(conversation, user_message, assistant_message)

        return Response(
            {
                "user_message": AIMessageSerializer(user_message).data,
                "assistant_message": AIMessageSerializer(assistant_message).data,
            },
            status=status.HTTP_201_CREATED,
        )


class AIChangeProposalListEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)

        from plane.db.models import ProjectMember

        # Filter: proposals from the requesting user's own conversations,
        # OR proposals whose target object's project the user is an
        # active member of (so a lead sees incoming proposals to review,
        # not just their own chat history) - documented choice, the spec
        # only asks for a "pending proposals" badge list without
        # prescribing the exact visibility filter.
        own_conversation_ids = AIConversation.objects.filter(workspace=workspace, created_by=request.user).values_list(
            "id", flat=True
        )
        member_project_ids = ProjectMember.objects.filter(
            workspace=workspace, member=request.user, is_active=True
        ).values_list("project_id", flat=True)

        queryset = AIChangeProposal.objects.filter(workspace=workspace).filter(
            models_q_own_or_member(own_conversation_ids, member_project_ids)
        )

        status_filter = request.GET.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        queryset = queryset.order_by("-created_at")
        return self.paginate(
            request=request,
            queryset=queryset,
            on_results=lambda data: AIChangeProposalSerializer(data, many=True).data,
        )


def models_q_own_or_member(own_conversation_ids, member_project_ids):
    from django.db.models import Q

    return Q(message__conversation_id__in=list(own_conversation_ids)) | Q(project_id__in=list(member_project_ids))


class AIChangeProposalApproveEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, pk):
        proposal = AIChangeProposal.objects.filter(workspace__slug=slug, pk=pk).first()
        if proposal is None:
            return Response({"error": "Proposal not found."}, status=status.HTTP_404_NOT_FOUND)

        error_response = _guard_reviewable(proposal, request.user)
        if error_response is not None:
            return error_response

        success, error = apply_change_proposal(proposal, request.user)
        if not success:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        proposal.status = AIChangeProposalStatus.APPLIED
        proposal.reviewed_by = request.user
        proposal.reviewed_at = now
        proposal.applied_at = now
        proposal.save(
            update_fields=[
                "status",
                "reviewed_by",
                "reviewed_at",
                "applied_at",
                "applied_activity_id",
                "updated_at",
            ]
        )
        return Response(AIChangeProposalSerializer(proposal).data, status=status.HTTP_200_OK)


class AIChangeProposalRejectEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug, pk):
        proposal = AIChangeProposal.objects.filter(workspace__slug=slug, pk=pk).first()
        if proposal is None:
            return Response({"error": "Proposal not found."}, status=status.HTTP_404_NOT_FOUND)

        error_response = _guard_reviewable(proposal, request.user)
        if error_response is not None:
            return error_response

        proposal.status = AIChangeProposalStatus.REJECTED
        proposal.reviewed_by = request.user
        proposal.reviewed_at = timezone.now()
        proposal.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at"])
        return Response(AIChangeProposalSerializer(proposal).data, status=status.HTTP_200_OK)


def _guard_reviewable(proposal, user):
    """Shared approve/reject guard - exigence 6 (write access to the
    SPECIFIC target object, Guest excluded outright since Guest's own
    ProjectMember role of 5 never satisfies `min_role=MEMBER`) and
    exigence 8 (expired/already-resolved proposals are frozen). Returns a
    `Response` to short-circuit with, or `None` to proceed."""
    if proposal.status != AIChangeProposalStatus.PENDING:
        return Response(
            {"error": f"This proposal is already '{proposal.status}' and can no longer be reviewed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if proposal.expires_at is not None and proposal.expires_at < timezone.now():
        proposal.status = AIChangeProposalStatus.EXPIRED
        proposal.save(update_fields=["status", "updated_at"])
        return Response({"error": "This proposal has expired."}, status=status.HTTP_400_BAD_REQUEST)

    if not can_user_access_object(
        user, proposal.workspace, proposal.target_model, proposal.target_object_id, min_role=ROLE.MEMBER.value
    ):
        return Response(
            {"error": "You don't have Member-level access to the target object of this proposal."},
            status=status.HTTP_403_FORBIDDEN,
        )

    return None
