# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.db import models
from django.db.models.functions import Lower

# Module imports
from .base import BaseModel
from .issue import Issue
from .project import Project, ROLE_CHOICES
from .state import StateGroup


class ProjectTemplate(BaseModel):
    """
    Reusable blueprint for creating new projects (states, labels, members,
    starter work items) - see
    docs/feature-specs/03-projects-roadmaps-initiatives.md ("Templates de
    projet") in plane-selfhost. Plain BaseModel + explicit workspace FK
    (not WorkspaceBaseModel) to avoid a spurious always-null `project`
    field - a template does not itself belong to a project, it is the
    blueprint FOR future projects. Same reasoning already applied to
    Initiative in the prior patch.
    """

    workspace = models.ForeignKey("db.Workspace", related_name="project_templates", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    network = models.IntegerField(choices=Project.NETWORK_CHOICES, default=2)
    linked_initiative = models.ForeignKey(
        "db.Initiative",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="linked_templates",
    )
    add_creator_as_lead = models.BooleanField(default=True)
    usage_count = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Project Template"
        verbose_name_plural = "Project Templates"
        db_table = "project_templates"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                Lower("name"),
                "workspace",
                condition=models.Q(deleted_at__isnull=True),
                name="project_template_unique_name_ci_per_workspace",
            )
        ]

    def __str__(self):
        return f"{self.name} <{self.workspace_id}>"


class ProjectTemplateState(BaseModel):
    template = models.ForeignKey(ProjectTemplate, related_name="states", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    color = models.CharField(max_length=255)
    group = models.CharField(max_length=20, choices=StateGroup.choices, default=StateGroup.BACKLOG)
    sequence = models.FloatField(default=65535)
    default = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Project Template State"
        verbose_name_plural = "Project Template States"
        db_table = "project_template_states"
        ordering = ("sequence",)

    def __str__(self):
        return f"{self.name} <{self.template_id}>"


class ProjectTemplateLabel(BaseModel):
    template = models.ForeignKey(ProjectTemplate, related_name="labels", on_delete=models.CASCADE)
    parent = models.ForeignKey(
        "self", null=True, blank=True, related_name="child_labels", on_delete=models.CASCADE
    )
    name = models.CharField(max_length=255)
    color = models.CharField(max_length=255, blank=True)
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "Project Template Label"
        verbose_name_plural = "Project Template Labels"
        db_table = "project_template_labels"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.name} <{self.template_id}>"


class ProjectTemplateMember(BaseModel):
    template = models.ForeignKey(ProjectTemplate, related_name="members", on_delete=models.CASCADE)
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_template_memberships"
    )
    role = models.PositiveSmallIntegerField(choices=ROLE_CHOICES, default=15)

    class Meta:
        verbose_name = "Project Template Member"
        verbose_name_plural = "Project Template Members"
        db_table = "project_template_members"
        unique_together = ["template", "member", "deleted_at"]
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.member_id} <{self.template_id}>"


class ProjectTemplateIssue(BaseModel):
    template = models.ForeignKey(ProjectTemplate, related_name="issues", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description_html = models.TextField(blank=True, default="<p></p>")
    priority = models.CharField(max_length=30, choices=Issue.PRIORITY_CHOICES, default="none")
    state = models.ForeignKey(
        ProjectTemplateState, null=True, blank=True, related_name="issues", on_delete=models.SET_NULL
    )
    parent = models.ForeignKey(
        "self", null=True, blank=True, related_name="child_issues", on_delete=models.CASCADE
    )
    labels = models.ManyToManyField(ProjectTemplateLabel, blank=True, related_name="issues")
    assignees = models.ManyToManyField(ProjectTemplateMember, blank=True, related_name="assigned_issues")
    sort_order = models.FloatField(default=65535)
    target_date_offset_days = models.IntegerField(null=True, blank=True)

    class Meta:
        verbose_name = "Project Template Issue"
        verbose_name_plural = "Project Template Issues"
        db_table = "project_template_issues"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.name} <{self.template_id}>"
