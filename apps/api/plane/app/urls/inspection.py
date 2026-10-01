# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Inspection compliance routes (ISO/IEC 17020 §4.1/§4.2).

The `name=` of every project-scoped route here is load-bearing: the enforcement
gate's exemption list (`plane.utils.inspection_compliance.EXEMPT_URL_NAMES`)
matches on exactly these strings, and a mismatch silently removes a lockout
escape hatch. `test_inspection_compliance.TestExemptionListIsReal` asserts every
exempt name resolves to a route registered here or elsewhere.
"""

from django.urls import path

from plane.app.views.inspection import (
    InspectionTemplateVersionEndpoint,
    InspectionTemplateVersionPublishEndpoint,
    ProjectInspectionComplianceEndpoint,
    ProjectInspectionConfigEndpoint,
    ProjectInspectionMeEndpoint,
    ProjectInspectionReviewEndpoint,
    ProjectInspectionSignEndpoint,
    ProjectInspectionTemplateEndpoint,
    WorkspaceInspectionTemplateEndpoint,
)

urlpatterns = [
    # --- Per-project configuration. EXEMPT from the gate: the Admin's way out.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inspection-config/",
        ProjectInspectionConfigEndpoint.as_view(),
        name="project-inspection-config",
    ),
    # --- Workspace-default document templates.
    path(
        "workspaces/<str:slug>/inspection-templates/",
        WorkspaceInspectionTemplateEndpoint.as_view(),
        name="workspace-inspection-templates",
    ),
    path(
        "workspaces/<str:slug>/inspection-templates/<uuid:pk>/",
        WorkspaceInspectionTemplateEndpoint.as_view(),
        name="workspace-inspection-templates",
    ),
    path(
        "workspaces/<str:slug>/inspection-templates/<uuid:template_id>/versions/",
        InspectionTemplateVersionEndpoint.as_view(),
        name="workspace-inspection-template-versions",
    ),
    path(
        "workspaces/<str:slug>/inspection-templates/<uuid:template_id>/versions/<uuid:pk>/",
        InspectionTemplateVersionEndpoint.as_view(),
        name="workspace-inspection-template-versions",
    ),
    path(
        "workspaces/<str:slug>/inspection-templates/<uuid:template_id>/versions/<uuid:pk>/publish/",
        InspectionTemplateVersionPublishEndpoint.as_view(),
        name="workspace-inspection-template-version-publish",
    ),
    # --- Per-project document override. EXEMPT: the signing screen reads it.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inspection-template/",
        ProjectInspectionTemplateEndpoint.as_view(),
        name="project-inspection-template",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inspection-template/<uuid:pk>/",
        ProjectInspectionTemplateEndpoint.as_view(),
        name="project-inspection-template",
    ),
    # --- Member-facing. Both EXEMPT: without them the obligation would be
    # impossible to discharge, which is exactly the bc7bab8bd lockout shape.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inspection/me/",
        ProjectInspectionMeEndpoint.as_view(),
        name="project-inspection-me",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inspection/sign/",
        ProjectInspectionSignEndpoint.as_view(),
        name="project-inspection-sign",
    ),
    # --- Managerial review (§4.1). EXEMPT so a reviewer who is themselves
    # behind on an unrelated obligation cannot deadlock everybody else.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inspection/declarations/<uuid:pk>/review/",
        ProjectInspectionReviewEndpoint.as_view(),
        name="project-inspection-review",
    ),
    # --- Admin compliance dashboard. EXEMPT: an Admin needs this read
    # precisely when people are blocked.
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/inspection/compliance/",
        ProjectInspectionComplianceEndpoint.as_view(),
        name="project-inspection-compliance",
    ),
]
