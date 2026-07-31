# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models

# Module imports
from .project import ProjectBaseModel


class Milestone(ProjectBaseModel):
    """
    A project-scoped checkpoint with a target date and a progress rollup
    derived from the issues attached to it - see
    docs/feature-specs/03-projects-roadmaps-initiatives.md ("Milestones de
    projet") in plane-selfhost. Deliberately a plain TextField description
    (Cycle's tier), not the collaborative quad-field pattern used by
    Issue/Page - disproportionate for this scope.
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    target_date = models.DateField(null=True, blank=True)
    sort_order = models.FloatField(default=65535)
    external_id = models.CharField(max_length=255, blank=True, null=True)
    external_source = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        verbose_name = "Milestone"
        verbose_name_plural = "Milestones"
        db_table = "milestones"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="milestone_unique_name_per_project_when_not_deleted",
            )
        ]

    def save(self, *args, **kwargs):
        if self._state.adding:
            smallest_sort_order = Milestone.objects.filter(project=self.project).aggregate(
                smallest=models.Min("sort_order")
            )["smallest"]

            if smallest_sort_order is not None:
                self.sort_order = smallest_sort_order - 10000

        super(Milestone, self).save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} <{self.project_id}>"
