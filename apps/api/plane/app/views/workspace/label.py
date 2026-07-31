# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import IntegrityError, transaction

# Third party modules
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.serializers import LabelSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import IssueLabel, Label, Project, Workspace
from plane.app.permissions import WorkspaceViewerPermission, allow_permission, ROLE
from plane.utils.cache import cache_response


class WorkspaceLabelsEndpoint(BaseAPIView):
    permission_classes = [WorkspaceViewerPermission]
    use_read_replica = True

    @cache_response(60 * 60 * 2)
    def get(self, request, slug):
        labels = Label.objects.filter(
            workspace__slug=slug,
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
        )
        serializer = LabelSerializer(labels, many=True).data
        return Response(serializer, status=status.HTTP_200_OK)


class LabelMergeEndpoint(BaseAPIView):
    """
    Merge one or more duplicate labels into a single target label - see
    docs/feature-specs/01-core-issue-tracking.md ("Label Groups avec
    exclusivité + fusion/re-scope") in plane-selfhost.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        source_label_ids = [str(x) for x in request.data.get("source_label_ids", [])]
        target_label_id = request.data.get("target_label_id")

        if not source_label_ids or not target_label_id:
            return Response(
                {"error": "source_label_ids and target_label_id are required"}, status=status.HTTP_400_BAD_REQUEST
            )
        target_label_id = str(target_label_id)
        source_label_ids = [lid for lid in source_label_ids if lid != target_label_id]
        if not source_label_ids:
            return Response(
                {"error": "source_label_ids must not be empty once target_label_id is excluded"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_label = Label.objects.filter(workspace__slug=slug, pk=target_label_id).first()
        if target_label is None:
            return Response({"error": "target label not found"}, status=status.HTTP_404_NOT_FOUND)

        source_labels = list(
            Label.objects.filter(workspace__slug=slug, pk__in=source_label_ids, project_id=target_label.project_id)
        )
        if not source_labels:
            return Response(
                {"error": "No source labels found in the same scope (project) as the target label"},
                status=status.HTTP_404_NOT_FOUND,
            )
        source_ids = [str(label.id) for label in source_labels]

        with transaction.atomic():
            # Any label whose group-parent is being merged away should now
            # point at the target instead, so the group survives the merge.
            Label.objects.filter(parent_id__in=source_ids).update(parent_id=target_label_id)

            # Drop source-label assignments on issues that already carry the
            # target label (IssueLabel has no DB unique constraint - dedupe
            # in application code instead), then reassign the rest.
            already_on_target = set(IssueLabel.objects.filter(label_id=target_label_id).values_list("issue_id", flat=True))
            IssueLabel.objects.filter(label_id__in=source_ids, issue_id__in=already_on_target).delete()
            migrated_count = IssueLabel.objects.filter(label_id__in=source_ids).update(label_id=target_label_id)

            Label.objects.filter(pk__in=source_ids).delete()

        return Response(
            {
                "target_label_id": target_label_id,
                "merged_label_ids": source_ids,
                "issue_labels_migrated": migrated_count,
            },
            status=status.HTTP_200_OK,
        )


class LabelBulkRescopeEndpoint(BaseAPIView):
    """
    Move labels between project scope and workspace scope (or between two
    projects) in bulk - see docs/feature-specs/01-core-issue-tracking.md.
    `project_id: null` moves a label to workspace-level.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        label_ids = [str(x) for x in request.data.get("label_ids", [])]
        if not label_ids or "project_id" not in request.data:
            return Response(
                {"error": "label_ids and project_id (null for workspace-level) are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target_project_id = request.data.get("project_id")

        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        if target_project_id is not None and not Project.objects.filter(
            pk=target_project_id, workspace=workspace
        ).exists():
            return Response({"error": "target project not found in this workspace"}, status=status.HTTP_404_NOT_FOUND)

        labels = Label.objects.filter(workspace=workspace, pk__in=label_ids)
        updated_ids = []
        errors = []
        for label in labels:
            try:
                with transaction.atomic():
                    label.project_id = target_project_id
                    label.save(update_fields=["project_id"])
                updated_ids.append(str(label.id))
            except IntegrityError:
                errors.append(
                    {"id": str(label.id), "reason": "A label with this name already exists in the target scope"}
                )

        return Response({"updated_label_ids": updated_ids, "errors": errors}, status=status.HTTP_200_OK)
