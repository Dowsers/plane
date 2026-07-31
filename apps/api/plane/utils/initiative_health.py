# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Worst-case health rollup for Initiatives - see
docs/feature-specs/03-projects-roadmaps-initiatives.md ("Entité
Initiatives") in plane-selfhost. Recalculated via explicit calls from
ProjectViewSet.partial_update() (when Project.health changes) and from the
InitiativeProject link/unlink endpoints - this codebase uses no Django
signals for cross-model side effects, so there is no post_save receiver
here by design.
"""


def recalculate_initiative_health(initiative_id):
    from plane.db.models import Initiative, Project

    healths = set(
        Project.objects.filter(
            initiative_links__initiative_id=initiative_id, initiative_links__deleted_at__isnull=True
        )
        .exclude(health__isnull=True)
        .values_list("health", flat=True)
    )

    if "off-track" in healths:
        new_health = "off-track"
    elif "at-risk" in healths:
        new_health = "at-risk"
    elif "on-track" in healths:
        new_health = "on-track"
    else:
        # No linked project (or none with a health set) - "no-status",
        # represented as null rather than a 4th choice value.
        new_health = None

    Initiative.objects.filter(pk=initiative_id).update(health=new_health)


def recalculate_initiatives_health_for_project(project_id):
    from plane.db.models import InitiativeProject

    initiative_ids = InitiativeProject.objects.filter(
        project_id=project_id, deleted_at__isnull=True
    ).values_list("initiative_id", flat=True)
    for initiative_id in initiative_ids:
        recalculate_initiative_health(initiative_id)
