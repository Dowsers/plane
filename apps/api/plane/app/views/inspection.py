# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Inspection compliance endpoints (ISO/IEC 17020 §4.1 impartiality / §4.2
confidentiality).

Admin-gated on both verbs for every settings/review endpoint, matching the
convention every sibling settings endpoint in this codebase already uses (see
`plane.app.views.ai_triage_config`). The two member-facing endpoints
(`.../inspection/me/` and `.../inspection/sign/`) are open to every active
project role including Guest, since the obligation binds everyone.

Every route name registered in `plane.app.urls.inspection` that appears in
`plane.utils.inspection_compliance.EXEMPT_URL_NAMES` must stay reachable for a
BLOCKED member - that is what stops this feature from locking people out of the
very screens that discharge the obligation.
"""

import hashlib

from django.db import transaction
from django.db.models import Max, Prefetch
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.inspection import (
    InspectionDocumentTemplateSerializer,
    InspectionDocumentTemplateVersionSerializer,
    InspectionReviewSerializer,
    InspectionSignatureSerializer,
)
from plane.db.models import (
    DEFAULT_IMPARTIALITY_QUESTIONNAIRE,
    INSPECTION_SIGNING_ORDER,
    InspectionDocumentKind,
    InspectionDocumentTemplate,
    InspectionDocumentTemplateVersion,
    InspectionObligation,
    InspectionSignature,
    Project,
    ProjectMember,
    Workspace,
)
from plane.utils.inspection_compliance import (
    clear_block_if_satisfied,
    resolve_applicable_version,
    signed_kinds,
    unmet_prerequisites,
)
from plane.utils.inspection_questionnaire import evaluate_answers
from plane.utils.ip_address import get_client_ip

from .base import BaseAPIView

# Fields an Admin may set on a project's inspection configuration. Deliberately
# not `is_inspection_enabled`'s siblings wholesale - `inspection_enabled_at` is
# stamped by this view, never supplied by the client.
_CONFIG_FIELDS = (
    "is_inspection_enabled",
    "inspection_mode",
    "inspection_grace_period_days",
    "inspection_enforcement_paused",
    "inspection_review_manager",
)


def _serialize_config(project) -> dict:
    data = {field: getattr(project, field) for field in _CONFIG_FIELDS}
    data["inspection_review_manager"] = project.inspection_review_manager_id
    data["inspection_enabled_at"] = project.inspection_enabled_at
    return data


class ProjectInspectionConfigEndpoint(BaseAPIView):
    """`GET`/`PATCH .../projects/<project_id>/inspection-config/`

    EXEMPT from the enforcement gate (see `EXEMPT_URL_NAMES`): this is the
    in-product way out of a lockout, so a project Admin who has not signed must
    still be able to reach it and switch the mode off or pause enforcement.
    """

    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        return Response(_serialize_config(project), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        was_enabled = project.is_inspection_enabled

        for field in _CONFIG_FIELDS:
            if field in request.data:
                setattr(project, field, request.data[field])

        # Stamp the first activation. Informational only - the grace clock is
        # per member on `InspectionObligation`, never this timestamp, so that
        # enabling the mode cannot instantly block existing members.
        if project.is_inspection_enabled and not was_enabled and project.inspection_enabled_at is None:
            project.inspection_enabled_at = timezone.now()

        project.save()
        return Response(_serialize_config(project), status=status.HTTP_200_OK)


class WorkspaceInspectionTemplateEndpoint(BaseAPIView):
    """`GET`/`POST /workspaces/<slug>/inspection-templates/`
    `GET`/`DELETE /workspaces/<slug>/inspection-templates/<pk>/`

    Workspace-scoped defaults (`project=None`). Creating a template for a kind
    also creates version 1 as a DRAFT - pre-filled with the shipped 15-question
    form for IMPARTIALITY so an admin never retypes it.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, pk=None):
        queryset = InspectionDocumentTemplate.objects.filter(
            workspace__slug=slug, project__isnull=True
        ).prefetch_related(Prefetch("versions", queryset=InspectionDocumentTemplateVersion.objects.all()))

        if pk:
            template = queryset.get(pk=pk)
            return Response(InspectionDocumentTemplateSerializer(template).data, status=status.HTTP_200_OK)

        return Response(
            InspectionDocumentTemplateSerializer(queryset, many=True).data, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        kind = request.data.get("kind")
        if kind not in InspectionDocumentKind.values:
            return Response(
                {"error": f"'kind' must be one of {', '.join(InspectionDocumentKind.values)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if InspectionDocumentTemplate.objects.filter(
            workspace=workspace, project__isnull=True, kind=kind
        ).exists():
            return Response(
                {"error": "This workspace already has a default template for this kind."},
                status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            template = InspectionDocumentTemplate.objects.create(
                workspace=workspace,
                project=None,
                kind=kind,
                name=request.data.get("name") or InspectionDocumentKind(kind).label,
            )
            InspectionDocumentTemplateVersion.objects.create(
                template=template,
                version=1,
                body=request.data.get("body", ""),
                # Only the impartiality declaration carries a questionnaire;
                # the NDA and the ethics charter are accept-the-text documents.
                questionnaire_schema=(
                    [dict(question) for question in DEFAULT_IMPARTIALITY_QUESTIONNAIRE]
                    if kind == InspectionDocumentKind.IMPARTIALITY
                    else []
                ),
            )

        template.refresh_from_db()
        return Response(
            InspectionDocumentTemplateSerializer(template).data, status=status.HTTP_201_CREATED
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        template = InspectionDocumentTemplate.objects.get(workspace__slug=slug, pk=pk)
        # Soft delete. `InspectionSignature.template_version` is PROTECT, so
        # past signatures and the exact text they accepted survive this -
        # retiring a template must never destroy evidence.
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectInspectionTemplateEndpoint(BaseAPIView):
    """`GET`/`POST`/`DELETE .../projects/<project_id>/inspection-template/`

    The per-project override, for a client that insists on its own NDA or
    charter text. EXEMPT from the gate: the signing screen reads it to render
    the right document.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        templates = InspectionDocumentTemplate.objects.filter(
            workspace__slug=slug, project_id=project_id
        ).prefetch_related("versions")
        return Response(
            InspectionDocumentTemplateSerializer(templates, many=True).data, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        kind = request.data.get("kind")
        if kind not in InspectionDocumentKind.values:
            return Response(
                {"error": f"'kind' must be one of {', '.join(InspectionDocumentKind.values)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if InspectionDocumentTemplate.objects.filter(
            project_id=project_id, kind=kind
        ).exists():
            return Response(
                {"error": "This project already overrides this kind."},
                status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            template = InspectionDocumentTemplate.objects.create(
                workspace=project.workspace,
                project=project,
                kind=kind,
                name=request.data.get("name") or InspectionDocumentKind(kind).label,
            )
            InspectionDocumentTemplateVersion.objects.create(
                template=template,
                version=1,
                body=request.data.get("body", ""),
                questionnaire_schema=(
                    [dict(question) for question in DEFAULT_IMPARTIALITY_QUESTIONNAIRE]
                    if kind == InspectionDocumentKind.IMPARTIALITY
                    else []
                ),
            )

        template.refresh_from_db()
        return Response(
            InspectionDocumentTemplateSerializer(template).data, status=status.HTTP_201_CREATED
        )

    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id, pk):
        template = InspectionDocumentTemplate.objects.get(project_id=project_id, pk=pk)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InspectionTemplateVersionEndpoint(BaseAPIView):
    """`GET`/`POST /workspaces/<slug>/inspection-templates/<template_id>/versions/`
    `PATCH /workspaces/<slug>/inspection-templates/<template_id>/versions/<pk>/`

    POST always creates a new DRAFT at `max(version) + 1`; PATCH edits a draft.
    There is deliberately no way to edit a published version here - see
    `InspectionDocumentTemplateVersion`'s docstring for the three levels of the
    immutability guarantee.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug, template_id):
        versions = InspectionDocumentTemplateVersion.objects.filter(
            template__workspace__slug=slug, template_id=template_id
        )
        return Response(
            InspectionDocumentTemplateVersionSerializer(versions, many=True).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, template_id):
        template = InspectionDocumentTemplate.objects.get(workspace__slug=slug, pk=template_id)
        serializer = InspectionDocumentTemplateVersionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        next_version = (
            InspectionDocumentTemplateVersion.objects.filter(template=template).aggregate(
                latest=Max("version")
            )["latest"]
            or 0
        ) + 1
        version = serializer.save(template=template, version=next_version)
        return Response(
            InspectionDocumentTemplateVersionSerializer(version).data, status=status.HTTP_201_CREATED
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, template_id, pk):
        version = InspectionDocumentTemplateVersion.objects.get(
            template__workspace__slug=slug, template_id=template_id, pk=pk
        )
        serializer = InspectionDocumentTemplateVersionSerializer(version, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class InspectionTemplateVersionPublishEndpoint(BaseAPIView):
    """`POST .../inspection-templates/<template_id>/versions/<pk>/publish/`

    Freezes the version and - this is the part that matters - RESETS every
    affected member's grace clock when the new version requires re-signature.

    Without that reset, publishing a revised NDA would instantly put every
    member of every inspection project past their deadline, which is one of the
    three lockout traps documented on `InspectionObligation`. One bulk
    `.update()`, at this single call site, rather than a signal.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, template_id, pk):
        version = InspectionDocumentTemplateVersion.objects.get(
            template__workspace__slug=slug, template_id=template_id, pk=pk
        )
        if version.is_published:
            return Response(
                {"error": "This version is already published."}, status=status.HTTP_409_CONFLICT
            )

        now = timezone.now()
        with transaction.atomic():
            version.published_at = now
            version.save()

            if version.requires_resignature:
                template = version.template
                obligations = InspectionObligation.objects.filter(kind=template.kind)
                if template.project_id:
                    obligations = obligations.filter(project_id=template.project_id)
                else:
                    # Workspace default: only projects that do NOT have their
                    # own override for this kind are affected.
                    overridden = InspectionDocumentTemplate.objects.filter(
                        workspace_id=template.workspace_id,
                        kind=template.kind,
                        project__isnull=False,
                    ).values_list("project_id", flat=True)
                    obligations = obligations.filter(
                        workspace_id=template.workspace_id
                    ).exclude(project_id__in=list(overridden))

                obligations.update(
                    obligation_started_at=now, reminder_count=0, last_reminder_sent_at=None, blocked_since=None
                )

        return Response(
            InspectionDocumentTemplateVersionSerializer(version).data, status=status.HTTP_200_OK
        )


class ProjectInspectionMeEndpoint(BaseAPIView):
    """`GET .../projects/<project_id>/inspection/me/` - "what do I owe here?"

    Open to every active project role, and EXEMPT from the gate: a blocked
    member must be able to find out what to sign and read the text.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)

        documents = []
        # Signing order, not enum order: the charter is accepted first, then the
        # impartiality declaration, then the NDA. See INSPECTION_SIGNING_ORDER.
        already_signed = signed_kinds(project, request.user.id)
        for kind in INSPECTION_SIGNING_ORDER:
            version = resolve_applicable_version(project, kind)
            if version is None:
                continue
            signature = (
                InspectionSignature.objects.filter(
                    project_id=project.id, member_id=request.user.id, template_version_id=version.id
                )
                .order_by("-signed_at")
                .first()
            )
            obligation = InspectionObligation.objects.filter(
                project_id=project.id, member_id=request.user.id, kind=kind
            ).first()
            documents.append(
                {
                    "kind": kind,
                    "template_id": str(version.template_id),
                    "template_version_id": str(version.id),
                    "version": version.version,
                    "body": version.body,
                    "asset": str(version.asset_id) if version.asset_id else None,
                    "questionnaire_schema": version.questionnaire_schema,
                    "signature": InspectionSignatureSerializer(signature).data if signature else None,
                    "obligation_started_at": obligation.obligation_started_at if obligation else None,
                    "blocked_since": obligation.blocked_since if obligation else None,
                    # Computed server-side so the UI never has to re-derive the
                    # sequence and cannot drift from what `sign/` will accept.
                    "blocked_by": unmet_prerequisites(project, request.user.id, kind),
                    "is_signed": kind in already_signed,
                }
            )

        return Response(
            {
                "is_inspection_enabled": project.is_inspection_enabled,
                "inspection_mode": project.inspection_mode,
                "inspection_grace_period_days": project.inspection_grace_period_days,
                "inspection_enforcement_paused": project.inspection_enforcement_paused,
                "documents": documents,
            },
            status=status.HTTP_200_OK,
        )


class ProjectInspectionSignEndpoint(BaseAPIView):
    """`POST .../projects/<project_id>/inspection/sign/`

    Body: `{"template_version_id": <uuid>, "signature_name": <str>,
    "questionnaire_answers": {...}}`

    The evidentiary fields are built here from the request and the STORED
    document, never taken from client input: the checksum is computed over the
    body as stored, and the email snapshot comes from the authenticated user.
    A client cannot claim to have signed a different text than the one on file.

    A declaration that discloses a conflict, or that contradicts its own
    attestations, is RECORDED and left `PENDING` review rather than rejected -
    see `plane.utils.inspection_questionnaire` for why discarding such a
    submission would be worse than recording it.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        version_id = request.data.get("template_version_id")
        if not version_id:
            return Response(
                {"error": "'template_version_id' is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        version = InspectionDocumentTemplateVersion.objects.filter(
            pk=version_id, published_at__isnull=False
        ).select_related("template").first()
        if version is None:
            return Response(
                {"error": "No such published document version."}, status=status.HTTP_404_NOT_FOUND
            )

        kind = version.template.kind
        # Only the version this project is actually subject to may be signed -
        # otherwise a member could satisfy an obligation by signing some other
        # project's (or a superseded) document.
        applicable = resolve_applicable_version(project, kind)
        if applicable is None or applicable.id != version.id:
            return Response(
                {"error": "This document version does not apply to this project."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if InspectionSignature.objects.filter(
            project_id=project.id, member_id=request.user.id, template_version_id=version.id
        ).exists():
            return Response(
                {"error": "You have already signed this version."}, status=status.HTTP_409_CONFLICT
            )

        # The documents are signed in a fixed order (charter, then impartiality,
        # then NDA). Enforced here and not only in the UI, so the stored evidence
        # genuinely reflects that sequence rather than merely suggesting it.
        prerequisites = unmet_prerequisites(project, request.user.id, kind)
        if prerequisites:
            return Response(
                {
                    "error": "Sign the preceding documents first.",
                    "error_code": "INSPECTION_OUT_OF_ORDER",
                    "blocked_by": prerequisites,
                },
                status=status.HTTP_409_CONFLICT,
            )

        evaluation = evaluate_answers(version.questionnaire_schema, request.data.get("questionnaire_answers"))
        if not evaluation.is_complete:
            return Response(
                {
                    "error": "The questionnaire is incomplete.",
                    "missing": list(evaluation.missing),
                    "invalid": list(evaluation.invalid),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        signature = InspectionSignature.objects.create(
            project=project,
            member=request.user,
            template_version=version,
            kind=kind,
            signed_at=timezone.now(),
            signature_name_snapshot=(request.data.get("signature_name") or request.user.display_name or "")[:255],
            signer_email_snapshot=(request.user.email or "")[:255],
            ip_address=get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            document_checksum=hashlib.sha256(version.body.encode("utf-8")).hexdigest(),
            questionnaire_answers=evaluation.cleaned,
            declared_conflicts=evaluation.declared_conflicts,
            # PENDING does NOT satisfy the obligation - the gate requires a
            # manager's verdict. See `inspection_compliance`.
            review_status="PENDING" if evaluation.requires_review else "NOT_REQUIRED",
        )

        # A member who was already blocked and has just become compliant must
        # stop being reported as blocked - see `clear_block_if_satisfied`.
        clear_block_if_satisfied(project, request.user.id)

        return Response(
            {
                **InspectionSignatureSerializer(signature).data,
                "conflicts": list(evaluation.conflicts),
                "failed_attestations": list(evaluation.failed_attestations),
                "requires_review": evaluation.requires_review,
            },
            status=status.HTTP_201_CREATED,
        )


class ProjectInspectionReviewEndpoint(BaseAPIView):
    """`GET`/`PATCH .../projects/<project_id>/inspection/declarations/<pk>/review/`

    §4.1's risk analysis. Restricted to the project's designated
    `inspection_review_manager`, falling back to any project Admin when none is
    set - and a reviewer may never review their own declaration.

    EXEMPT from the gate so a reviewer who is themselves behind on an unrelated
    obligation cannot become a deadlock for everybody else.
    """

    def _may_review(self, request, project):
        if project.inspection_review_manager_id:
            if project.inspection_review_manager_id == request.user.id:
                return True
            # A designated manager does not exclude Admins entirely - otherwise
            # that person leaving would strand every pending declaration.
        return ProjectMember.objects.filter(
            project_id=project.id, member_id=request.user.id, role=ROLE.ADMIN.value, is_active=True
        ).exists()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, pk):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        if not self._may_review(request, project):
            return Response(
                {"error": "You are not allowed to review declarations on this project."},
                status=status.HTTP_403_FORBIDDEN,
            )
        signature = InspectionSignature.objects.get(project_id=project_id, pk=pk)
        return Response(InspectionSignatureSerializer(signature).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def patch(self, request, slug, project_id, pk):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        if not self._may_review(request, project):
            return Response(
                {"error": "You are not allowed to review declarations on this project."},
                status=status.HTTP_403_FORBIDDEN,
            )

        signature = InspectionSignature.objects.get(project_id=project_id, pk=pk)
        if signature.member_id == request.user.id:
            return Response(
                {"error": "You cannot review your own declaration."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = InspectionReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        signature.review_status = data["review_status"]
        signature.risk_level = data.get("risk_level")
        signature.mitigation_measures = data.get("mitigation_measures", "")
        signature.review_notes = data.get("review_notes", "")
        signature.reviewed_by = request.user
        signature.reviewed_at = timezone.now()
        signature.save()

        # Accepting a PENDING declaration is the second way an obligation
        # becomes satisfied, so the block has to be lifted here too.
        clear_block_if_satisfied(project, signature.member_id)

        return Response(InspectionSignatureSerializer(signature).data, status=status.HTTP_200_OK)


class ProjectInspectionComplianceEndpoint(BaseAPIView):
    """`GET .../projects/<project_id>/inspection/compliance/`

    The admin dashboard: one row per active member, what they owe, what they
    have signed, and whether anything is awaiting review. EXEMPT from the gate
    (it is a read an Admin needs precisely when people are blocked).
    """

    @allow_permission([ROLE.ADMIN])
    def get(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)

        applicable = {}
        for kind in INSPECTION_SIGNING_ORDER:
            version = resolve_applicable_version(project, kind)
            if version is not None:
                applicable[kind] = version

        members = ProjectMember.objects.filter(
            project_id=project.id, is_active=True
        ).select_related("member")
        signatures = InspectionSignature.objects.filter(project_id=project.id).select_related("member")
        obligations = InspectionObligation.objects.filter(project_id=project.id)

        by_member = {}
        for signature in signatures:
            by_member.setdefault(signature.member_id, {})[signature.template_version_id] = signature
        clocks = {(o.member_id, o.kind): o for o in obligations}

        rows = []
        for membership in members:
            member_signatures = by_member.get(membership.member_id, {})
            documents = []
            for kind, version in applicable.items():
                signature = member_signatures.get(version.id)
                clock = clocks.get((membership.member_id, kind))
                documents.append(
                    {
                        "kind": kind,
                        "version": version.version,
                        "signed_at": signature.signed_at if signature else None,
                        "review_status": signature.review_status if signature else None,
                        "risk_level": signature.risk_level if signature else None,
                        "declared_conflicts": signature.declared_conflicts if signature else False,
                        "signature_id": str(signature.id) if signature else None,
                        "blocked_since": clock.blocked_since if clock else None,
                    }
                )
            rows.append(
                {
                    "member_id": str(membership.member_id),
                    "member_email": membership.member.email if membership.member else None,
                    "role": membership.role,
                    "documents": documents,
                }
            )

        return Response(
            {
                "inspection_mode": project.inspection_mode,
                "is_inspection_enabled": project.is_inspection_enabled,
                "inspection_enforcement_paused": project.inspection_enforcement_paused,
                "required_kinds": list(applicable.keys()),
                "members": rows,
            },
            status=status.HTTP_200_OK,
        )
