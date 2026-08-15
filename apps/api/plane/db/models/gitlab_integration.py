# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
GitLab native MR<->issue linking - see
docs/feature-specs/07-integrations-git.md ("2. GitLab natif") in
plane-selfhost, category 7, feature 2, complexity L.

DEVIATION FROM THE SPEC'S OWN CITED PRECEDENT: the spec's "Implications
sur le modele de donnees" section says this builds "s'appuyant sur les
modeles existants Integration, WorkspaceIntegration [...]". Research
before writing any code here (see plane-selfhost's
plane_fork_cat7_research_findings.md) confirmed `Integration`/
`WorkspaceIntegration` (plane/db/models/integration/base.py) are real
models but completely dead code - zero views/serializers/URLs reference
them anywhere in the current backend - and structurally mismatched with
this fork's current conventions (`Integration` extends `AuditModel`
directly rather than `TimeAuditModel`/`WorkspaceBaseModel`, no soft-delete-
aware unique constraints, etc.). Reusing them would mean building on
schema that nothing else validates. `GitlabWorkspaceConnection` below is a
new, small model that plays the same role WorkspaceIntegration was meant
to (the workspace-level "we are connected to a GitLab instance" record)
but follows this fork's *current* patterns (`WorkspaceBaseModel`, partial
unique constraint on `workspace` scoped to `deleted_at__isnull=True`,
`EncryptedTextField` for the token) - the same substitution
`GithubWorkspaceConnection` makes in github_integration.py, for the exact
same reason.

Per the spec's own data-model text, `GitlabRepository` carries its own
`access_token`/`instance_url`/`token_type` fields (not just a FK to a
shared connection holding the one token) - preserved as-is here, since a
self-hosted deployment might reasonably want a repository added under a
different token than the one used for the initial `.../repositories/`
listing call (e.g. a more narrowly-scoped project token). The FK to
`GitlabWorkspaceConnection` exists for cascade-on-disconnect (exigence 16)
and to default new repositories' credentials from, not to be the sole
source of truth for them.

Cardinality resolution: exigence 2's own parenthetical ("un repo pouvant
alimenter un seul projet Plane a la fois") and the "Implications" section's
model text ("un repo -> un seul projet Plane" for
`GitlabRepositoryProjectConnection`) both describe a *many-repos-to-one-
project* relationship, not a true M2M. `unique_together(("project",
"repository"))` alone would not enforce that (it only blocks the exact
same pair twice) - `repository` is additionally declared `unique=True`
below, which is what actually makes "a GitLab repo can only ever be
associated with one Plane project" true at the DB level.

No `link_type`/closes-vs-references distinction on `GitlabMergeRequestIssueSync`
(unlike GitHub's `IssuePullRequestLink.link_type`) - deliberately absent
because the spec's own model list for this feature does not include such
a field at all, unlike GitHub's spec which explicitly lists `link_type`.
Every detected/manual reference becomes a fully-synced link that
participates in both state-mapping transitions and title/description/
assignee/label sync - see plane/utils/gitlab_sync_engine.py's module
docstring for the full reasoning and how this makes GitLab's linking
semantics genuinely simpler than (not a reskin of) GitHub's.
"""

from django.db import models

from .project import ProjectBaseModel
from .workspace import WorkspaceBaseModel
from plane.db.fields import EncryptedTextField

DEFAULT_GITLAB_INSTANCE_URL = "https://gitlab.com"
# Exigence 4's own default pattern, reproduced verbatim - case-insensitive
# match, one capturing group (the issue identifier). See
# plane/utils/gitlab_link_detection.py for how this is compiled/applied.
DEFAULT_GITLAB_LINK_PATTERN = r"(?:Closes|Fixes|Resolves|Relates to)?\s*([A-Z]+-\d+)"


class GitlabTokenType(models.TextChoices):
    PAT = "pat", "Personal/Project Access Token"
    OAUTH = "oauth", "OAuth"


class GitlabMergeRequestState(models.TextChoices):
    OPENED = "opened", "Opened"
    CLOSED = "closed", "Closed"
    MERGED = "merged", "Merged"
    LOCKED = "locked", "Locked"


class GitlabWorkspaceConnection(WorkspaceBaseModel):
    instance_url = models.URLField(max_length=500, default=DEFAULT_GITLAB_INSTANCE_URL)
    access_token = EncryptedTextField()
    token_type = models.CharField(max_length=10, choices=GitlabTokenType.choices, default=GitlabTokenType.PAT)
    gitlab_username = models.CharField(max_length=255, blank=True, default="")
    connected_by = models.ForeignKey(
        "db.User", on_delete=models.SET_NULL, null=True, related_name="gitlab_workspace_connections"
    )

    class Meta:
        verbose_name = "GitLab Workspace Connection"
        verbose_name_plural = "GitLab Workspace Connections"
        db_table = "gitlab_workspace_connections"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="gitlab_workspace_connection_unique_workspace_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.workspace_id} <-> {self.instance_url}"


class GitlabRepository(WorkspaceBaseModel):
    workspace_connection = models.ForeignKey(
        GitlabWorkspaceConnection, on_delete=models.CASCADE, related_name="repositories"
    )
    instance_url = models.URLField(max_length=500, default=DEFAULT_GITLAB_INSTANCE_URL)
    gitlab_project_id = models.IntegerField()
    path_with_namespace = models.CharField(max_length=500)
    access_token = EncryptedTextField()
    token_type = models.CharField(max_length=10, choices=GitlabTokenType.choices, default=GitlabTokenType.PAT)
    webhook_id = models.IntegerField(null=True, blank=True)
    webhook_secret_token = models.CharField(max_length=255)

    class Meta:
        verbose_name = "GitLab Repository"
        verbose_name_plural = "GitLab Repositories"
        db_table = "gitlab_repositories"
        ordering = ("path_with_namespace",)
        unique_together = ["instance_url", "gitlab_project_id", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["instance_url", "gitlab_project_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="gitlab_repository_unique_instance_project_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.instance_url}/{self.path_with_namespace}"


class GitlabRepositoryProjectConnection(ProjectBaseModel):
    # `unique=True` (not just part of `unique_together` below) is what
    # actually enforces "a repo can only ever feed one Plane project" -
    # see module docstring's "Cardinality resolution".
    repository = models.OneToOneField(
        GitlabRepository, on_delete=models.CASCADE, related_name="project_connection"
    )

    class Meta:
        verbose_name = "GitLab Repository Project Connection"
        verbose_name_plural = "GitLab Repository Project Connections"
        db_table = "gitlab_repository_project_connections"
        ordering = ("-created_at",)
        unique_together = ["project", "repository", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "repository"],
                condition=models.Q(deleted_at__isnull=True),
                name="gitlab_repo_project_conn_unique_project_repo_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.repository_id} -> {self.project_id}"


class ProjectGitlabSyncSettings(ProjectBaseModel):
    """OneToOne on `project` - one settings row governs every
    `GitlabRepository` connected to that project (there can be several,
    per exigence 2's "un ou plusieurs repositories [...] a un projet Plane
    donne")."""

    project = models.OneToOneField(
        "db.Project", on_delete=models.CASCADE, related_name="gitlab_sync_settings"
    )
    sync_title_description = models.BooleanField(default=True)
    sync_assignee = models.BooleanField(default=False)
    sync_labels = models.BooleanField(default=False)
    create_missing_labels = models.BooleanField(default=False)
    link_pattern = models.CharField(max_length=500, default=DEFAULT_GITLAB_LINK_PATTERN)
    # Not in the spec's own field list for this model, but explicitly
    # required by the task that commissioned this patch ("the 'never
    # regress a completed/cancelled issue' rule from both specs") even
    # though GitLab's own spec text (unlike GitHub's exigence 5) never
    # states this rule explicitly for MRs. Added for product-parity with
    # GitHub and because leaving it out would mean a stray late webhook
    # (e.g. a MR re-opened after the linked issue was already manually
    # marked Done) could silently regress a finished issue - the same
    # failure mode GitHub's spec explicitly calls out and guards against.
    allow_backward_transition = models.BooleanField(default=False)
    state_on_open = models.ForeignKey(
        "db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="gitlab_state_on_open"
    )
    state_on_ready = models.ForeignKey(
        "db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="gitlab_state_on_ready"
    )
    state_on_merge = models.ForeignKey(
        "db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="gitlab_state_on_merge"
    )
    state_on_close = models.ForeignKey(
        "db.State", on_delete=models.SET_NULL, null=True, blank=True, related_name="gitlab_state_on_close"
    )

    class Meta:
        verbose_name = "Project GitLab Sync Settings"
        verbose_name_plural = "Project GitLab Sync Settings"
        db_table = "project_gitlab_sync_settings"
        ordering = ("-created_at",)

    def __str__(self):
        return f"gitlab sync settings <{self.project_id}>"


class GitlabMergeRequestIssueSync(ProjectBaseModel):
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="gitlab_merge_requests")
    repository = models.ForeignKey(GitlabRepository, on_delete=models.CASCADE, related_name="merge_request_syncs")
    merge_request_id = models.IntegerField()
    merge_request_iid = models.IntegerField()
    title = models.CharField(max_length=1000, blank=True, default="")
    source_branch = models.CharField(max_length=500, blank=True, default="")
    target_branch = models.CharField(max_length=500, blank=True, default="")
    state = models.CharField(
        max_length=20, choices=GitlabMergeRequestState.choices, default=GitlabMergeRequestState.OPENED
    )
    draft = models.BooleanField(default=False)
    web_url = models.URLField(max_length=1000, blank=True, default="")
    last_synced_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "GitLab Merge Request Issue Sync"
        verbose_name_plural = "GitLab Merge Request Issue Syncs"
        db_table = "gitlab_merge_request_issue_syncs"
        ordering = ("-created_at",)
        unique_together = ["repository", "merge_request_id", "issue", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["repository", "merge_request_id", "issue"],
                condition=models.Q(deleted_at__isnull=True),
                name="gitlab_mr_sync_unique_repo_mr_issue_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.repository_id}!{self.merge_request_iid} <-> {self.issue_id}"
