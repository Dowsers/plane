# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
GitHub PR<->issue linking + state-mapping engine - see
docs/feature-specs/07-integrations-git.md ("1. GitHub natif") in
plane-selfhost. Pure(ish) functions operating on already-fetched
model/payload data - no HTTP calls here (those live in
plane/utils/github_client.py, called from plane/bgtasks/github_sync_task.py
which orchestrates this module) - so this module is fully unit-testable
without a live GitHub API.

SECURITY-CRITICAL: `resolve_referenced_issue` is this feature's single
choke point for exigence 11's cross-tenant isolation rule ("Si une PR
reference un identifiant de projet qui n'existe pas dans le workspace
connecte, ou un ticket appartenant a un projet dont le depot n'est pas
synchronise, le systeme DOIT ignorer silencieusement la reference [...]
aucune fuite de donnees inter-workspace/inter-tenant"). Every lookup here
is scoped through `repository.workspace_connection.workspace` - there is
no code path anywhere in this module that queries `Project`/`Issue` by
identifier alone without that workspace filter, specifically so a webhook
for repo A's sync can never resolve/mutate an issue belonging to a
different workspace even if two workspaces happen to have projects with
the same identifier and an issue with the same sequence number - see this
feature's README "Testing" section for the dedicated cross-tenant test.

STATE-MAPPING DESIGN (exigence 3's "un ticket referencee par plusieurs
PR [...] la transition appliquee reflete l'etat de la PR la plus avancee
parmi celles actives"): `STATUS_RANK` orders every non-terminal-failure
status from least to most advanced; `closed` (abandoned without merging)
is deliberately excluded from that ranking and only used as the effective
status when EVERY `closes`-linked PR for the issue is closed - a single
still-open PR must never be out-ranked by a *different*, abandoned PR on
the same issue, but if the only PR(s) left are all abandoned, the issue
should still reflect that (see `compute_effective_status`).
"""

import json

from django.utils import timezone

from plane.db.models import GithubPullRequestLinkType, GithubPullRequestStatus, GithubStateMappingTrigger
from plane.db.models.state import StateGroup
from plane.utils.exception_logger import log_exception

# Trigger vocabulary <-> PR status: one-to-one, per the spec's own two
# lists (see docs/feature-specs/07-integrations-git.md, exigence 4's
# trigger list and the data model's `GithubPullRequest.status` choices) -
# this correspondence isn't stated explicitly in the spec text but is the
# only mapping under which every status has exactly one matching trigger
# and vice versa; documented here since it's a genuine interpretation
# call, not spelled out verbatim anywhere in the spec.
TRIGGER_FOR_STATUS = {
    GithubPullRequestStatus.DRAFT: GithubStateMappingTrigger.PR_DRAFT,
    GithubPullRequestStatus.OPEN: GithubStateMappingTrigger.PR_OPENED,
    GithubPullRequestStatus.IN_REVIEW: GithubStateMappingTrigger.PR_READY_FOR_REVIEW,
    GithubPullRequestStatus.APPROVED: GithubStateMappingTrigger.PR_APPROVED,
    GithubPullRequestStatus.MERGED: GithubStateMappingTrigger.PR_MERGED,
    GithubPullRequestStatus.CLOSED: GithubStateMappingTrigger.PR_CLOSED,
}

STATUS_RANK = {
    GithubPullRequestStatus.DRAFT: 0,
    GithubPullRequestStatus.OPEN: 1,
    GithubPullRequestStatus.IN_REVIEW: 2,
    GithubPullRequestStatus.APPROVED: 3,
    GithubPullRequestStatus.MERGED: 4,
}

_REGRESSION_GUARDED_GROUPS = {StateGroup.COMPLETED.value, StateGroup.CANCELLED.value}


def resolve_pull_request_status(action, draft, merged):
    """Maps a GitHub `pull_request` webhook action (+ the PR's own
    `draft`/`merged` flags) to one of `GithubPullRequestStatus` - see
    module docstring for the status<->trigger correspondence this feeds
    into. `action` values per GitHub's own docs (confirmed live, see
    README): opened/reopened/ready_for_review/converted_to_draft/closed/
    synchronize/edited/... - any action not explicitly handled here
    (e.g. `labeled`, `assigned`) returns None, meaning "don't touch the
    stored status for this event" (the caller only updates PR metadata,
    no status/trigger processing)."""
    if action in ("opened", "reopened"):
        return GithubPullRequestStatus.DRAFT if draft else GithubPullRequestStatus.OPEN
    if action == "ready_for_review":
        return GithubPullRequestStatus.IN_REVIEW
    if action == "converted_to_draft":
        return GithubPullRequestStatus.DRAFT
    if action == "closed":
        return GithubPullRequestStatus.MERGED if merged else GithubPullRequestStatus.CLOSED
    return None


def compute_effective_status(pull_requests):
    """`pull_requests` - an iterable of `GithubPullRequest` (or anything
    with a `.status` attribute). Returns the single "most advanced active"
    status per exigence 3, or None if the list is empty."""
    statuses = [pr.status for pr in pull_requests]
    if not statuses:
        return None
    non_closed = [s for s in statuses if s in STATUS_RANK]
    if non_closed:
        return max(non_closed, key=lambda s: STATUS_RANK[s])
    return GithubPullRequestStatus.CLOSED


def resolve_referenced_issue(repository, identifier, sequence_id):
    """Exigence 11's tenant/sync-scoping choke point - see module
    docstring. Returns `(issue, repository_sync)` or `(None, None)` if
    the reference can't be resolved *for this specific repository* (wrong
    workspace, project not synced to this repo, or no such issue
    sequence)."""
    from plane.db.models import GithubRepositoryProjectSync, Issue, Project

    workspace = repository.workspace_connection.workspace

    project = Project.objects.filter(identifier__iexact=identifier, workspace=workspace).first()
    if project is None:
        log_exception(
            Exception(
                f"github_sync: identifier '{identifier}' does not match any project in "
                f"workspace {workspace.id} (repository {repository.id}) - reference ignored"
            ),
            warning=True,
        )
        return None, None

    repository_sync = GithubRepositoryProjectSync.objects.filter(
        repository=repository, project=project, is_active=True
    ).first()
    if repository_sync is None:
        log_exception(
            Exception(
                f"github_sync: project {project.id} ('{identifier}') is not synced to repository "
                f"{repository.id} - reference ignored (exigence 11)"
            ),
            warning=True,
        )
        return None, None

    issue = Issue.objects.filter(project=project, sequence_id=sequence_id).first()
    if issue is None:
        log_exception(
            Exception(f"github_sync: no issue {identifier}-{sequence_id} in project {project.id}"),
            warning=True,
        )
        return None, None

    return issue, repository_sync


def sync_links_for_pull_request(pull_request, refs, actor):
    """Creates any missing `IssuePullRequestLink` rows for `refs`
    (`[{"identifier","sequence_id","link_type"}, ...]`, see
    plane.utils.github_link_detection) - idempotent (a pair already
    linked, regardless of who/what created it, is left untouched: this
    covers both "already auto-detected on a previous event" and "a human
    already linked this PR manually", exigence 10's "les liens crees
    manuellement ne sont jamais supprimes/modifies automatiquement").

    Returns the list of newly-created `IssuePullRequestLink` rows (for
    the caller to fire IssueActivity/webhook events over) plus the set of
    issues touched.
    """
    from plane.db.models import IssuePullRequestLink

    created_links = []
    for ref in refs:
        issue, repository_sync = resolve_referenced_issue(
            pull_request.repository, ref["identifier"], ref["sequence_id"]
        )
        if issue is None:
            continue

        existing = IssuePullRequestLink.objects.filter(issue=issue, pull_request=pull_request).first()
        if existing is not None:
            continue

        link = IssuePullRequestLink(
            issue=issue,
            pull_request=pull_request,
            link_type=ref["link_type"],
            workspace=pull_request.workspace,
            project=repository_sync.project,
        )
        # System-created: `created_by` must stay NULL (see
        # `IssuePullRequestLink`'s own docstring) to distinguish it from a
        # human-created manual link - `disable_auto_set_user` skips
        # `BaseModel.save()`'s normal crum-actor auto-assignment (which
        # would otherwise attribute it to the impersonated bot actor).
        link.save(disable_auto_set_user=True)
        created_links.append((link, repository_sync))

    return created_links


def reconcile_links_on_edit(pull_request, refs):
    """Exigence 12: an `edited` PR event re-scans title/description(+commits)
    and removes system-created (`created_by IS NULL`) links whose
    reference is no longer present - manual links (`created_by` set, or
    `link_type=MANUAL`) are never touched here."""
    from plane.db.models import IssuePullRequestLink

    current_pairs = {(r["identifier"], r["sequence_id"]) for r in refs}

    removed = []
    system_links = IssuePullRequestLink.objects.filter(
        pull_request=pull_request, created_by__isnull=True
    ).exclude(link_type=GithubPullRequestLinkType.MANUAL).select_related("issue", "issue__project")
    for link in system_links:
        issue = link.issue
        pair = (issue.project.identifier, issue.sequence_id)
        if pair not in current_pairs:
            removed.append(link)
            link.delete()

    return removed


def apply_state_for_issue(issue, repository_sync, actor, triggering_pull_request=None):
    """Recomputes the "most advanced active `closes`-linked PR" status for
    `issue` within `repository_sync` and applies the configured state
    transition, if any - see module docstring for the ranking rule and
    exigence 5 for the no-regression guard. No-op (not an error) when:
    no `closes` links exist, no mapping configured for the resulting
    trigger, the mapped state is the issue's current state already, or
    the no-regression guard blocks it (unless `allow_backward_transition`).

    Returns True if a transition was applied, False otherwise.
    """
    from plane.bgtasks.issue_activities_task import issue_activity
    from plane.db.models import GithubPullRequest, IssueActivity, ProjectGithubStateMapping

    closes_prs = list(
        GithubPullRequest.objects.filter(
            repository=repository_sync.repository,
            issue_links__issue=issue,
            issue_links__link_type=GithubPullRequestLinkType.CLOSES,
        ).distinct()
    )
    effective_status = compute_effective_status(closes_prs)
    if effective_status is None:
        return False

    trigger = TRIGGER_FOR_STATUS[effective_status]
    mapping = ProjectGithubStateMapping.objects.filter(repository_sync=repository_sync, trigger=trigger).first()
    if mapping is None or mapping.target_state_id is None:
        return False

    target_state = mapping.target_state
    current_state = issue.state

    if current_state_id_equals(current_state, target_state):
        return False

    if (
        current_state is not None
        and current_state.group in _REGRESSION_GUARDED_GROUPS
        and target_state.group not in _REGRESSION_GUARDED_GROUPS
        and not repository_sync.allow_backward_transition
    ):
        log_exception(
            Exception(
                f"github_sync: blocked regression of issue {issue.id} from "
                f"'{current_state.group}' to '{target_state.group}' via trigger '{trigger}' "
                "(allow_backward_transition is False)"
            ),
            warning=True,
        )
        return False

    old_state = current_state
    issue.state_id = target_state.id
    issue.save(update_fields=["state_id", "updated_at"])

    epoch = int(timezone.now().timestamp())

    # Standard activity/notification pipeline (state-change diff,
    # notifications, SLA sync) - see recurring_issue_task.py /
    # workflow_rule_engine.py for the same pattern reused here.
    # `is_automation=False` deliberately (not the rule-engine's own flag):
    # this change didn't originate from the workflow rule engine, and a
    # project's own state-change-triggered rules should still be able to
    # react to a PR-driven transition exactly like a human-driven one.
    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps({"state_id": str(target_state.id)}),
        current_instance=json.dumps({"state_id": str(old_state.id) if old_state else None}),
        actor_id=str(actor.id),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        epoch=epoch,
        notification=True,
        is_automation=False,
    )

    pr_label = f"PR #{triggering_pull_request.number}" if triggering_pull_request else "a linked PR"
    IssueActivity.objects.create(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        verb="updated",
        field="github_pull_request_state_change",
        old_value=old_state.name if old_state else None,
        new_value=target_state.name,
        actor_id=actor.id,
        comment=f"State changed automatically via {pr_label} ({effective_status})",
        epoch=epoch,
    )

    _dispatch_webhook(
        event="pull_request_state_changed",
        issue=issue,
        pull_request=triggering_pull_request,
        actor=actor,
        extra={"trigger": trigger, "from_state_id": str(old_state.id) if old_state else None,
               "to_state_id": str(target_state.id)},
    )

    return True


def current_state_id_equals(current_state, target_state):
    return current_state is not None and current_state.id == target_state.id


def dispatch_link_events(created_links, actor):
    """Fires IssueActivity + outbound webhook events for freshly-created
    links - separated from `sync_links_for_pull_request` so tests can
    exercise the pure linking logic without needing Celery/webhook
    plumbing wired up."""
    from plane.db.models import IssueActivity

    epoch = int(timezone.now().timestamp())
    for link, repository_sync in created_links:
        issue = link.issue
        IssueActivity.objects.create(
            issue=issue,
            project_id=issue.project_id,
            workspace_id=issue.workspace_id,
            verb="created",
            field="github_pull_request_linked",
            new_value=link.pull_request.url,
            actor_id=actor.id,
            comment=f"Linked to PR #{link.pull_request.number} ({link.link_type})",
            epoch=epoch,
        )
        _dispatch_webhook(
            event="pull_request_linked",
            issue=issue,
            pull_request=link.pull_request,
            actor=actor,
            extra={"link_type": link.link_type},
        )


def dispatch_unlink_event(link, actor, issue=None):
    from plane.db.models import IssueActivity

    issue = issue or link.issue
    epoch = int(timezone.now().timestamp())
    IssueActivity.objects.create(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        verb="deleted",
        field="github_pull_request_unlinked",
        old_value=link.pull_request.url,
        actor_id=actor.id if actor else None,
        comment=f"Unlinked from PR #{link.pull_request.number}",
        epoch=epoch,
    )


def _dispatch_webhook(event, issue, pull_request, actor, extra=None):
    try:
        from plane.bgtasks.webhook_task import webhook_activity

        event_data = {
            "issue_id": str(issue.id),
            "pull_request_id": str(pull_request.id) if pull_request else None,
            "pull_request_number": pull_request.number if pull_request else None,
            "pull_request_status": pull_request.status if pull_request else None,
        }
        if extra:
            event_data.update(extra)

        webhook_activity.delay(
            event=event,
            verb="triggered",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=str(actor.id) if actor else None,
            slug=issue.project.workspace.slug,
            current_site=None,
            event_id=str(pull_request.id) if pull_request else str(issue.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override=event_data,
        )
    except Exception as e:  # pragma: no cover - defensive, mirrors workflow_transition_engine's own style
        log_exception(e, warning=True)
