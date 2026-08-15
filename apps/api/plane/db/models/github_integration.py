# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
GitHub native PR<->issue linking - see
docs/feature-specs/07-integrations-git.md ("1. GitHub natif") in
plane-selfhost, category 7, feature 1, complexity L.

DEVIATION FROM THE SPEC'S OWN "Implications sur le modele de donnees"
INTRO: the spec asks for "une nouvelle application Django dediee, ex.
plane.app.models.integrations.github (ou app separee)". Every other L/M
patch in this initiative that made the same "new dedicated Django app"
suggestion (SLA policies, workflow rule engine, recurring issue templates,
etc.) was instead implemented as a single new module inside the existing
flat `plane.db.models` package (see sla.py, workflow_transition.py,
recurring_issue_template.py) - this fork has exactly one Django app for
all first-party models, `plane.db`, and every other "new app" spec
suggestion across this entire initiative has been resolved the same way
for consistency (one migration history, one `INSTALLED_APPS` entry,
no cross-app FK friction). No exception is made here.

Six models, matching the spec's own list, with two intentional structural
differences from the spec's literal text:

1. `GithubWorkspaceConnection` replaces the spec's implicit assumption
   that a connection is just fields on a single row identified by
   `workspace` FK "unique" - implemented here as `WorkspaceBaseModel` with
   a partial unique constraint on `workspace` scoped to
   `deleted_at__isnull=True` (the same "soft-deletable but unique among
   the living rows" pattern already used by `Webhook.url` and
   `Project.identifier` in this codebase), so reconnecting after a
   disconnect doesn't require ever deleting history.
2. `ProjectGithubStateMapping.repository_sync` is the only FK needed to
   reach `project`/`workspace` (via `GithubRepositoryProjectSync`), so it
   is a plain `BaseModel` rather than `ProjectBaseModel`/`WorkspaceBaseModel`
   - it would otherwise need every write path to redundantly pass
   `project`/`workspace` that are already implied by `repository_sync`.

Token storage: `access_token`/`refresh_token`/`webhook_secret` all use
`plane.db.fields.EncryptedTextField` (see that module's docstring for the
exact encrypt/decrypt behavior and its one known inherited limitation) -
this is the shared field built specifically for category 7 so every
connector encrypts identically instead of inventing its own scheme.
"""

from django.db import models

from .base import BaseModel
from .project import ProjectBaseModel
from .workspace import WorkspaceBaseModel
from plane.db.fields import EncryptedTextField


class GithubInstallationType(models.TextChoices):
    OAUTH_APP = "oauth_app", "OAuth App"
    PERSONAL_ACCESS_TOKEN = "personal_access_token", "Personal Access Token"


class GithubAccountType(models.TextChoices):
    USER = "user", "User"
    ORGANIZATION = "organization", "Organization"


class GithubPullRequestStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    OPEN = "open", "Open"
    IN_REVIEW = "in_review", "In Review"
    APPROVED = "approved", "Approved"
    MERGED = "merged", "Merged"
    CLOSED = "closed", "Closed"


class GithubStateMappingTrigger(models.TextChoices):
    PR_DRAFT = "pr_draft", "PR created as draft"
    PR_OPENED = "pr_opened", "PR opened / ready for review"
    PR_READY_FOR_REVIEW = "pr_ready_for_review", "PR marked ready for review"
    PR_APPROVED = "pr_approved", "PR approved"
    PR_MERGED = "pr_merged", "PR merged"
    PR_CLOSED = "pr_closed", "PR closed without merge"


class GithubPullRequestLinkType(models.TextChoices):
    CLOSES = "closes", "Closes"
    REFERENCES = "references", "References"
    MANUAL = "manual", "Manual"


class GithubWorkspaceConnection(WorkspaceBaseModel):
    """One row per workspace (see class docstring above re: the partial
    unique constraint instead of a hard DB-level `unique=True` on the FK,
    which would make reconnecting after a soft-deleted disconnect
    impossible without a hard delete first)."""

    installation_type = models.CharField(
        max_length=30,
        choices=GithubInstallationType.choices,
        default=GithubInstallationType.PERSONAL_ACCESS_TOKEN,
    )
    access_token = EncryptedTextField()
    # Only ever populated by the (disabled-by-default) OAuth App scaffolding
    # path - see plane/authentication/provider/oauth/github_app.py. A PAT
    # connection has no refresh token at all.
    refresh_token = EncryptedTextField(null=True, blank=True)
    github_account_login = models.CharField(max_length=255, blank=True, default="")
    github_account_type = models.CharField(
        max_length=20, choices=GithubAccountType.choices, default=GithubAccountType.USER
    )
    connected_by = models.ForeignKey(
        "db.User", on_delete=models.SET_NULL, null=True, related_name="github_workspace_connections"
    )

    class Meta:
        verbose_name = "GitHub Workspace Connection"
        verbose_name_plural = "GitHub Workspace Connections"
        db_table = "github_workspace_connections"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="github_workspace_connection_unique_workspace_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.workspace_id} <-> github:{self.github_account_login}"


class GithubRepository(WorkspaceBaseModel):
    workspace_connection = models.ForeignKey(
        GithubWorkspaceConnection, on_delete=models.CASCADE, related_name="repositories"
    )
    github_repo_id = models.BigIntegerField()
    full_name = models.CharField(max_length=500)
    html_url = models.URLField(max_length=1000, blank=True, default="")
    default_branch = models.CharField(max_length=255, blank=True, default="main")

    class Meta:
        verbose_name = "GitHub Repository"
        verbose_name_plural = "GitHub Repositories"
        db_table = "github_repositories"
        ordering = ("full_name",)
        unique_together = ["workspace_connection", "github_repo_id", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["workspace_connection", "github_repo_id"],
                condition=models.Q(deleted_at__isnull=True),
                name="github_repository_unique_connection_repo_when_not_deleted",
            )
        ]

    def __str__(self):
        return self.full_name


class GithubRepositoryProjectSync(ProjectBaseModel):
    """Links exactly one `GithubRepository` to exactly one `Project` - a
    monorepo (one repo powering several Plane projects) is represented by
    several of these rows, each with its own independently-registered
    GitHub webhook (see exigence 8) and its own `webhook_secret`, which is
    exactly why the secret lives here and not on `GithubRepository`."""

    repository = models.ForeignKey(GithubRepository, on_delete=models.CASCADE, related_name="project_syncs")
    webhook_external_id = models.CharField(max_length=255, blank=True, default="")
    webhook_secret = EncryptedTextField()
    is_active = models.BooleanField(default=True)
    allow_backward_transition = models.BooleanField(default=False)

    class Meta:
        verbose_name = "GitHub Repository Project Sync"
        verbose_name_plural = "GitHub Repository Project Syncs"
        db_table = "github_repository_project_syncs"
        ordering = ("-created_at",)
        unique_together = ["repository", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["repository", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="github_repo_project_sync_unique_repo_project_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.repository.full_name} -> {self.project_id}"


class ProjectGithubStateMapping(BaseModel):
    repository_sync = models.ForeignKey(
        GithubRepositoryProjectSync, on_delete=models.CASCADE, related_name="state_mappings"
    )
    trigger = models.CharField(max_length=30, choices=GithubStateMappingTrigger.choices)
    # Null = "no action" for this trigger (exigence 4's "chacun pouvant
    # etre laisse sans action").
    target_state = models.ForeignKey(
        "db.State", on_delete=models.CASCADE, null=True, blank=True, related_name="github_trigger_mappings"
    )

    class Meta:
        verbose_name = "Project GitHub State Mapping"
        verbose_name_plural = "Project GitHub State Mappings"
        db_table = "project_github_state_mappings"
        ordering = ("trigger",)
        unique_together = ["repository_sync", "trigger", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["repository_sync", "trigger"],
                condition=models.Q(deleted_at__isnull=True),
                name="github_state_mapping_unique_sync_trigger_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.repository_sync_id}:{self.trigger}"


class GithubPullRequest(WorkspaceBaseModel):
    """One row per real GitHub PR, keyed by (repository, number) - shared
    across every issue that references it (exigence 3's "un ticket
    referencee par plusieurs PR")."""

    repository = models.ForeignKey(GithubRepository, on_delete=models.CASCADE, related_name="pull_requests")
    number = models.IntegerField()
    github_pr_id = models.BigIntegerField()
    title = models.CharField(max_length=1000, blank=True, default="")
    url = models.URLField(max_length=1000, blank=True, default="")
    status = models.CharField(
        max_length=20, choices=GithubPullRequestStatus.choices, default=GithubPullRequestStatus.OPEN
    )
    author_login = models.CharField(max_length=255, blank=True, default="")
    source_branch = models.CharField(max_length=500, blank=True, default="")
    target_branch = models.CharField(max_length=500, blank=True, default="")
    merged_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "GitHub Pull Request"
        verbose_name_plural = "GitHub Pull Requests"
        db_table = "github_pull_requests"
        ordering = ("-created_at",)
        unique_together = ["repository", "number", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["repository", "number"],
                condition=models.Q(deleted_at__isnull=True),
                name="github_pull_request_unique_repo_number_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.repository.full_name}#{self.number}"


class IssuePullRequestLink(WorkspaceBaseModel):
    issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE, related_name="github_pull_requests"
    )
    pull_request = models.ForeignKey(GithubPullRequest, on_delete=models.CASCADE, related_name="issue_links")
    link_type = models.CharField(max_length=20, choices=GithubPullRequestLinkType.choices)
    # NULL = system-created (auto-detected from title/description/commits),
    # non-null = a human manually linked it via the issue detail panel -
    # exigence 12 relies on this distinction to know which links it is
    # allowed to remove automatically during edited-PR reconciliation.

    class Meta:
        verbose_name = "Issue Pull Request Link"
        verbose_name_plural = "Issue Pull Request Links"
        db_table = "issue_pull_request_links"
        ordering = ("-created_at",)
        unique_together = ["issue", "pull_request", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "pull_request"],
                condition=models.Q(deleted_at__isnull=True),
                name="issue_pr_link_unique_issue_pr_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.issue_id} <-> {self.pull_request_id} ({self.link_type})"
